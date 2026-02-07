import { GameState, GameEvent } from '../engine/types';
import { getSpace } from '../engine/board-data';

export interface DisplayState {
  gameState: GameState | null;
  eventLog: string[];
  thinkingPlayer: string | null;
  turnNumber: number;
  gameOver: boolean;
  gameOverSummary: string[];
}

type Listener = () => void;

/** Bridge between the imperative game loop and the reactive Ink UI */
export class InkRenderer {
  private state: DisplayState = {
    gameState: null,
    eventLog: [],
    thinkingPlayer: null,
    turnNumber: 0,
    gameOver: false,
    gameOverSummary: [],
  };

  private listeners: Set<Listener> = new Set();

  getState(): DisplayState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private pushLog(msg: string): void {
    this.state.eventLog = [...this.state.eventLog, msg];
  }

  renderGameStart(state: GameState): void {
    this.state = { ...this.state, gameState: state, turnNumber: state.turnNumber };
    this.notify();
  }

  renderTurnStart(state: GameState): void {
    const player = state.players[state.currentPlayerIndex];
    this.state = { ...this.state, gameState: state, turnNumber: state.turnNumber };
    this.pushLog(`── TURN ${state.turnNumber}: ${player.name}'s turn ──`);
    this.notify();
  }

  renderEvents(events: GameEvent[], state: GameState): void {
    this.state = { ...this.state, gameState: state };
    for (const event of events) {
      const msg = this.formatEvent(event, state);
      if (msg) this.pushLog(msg);
    }
    this.notify();
  }

  renderAction(playerName: string, actionName: string, args?: Record<string, unknown>): void {
    const argsStr = args && Object.keys(args).length > 0
      ? ` ${JSON.stringify(args)}`
      : '';
    this.pushLog(`→ ${playerName}: ${actionName}${argsStr}`);
    this.notify();
  }

  renderActionError(error: string): void {
    this.pushLog(`✗ ${error}`);
    this.notify();
  }

  renderLLMThinking(playerName: string): void {
    this.state = { ...this.state, thinkingPlayer: playerName };
    this.notify();
  }

  renderLLMDone(): void {
    this.state = { ...this.state, thinkingPlayer: null };
    this.notify();
  }

  renderPlayerStatus(state: GameState): void {
    this.state = { ...this.state, gameState: state };
    this.notify();
  }

  renderAuctionStart(propertyName: string): void {
    this.pushLog(`AUCTION: ${propertyName}`);
    this.notify();
  }

  renderBid(playerName: string, amount: number): void {
    this.pushLog(amount > 0 ? `  ${playerName} bids $${amount}` : `  ${playerName} passes`);
    this.notify();
  }

  renderGameOver(state: GameState): void {
    this.state = { ...this.state, gameState: state, gameOver: true };

    const summary: string[] = [];
    if (state.winner) {
      const winner = state.players.find(p => p.id === state.winner)!;
      summary.push(`GAME OVER — ${winner.name} WINS!`);
    } else {
      summary.push('GAME OVER — No winner (turn limit reached)');
    }
    summary.push('');

    const ranked = [...state.players].sort((a, b) => {
      if (a.isBankrupt && !b.isBankrupt) return 1;
      if (!a.isBankrupt && b.isBankrupt) return -1;
      return this.calculateNetWorth(b) - this.calculateNetWorth(a);
    });

    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i];
      if (p.isBankrupt) {
        summary.push(`  ${i + 1}. ${p.name} — BANKRUPT`);
      } else {
        const nw = this.calculateNetWorth(p);
        summary.push(`  ${i + 1}. ${p.name} — $${nw} net worth ($${p.balance} cash, ${p.properties.size} props)`);
      }
    }

    summary.push('');
    summary.push(`Game ended after ${state.turnNumber} turns`);

    this.state.gameOverSummary = summary;
    for (const line of summary) this.pushLog(line);
    this.notify();
  }

  private calculateNetWorth(player: { balance: number; properties: Map<number, any> }): number {
    let worth = player.balance;
    for (const [pos, propState] of player.properties) {
      const space = getSpace(pos);
      if ('price' in space) worth += (space as any).price;
      if (space.type === 'property' && propState.houses > 0) {
        worth += (space as any).houseCost * (propState.houses === 5 ? 5 : propState.houses);
      }
    }
    return worth;
  }

  private formatEvent(event: GameEvent, state: GameState): string | null {
    const pn = (id: string) => state.players.find(p => p.id === id)?.name ?? id;

    switch (event.type) {
      case 'roll_dice':
        return `🎲 ${pn(event.playerId)} rolled [${event.dice[0]}][${event.dice[1]}] = ${event.dice[0] + event.dice[1]}${event.doubles ? ' DOUBLES!' : ''}`;
      case 'move':
        return null;
      case 'land':
        return `📍 Landed on ${event.spaceName}`;
      case 'pass_go':
        return `💰 Passed Go! +$200`;
      case 'pay_rent':
        return `💸 ${pn(event.payerId)} paid $${event.amount} rent to ${pn(event.ownerId)} (${event.property})`;
      case 'buy_property':
        return `🏠 ${pn(event.playerId)} bought ${event.property} for $${event.price}`;
      case 'auction_start':
        return null;
      case 'auction_bid':
        return null;
      case 'auction_won':
        return `🔨 ${pn(event.playerId)} won ${event.property} at $${event.price}`;
      case 'auction_no_bids':
        return `🔨 No bids on ${event.property}`;
      case 'build_house':
        return `🏗️ ${pn(event.playerId)} built on ${event.property} (${event.houses}H)`;
      case 'build_hotel':
        return `🏨 ${pn(event.playerId)} HOTEL on ${event.property}`;
      case 'sell_house':
        return `📉 ${pn(event.playerId)} sold house on ${event.property}`;
      case 'draw_card':
        return `🃏 ${event.deck}: "${event.cardText}"`;
      case 'pay_tax':
        return `💰 ${pn(event.playerId)} paid $${event.amount} ${event.taxName}`;
      case 'go_to_jail':
        return `🚔 ${pn(event.playerId)} → JAIL (${event.reason})`;
      case 'get_out_of_jail':
        return `🔓 ${pn(event.playerId)} out of jail: ${event.method}`;
      case 'mortgage':
        return `📋 ${pn(event.playerId)} mortgaged ${event.property} +$${event.received}`;
      case 'unmortgage':
        return `📋 ${pn(event.playerId)} unmortgaged ${event.property} -$${event.cost}`;
      case 'trade_completed':
        return `🤝 Trade: ${event.fromPlayer} ↔ ${event.toPlayer}`;
      case 'trade_rejected':
        return `❌ ${event.toPlayer} rejected trade`;
      case 'bankruptcy':
        return `💀 ${pn(event.playerId)} BANKRUPT!`;
      case 'game_over':
        return null;
      case 'collect':
        return `💰 ${pn(event.playerId)} +$${event.amount} (${event.reason})`;
      case 'pay':
        return `💸 ${pn(event.playerId)} -$${event.amount} (${event.reason})`;
      case 'transfer':
        return `💸 ${pn(event.fromPlayerId)} → ${pn(event.toPlayerId)}: $${event.amount}`;
      default:
        return null;
    }
  }
}
