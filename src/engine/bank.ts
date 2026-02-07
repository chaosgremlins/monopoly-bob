import { GameState, PlayerState, PropertyState } from './types';
import { BOARD_SPACES, isOwnableSpace } from './board-data';

export function getPropertyOwner(state: GameState, position: number): PlayerState | null {
  for (const player of state.players) {
    if (!player.isBankrupt && player.properties.has(position)) {
      return player;
    }
  }
  return null;
}

export function isPropertyOwned(state: GameState, position: number): boolean {
  return getPropertyOwner(state, position) !== null;
}

export function transferPropertyToPlayer(
  state: GameState,
  position: number,
  playerId: string,
): GameState {
  const newState = cloneState(state);
  const player = getPlayerById(newState, playerId);
  player.properties.set(position, { houses: 0, mortgaged: false });
  return newState;
}

export function removePropertyFromPlayer(
  state: GameState,
  position: number,
  playerId: string,
): GameState {
  const newState = cloneState(state);
  const player = getPlayerById(newState, playerId);
  player.properties.delete(position);
  return newState;
}

export function adjustBalance(state: GameState, playerId: string, amount: number): GameState {
  const newState = cloneState(state);
  const player = getPlayerById(newState, playerId);
  player.balance += amount;
  return newState;
}

export function transferMoney(
  state: GameState,
  fromPlayerId: string,
  toPlayerId: string,
  amount: number,
): GameState {
  let newState = cloneState(state);
  const fromPlayer = getPlayerById(newState, fromPlayerId);
  const toPlayer = getPlayerById(newState, toPlayerId);
  fromPlayer.balance -= amount;
  toPlayer.balance += amount;
  return newState;
}

export function getPlayerById(state: GameState, playerId: string): PlayerState {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error(`Player ${playerId} not found`);
  return player;
}

export function countPlayerRailroads(state: GameState, playerId: string): number {
  const player = getPlayerById(state, playerId);
  let count = 0;
  for (const pos of player.properties.keys()) {
    const space = BOARD_SPACES[pos];
    if (space.type === 'railroad' && !player.properties.get(pos)!.mortgaged) {
      count++;
    }
  }
  return count;
}

export function countPlayerUtilities(state: GameState, playerId: string): number {
  const player = getPlayerById(state, playerId);
  let count = 0;
  for (const pos of player.properties.keys()) {
    const space = BOARD_SPACES[pos];
    if (space.type === 'utility' && !player.properties.get(pos)!.mortgaged) {
      count++;
    }
  }
  return count;
}

export function playerOwnsColorGroup(
  state: GameState,
  playerId: string,
  positions: number[],
): boolean {
  const player = getPlayerById(state, playerId);
  return positions.every(pos => player.properties.has(pos));
}

export function countHousesAndHotels(
  state: GameState,
  playerId: string,
): { houses: number; hotels: number } {
  const player = getPlayerById(state, playerId);
  let houses = 0;
  let hotels = 0;
  for (const propState of player.properties.values()) {
    if (propState.houses === 5) {
      hotels++;
    } else {
      houses += propState.houses;
    }
  }
  return { houses, hotels };
}

// Deep clone the game state (properties Maps need special handling)
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      properties: new Map(
        Array.from(p.properties.entries()).map(([k, v]) => [k, { ...v }]),
      ),
    })),
    lastDiceRoll: state.lastDiceRoll ? [...state.lastDiceRoll] : null,
    chanceDeck: [...state.chanceDeck],
    communityChestDeck: [...state.communityChestDeck],
    chanceDiscardPile: [...state.chanceDiscardPile],
    communityChestDiscardPile: [...state.communityChestDiscardPile],
    activeTrade: state.activeTrade ? { ...state.activeTrade } : null,
    pendingDebt: state.pendingDebt ? { ...state.pendingDebt } : null,
    gameLog: [...state.gameLog],
  };
}

export function getActivePlayers(state: GameState): PlayerState[] {
  return state.players.filter(p => !p.isBankrupt);
}
