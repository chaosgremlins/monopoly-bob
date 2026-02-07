import { GameState, PlayerState, GameEvent, PropertySpace } from '../engine/types';
import { BOARD_SPACES, COLOR_GROUP_MEMBERS, getSpace } from '../engine/board-data';
import { playerOwnsColorGroup } from '../engine/bank';

export function buildSystemPrompt(playerName: string): string {
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

Strategy tips:
- Orange and red properties are landed on most frequently.
- Completing color groups is essential — trade to get monopolies.
- Railroads provide steady income early game.
- Building to 3 houses is the most cost-effective development level.
- Keep cash reserves for rent payments.
- Mortgage low-value properties before high-value ones.`;
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
