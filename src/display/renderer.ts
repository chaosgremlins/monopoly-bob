import chalk from 'chalk';
import { GameState, GameEvent, PlayerState } from '../engine/types';
import { getSpace, BOARD_SPACES, COLOR_GROUP_MEMBERS } from '../engine/board-data';
import { PLAYER_COLORS, COLOR_MAP, BOLD, MONEY, DANGER, DIM } from './colors';

const DIVIDER = chalk.dim('─'.repeat(80));

export class Renderer {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  renderGameStart(state: GameState): void {
    console.log('');
    console.log(BOLD(chalk.whiteBright('╔══════════════════════════════════════════════════╗')));
    console.log(BOLD(chalk.whiteBright('║            M O N O P O L Y   E V A L            ║')));
    console.log(BOLD(chalk.whiteBright('║           LLM vs LLM Board Game Simulation       ║')));
    console.log(BOLD(chalk.whiteBright('╚══════════════════════════════════════════════════╝')));
    console.log('');

    console.log(BOLD('Players:'));
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      console.log(`  ${color(`[${i + 1}]`)} ${color(p.name)} — $${p.balance}`);
    }
    console.log('');
    console.log(DIVIDER);
  }

  renderTurnStart(state: GameState): void {
    const player = state.players[state.currentPlayerIndex];
    const idx = state.currentPlayerIndex;
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    const space = getSpace(player.position);

    console.log('');
    console.log(BOLD(color(`━━━ TURN ${state.turnNumber}: ${player.name}'s turn ━━━`)));
    console.log(`  Position: ${space.name} (${player.position}) | Balance: ${MONEY(`$${player.balance}`)} | Properties: ${player.properties.size}`);
    if (player.inJail) {
      console.log(DANGER(`  🔒 IN JAIL (attempt ${player.jailTurns + 1}/3)`));
    }
  }

  renderEvents(events: GameEvent[], state: GameState): void {
    for (const event of events) {
      const msg = this.formatEvent(event, state);
      if (msg) {
        console.log(`  ${msg}`);
      }
    }
  }

  renderPlayerStatus(state: GameState): void {
    console.log('');
    console.log(DIM('  Players:'));
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const space = getSpace(p.position);

      if (p.isBankrupt) {
        console.log(DIM(`    ${p.name}: BANKRUPT`));
        continue;
      }

      const propCount = p.properties.size;
      const indicator = i === state.currentPlayerIndex ? '→ ' : '  ';
      console.log(`  ${indicator}${color(p.name)}: ${MONEY(`$${p.balance}`)} | ${space.name} | ${propCount} props${p.inJail ? DANGER(' [JAIL]') : ''}`);
    }
  }

  renderAction(playerName: string, actionName: string, args?: Record<string, unknown>): void {
    const argsStr = args && Object.keys(args).length > 0
      ? ` ${DIM(JSON.stringify(args))}`
      : '';
    console.log(`  ${DIM('→')} ${playerName} chose: ${BOLD(actionName)}${argsStr}`);
  }

  renderActionError(error: string): void {
    console.log(`  ${DANGER(`✗ ${error}`)}`);
  }

  renderLLMThinking(playerName: string): void {
    process.stdout.write(`  ${DIM(`${playerName} is thinking...`)}`);
  }

  renderLLMDone(): void {
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }

  renderGameOver(state: GameState): void {
    console.log('');
    console.log(DIVIDER);
    console.log('');

    if (state.winner) {
      const winner = state.players.find(p => p.id === state.winner)!;
      const idx = state.players.indexOf(winner);
      const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];

      console.log(BOLD(chalk.whiteBright('╔══════════════════════════════════════════════════╗')));
      console.log(BOLD(chalk.whiteBright(`║  GAME OVER — ${color(winner.name)} WINS!`)).padEnd(61) + BOLD(chalk.whiteBright('║')));
      console.log(BOLD(chalk.whiteBright('╚══════════════════════════════════════════════════╝')));
    } else {
      console.log(BOLD('GAME OVER — No winner (turn limit reached)'));
    }

    console.log('');
    console.log(BOLD('Final standings:'));
    const ranked = [...state.players].sort((a, b) => {
      if (a.isBankrupt && !b.isBankrupt) return 1;
      if (!a.isBankrupt && b.isBankrupt) return -1;
      return this.calculateNetWorth(b, state) - this.calculateNetWorth(a, state);
    });

    for (let rank = 0; rank < ranked.length; rank++) {
      const p = ranked[rank];
      const idx = state.players.indexOf(p);
      const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];

      if (p.isBankrupt) {
        console.log(`  ${rank + 1}. ${DIM(p.name)} — BANKRUPT`);
      } else {
        const netWorth = this.calculateNetWorth(p, state);
        console.log(`  ${rank + 1}. ${color(p.name)} — Net worth: ${MONEY(`$${netWorth}`)} (Cash: $${p.balance}, ${p.properties.size} properties)`);
      }
    }

    console.log('');
    console.log(DIM(`Game ended after ${state.turnNumber} turns`));
  }

  renderAuctionStart(propertyName: string): void {
    console.log(`  ${BOLD(`AUCTION: ${propertyName}`)}`);
  }

  renderBid(playerName: string, amount: number): void {
    if (amount > 0) {
      console.log(`    ${playerName} bids ${MONEY(`$${amount}`)}`);
    } else {
      console.log(`    ${playerName} ${DIM('passes')}`);
    }
  }

  private calculateNetWorth(player: PlayerState, state: GameState): number {
    let worth = player.balance;
    for (const [pos, propState] of player.properties) {
      const space = getSpace(pos);
      if ('price' in space) {
        worth += space.price;
      }
      if (space.type === 'property' && propState.houses > 0) {
        const houseCost = propState.houses === 5
          ? space.houseCost * 5  // 4 houses + 1 hotel equivalent
          : space.houseCost * propState.houses;
        worth += houseCost;
      }
    }
    return worth;
  }

  private formatEvent(event: GameEvent, state: GameState): string | null {
    const pn = (id: string) => {
      const p = state.players.find(p => p.id === id);
      if (!p) return id;
      const idx = state.players.indexOf(p);
      return PLAYER_COLORS[idx % PLAYER_COLORS.length](p.name);
    };

    switch (event.type) {
      case 'roll_dice':
        return `🎲 ${pn(event.playerId)} rolled [${event.dice[0]}][${event.dice[1]}] = ${event.dice[0] + event.dice[1]}${event.doubles ? BOLD(' DOUBLES!') : ''}`;
      case 'move':
        return null; // Suppress move events (land event is more useful)
      case 'land':
        return `📍 Landed on ${BOLD(event.spaceName)}`;
      case 'pass_go':
        return `💰 Passed Go! Collected ${MONEY('$200')}`;
      case 'pay_rent':
        return `💸 ${pn(event.payerId)} paid ${DANGER(`$${event.amount}`)} rent to ${pn(event.ownerId)} for ${event.property}`;
      case 'buy_property':
        return `🏠 ${pn(event.playerId)} bought ${BOLD(event.property)} for ${MONEY(`$${event.price}`)}`;
      case 'auction_start':
        return null; // Handled by renderAuctionStart
      case 'auction_bid':
        return null; // Handled by renderBid
      case 'auction_won':
        return `🔨 ${pn(event.playerId)} won auction for ${BOLD(event.property)} at ${MONEY(`$${event.price}`)}`;
      case 'auction_no_bids':
        return `🔨 No bids on ${event.property} — remains unowned`;
      case 'build_house':
        return `🏗️  ${pn(event.playerId)} built house on ${event.property} (${event.houses} houses)`;
      case 'build_hotel':
        return `🏨 ${pn(event.playerId)} built HOTEL on ${event.property}`;
      case 'sell_house':
        return `📉 ${pn(event.playerId)} sold house on ${event.property} (${event.houses} remain)`;
      case 'draw_card':
        return `🃏 ${pn(event.playerId)} drew ${event.deck}: "${event.cardText}"`;
      case 'pay_tax':
        return `💰 ${pn(event.playerId)} paid ${DANGER(`$${event.amount}`)} ${event.taxName}`;
      case 'go_to_jail':
        return `🚔 ${pn(event.playerId)} goes to JAIL! (${event.reason})`;
      case 'get_out_of_jail':
        return `🔓 ${pn(event.playerId)} got out of jail: ${event.method}`;
      case 'mortgage':
        return `📋 ${pn(event.playerId)} mortgaged ${event.property} for ${MONEY(`$${event.received}`)}`;
      case 'unmortgage':
        return `📋 ${pn(event.playerId)} unmortgaged ${event.property} for ${DANGER(`$${event.cost}`)}`;
      case 'trade_completed':
        return `🤝 Trade completed: ${event.fromPlayer} ↔ ${event.toPlayer}: ${event.description}`;
      case 'trade_rejected':
        return `❌ ${event.toPlayer} rejected trade from ${event.fromPlayer}`;
      case 'bankruptcy':
        return DANGER(`💀 ${pn(event.playerId)} declared BANKRUPTCY!`);
      case 'game_over':
        return null; // Handled by renderGameOver
      case 'collect':
        return `💰 ${pn(event.playerId)} collected ${MONEY(`$${event.amount}`)}: ${event.reason}`;
      case 'pay':
        return `💸 ${pn(event.playerId)} paid ${DANGER(`$${event.amount}`)}: ${event.reason}`;
      case 'transfer':
        return `💸 ${pn(event.fromPlayerId)} paid ${DANGER(`$${event.amount}`)} to ${pn(event.toPlayerId)}: ${event.reason}`;
      default:
        return DIM(JSON.stringify(event));
    }
  }
}
