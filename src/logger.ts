import { writeFileSync } from 'fs';
import { GameState, GameEvent } from './engine/types';
import { serializeState } from './engine/game-state';

export interface GameLogEntry {
  turnNumber: number;
  playerName: string;
  action: string;
  events: GameEvent[];
  timestamp: number;
}

export class GameLogger {
  private entries: GameLogEntry[] = [];
  private logFile: string | null;

  constructor(logFile: string | null) {
    this.logFile = logFile;
  }

  logAction(
    turnNumber: number,
    playerName: string,
    action: string,
    events: GameEvent[],
  ): void {
    this.entries.push({
      turnNumber,
      playerName,
      action,
      events,
      timestamp: Date.now(),
    });
  }

  flush(finalState?: GameState): void {
    if (!this.logFile) return;

    const output = {
      entries: this.entries,
      finalState: finalState ? JSON.parse(serializeState(finalState)) : null,
      totalTurns: this.entries.length > 0
        ? this.entries[this.entries.length - 1].turnNumber
        : 0,
    };

    writeFileSync(this.logFile, JSON.stringify(output, null, 2));
    console.log(`Game log written to ${this.logFile}`);
  }
}
