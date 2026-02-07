export interface DiceRoll {
  dice: [number, number];
  sum: number;
  isDoubles: boolean;
}

export function createRng(seed?: number): () => number {
  if (seed === undefined) {
    return Math.random;
  }
  // Simple seeded PRNG (mulberry32)
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDice(rng: () => number): DiceRoll {
  const die1 = Math.floor(rng() * 6) + 1;
  const die2 = Math.floor(rng() * 6) + 1;
  return {
    dice: [die1, die2],
    sum: die1 + die2,
    isDoubles: die1 === die2,
  };
}
