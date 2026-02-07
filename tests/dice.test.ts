import { describe, it, expect } from 'bun:test';
import { rollDice, createRng } from '../src/engine/dice';

describe('dice', () => {
  describe('rollDice', () => {
    it('produces values between 1 and 6', () => {
      const rng = createRng(1);
      for (let i = 0; i < 100; i++) {
        const roll = rollDice(rng);
        expect(roll.dice[0]).toBeGreaterThanOrEqual(1);
        expect(roll.dice[0]).toBeLessThanOrEqual(6);
        expect(roll.dice[1]).toBeGreaterThanOrEqual(1);
        expect(roll.dice[1]).toBeLessThanOrEqual(6);
      }
    });

    it('sum equals die1 + die2', () => {
      const rng = createRng(2);
      for (let i = 0; i < 50; i++) {
        const roll = rollDice(rng);
        expect(roll.sum).toBe(roll.dice[0] + roll.dice[1]);
      }
    });

    it('isDoubles is true when both dice are equal', () => {
      const rng = createRng(3);
      for (let i = 0; i < 100; i++) {
        const roll = rollDice(rng);
        expect(roll.isDoubles).toBe(roll.dice[0] === roll.dice[1]);
      }
    });
  });

  describe('createRng', () => {
    it('seeded RNG produces deterministic results', () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      for (let i = 0; i < 20; i++) {
        expect(rng1()).toBe(rng2());
      }
    });

    it('different seeds produce different results', () => {
      const rng1 = createRng(1);
      const rng2 = createRng(2);
      const results1 = Array.from({ length: 10 }, () => rng1());
      const results2 = Array.from({ length: 10 }, () => rng2());
      expect(results1).not.toEqual(results2);
    });

    it('produces values in [0, 1)', () => {
      const rng = createRng(99);
      for (let i = 0; i < 100; i++) {
        const val = rng();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });
});
