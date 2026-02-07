import { appendFileSync, readFileSync } from 'fs';
import { GameState, GameAction, TradeOffer, ScenarioConfig } from './engine/types';
import { GameEngine } from './engine/game-engine';
import { createInitialState, applyScenario } from './engine/game-state';
import { getSpace } from './engine/board-data';
import { getActivePlayers, getPlayerById } from './engine/bank';
import { createRng } from './engine/dice';
import { LLMAdapter, ChatMessage, ContentBlock, ToolDefinition, LLMResponse } from './llm/types';
import { STATIC_TOOLS, formatAvailableActions, translateActionsToTools } from './llm/tool-translator';
import { buildSystemPrompt, buildTurnMessage, buildAuctionMessage } from './llm/prompt-builder';
import { Renderer } from './display/renderer';
import { InkRenderer } from './display/ink-renderer';
import { GameLogger } from './logger';
import { GameConfig } from './config';

type AnyRenderer = Renderer | InkRenderer;

const ERROR_LOG = 'monopoly-errors.log';

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
  private renderer: AnyRenderer;
  private logger: GameLogger;
  private config: GameConfig;
  private rng: () => number;
  private totalUsage = { inputTokens: 0, outputTokens: 0, cacheCreation: 0, cacheRead: 0, apiCalls: 0 };

  constructor(config: GameConfig, adapterFactory: (playerName: string) => LLMAdapter, renderer?: AnyRenderer) {
    this.config = config;
    this.rng = createRng(config.seed);
    this.engine = new GameEngine(this.rng);
    this.renderer = renderer ?? new Renderer(config.verbose);
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

    // Apply scenario overrides if provided
    if (config.scenarioFile) {
      const scenarioJson = readFileSync(config.scenarioFile, 'utf-8');
      const scenario: ScenarioConfig = JSON.parse(scenarioJson);
      this.state = applyScenario(this.state, scenario);

      // Update player names in context map if scenario renamed them
      for (let i = 0; i < scenario.players.length && i < this.state.players.length; i++) {
        if (scenario.players[i].name) {
          const player = this.state.players[i];
          const ctx = this.players.get(player.id)!;
          ctx.systemPrompt = buildSystemPrompt(player.name);
        }
      }
    }
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
    this.logUsageSummary();
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
        this.renderer.renderActionError(`[WARNING] ${player.name} failed to choose an action. Forcing end_turn.`);
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
      this.renderer.renderActionError(`[WARNING] Turn action limit reached for ${currentPlayer.name}. Forcing end_turn.`);
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
    const turnMessage = buildTurnMessage(this.state, playerId);
    const actionsText = formatAvailableActions(availableActions);

    // Add turn message + available actions to history
    ctx.history.push({ role: 'user', content: `${turnMessage}\n\n${actionsText}` });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        this.renderer.renderLLMThinking(
          this.state.players.find(p => p.id === playerId)!.name,
        );

        const response = await ctx.adapter.chat(ctx.systemPrompt, ctx.history, STATIC_TOOLS);
        this.trackUsage(response);

        this.renderer.renderLLMDone();

        // Add assistant message to history
        ctx.history.push(response.rawMessage);

        if (response.toolCalls.length === 0) {
          // LLM didn't use a tool — send tool_results for any tool_use blocks
          // in rawMessage (shouldn't happen with tool_choice:'any', but be safe),
          // then nudge it. Combine into one user message to avoid consecutive
          // user messages.
          const blocks = Array.isArray(response.rawMessage.content) ? response.rawMessage.content : [];
          const toolUseBlocks = blocks.filter((b: ContentBlock) => b.type === 'tool_use') as
            { type: 'tool_use'; id: string }[];

          const resultBlocks: ContentBlock[] = toolUseBlocks.map(b => ({
            type: 'tool_result' as const,
            tool_use_id: b.id,
            content: 'You must use a tool call.',
          }));

          if (resultBlocks.length > 0) {
            resultBlocks.push({ type: 'text', text: 'You must choose an action by making a tool call. Please select one of the available actions.' } as any);
            ctx.history.push({ role: 'user', content: resultBlocks });
          } else {
            ctx.history.push({
              role: 'user',
              content: 'You must choose an action by making a tool call. Please select one of the available actions.',
            });
          }
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
        this.renderer.renderActionError(`[ERROR] LLM call failed: ${msg}`);
        this.logError(`getLLMAction attempt ${attempt + 1}/${MAX_RETRIES}`, error, {
          playerId,
          historyLength: ctx.history.length,
        });

        // Repair history before retrying — the error is likely caused by
        // orphaned tool_use blocks without matching tool_results
        ctx.history = sanitizeHistory(ctx.history);

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

      try {
        this.renderer.renderLLMThinking(p.name);
        const response = await ctx.adapter.chat(ctx.systemPrompt, ctx.history, STATIC_TOOLS);
        this.trackUsage(response);
        this.renderer.renderLLMDone();

        ctx.history.push(response.rawMessage);

        if (response.toolCalls.length > 0) {
          const bid = response.toolCalls[0].arguments.amount as number;
          const validBid = Math.max(0, Math.min(bid, p.balance));
          bids.set(p.id, Math.floor(validBid));
          this.renderer.renderBid(p.name, Math.floor(validBid));

          // Send tool results for ALL tool_use blocks in the response
          this.sendToolResult(ctx, true, [], undefined);
          // Overwrite the generic result with the bid-specific one for the first tool
          const lastResultMsg = ctx.history[ctx.history.length - 1];
          if (Array.isArray(lastResultMsg.content) && lastResultMsg.content.length > 0) {
            (lastResultMsg.content[0] as any).content = `Bid of $${Math.floor(validBid)} recorded.`;
          }
        } else {
          bids.set(p.id, 0);
          this.renderer.renderBid(p.name, 0);
          // Even with no toolCalls, the rawMessage might have tool_use blocks.
          // Ensure we send tool_results for any that exist.
          this.sendToolResult(ctx, true, [], undefined);
        }
      } catch (error) {
        this.renderer.renderLLMDone();
        this.logError(`handleAuction bid from ${p.name}`, error, {
          playerId: p.id,
          auctionProperty: space.name,
          historyLength: ctx.history.length,
        });
        // Sanitize history to fix any orphaned tool_use blocks from the failed call
        ctx.history = sanitizeHistory(ctx.history);
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
    const tradeActions = formatAvailableActions(this.engine.getAvailableActions(this.state));
    ctx.history.push({ role: 'user', content: `${tradeMessage}\n\n${tradeActions}` });

    try {
      const target = this.state.players.find(p => p.id === targetId)!;
      this.renderer.renderLLMThinking(target.name);
      const response = await ctx.adapter.chat(ctx.systemPrompt, ctx.history, STATIC_TOOLS);
      this.trackUsage(response);
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

      // LLM didn't return a valid trade response — send tool_results for any
      // tool_use blocks to prevent orphaned blocks, then fall through to reject
      this.sendToolResult(ctx, false, [], 'Invalid response to trade offer.');
    } catch (error) {
      this.renderer.renderLLMDone();
      this.logError(`handleTradeResponse from ${targetId}`, error, {
        targetId,
        historyLength: ctx.history.length,
      });
      // Sanitize history to fix any orphaned tool_use blocks from the failed call
      ctx.history = sanitizeHistory(ctx.history);
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
    // Find the last assistant message with tool_use blocks
    const lastMsg = ctx.history[ctx.history.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    const blocks = Array.isArray(lastMsg.content) ? lastMsg.content : [];
    const toolUseBlocks = blocks.filter((b: ContentBlock) => b.type === 'tool_use') as
      { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }[];

    if (toolUseBlocks.length === 0) return;

    const resultText = success
      ? `Action executed successfully.${events.length > 0 ? ` Events: ${events.map(e => e.type).join(', ')}` : ''}`
      : `Action failed: ${error}`;

    // Send a tool_result for EVERY tool_use block in the assistant message.
    // The API requires each tool_use to have a matching tool_result.
    const resultBlocks: ContentBlock[] = toolUseBlocks.map((toolUse, i) => ({
      type: 'tool_result' as const,
      tool_use_id: toolUse.id,
      // First tool_use gets the real result; extras get a generic acknowledgment
      content: i === 0 ? resultText : 'Acknowledged (only first tool call was processed).',
    }));

    ctx.history.push({
      role: 'user',
      content: resultBlocks,
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

  private trackUsage(response: LLMResponse): void {
    if (!response.usage) return;
    this.totalUsage.inputTokens += response.usage.inputTokens;
    this.totalUsage.outputTokens += response.usage.outputTokens;
    this.totalUsage.cacheCreation += response.usage.cacheCreationInputTokens ?? 0;
    this.totalUsage.cacheRead += response.usage.cacheReadInputTokens ?? 0;
    this.totalUsage.apiCalls++;

    if (this.renderer instanceof InkRenderer) {
      this.renderer.renderUsage({
        apiCalls: this.totalUsage.apiCalls,
        inputTokens: this.totalUsage.inputTokens,
        outputTokens: this.totalUsage.outputTokens,
        cacheRead: this.totalUsage.cacheRead,
        cacheWrite: this.totalUsage.cacheCreation,
      });
    }
  }

  private logUsageSummary(): void {
    const u = this.totalUsage;
    // Per Anthropic docs: input_tokens = tokens AFTER last cache breakpoint (uncached).
    // Total = cache_read + cache_creation + input_tokens
    const totalInput = u.cacheRead + u.cacheCreation + u.inputTokens;
    const cachePct = totalInput > 0 ? Math.round((u.cacheRead / totalInput) * 100) : 0;

    const lines = [
      ``,
      `── Token Usage ──`,
      `  API calls: ${u.apiCalls}`,
      `  Total input: ${totalInput.toLocaleString()} tokens (${cachePct}% cache hit)`,
      `    Cache read: ${u.cacheRead.toLocaleString()} | Cache write: ${u.cacheCreation.toLocaleString()} | Uncached: ${u.inputTokens.toLocaleString()}`,
      `  Output: ${u.outputTokens.toLocaleString()} tokens`,
    ];
    for (const line of lines) {
      this.renderer.renderActionError(line); // reuse as generic log line
    }
  }

  private logError(context: string, error: unknown, extra?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const lines: string[] = [
      `\n${'='.repeat(80)}`,
      `[${timestamp}] ${context}`,
      `Turn: ${this.state.turnNumber} | Player: ${this.state.players[this.state.currentPlayerIndex]?.name ?? '?'}`,
    ];

    if (error instanceof Error) {
      lines.push(`Error: ${error.message}`);
      // Anthropic SDK errors have status and body
      const apiErr = error as any;
      if (apiErr.status) lines.push(`Status: ${apiErr.status}`);
      if (apiErr.error) lines.push(`Body: ${JSON.stringify(apiErr.error, null, 2)}`);
      if (apiErr.headers) {
        const reqId = apiErr.headers?.['request-id'] ?? apiErr.headers?.get?.('request-id');
        if (reqId) lines.push(`Request-ID: ${reqId}`);
      }
      if (error.stack) lines.push(`Stack: ${error.stack}`);
    } else {
      lines.push(`Error: ${String(error)}`);
    }

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        try {
          lines.push(`${key}: ${JSON.stringify(value, null, 2)}`);
        } catch {
          lines.push(`${key}: [unserializable]`);
        }
      }
    }

    lines.push('='.repeat(80));

    try {
      appendFileSync(ERROR_LOG, lines.join('\n') + '\n');
    } catch {
      // Can't write error log — ignore
    }
  }

  private trimHistory(ctx: PlayerContext): void {
    if (ctx.history.length <= 60) return;

    // Slice to last ~40 messages, then find a safe start point.
    let sliced = ctx.history.slice(-40);

    // Walk forward to find the first plain 'user' message (not a tool_result)
    let safeStart = 0;
    for (let i = 0; i < sliced.length; i++) {
      const msg = sliced[i];
      if (msg.role === 'user') {
        const isToolResult = Array.isArray(msg.content) &&
          msg.content.length > 0 &&
          (msg.content[0] as any).type === 'tool_result';
        if (!isToolResult) {
          safeStart = i;
          break;
        }
      }
    }

    sliced = sliced.slice(safeStart);

    // Now sanitize: ensure every assistant message with tool_use blocks
    // has a following user message with matching tool_results.
    ctx.history = sanitizeHistory(sliced);
  }
}

/**
 * Sanitize a conversation history to ensure no orphaned tool_use or tool_result blocks.
 *
 * Rules enforced:
 * 1. Every assistant message with tool_use blocks must be followed by a user message
 *    with matching tool_result blocks for ALL tool_use IDs.
 * 2. No user message should start with tool_result blocks unless preceded by an
 *    assistant message with corresponding tool_use blocks.
 *
 * Fixes applied:
 * - If an assistant message has tool_use blocks but the next message is missing or
 *   doesn't have matching tool_results, insert a synthetic tool_result user message.
 * - If a user message has tool_result blocks with no matching preceding tool_use,
 *   remove it.
 */
export function sanitizeHistory(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    result.push(msg);

    if (msg.role === 'assistant') {
      // Collect all tool_use IDs from this assistant message
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      const toolUseIds = blocks
        .filter((b: ContentBlock) => b.type === 'tool_use')
        .map((b: any) => b.id as string);

      if (toolUseIds.length === 0) continue;

      // Check the next message for matching tool_results
      const next = messages[i + 1];
      if (next && next.role === 'user' && Array.isArray(next.content)) {
        const existingResultIds = new Set(
          next.content
            .filter((b: ContentBlock) => b.type === 'tool_result')
            .map((b: any) => b.tool_use_id as string),
        );

        // Find missing tool_result IDs
        const missingIds = toolUseIds.filter(id => !existingResultIds.has(id));
        if (missingIds.length > 0) {
          // Patch the next message to include the missing tool_results
          const extraBlocks: ContentBlock[] = missingIds.map(id => ({
            type: 'tool_result' as const,
            tool_use_id: id,
            content: 'Acknowledged.',
          }));
          next.content = [...next.content, ...extraBlocks];
        }
      } else {
        // No following user message or it's not a tool_result message — insert one
        const syntheticBlocks: ContentBlock[] = toolUseIds.map(id => ({
          type: 'tool_result' as const,
          tool_use_id: id,
          content: 'Acknowledged.',
        }));
        // Insert synthetic tool_result message right after this assistant message
        // We'll add it to result and skip nothing (the original next message
        // will be processed on the next iteration)
        result.push({ role: 'user', content: syntheticBlocks });
      }
    }
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
