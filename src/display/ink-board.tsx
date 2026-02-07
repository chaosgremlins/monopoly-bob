import React from 'react';
import { Box, Text } from 'ink';
import { GameState, PlayerState, PropertyState } from '../engine/types';
import { BOARD_SPACES, getSpace, COLOR_GROUP_MEMBERS } from '../engine/board-data';

// Board cell layout positions:
// Top row:    positions 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
// Left col:   positions 9, 8, 7, 6, 5, 4, 3, 2, 1 (top to bottom)
// Right col:  positions 21, 22, 23, 24, 25, 26, 27, 28, 29 (top to bottom)
// Bottom row: positions 0, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30

const TOP_ROW = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const LEFT_COL = [9, 8, 7, 6, 5, 4, 3, 2, 1];
const RIGHT_COL = [21, 22, 23, 24, 25, 26, 27, 28, 29];
const BOTTOM_ROW = [0, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30];

const CELL_W = 8;

const ABBREV: Record<number, [string, string]> = {
  0:  ['START', ''],
  1:  ['MEDTRN', 'AVE'],
  2:  ['COM', 'CHEST'],
  3:  ['BALTIC', 'AVE'],
  4:  ['INCOME', 'TAX'],
  5:  ['READ', 'RAIL'],
  6:  ['ORNTL', 'AVE'],
  7:  ['CHANCE', ''],
  8:  ['VERMNT', 'AVE'],
  9:  ['CNNCT', 'AVE'],
  10: ['VISIT', 'JAIL'],
  11: ['ST.CH', 'AVE'],
  12: ['ELCT', 'COMP'],
  13: ['STATES', 'AVE'],
  14: ['VRGNA', 'AVE'],
  15: ['PNSLVA', 'RAIL'],
  16: ['ST.JA', 'AVE'],
  17: ['COM', 'CHEST'],
  18: ['TEN', 'AVE'],
  19: ['NY', 'AVE'],
  20: ['FREE', 'PARK'],
  21: ['KNTCY', 'AVE'],
  22: ['CHANCE', ''],
  23: ['IND', 'AVE'],
  24: ['ILL', 'AVE'],
  25: ['B&O', 'RAIL'],
  26: ['ATLNTC', 'AVE'],
  27: ['VNTNR', 'AVE'],
  28: ['WATER', 'WORKS'],
  29: ['MRVN', 'GRDNS'],
  30: ['GO TO', 'JAIL'],
  31: ['PCFC', 'AVE'],
  32: ['NC', 'AVE'],
  33: ['COM', 'CHEST'],
  34: ['PNSLVA', 'AVE'],
  35: ['SHORT', 'LINE'],
  36: ['CHANCE', ''],
  37: ['PARK', 'PLACE'],
  38: ['LUXURY', 'TAX'],
  39: ['BRDWK', ''],
};

type ColorName = 'brown' | 'light_blue' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'dark_blue';

const COLOR_HEX: Record<string, string> = {
  brown: '#8B4513',
  light_blue: '#87CEEB',
  pink: '#FF69B4',
  orange: '#FFA500',
  red: '#FF0000',
  yellow: '#FFFF00',
  green: '#00FF00',
  dark_blue: '#0000FF',
};

const PLAYER_TOKENS = ['A', 'B', 'C', 'D'];
const PLAYER_COLORS_HEX = ['#00FFFF', '#FF00FF', '#FFFF00', '#00FF00'];

function getColorGroup(pos: number): string | null {
  const space = BOARD_SPACES[pos];
  if (space.type === 'property') return space.colorGroup;
  return null;
}

function getPlayersAt(pos: number, state: GameState): number[] {
  const indices: number[] = [];
  for (let i = 0; i < state.players.length; i++) {
    if (!state.players[i].isBankrupt && state.players[i].position === pos) {
      indices.push(i);
    }
  }
  return indices;
}

function getOwnerIndex(pos: number, state: GameState): number | null {
  for (let i = 0; i < state.players.length; i++) {
    if (!state.players[i].isBankrupt && state.players[i].properties.has(pos)) {
      return i;
    }
  }
  return null;
}

function getHouseDisplay(pos: number, state: GameState): string {
  for (const p of state.players) {
    const ps = p.properties.get(pos);
    if (ps && ps.houses > 0) {
      if (ps.houses === 5) return 'H';
      return ps.houses.toString();
    }
  }
  return '';
}

interface CellProps {
  pos: number;
  state: GameState;
  width?: number;
}

function Cell({ pos, state, width = CELL_W }: CellProps) {
  const [line1, line2] = ABBREV[pos] || ['?', ''];
  const colorGroup = getColorGroup(pos);
  const playersHere = getPlayersAt(pos, state);
  const ownerIdx = getOwnerIndex(pos, state);
  const houses = getHouseDisplay(pos, state);

  // Color bar character
  const colorBar = colorGroup ? '▐' : ' ';
  const colorHex = colorGroup ? COLOR_HEX[colorGroup] : undefined;

  // Player tokens
  const tokens = playersHere.map(i => PLAYER_TOKENS[i]).join('');

  // Owner indicator
  const ownerMark = ownerIdx !== null ? PLAYER_TOKENS[ownerIdx] : '';

  // Build the cell content
  const padded1 = line1.padEnd(width - 2).substring(0, width - 2);
  const padded2 = line2.padEnd(width - 2).substring(0, width - 2);

  // Third line: tokens + houses
  const infoLine = (tokens + (houses ? `[${houses}]` : '')).padEnd(width - 2).substring(0, width - 2);

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        {colorHex ? <Text color={colorHex}>{colorBar}</Text> : <Text> </Text>}
        <Text dimColor>{padded1}</Text>
      </Box>
      <Box>
        {colorHex ? <Text color={colorHex}>{colorBar}</Text> : <Text> </Text>}
        <Text dimColor>{padded2}</Text>
      </Box>
      <Box>
        <Text> </Text>
        {playersHere.length > 0 ? (
          <Text>
            {playersHere.map((pi, j) => (
              <Text key={pi} color={PLAYER_COLORS_HEX[pi]}>{PLAYER_TOKENS[pi]}</Text>
            ))}
            <Text dimColor>{' '.repeat(Math.max(0, width - 2 - playersHere.length - houses.length - (houses ? 2 : 0)))}</Text>
            {houses ? <Text color="#FFAA00">[{houses}]</Text> : null}
          </Text>
        ) : (
          <Text dimColor>{houses ? `[${houses}]`.padEnd(width - 2) : ' '.repeat(width - 2)}</Text>
        )}
      </Box>
    </Box>
  );
}

interface BoardProps {
  state: GameState;
}

export function Board({ state }: BoardProps) {
  return (
    <Box flexDirection="column">
      {/* Top row */}
      <Box>
        {TOP_ROW.map(pos => (
          <Cell key={pos} pos={pos} state={state} />
        ))}
      </Box>

      {/* Separator */}
      <Text dimColor>{'─'.repeat(CELL_W * 11)}</Text>

      {/* Middle section: left col + center + right col */}
      {LEFT_COL.map((leftPos, i) => {
        const rightPos = RIGHT_COL[i];
        return (
          <Box key={i}>
            <Cell pos={leftPos} state={state} />
            <Box width={CELL_W * 9}>
              {i === 0 && (
                <Box justifyContent="center" width={CELL_W * 9}>
                  <Text bold color="white">     M O N O P O L Y</Text>
                </Box>
              )}
            </Box>
            <Cell pos={rightPos} state={state} />
          </Box>
        );
      })}

      {/* Separator */}
      <Text dimColor>{'─'.repeat(CELL_W * 11)}</Text>

      {/* Bottom row */}
      <Box>
        {BOTTOM_ROW.map(pos => (
          <Cell key={pos} pos={pos} state={state} />
        ))}
      </Box>
    </Box>
  );
}
