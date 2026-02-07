import { describe, it, expect } from 'bun:test';
import {
  cloneState, getPlayerById, getPropertyOwner, isPropertyOwned,
  adjustBalance, transferMoney, countPlayerRailroads, countPlayerUtilities,
  playerOwnsColorGroup, countHousesAndHotels, getActivePlayers,
} from '../src/engine/bank';
import { COLOR_GROUP_MEMBERS } from '../src/engine/board-data';
import { createTestState, giveProperty, getPlayer, giveColorGroup } from './helpers';

describe('bank', () => {
  describe('cloneState', () => {
    it('produces a deep copy', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      const clone = cloneState(state);

      // Modify the clone
      clone.players[0].balance = 999;
      clone.players[0].properties.set(3, { houses: 0, mortgaged: false });

      // Original is unaffected
      expect(state.players[0].balance).toBe(1500);
      expect(state.players[0].properties.has(3)).toBe(false);
    });

    it('clones property Maps correctly', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1, 3, false);
      const clone = cloneState(state);

      // Modify clone property state
      clone.players[0].properties.get(1)!.houses = 5;

      // Original is unaffected
      expect(state.players[0].properties.get(1)!.houses).toBe(3);
    });
  });

  describe('getPlayerById', () => {
    it('returns the correct player', () => {
      const state = createTestState();
      const p = getPlayerById(state, 'player_1');
      expect(p.name).toBe('Player1');
    });

    it('throws for unknown player', () => {
      const state = createTestState();
      expect(() => getPlayerById(state, 'nobody')).toThrow();
    });
  });

  describe('getPropertyOwner / isPropertyOwned', () => {
    it('returns null for unowned property', () => {
      const state = createTestState();
      expect(getPropertyOwner(state, 1)).toBeNull();
      expect(isPropertyOwned(state, 1)).toBe(false);
    });

    it('returns the owner', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      const owner = getPropertyOwner(state, 1);
      expect(owner).not.toBeNull();
      expect(owner!.id).toBe('player_0');
      expect(isPropertyOwned(state, 1)).toBe(true);
    });

    it('ignores bankrupt players', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      state.players[0].isBankrupt = true;
      expect(getPropertyOwner(state, 1)).toBeNull();
    });
  });

  describe('adjustBalance', () => {
    it('adds money', () => {
      const state = createTestState();
      const newState = adjustBalance(state, 'player_0', 200);
      expect(getPlayer(newState, 'player_0').balance).toBe(1700);
      // Original unchanged
      expect(getPlayer(state, 'player_0').balance).toBe(1500);
    });

    it('removes money', () => {
      const state = createTestState();
      const newState = adjustBalance(state, 'player_0', -500);
      expect(getPlayer(newState, 'player_0').balance).toBe(1000);
    });
  });

  describe('transferMoney', () => {
    it('moves money between players', () => {
      const state = createTestState();
      const newState = transferMoney(state, 'player_0', 'player_1', 300);
      expect(getPlayer(newState, 'player_0').balance).toBe(1200);
      expect(getPlayer(newState, 'player_1').balance).toBe(1800);
    });
  });

  describe('countPlayerRailroads', () => {
    it('counts only unmortgaged railroads', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 5);  // Reading Railroad
      giveProperty(state, 'player_0', 15); // Pennsylvania Railroad
      giveProperty(state, 'player_0', 25, 0, true); // B&O - mortgaged

      expect(countPlayerRailroads(state, 'player_0')).toBe(2);
    });

    it('returns 0 when player has no railroads', () => {
      const state = createTestState();
      expect(countPlayerRailroads(state, 'player_0')).toBe(0);
    });
  });

  describe('countPlayerUtilities', () => {
    it('counts only unmortgaged utilities', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 12); // Electric Company
      giveProperty(state, 'player_0', 28, 0, true); // Water Works - mortgaged

      expect(countPlayerUtilities(state, 'player_0')).toBe(1);
    });
  });

  describe('playerOwnsColorGroup', () => {
    it('returns true when player owns all in group', () => {
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      expect(playerOwnsColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown)).toBe(true);
    });

    it('returns false when player is missing one', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1); // Mediterranean only
      expect(playerOwnsColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown)).toBe(false);
    });
  });

  describe('countHousesAndHotels', () => {
    it('counts houses and hotels separately', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1, 3);  // 3 houses
      giveProperty(state, 'player_0', 3, 5);  // hotel
      giveProperty(state, 'player_0', 6, 2);  // 2 houses

      const { houses, hotels } = countHousesAndHotels(state, 'player_0');
      expect(houses).toBe(5); // 3 + 2
      expect(hotels).toBe(1);
    });
  });

  describe('getActivePlayers', () => {
    it('excludes bankrupt players', () => {
      const state = createTestState();
      state.players[1].isBankrupt = true;
      const active = getActivePlayers(state);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('player_0');
    });
  });
});
