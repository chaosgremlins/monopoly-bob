import { describe, it, expect } from 'bun:test';
import { calculateRent } from '../src/engine/rent-calculator';
import { COLOR_GROUP_MEMBERS } from '../src/engine/board-data';
import { createTestState, giveProperty, giveColorGroup } from './helpers';

describe('rent-calculator', () => {
  describe('property rent', () => {
    it('returns 0 for unowned property', () => {
      const state = createTestState();
      expect(calculateRent(state, 1, [3, 4])).toBe(0);
    });

    it('returns 0 for mortgaged property', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1, 0, true); // mortgaged
      expect(calculateRent(state, 1, [3, 4])).toBe(0);
    });

    it('returns base rent for single property', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 1); // Mediterranean: base rent $2
      expect(calculateRent(state, 1, [3, 4])).toBe(2);
    });

    it('returns double rent for monopoly (no houses)', () => {
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      // Mediterranean base rent $2, monopoly = $4
      expect(calculateRent(state, 1, [3, 4])).toBe(4);
    });

    it('returns rent based on house count', () => {
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);

      // Mediterranean: rent array [2, 10, 30, 90, 160, 250]
      giveProperty(state, 'player_0', 1, 1); // overwrite with 1 house
      expect(calculateRent(state, 1, [3, 4])).toBe(10);

      giveProperty(state, 'player_0', 1, 3); // 3 houses
      expect(calculateRent(state, 1, [3, 4])).toBe(90);

      giveProperty(state, 'player_0', 1, 5); // hotel
      expect(calculateRent(state, 1, [3, 4])).toBe(250);
    });

    it('Boardwalk hotel rent is $2000', () => {
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.dark_blue);
      giveProperty(state, 'player_0', 39, 5); // Boardwalk hotel
      expect(calculateRent(state, 39, [3, 4])).toBe(2000);
    });
  });

  describe('railroad rent', () => {
    it('$25 for 1 railroad', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 5);
      expect(calculateRent(state, 5, [3, 4])).toBe(25);
    });

    it('$50 for 2 railroads', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 5);
      giveProperty(state, 'player_0', 15);
      expect(calculateRent(state, 5, [3, 4])).toBe(50);
    });

    it('$100 for 3 railroads', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 5);
      giveProperty(state, 'player_0', 15);
      giveProperty(state, 'player_0', 25);
      expect(calculateRent(state, 5, [3, 4])).toBe(100);
    });

    it('$200 for 4 railroads', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 5);
      giveProperty(state, 'player_0', 15);
      giveProperty(state, 'player_0', 25);
      giveProperty(state, 'player_0', 35);
      expect(calculateRent(state, 5, [3, 4])).toBe(200);
    });

    it('does not count mortgaged railroads', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 5);
      giveProperty(state, 'player_0', 15, 0, true); // mortgaged
      expect(calculateRent(state, 5, [3, 4])).toBe(25); // only 1 counts
    });

    it('applies card multiplier', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 5);
      giveProperty(state, 'player_0', 15);
      // 2 railroads = $50 base, multiplier 2 = $100
      expect(calculateRent(state, 5, [3, 4], 2)).toBe(100);
    });
  });

  describe('utility rent', () => {
    it('4x dice roll for 1 utility', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 12); // Electric Company
      // dice [3, 4] = 7, rent = 7 * 4 = 28
      expect(calculateRent(state, 12, [3, 4])).toBe(28);
    });

    it('10x dice roll for 2 utilities', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 12);
      giveProperty(state, 'player_0', 28);
      // dice [3, 4] = 7, rent = 7 * 10 = 70
      expect(calculateRent(state, 12, [3, 4])).toBe(70);
    });

    it('card multiplier overrides utility count', () => {
      const state = createTestState();
      giveProperty(state, 'player_0', 12); // only 1 utility
      // dice [5, 6] = 11, card multiplier 10 = 110
      expect(calculateRent(state, 12, [5, 6], 10)).toBe(110);
    });
  });
});
