import { describe, it, expect } from 'bun:test';
import { createInitialState, serializeState, deserializeState, applyScenario } from '../src/engine/game-state';
import { createRng } from '../src/engine/dice';
import { ScenarioConfig } from '../src/engine/types';

describe('game-state', () => {
  describe('createInitialState', () => {
    it('creates correct number of players', () => {
      const state = createInitialState(
        [{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }],
        createRng(1),
      );
      expect(state.players).toHaveLength(2);
    });

    it('all players start at position 0 with $1500', () => {
      const state = createInitialState(
        [{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }, { id: 'p2', name: 'C' }],
        createRng(1),
      );
      for (const p of state.players) {
        expect(p.position).toBe(0);
        expect(p.balance).toBe(1500);
        expect(p.properties.size).toBe(0);
        expect(p.inJail).toBe(false);
        expect(p.isBankrupt).toBe(false);
      }
    });

    it('starts on turn 1 with pre_roll phase', () => {
      const state = createInitialState([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], createRng(1));
      expect(state.turnNumber).toBe(1);
      expect(state.turnPhase).toBe('pre_roll');
      expect(state.currentPlayerIndex).toBe(0);
    });

    it('initializes bank with 32 houses and 12 hotels', () => {
      const state = createInitialState([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], createRng(1));
      expect(state.bankHouses).toBe(32);
      expect(state.bankHotels).toBe(12);
    });

    it('shuffles card decks', () => {
      const state = createInitialState([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], createRng(1));
      expect(state.chanceDeck).toHaveLength(16);
      expect(state.communityChestDeck).toHaveLength(16);
    });
  });

  describe('applyScenario', () => {
    function makeState() {
      return createInitialState(
        [{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }],
        createRng(1),
      );
    }

    it('overrides player balances', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [{ balance: 500 }, { balance: 2000 }],
      };
      applyScenario(state, scenario);
      expect(state.players[0].balance).toBe(500);
      expect(state.players[1].balance).toBe(2000);
    });

    it('overrides player names', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [{ name: 'Xander' }, {}],
      };
      applyScenario(state, scenario);
      expect(state.players[0].name).toBe('Xander');
      expect(state.players[1].name).toBe('B'); // unchanged
    });

    it('overrides player positions', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [{ position: 24 }, { position: 5 }],
      };
      applyScenario(state, scenario);
      expect(state.players[0].position).toBe(24);
      expect(state.players[1].position).toBe(5);
    });

    it('assigns properties to players', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [
          { properties: [{ position: 1 }, { position: 3, houses: 2 }] },
          { properties: [{ position: 5 }, { position: 15, mortgaged: true }] },
        ],
      };
      applyScenario(state, scenario);
      expect(state.players[0].properties.size).toBe(2);
      expect(state.players[0].properties.get(1)?.houses).toBe(0);
      expect(state.players[0].properties.get(3)?.houses).toBe(2);
      expect(state.players[1].properties.get(5)?.mortgaged).toBe(false);
      expect(state.players[1].properties.get(15)?.mortgaged).toBe(true);
    });

    it('deducts houses from bank supply', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [
          { properties: [{ position: 1, houses: 3 }, { position: 3, houses: 2 }] },
          {},
        ],
      };
      applyScenario(state, scenario);
      expect(state.bankHouses).toBe(32 - 5);
    });

    it('deducts hotels from bank supply', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [
          { properties: [{ position: 1, houses: 5 }] },
          {},
        ],
      };
      applyScenario(state, scenario);
      expect(state.bankHotels).toBe(12 - 1);
      expect(state.bankHouses).toBe(32); // hotels don't consume houses
    });

    it('sets jail status and forces position to 10', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [{ inJail: true }, {}],
      };
      applyScenario(state, scenario);
      expect(state.players[0].inJail).toBe(true);
      expect(state.players[0].position).toBe(10);
    });

    it('throws for non-ownable positions', () => {
      const state = makeState();
      const scenario: ScenarioConfig = {
        players: [{ properties: [{ position: 0 }] }, {}], // GO is not ownable
      };
      expect(() => applyScenario(state, scenario)).toThrow('not an ownable property');
    });

    it('ignores extra players in scenario beyond game player count', () => {
      const state = makeState(); // 2 players
      const scenario: ScenarioConfig = {
        players: [{ balance: 100 }, { balance: 200 }, { balance: 300 }],
      };
      applyScenario(state, scenario);
      expect(state.players).toHaveLength(2);
      expect(state.players[0].balance).toBe(100);
      expect(state.players[1].balance).toBe(200);
    });
  });

  describe('serialization round-trip', () => {
    it('serializes and deserializes correctly', () => {
      const state = createInitialState(
        [{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }],
        createRng(42),
      );
      state.players[0].properties.set(1, { houses: 2, mortgaged: false });
      state.players[0].properties.set(5, { houses: 0, mortgaged: true });

      const json = serializeState(state);
      const restored = deserializeState(json);

      expect(restored.players[0].balance).toBe(state.players[0].balance);
      expect(restored.players[0].properties).toBeInstanceOf(Map);
      expect(restored.players[0].properties.get(1)?.houses).toBe(2);
      expect(restored.players[0].properties.get(5)?.mortgaged).toBe(true);
      expect(restored.turnNumber).toBe(state.turnNumber);
      expect(restored.bankHouses).toBe(state.bankHouses);
    });
  });
});
