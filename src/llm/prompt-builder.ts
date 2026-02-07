import { GameState, PlayerState, GameEvent, PropertySpace } from '../engine/types';
import { BOARD_SPACES, COLOR_GROUP_MEMBERS, getSpace } from '../engine/board-data';
import { playerOwnsColorGroup } from '../engine/bank';

// Each player gets a distinct strategic personality to create varied playstyles.
const STRATEGY_PROFILES: Record<string, string> = {
  Alice: `Your playstyle: AGGRESSIVE DEVELOPER
You believe in winning through rapid property development. Your priorities:
- Buy every property you land on if you can afford it — property is king.
- Build houses as soon as you complete a color group, even if it leaves you cash-poor.
- Target the orange and red color groups — they have the best ROI.
- Use aggressive auction bids to grab key properties others pass on.
- Mortgage low-value properties to fund building on high-value monopolies.
- You'd rather go all-in and risk going broke than play it safe with cash in hand.
- When trading, overpay if needed to complete a monopoly — the rent income is worth it.`,

  Bob: `Your playstyle: RAILROAD BARON & UTILITY MOGUL
You believe in steady, reliable income from railroads and utilities. Your priorities:
- Prioritize railroads above all else — owning 3-4 railroads is your win condition.
- Utilities are underrated — grab them when you can.
- Be willing to trade away color group properties in exchange for railroads.
- Keep healthy cash reserves ($300+) — you win by outlasting opponents, not quick knockouts.
- Only build houses when you have a large cash surplus and a complete color group.
- In auctions, bid aggressively on railroads but conservatively on everything else.
- Play the long game: let others overextend and bleed them with steady railroad rent.`,

  Charlie: `Your playstyle: SHREWD TRADER
You believe in winning through clever deals. Your priorities:
- Accumulate properties even if they're scattered — they're trading chips.
- Actively propose trades to complete monopolies (yours or to break opponents').
- You'll accept slightly unfavorable trades if they give you a monopoly faster.
- Target the light blue and pink groups — they're cheap to develop and often overlooked.
- Keep moderate cash reserves (~$200-300) to stay flexible.
- Build to 3 houses (the efficiency sweet spot) before pushing further.
- Watch what opponents need and use it as leverage in trades.
- In auctions, drive up the price on properties your opponents need, even if you don't want them.`,

  Diana: `Your playstyle: CASH-RICH CONSERVATIVE
You believe in financial discipline and patience. Your priorities:
- Always maintain a large cash reserve ($400+) — never go below $300 voluntarily.
- Only buy properties that fit your strategic goals; pass on expensive properties you can't develop.
- Prefer the cheaper color groups (brown, light blue, pink) — low cost to monopolize and develop.
- In auctions, look for bargains — bid well below list price, and let others overpay.
- Build houses incrementally — never spend more than half your cash on development at once.
- Mortgage properties rather than going into debt.
- Reject unfavorable trades — don't get pressured into bad deals.
- You win by staying solvent while opponents bankrupt themselves.`,
};

export function buildSystemPrompt(playerName: string): string {
  const strategyProfile = STRATEGY_PROFILES[playerName] ?? STRATEGY_PROFILES['Alice'];

  return `You are playing a game of Monopoly. You are "${playerName}".
Your goal is to bankrupt all other players by acquiring properties, building houses and hotels, and collecting rent.

You play by choosing tool calls that represent your game actions. On each turn you will receive the current game state and a list of available actions. You MUST choose exactly one action by making a tool call.

Key rules:
- You collect $200 each time you pass or land on Go.
- If you land on an unowned property, you may buy it or send it to auction.
- If you land on an owned property, you pay rent to the owner.
- Own all properties in a color group (monopoly) to build houses. Doubles base rent on unimproved properties.
- Houses must be built evenly across a color group.
- 4 houses can be upgraded to a hotel. Hotels collect the highest rent.
- You can mortgage properties to raise cash (no rent collected while mortgaged).
- Three doubles in a row sends you to jail.
- In jail: roll doubles, pay $50, or use a Get Out of Jail Free card.

${strategyProfile}

General knowledge:
- Orange and red properties are landed on most frequently.
- Building to 3 houses is the most cost-effective development level.
- IMPORTANT: When you have a monopoly, build houses! It dramatically increases rent.

${buildBoardReference()}`;
}

function buildBoardReference(): string {
  const lines: string[] = ['BOARD REFERENCE (all 40 spaces):'];
  lines.push('');

  const groups: Record<string, string[]> = {};

  for (const space of BOARD_SPACES) {
    if (space.type === 'property') {
      const group = space.colorGroup;
      if (!groups[group]) groups[group] = [];
      groups[group].push(
        `  Pos ${space.position}: ${space.name} — $${space.price}, house $${space.houseCost}, rent [${space.rent.join(', ')}]`
      );
    }
  }

  for (const [group, props] of Object.entries(groups)) {
    lines.push(`${group.toUpperCase()} GROUP:`);
    for (const p of props) lines.push(p);
    lines.push('');
  }

  lines.push('RAILROADS ($200 each, rent: $25/$50/$100/$200 for 1/2/3/4 owned):');
  for (const space of BOARD_SPACES) {
    if (space.type === 'railroad') {
      lines.push(`  Pos ${space.position}: ${space.name}`);
    }
  }
  lines.push('');

  lines.push('UTILITIES ($150 each, rent: 4x/10x dice roll for 1/2 owned):');
  for (const space of BOARD_SPACES) {
    if (space.type === 'utility') {
      lines.push(`  Pos ${space.position}: ${space.name}`);
    }
  }
  lines.push('');

  lines.push('SPECIAL SPACES:');
  lines.push('  Pos 0: Go (collect $200)');
  lines.push('  Pos 4: Income Tax ($200)');
  lines.push('  Pos 10: Jail / Just Visiting');
  lines.push('  Pos 20: Free Parking');
  lines.push('  Pos 30: Go To Jail');
  lines.push('  Pos 38: Luxury Tax ($100)');
  lines.push('  Chance: Pos 7, 22, 36');
  lines.push('  Community Chest: Pos 2, 17, 33');

  return lines.join('\n');
}

export function buildTurnMessage(state: GameState, actingPlayerId: string): string {
  const player = state.players.find(p => p.id === actingPlayerId)!;
  const space = getSpace(player.position);

  const lines: string[] = [
    `=== TURN ${state.turnNumber} ===`,
    `Phase: ${formatPhase(state.turnPhase)}`,
    '',
    `YOUR STATUS (${player.name}):`,
    `  Position: ${space.name} (space ${player.position})`,
    `  Balance: $${player.balance}`,
    `  Properties: ${formatPlayerProperties(player)}`,
    `  Get Out of Jail Free cards: ${player.getOutOfJailCards}`,
  ];

  if (player.inJail) {
    lines.push(`  IN JAIL (turn ${player.jailTurns + 1} of 3)`);
  }

  if (state.lastDiceRoll) {
    lines.push(`  Last dice roll: [${state.lastDiceRoll[0]}][${state.lastDiceRoll[1]}] = ${state.lastDiceRoll[0] + state.lastDiceRoll[1]}`);
  }

  lines.push('');
  lines.push('OTHER PLAYERS:');
  for (const other of state.players) {
    if (other.id === actingPlayerId) continue;
    if (other.isBankrupt) {
      lines.push(`  ${other.name}: BANKRUPT`);
    } else {
      const otherSpace = getSpace(other.position);
      lines.push(`  ${other.name}: $${other.balance} | ${otherSpace.name} (space ${other.position}) | ${other.properties.size} properties${other.inJail ? ' | IN JAIL' : ''}`);
    }
  }

  // Show recent events
  const recentEvents = state.gameLog.slice(-8);
  if (recentEvents.length > 0) {
    lines.push('');
    lines.push('RECENT EVENTS:');
    for (const event of recentEvents) {
      lines.push(`  ${formatEvent(event, state)}`);
    }
  }

  // Show pending debt
  if (state.pendingDebt) {
    lines.push('');
    lines.push(`*** DEBT: You owe $${state.pendingDebt.amount} to ${state.pendingDebt.creditor === 'bank' ? 'the Bank' : state.pendingDebt.creditor} for ${state.pendingDebt.reason}. Raise funds or declare bankruptcy. ***`);
  }

  // Show active trade
  if (state.activeTrade) {
    const trade = state.activeTrade;
    lines.push('');
    lines.push('TRADE OFFER:');
    const from = state.players.find(p => p.id === trade.fromPlayerId)!;
    lines.push(`  From: ${from.name}`);
    lines.push(`  Offering: ${formatTradeItems(trade.offeredProperties, trade.offeredMoney)}`);
    lines.push(`  Requesting: ${formatTradeItems(trade.requestedProperties, trade.requestedMoney)}`);
  }

  // Highlight buildable monopolies
  const buildHints = getBuildHints(state, player);
  if (buildHints.length > 0) {
    lines.push('');
    lines.push('*** BUILDING OPPORTUNITY ***');
    for (const hint of buildHints) {
      lines.push(`  ${hint}`);
    }
    lines.push('  TIP: Building houses dramatically increases rent. Consider building before ending your turn!');
  }

  // Board overview — list all owned properties
  lines.push('');
  lines.push('PROPERTY OWNERSHIP:');
  for (const p of state.players) {
    if (p.isBankrupt || p.properties.size === 0) continue;
    const props = Array.from(p.properties.entries())
      .map(([pos, ps]) => {
        const s = getSpace(pos);
        let info = s.name;
        if (ps.mortgaged) info += ' [M]';
        if (ps.houses === 5) info += ' [Hotel]';
        else if (ps.houses > 0) info += ` [${ps.houses}H]`;
        return info;
      })
      .join(', ');
    lines.push(`  ${p.name}: ${props}`);
  }

  return lines.join('\n');
}

export function buildAuctionMessage(
  state: GameState,
  biddingPlayerId: string,
  propertyPosition: number,
): string {
  const player = state.players.find(p => p.id === biddingPlayerId)!;
  const space = getSpace(propertyPosition);

  return [
    `=== AUCTION ===`,
    `Property: ${space.name} (position ${propertyPosition})`,
    `List price: $${(space as any).price}`,
    `Your balance: $${player.balance}`,
    '',
    'Submit your bid. Bid 0 to pass. Highest bidder wins.',
  ].join('\n');
}

function getBuildHints(state: GameState, player: PlayerState): string[] {
  const hints: string[] = [];

  for (const [colorGroup, positions] of Object.entries(COLOR_GROUP_MEMBERS)) {
    if (!playerOwnsColorGroup(state, player.id, positions)) continue;

    const anyMortgaged = positions.some(p => player.properties.get(p)?.mortgaged);
    if (anyMortgaged) continue;

    const propsInfo = positions.map(pos => {
      const space = getSpace(pos) as PropertySpace;
      const ps = player.properties.get(pos)!;
      return { space, ps, pos };
    });

    const minHouses = Math.min(...propsInfo.map(p => p.ps.houses));
    const maxHouses = Math.max(...propsInfo.map(p => p.ps.houses));
    const houseCost = propsInfo[0].space.houseCost;

    if (maxHouses >= 5) {
      // Fully developed
      continue;
    }

    if (player.balance < houseCost) {
      hints.push(`You have the ${colorGroup} monopoly but can't afford to build ($${houseCost}/house, you have $${player.balance}).`);
      continue;
    }

    const buildable = propsInfo.filter(p => p.ps.houses <= minHouses && p.ps.houses < 4);
    const names = buildable.map(p => `${p.space.name} (pos ${p.pos})`).join(', ');
    const currentRent = propsInfo[0].space.rent[minHouses] * (minHouses === 0 ? 2 : 1);
    const nextRent = propsInfo[0].space.rent[minHouses + 1];

    hints.push(`${colorGroup} monopoly: can build on ${names} for $${houseCost}/house. Rent jumps from $${currentRent} to $${nextRent}.`);
  }

  return hints;
}

function formatPhase(phase: string): string {
  return phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatPlayerProperties(player: PlayerState): string {
  if (player.properties.size === 0) return 'None';

  const groups = new Map<string, string[]>();

  for (const [pos, propState] of player.properties) {
    const space = getSpace(pos);
    let groupName: string;
    if (space.type === 'property') groupName = space.colorGroup;
    else if (space.type === 'railroad') groupName = 'railroads';
    else groupName = 'utilities';

    if (!groups.has(groupName)) groups.set(groupName, []);

    let label = space.name;
    if (propState.mortgaged) label += ' [M]';
    if (propState.houses === 5) label += ' [Hotel]';
    else if (propState.houses > 0) label += ` [${propState.houses}H]`;
    groups.get(groupName)!.push(label);
  }

  return Array.from(groups.entries())
    .map(([group, props]) => `${group}: ${props.join(', ')}`)
    .join(' | ');
}

function formatTradeItems(properties: number[], money: number): string {
  const parts: string[] = [];
  if (properties.length > 0) {
    parts.push(properties.map(p => getSpace(p).name).join(', '));
  }
  if (money > 0) {
    parts.push(`$${money}`);
  }
  return parts.length > 0 ? parts.join(' + ') : 'Nothing';
}

function formatEvent(event: GameEvent, state: GameState): string {
  const playerName = (id: string) => state.players.find(p => p.id === id)?.name ?? id;

  switch (event.type) {
    case 'roll_dice':
      return `${playerName(event.playerId)} rolled [${event.dice[0]}][${event.dice[1]}]${event.doubles ? ' DOUBLES!' : ''}`;
    case 'move':
      return `${playerName(event.playerId)} moved to ${getSpace(event.to).name}${event.passedGo ? ' (passed Go!)' : ''}`;
    case 'land':
      return `${playerName(event.playerId)} landed on ${event.spaceName}`;
    case 'pay_rent':
      return `${playerName(event.payerId)} paid $${event.amount} rent to ${playerName(event.ownerId)} for ${event.property}`;
    case 'buy_property':
      return `${playerName(event.playerId)} bought ${event.property} for $${event.price}`;
    case 'auction_won':
      return `${playerName(event.playerId)} won auction for ${event.property} at $${event.price}`;
    case 'auction_no_bids':
      return `No bids on ${event.property}`;
    case 'build_house':
      return `${playerName(event.playerId)} built house on ${event.property} (${event.houses} houses)`;
    case 'build_hotel':
      return `${playerName(event.playerId)} built hotel on ${event.property}`;
    case 'draw_card':
      return `${playerName(event.playerId)} drew ${event.deck}: "${event.cardText}"`;
    case 'pay_tax':
      return `${playerName(event.playerId)} paid $${event.amount} ${event.taxName}`;
    case 'go_to_jail':
      return `${playerName(event.playerId)} went to Jail: ${event.reason}`;
    case 'get_out_of_jail':
      return `${playerName(event.playerId)} got out of Jail: ${event.method}`;
    case 'mortgage':
      return `${playerName(event.playerId)} mortgaged ${event.property} for $${event.received}`;
    case 'unmortgage':
      return `${playerName(event.playerId)} unmortgaged ${event.property} for $${event.cost}`;
    case 'trade_completed':
      return `Trade completed: ${event.fromPlayer} <-> ${event.toPlayer}: ${event.description}`;
    case 'trade_rejected':
      return `${event.toPlayer} rejected trade from ${event.fromPlayer}`;
    case 'bankruptcy':
      return `${playerName(event.playerId)} declared BANKRUPTCY!`;
    case 'game_over':
      return `GAME OVER! ${playerName(event.winnerId)} wins! ${event.reason}`;
    case 'pass_go':
      return `${playerName(event.playerId)} passed Go and collected $${event.collected}`;
    case 'collect':
      return `${playerName(event.playerId)} collected $${event.amount}: ${event.reason}`;
    case 'pay':
      return `${playerName(event.playerId)} paid $${event.amount}: ${event.reason}`;
    case 'transfer':
      return `${playerName(event.fromPlayerId)} paid $${event.amount} to ${playerName(event.toPlayerId)}: ${event.reason}`;
    case 'sell_house':
      return `${playerName(event.playerId)} sold house on ${event.property} (${event.houses} houses remain)`;
    case 'auction_start':
      return `Auction started for ${event.property}`;
    case 'auction_bid':
      return `${playerName(event.playerId)} bid $${event.amount}`;
    default:
      return JSON.stringify(event);
  }
}
