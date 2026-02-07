import { GameState, PlayerState, ScenarioConfig } from './types';
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS, createShuffledDeck } from './cards';
import { getSpace } from './board-data';

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

export function applyScenario(state: GameState, scenario: ScenarioConfig): GameState {
  for (let i = 0; i < scenario.players.length && i < state.players.length; i++) {
    const preset = scenario.players[i];
    const player = state.players[i];

    if (preset.name !== undefined) player.name = preset.name;
    if (preset.balance !== undefined) player.balance = preset.balance;
    if (preset.position !== undefined) player.position = preset.position;
    if (preset.getOutOfJailCards !== undefined) player.getOutOfJailCards = preset.getOutOfJailCards;
    if (preset.inJail !== undefined) {
      player.inJail = preset.inJail;
      if (preset.inJail) player.position = 10; // Jail position
    }

    if (preset.properties) {
      for (const prop of preset.properties) {
        const space = getSpace(prop.position);
        if (!('price' in space)) {
          throw new Error(`Position ${prop.position} (${space.name}) is not an ownable property`);
        }
        player.properties.set(prop.position, {
          houses: prop.houses ?? 0,
          mortgaged: prop.mortgaged ?? false,
        });

        // Deduct houses/hotels from bank supply
        const houses = prop.houses ?? 0;
        if (houses === 5) {
          state.bankHotels--;
        } else if (houses > 0) {
          state.bankHouses -= houses;
        }
      }
    }
  }

  return state;
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
