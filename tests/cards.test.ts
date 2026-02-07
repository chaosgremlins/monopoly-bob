import { describe, it, expect } from 'bun:test';
import {
  CHANCE_CARDS, COMMUNITY_CHEST_CARDS,
  createShuffledDeck, drawCard,
} from '../src/engine/cards';
import { createRng } from '../src/engine/dice';

describe('cards', () => {
  describe('card data', () => {
    it('has 16 Chance cards', () => {
      expect(CHANCE_CARDS).toHaveLength(16);
    });

    it('has 16 Community Chest cards', () => {
      expect(COMMUNITY_CHEST_CARDS).toHaveLength(16);
    });

    it('each Chance card has deck "chance"', () => {
      for (const card of CHANCE_CARDS) {
        expect(card.deck).toBe('chance');
      }
    });

    it('each Community Chest card has deck "community_chest"', () => {
      for (const card of COMMUNITY_CHEST_CARDS) {
        expect(card.deck).toBe('community_chest');
      }
    });

    it('Chance has exactly 1 Get Out of Jail Free card', () => {
      const jailCards = CHANCE_CARDS.filter(c => c.effect.type === 'get_out_of_jail_free');
      expect(jailCards).toHaveLength(1);
    });

    it('Community Chest has exactly 1 Get Out of Jail Free card', () => {
      const jailCards = COMMUNITY_CHEST_CARDS.filter(c => c.effect.type === 'get_out_of_jail_free');
      expect(jailCards).toHaveLength(1);
    });
  });

  describe('createShuffledDeck', () => {
    it('returns all indices', () => {
      const rng = createRng(1);
      const deck = createShuffledDeck(CHANCE_CARDS, rng);
      expect(deck).toHaveLength(16);
      expect([...deck].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 16 }, (_, i) => i),
      );
    });

    it('is deterministic with same seed', () => {
      const deck1 = createShuffledDeck(CHANCE_CARDS, createRng(42));
      const deck2 = createShuffledDeck(CHANCE_CARDS, createRng(42));
      expect(deck1).toEqual(deck2);
    });

    it('different seeds produce different orders', () => {
      const deck1 = createShuffledDeck(CHANCE_CARDS, createRng(1));
      const deck2 = createShuffledDeck(CHANCE_CARDS, createRng(2));
      expect(deck1).not.toEqual(deck2);
    });
  });

  describe('drawCard', () => {
    it('draws the top card from the deck', () => {
      const rng = createRng(1);
      const deck = [3, 7, 1, 5];
      const discard: number[] = [];

      const result = drawCard(deck, discard, CHANCE_CARDS, rng);
      expect(result.card).toBe(CHANCE_CARDS[3]);
      expect(result.newDeck).toEqual([7, 1, 5]);
    });

    it('adds drawn card to discard pile', () => {
      const rng = createRng(1);
      const deck = [3, 7, 1];
      const discard: number[] = [];

      const result = drawCard(deck, discard, CHANCE_CARDS, rng);
      expect(result.newDiscardPile).toContain(3);
    });

    it('Get Out of Jail Free cards do NOT go to discard', () => {
      const rng = createRng(1);
      // Card index 8 is the Get Out of Jail Free Chance card
      const jailCardIndex = CHANCE_CARDS.findIndex(c => c.effect.type === 'get_out_of_jail_free');
      const deck = [jailCardIndex, 1, 2];
      const discard: number[] = [];

      const result = drawCard(deck, discard, CHANCE_CARDS, rng);
      expect(result.card.effect.type).toBe('get_out_of_jail_free');
      expect(result.newDiscardPile).not.toContain(jailCardIndex);
    });

    it('reshuffles discard pile when deck is empty', () => {
      const rng = createRng(1);
      const deck: number[] = [];
      const discard = [5, 10, 2];

      const result = drawCard(deck, discard, CHANCE_CARDS, rng);
      // Should have drawn a card
      expect(result.card).toBeDefined();
      // Old discard should be cleared (cards moved to new deck)
      // New deck should have remaining cards after drawing one
      expect(result.newDeck.length + result.newDiscardPile.length).toBeLessThanOrEqual(3);
    });
  });
});
