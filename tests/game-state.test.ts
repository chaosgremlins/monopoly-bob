import { describe, it, expect } from 'bun:test';
import { createInitialState, serializeState, deserializeState } from '../src/engine/game-state';
import { createRng } from '../src/engine/dice';

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
