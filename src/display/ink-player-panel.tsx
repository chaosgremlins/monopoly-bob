import React from 'react';
import { Box, Text } from 'ink';
import { GameState } from '../engine/types';
import { getSpace } from '../engine/board-data';

const PLAYER_TOKENS = ['A', 'B', 'C', 'D'];
const PLAYER_COLORS_HEX = ['#00FFFF', '#FF00FF', '#FFFF00', '#00FF00'];

interface PlayerPanelProps {
  state: GameState;
  thinkingPlayer: string | null;
}

function calculateNetWorth(player: { balance: number; properties: Map<number, any> }): number {
  let worth = player.balance;
  for (const [pos, propState] of player.properties) {
    const space = getSpace(pos);
    if ('price' in space) worth += (space as any).price;
    if (space.type === 'property' && propState.houses > 0) {
      worth += (space as any).houseCost * (propState.houses === 5 ? 5 : propState.houses);
    }
  }
  return worth;
}

export function PlayerPanel({ state, thinkingPlayer }: PlayerPanelProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} width={32}>
      <Text bold color="white">Players</Text>
      <Text dimColor>{'─'.repeat(28)}</Text>

      {state.players.map((player, i) => {
        const isCurrentPlayer = i === state.currentPlayerIndex;
        const color = PLAYER_COLORS_HEX[i];
        const token = PLAYER_TOKENS[i];
        const space = getSpace(player.position);
        const isThinking = thinkingPlayer === player.name;

        if (player.isBankrupt) {
          return (
            <Box key={player.id} flexDirection="column" marginTop={1}>
              <Text>
                <Text dimColor>{token} </Text>
                <Text dimColor strikethrough>{player.name}</Text>
                <Text dimColor> BANKRUPT</Text>
              </Text>
            </Box>
          );
        }

        const netWorth = calculateNetWorth(player);

        return (
          <Box key={player.id} flexDirection="column" marginTop={1}>
            <Box>
              <Text color={color} bold>{isCurrentPlayer ? '> ' : '  '}</Text>
              <Text color={color} bold>{token} {player.name}</Text>
              {isThinking && <Text color="#888"> ...</Text>}
            </Box>
            <Box>
              <Text>    </Text>
              <Text color="#00FF00" bold>${player.balance}</Text>
              <Text dimColor> (NW: ${netWorth})</Text>
            </Box>
            <Box>
              <Text>    </Text>
              <Text dimColor>{space.name}</Text>
            </Box>
            {player.inJail && (
              <Box>
                <Text>    </Text>
                <Text color="red">IN JAIL ({player.jailTurns + 1}/3)</Text>
              </Box>
            )}
            {player.properties.size > 0 && (
              <Box>
                <Text>    </Text>
                <Text dimColor>{player.properties.size} properties</Text>
              </Box>
            )}
            {player.getOutOfJailCards > 0 && (
              <Box>
                <Text>    </Text>
                <Text dimColor>{player.getOutOfJailCards} GOOJF card(s)</Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>{'─'.repeat(28)}</Text>
      </Box>
      <Box>
        <Text dimColor>Turn {state.turnNumber}</Text>
      </Box>
      <Box>
        <Text dimColor>Houses: {state.bankHouses} Hotels: {state.bankHotels}</Text>
      </Box>
    </Box>
  );
}
