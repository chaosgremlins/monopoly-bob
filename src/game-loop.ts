import { GameState, GameAction, TradeOffer } from './engine/types';
import { GameEngine } from './engine/game-engine';
import { createInitialState } from './engine/game-state';
import { getSpace } from './engine/board-data';
import { getActivePlayers, getPlayerById } from './engine/bank';
import { createRng } from './engine/dice';
import { LLMAdapter, ChatMessage, ContentBlock, ToolDefinition } from './llm/types';
import { translateActionsToTools } from './llm/tool-translator';
import { buildSystemPrompt, buildTurnMessage, buildAuctionMessage } from './llm/prompt-builder';
import { Renderer } from './display/renderer';
import { GameLogger } from './logger';
import { GameConfig } from './config';

const PLAYER_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana'];
const MAX_ACTIONS_PER_TURN = 20;
const MAX_RETRIES = 3;

interface PlayerContext {
  adapter: LLMAdapter;
  systemPrompt: string;
  history: ChatMessage[];
}

export class GameLoop {
  private state!: GameState;
  private engine: GameEngine;
  private players: Map<string, PlayerContext> = new Map();
  private renderer: Renderer;
  private logger: GameLogger;
  private config: GameConfig;
  private rng: () => number;

  constructor(config: GameConfig, adapterFactory: (playerName: string) => LLMAdapter) {
    this.config = config;
    this.rng = createRng(config.seed);
    this.engine = new GameEngine(this.rng);
    this.renderer = new Renderer(config.verbose);
    this.logger = new GameLogger(config.logFile);

    // Create player configs
    const playerConfigs = [];
    for (let i = 0; i < config.players; i++) {
      const id = `player_${i}`;
      const name = PLAYER_NAMES[i];
      playerConfigs.push({ id, name });

      const adapter = adapterFactory(name);
      const systemPrompt = buildSystemPrompt(name);
      this.players.set(id, {
        adapter,
        systemPrompt,
        history: [],
      });
    }

    this.state = createInitialState(playerConfigs, this.rng);
  }

  async run(): Promise<GameState> {
    this.renderer.renderGameStart(this.state);

    while (!this.state.winner && this.state.turnNumber <= this.config.maxTurns) {
      await this.executeTurn();

      // Check for winner after turn
      const active = getActivePlayers(this.state);
      if (active.length === 1) {
        this.state.winner = active[0].id;
        this.state.gameLog.push({
          type: 'game_over',
          winnerId: active[0].id,
          reason: 'All other players bankrupt',
        });
        break;
      }
    }

    this.renderer.renderGameOver(this.state);
    this.logger.flush(this.state);
    return this.state;
  }

  private async executeTurn(): Promise<void> {
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.isBankrupt) {
      this.advanceTurn();
      return;
    }

    this.renderer.renderTurnStart(this.state);
    this.state.turnPhase = 'pre_roll';
    let actionCount = 0;

    while (this.state.turnPhase !== 'turn_complete' && actionCount < MAX_ACTIONS_PER_TURN) {
      // Always re-read the current player (it doesn't change mid-turn, but be safe)
      const player = this.state.players[this.state.currentPlayerIndex];

      // Auto-resolve landing effects
      if (this.state.turnPhase === 'post_roll_land') {
        const result = this.engine.autoResolveLanding(this.state);
        this.state = result.newState;
        this.renderer.renderEvents(result.events, this.state);
        for (const event of result.events) {
          this.logger.logAction(this.state.turnNumber, player.name, 'auto_resolve', [event]);
        }

        // If landing triggered another post_roll_land (e.g., card moved player), continue
        if (this.state.turnPhase === 'post_roll_land') continue;

        // If now in auction phase, handle it specially
        if (this.state.turnPhase === 'auction') {
          await this.handleAuction();
          continue;
        }
        continue;
      }

      // Handle auction phase
      if (this.state.turnPhase === 'auction') {
        await this.handleAuction();
        continue;
      }

      // Handle trading phase (target player responds)
      if (this.state.turnPhase === 'trading') {
        await this.handleTradeResponse();
        continue;
      }

      // Get available actions
      const availableActions = this.engine.getAvailableActions(this.state);
      if (availableActions.length === 0) {
        // No actions available — end turn
        break;
      }

      // Current player acts
      const ctx = this.players.get(player.id)!;

      // Get LLM action
      const action = await this.getLLMAction(ctx, player.id, availableActions);
      if (!action) {
        // LLM failed to produce a valid action after retries — force end turn
        console.log(`  [WARNING] ${player.name} failed to choose an action. Forcing end_turn.`);
        const result = this.engine.applyAction(this.state, { action: 'end_turn' });
        this.state = result.newState;
        actionCount++;
        continue;
      }

      // Apply action
      this.renderer.renderAction(player.name, action.action, this.getActionArgs(action));

      const result = this.engine.applyAction(this.state, action);

      // Send tool result back
      this.sendToolResult(ctx, result.success, result.events, result.error);

      if (result.success) {
        this.state = result.newState;
        this.renderer.renderEvents(result.events, this.state);
        this.logger.logAction(this.state.turnNumber, player.name, action.action, result.events);
      } else {
        this.renderer.renderActionError(result.error ?? 'Unknown error');
      }

      actionCount++;

      // Small delay for readability
      if (this.config.turnDelay > 0) {
        await sleep(this.config.turnDelay);
      }
    }

    if (actionCount >= MAX_ACTIONS_PER_TURN) {
      console.log(`  [WARNING] Turn action limit reached for ${currentPlayer.name}. Forcing end_turn.`);
    }

    // Advance to next player
    this.advanceTurn();

    // Trim history to prevent context overflow
    for (const [, ctx] of this.players) {
      this.trimHistory(ctx);
    }
  }

  private async getLLMAction(
    ctx: PlayerContext,
    playerId: string,
    availableActions: ReturnType<GameEngine['getAvailableActions']>,
  ): Promise<GameAction | null> {
    const tools = translateActionsToTools(availableActions);
    const turnMessage = buildTurnMessage(this.state, playerId);

    // Add turn message to history
    ctx.history.push({ role: 'user', content: turnMessage });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        this.renderer.renderLLMThinking(
          this.state.players.find(p => p.id === playerId)!.name,
        );

        const response = await ctx.adapter.chat(ctx.systemPrompt, ctx.history, tools);

        this.renderer.renderLLMDone();

        // Add assistant message to history
        ctx.history.push(response.rawMessage);

        if (response.toolCalls.length === 0) {
          // LLM didn't use a tool — nudge it
          ctx.history.push({
            role: 'user',
            content: 'You must choose an action by making a tool call. Please select one of the available actions.',
          });
          continue;
        }

        const toolCall = response.toolCalls[0];
        const action = this.parseToolCall(toolCall.name, toolCall.arguments);

        if (action) {
          // Send tool result placeholder (will be updated after applying)
          return action;
        }

        // Invalid tool call
        this.sendToolResult(ctx, false, [], `Invalid action: ${toolCall.name}`);
      } catch (error) {
        this.renderer.renderLLMDone();
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.log(`  [ERROR] LLM call failed: ${msg}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleep(1000); // Back off before retry
        }
      }
    }

    return null;
  }

  private async handleAuction(): Promise<void> {
    const player = this.state.players[this.state.currentPlayerIndex];
    const position = player.position;
    const space = getSpace(position);

    this.renderer.renderAuctionStart(space.name);

    const bids = new Map<string, number>();

    // Get bids from all non-bankrupt players
    for (const p of this.state.players) {
      if (p.isBankrupt) continue;

      const ctx = this.players.get(p.id)!;
      const auctionMessage = buildAuctionMessage(this.state, p.id, position);

      ctx.history.push({ role: 'user', content: auctionMessage });

      const auctionTools = translateActionsToTools(
        this.engine.getAvailableActions(this.state),
      );

      // Override tools with just the bid tool
      const bidTool: ToolDefinition = {
        name: 'submit_bid',
        description: `Submit your bid for ${space.name}. Bid 0 to pass. Max bid: $${p.balance}.`,
        input_schema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: `Your bid amount (0 to ${p.balance})`,
            },
          },
          required: ['amount'],
        },
      };

      try {
        this.renderer.renderLLMThinking(p.name);
        const response = await ctx.adapter.chat(ctx.systemPrompt, ctx.history, [bidTool]);
        this.renderer.renderLLMDone();

        ctx.history.push(response.rawMessage);

        if (response.toolCalls.length > 0) {
          const bid = response.toolCalls[0].arguments.amount as number;
          const validBid = Math.max(0, Math.min(bid, p.balance));
          bids.set(p.id, Math.floor(validBid));
          this.renderer.renderBid(p.name, Math.floor(validBid));

          // Send tool result
          ctx.history.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: response.toolCalls[0].id,
              content: `Bid of $${Math.floor(validBid)} recorded.`,
            }],
          });
        } else {
          bids.set(p.id, 0);
          this.renderer.renderBid(p.name, 0);
        }
      } catch (error) {
        this.renderer.renderLLMDone();
        bids.set(p.id, 0);
        this.renderer.renderBid(p.name, 0);
      }
    }

    // Resolve auction
    const result = this.engine.resolveAuction(this.state, bids, position);
    this.state = result.newState;
    this.renderer.renderEvents(result.events, this.state);
  }

  private async handleTradeResponse(): Promise<void> {
    if (!this.state.activeTrade) {
      this.state.turnPhase = 'post_action';
      return;
    }

    const trade = this.state.activeTrade;
    const targetId = trade.toPlayerId;
    const ctx = this.players.get(targetId)!;

    const tradeMessage = buildTurnMessage(this.state, targetId);
    ctx.history.push({ role: 'user', content: tradeMessage });

    const tools = translateActionsToTools(this.engine.getAvailableActions(this.state));

    try {
      const target = this.state.players.find(p => p.id === targetId)!;
      this.renderer.renderLLMThinking(target.name);
      const response = await ctx.adapter.chat(ctx.systemPrompt, ctx.history, tools);
      this.renderer.renderLLMDone();

      ctx.history.push(response.rawMessage);

      if (response.toolCalls.length > 0) {
        const action = this.parseToolCall(
          response.toolCalls[0].name,
          response.toolCalls[0].arguments,
        );

        if (action && (action.action === 'accept_trade' || action.action === 'reject_trade')) {
          const result = this.engine.applyAction(this.state, action);
          this.sendToolResult(ctx, result.success, result.events, result.error);
          if (result.success) {
            this.state = result.newState;
            this.renderer.renderEvents(result.events, this.state);
          }
          return;
        }
      }
    } catch (error) {
      this.renderer.renderLLMDone();
    }

    // Default: reject trade
    const result = this.engine.applyAction(this.state, { action: 'reject_trade' });
    if (result.success) {
      this.state = result.newState;
      this.renderer.renderEvents(result.events, this.state);
    }
  }

  private parseToolCall(name: string, args: Record<string, unknown>): GameAction | null {
    switch (name) {
      case 'roll_dice':
        return { action: 'roll_dice' };
      case 'buy_property':
        return { action: 'buy_property' };
      case 'auction_property':
        return { action: 'auction_property' };
      case 'build_house':
        return { action: 'build_house', propertyPosition: args.property_position as number };
      case 'build_hotel':
        return { action: 'build_hotel', propertyPosition: args.property_position as number };
      case 'sell_house':
        return { action: 'sell_house', propertyPosition: args.property_position as number };
      case 'mortgage_property':
        return { action: 'mortgage_property', propertyPosition: args.property_position as number };
      case 'unmortgage_property':
        return { action: 'unmortgage_property', propertyPosition: args.property_position as number };
      case 'trade_offer':
        return {
          action: 'trade_offer',
          offer: {
            fromPlayerId: this.state.players[this.state.currentPlayerIndex].id,
            toPlayerId: args.target_player_id as string,
            offeredProperties: (args.offered_properties as number[]) ?? [],
            offeredMoney: (args.offered_money as number) ?? 0,
            requestedProperties: (args.requested_properties as number[]) ?? [],
            requestedMoney: (args.requested_money as number) ?? 0,
          },
        };
      case 'accept_trade':
        return { action: 'accept_trade' };
      case 'reject_trade':
        return { action: 'reject_trade' };
      case 'end_turn':
        return { action: 'end_turn' };
      case 'declare_bankruptcy':
        return { action: 'declare_bankruptcy' };
      case 'use_get_out_of_jail_card':
        return { action: 'use_get_out_of_jail_card' };
      case 'pay_jail_fine':
        return { action: 'pay_jail_fine' };
      case 'submit_bid':
        return { action: 'submit_bid', amount: (args.amount as number) ?? 0 };
      default:
        return null;
    }
  }

  private getActionArgs(action: GameAction): Record<string, unknown> | undefined {
    const { action: name, ...rest } = action as any;
    if (Object.keys(rest).length === 0) return undefined;
    return rest;
  }

  private sendToolResult(
    ctx: PlayerContext,
    success: boolean,
    events: { type: string }[],
    error?: string,
  ): void {
    // Find the last assistant message with a tool_use
    const lastMsg = ctx.history[ctx.history.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    const blocks = Array.isArray(lastMsg.content) ? lastMsg.content : [];
    const toolUseBlock = blocks.find((b: ContentBlock) => b.type === 'tool_use') as
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      | undefined;

    if (!toolUseBlock) return;

    const resultText = success
      ? `Action executed successfully.${events.length > 0 ? ` Events: ${events.map(e => e.type).join(', ')}` : ''}`
      : `Action failed: ${error}`;

    ctx.history.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: resultText,
      }],
    });
  }

  private advanceTurn(): void {
    const player = this.state.players[this.state.currentPlayerIndex];
    player.doublesCount = 0;

    const numPlayers = this.state.players.length;
    let next = (this.state.currentPlayerIndex + 1) % numPlayers;
    let attempts = 0;
    while (this.state.players[next].isBankrupt && attempts < numPlayers) {
      next = (next + 1) % numPlayers;
      attempts++;
    }

    this.state.currentPlayerIndex = next;
    this.state.turnPhase = 'turn_complete';
    this.state.turnNumber++;
    this.state.lastDiceRoll = null;
  }

  private trimHistory(ctx: PlayerContext): void {
    if (ctx.history.length > 60) {
      ctx.history = ctx.history.slice(-40);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
