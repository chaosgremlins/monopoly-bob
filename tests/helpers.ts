import { GameState, PlayerState, PropertyState } from '../src/engine/types';
import { createInitialState } from '../src/engine/game-state';
import { createRng } from '../src/engine/dice';
import { GameEngine } from '../src/engine/game-engine';
import { cloneState } from '../src/engine/bank';

/** Fixed seed for deterministic tests */
export const TEST_SEED = 42;

/** Create a deterministic RNG for tests */
export function testRng(): () => number {
  return createRng(TEST_SEED);
}

/** Create a 2-player initial state with deterministic RNG */
export function createTestState(playerCount = 2): GameState {
  const configs = [];
  for (let i = 0; i < playerCount; i++) {
    configs.push({ id: `player_${i}`, name: `Player${i}` });
  }
  return createInitialState(configs, testRng());
}

/** Create engine with deterministic RNG */
export function createTestEngine(): GameEngine {
  return new GameEngine(testRng());
}

/** Helper: give a player a property (no cost) */
export function giveProperty(
  state: GameState,
  playerId: string,
  position: number,
  houses = 0,
  mortgaged = false,
): void {
  const player = state.players.find(p => p.id === playerId)!;
  player.properties.set(position, { houses, mortgaged });
}

/** Helper: set player position */
export function setPosition(state: GameState, playerId: string, position: number): void {
  const player = state.players.find(p => p.id === playerId)!;
  player.position = position;
}

/** Helper: set player balance */
export function setBalance(state: GameState, playerId: string, balance: number): void {
  const player = state.players.find(p => p.id === playerId)!;
  player.balance = balance;
}

/** Helper: put player in jail */
export function putInJail(state: GameState, playerId: string, jailTurns = 0): void {
  const player = state.players.find(p => p.id === playerId)!;
  player.position = 10;
  player.inJail = true;
  player.jailTurns = jailTurns;
}

/** Helper: get player by id */
export function getPlayer(state: GameState, playerId: string): PlayerState {
  return state.players.find(p => p.id === playerId)!;
}

/** Helper: give player a complete color group */
export function giveColorGroup(
  state: GameState,
  playerId: string,
  positions: number[],
): void {
  for (const pos of positions) {
    giveProperty(state, playerId, pos);
  }
}
