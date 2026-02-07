import { GameState, PropertySpace, RailroadSpace, UtilitySpace } from './types';
import { BOARD_SPACES, COLOR_GROUP_MEMBERS } from './board-data';
import { getPropertyOwner, countPlayerRailroads, countPlayerUtilities, playerOwnsColorGroup } from './bank';

export function calculateRent(
  state: GameState,
  position: number,
  diceRoll: [number, number],
  cardMultiplier?: number,
): number {
  const space = BOARD_SPACES[position];
  const owner = getPropertyOwner(state, position);

  if (!owner) return 0;

  const propState = owner.properties.get(position);
  if (!propState || propState.mortgaged) return 0;

  switch (space.type) {
    case 'property':
      return calculatePropertyRent(state, space, propState.houses, owner.id);
    case 'railroad':
      return calculateRailroadRent(state, owner.id, cardMultiplier);
    case 'utility':
      return calculateUtilityRent(state, owner.id, diceRoll, cardMultiplier);
    default:
      return 0;
  }
}

function calculatePropertyRent(
  state: GameState,
  space: PropertySpace,
  houses: number,
  ownerId: string,
): number {
  if (houses > 0) {
    // houses index: 1h=1, 2h=2, 3h=3, 4h=4, hotel(5)=5
    return space.rent[houses];
  }

  // No houses — check for monopoly (double rent)
  const groupPositions = COLOR_GROUP_MEMBERS[space.colorGroup];
  if (playerOwnsColorGroup(state, ownerId, groupPositions)) {
    return space.rent[0] * 2;
  }

  return space.rent[0];
}

function calculateRailroadRent(
  state: GameState,
  ownerId: string,
  multiplier?: number,
): number {
  const count = countPlayerRailroads(state, ownerId);
  const baseRent = 25 * Math.pow(2, count - 1); // 25, 50, 100, 200
  return baseRent * (multiplier ?? 1);
}

function calculateUtilityRent(
  state: GameState,
  ownerId: string,
  diceRoll: [number, number],
  multiplier?: number,
): number {
  const diceSum = diceRoll[0] + diceRoll[1];

  if (multiplier) {
    // Card-directed: pay multiplier * dice roll
    return diceSum * multiplier;
  }

  const count = countPlayerUtilities(state, ownerId);
  if (count === 1) return diceSum * 4;
  if (count >= 2) return diceSum * 10;
  return 0;
}
