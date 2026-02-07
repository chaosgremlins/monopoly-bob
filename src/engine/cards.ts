import { Card } from './types';

export const CHANCE_CARDS: Card[] = [
  { id: 0, deck: 'chance', text: 'Advance to Boardwalk.',
    effect: { type: 'move_to', position: 39, collectGo: true } },
  { id: 1, deck: 'chance', text: 'Advance to Go. Collect $200.',
    effect: { type: 'move_to', position: 0, collectGo: true } },
  { id: 2, deck: 'chance', text: 'Advance to Illinois Avenue. If you pass Go, collect $200.',
    effect: { type: 'move_to', position: 24, collectGo: true } },
  { id: 3, deck: 'chance', text: 'Advance to St. Charles Place. If you pass Go, collect $200.',
    effect: { type: 'move_to', position: 11, collectGo: true } },
  { id: 4, deck: 'chance', text: 'Advance to the nearest Railroad. Pay owner twice the rental.',
    effect: { type: 'move_to_nearest', spaceType: 'railroad', payMultiplier: 2 } },
  { id: 5, deck: 'chance', text: 'Advance to the nearest Railroad. Pay owner twice the rental.',
    effect: { type: 'move_to_nearest', spaceType: 'railroad', payMultiplier: 2 } },
  { id: 6, deck: 'chance', text: 'Advance to the nearest Utility. If unowned, you may buy it. If owned, pay owner 10 times the dice roll.',
    effect: { type: 'move_to_nearest', spaceType: 'utility', payMultiplier: 10 } },
  { id: 7, deck: 'chance', text: 'Bank pays you dividend of $50.',
    effect: { type: 'collect', amount: 50 } },
  { id: 8, deck: 'chance', text: 'Get Out of Jail Free.',
    effect: { type: 'get_out_of_jail_free' } },
  { id: 9, deck: 'chance', text: 'Go Back 3 Spaces.',
    effect: { type: 'move_back', spaces: 3 } },
  { id: 10, deck: 'chance', text: 'Go to Jail. Go directly to Jail, do not pass Go, do not collect $200.',
    effect: { type: 'go_to_jail' } },
  { id: 11, deck: 'chance', text: 'Make general repairs on all your property. For each house pay $25. For each hotel pay $100.',
    effect: { type: 'pay_per_house', houseAmount: 25, hotelAmount: 100 } },
  { id: 12, deck: 'chance', text: 'Speeding fine $15.',
    effect: { type: 'pay', amount: 15 } },
  { id: 13, deck: 'chance', text: 'Take a trip to Reading Railroad. If you pass Go, collect $200.',
    effect: { type: 'move_to', position: 5, collectGo: true } },
  { id: 14, deck: 'chance', text: 'You have been elected Chairman of the Board. Pay each player $50.',
    effect: { type: 'pay_each_player', amount: 50 } },
  { id: 15, deck: 'chance', text: 'Your building loan matures. Collect $150.',
    effect: { type: 'collect', amount: 150 } },
];

export const COMMUNITY_CHEST_CARDS: Card[] = [
  { id: 0, deck: 'community_chest', text: 'Advance to Go. Collect $200.',
    effect: { type: 'move_to', position: 0, collectGo: true } },
  { id: 1, deck: 'community_chest', text: 'Bank error in your favor. Collect $200.',
    effect: { type: 'collect', amount: 200 } },
  { id: 2, deck: 'community_chest', text: "Doctor's fee. Pay $50.",
    effect: { type: 'pay', amount: 50 } },
  { id: 3, deck: 'community_chest', text: 'From sale of stock you get $50.',
    effect: { type: 'collect', amount: 50 } },
  { id: 4, deck: 'community_chest', text: 'Get Out of Jail Free.',
    effect: { type: 'get_out_of_jail_free' } },
  { id: 5, deck: 'community_chest', text: 'Go to Jail. Go directly to jail, do not pass Go, do not collect $200.',
    effect: { type: 'go_to_jail' } },
  { id: 6, deck: 'community_chest', text: 'Holiday fund matures. Receive $100.',
    effect: { type: 'collect', amount: 100 } },
  { id: 7, deck: 'community_chest', text: 'Income tax refund. Collect $20.',
    effect: { type: 'collect', amount: 20 } },
  { id: 8, deck: 'community_chest', text: 'It is your birthday. Collect $10 from every player.',
    effect: { type: 'collect_from_each_player', amount: 10 } },
  { id: 9, deck: 'community_chest', text: 'Life insurance matures. Collect $100.',
    effect: { type: 'collect', amount: 100 } },
  { id: 10, deck: 'community_chest', text: 'Pay hospital fees of $100.',
    effect: { type: 'pay', amount: 100 } },
  { id: 11, deck: 'community_chest', text: 'Pay school fees of $50.',
    effect: { type: 'pay', amount: 50 } },
  { id: 12, deck: 'community_chest', text: 'Receive $25 consultancy fee.',
    effect: { type: 'collect', amount: 25 } },
  { id: 13, deck: 'community_chest', text: 'You are assessed for street repair. $40 per house. $115 per hotel.',
    effect: { type: 'pay_per_house', houseAmount: 40, hotelAmount: 115 } },
  { id: 14, deck: 'community_chest', text: 'You have won second prize in a beauty contest. Collect $10.',
    effect: { type: 'collect', amount: 10 } },
  { id: 15, deck: 'community_chest', text: 'You inherit $100.',
    effect: { type: 'collect', amount: 100 } },
];

export function createShuffledDeck(cards: Card[], rng: () => number): number[] {
  const indices = cards.map((_, i) => i);
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

export function drawCard(
  deck: number[],
  discardPile: number[],
  cards: Card[],
  rng: () => number,
): { card: Card; newDeck: number[]; newDiscardPile: number[] } {
  let currentDeck = [...deck];
  let currentDiscard = [...discardPile];

  if (currentDeck.length === 0) {
    // Reshuffle discard pile
    currentDeck = createShuffledDeck(
      currentDiscard.map(i => cards[i]),
      rng,
    );
    // Re-map: the shuffled deck contains indices into the *discard* array,
    // but we need indices into the original cards array
    currentDeck = [];
    const reshuffled = [...currentDiscard];
    for (let i = reshuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
    }
    currentDeck = reshuffled;
    currentDiscard = [];
  }

  const cardIndex = currentDeck.shift()!;
  const card = cards[cardIndex];

  // Get Out of Jail Free cards don't go to discard pile — they stay with the player
  if (card.effect.type !== 'get_out_of_jail_free') {
    currentDiscard.push(cardIndex);
  }

  return { card, newDeck: currentDeck, newDiscardPile: currentDiscard };
}
