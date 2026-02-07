import { GameState, PlayerState } from './types';
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS, createShuffledDeck } from './cards';

export function createInitialState(
  playerConfigs: { id: string; name: string }[],
  rng: () => number,
): GameState {
  const players: PlayerState[] = playerConfigs.map(config => ({
    id: config.id,
    name: config.name,
    position: 0,
    balance: 1500,
    properties: new Map(),
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    isBankrupt: false,
    doublesCount: 0,
  }));

  return {
    players,
    currentPlayerIndex: 0,
    turnPhase: 'pre_roll',
    turnNumber: 1,
    lastDiceRoll: null,
    chanceDeck: createShuffledDeck(CHANCE_CARDS, rng),
    communityChestDeck: createShuffledDeck(COMMUNITY_CHEST_CARDS, rng),
    chanceDiscardPile: [],
    communityChestDiscardPile: [],
    bankHouses: 32,
    bankHotels: 12,
    activeTrade: null,
    pendingDebt: null,
    gameLog: [],
    winner: null,
  };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state, (key, value) => {
    if (value instanceof Map) {
      return { __type: 'Map', entries: Array.from(value.entries()) };
    }
    return value;
  }, 2);
}

export function deserializeState(json: string): GameState {
  return JSON.parse(json, (key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Map') {
      return new Map(value.entries);
    }
    return value;
  });
}
