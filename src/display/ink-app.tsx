import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Board } from './ink-board';
import { PlayerPanel } from './ink-player-panel';
import { EventLog } from './ink-event-log';
import { InkRenderer, DisplayState } from './ink-renderer';

interface AppProps {
  renderer: InkRenderer;
}

export function App({ renderer }: AppProps) {
  const [displayState, setDisplayState] = useState<DisplayState>(renderer.getState());

  useEffect(() => {
    const unsub = renderer.subscribe(() => {
      setDisplayState({ ...renderer.getState() });
    });
    return unsub;
  }, [renderer]);

  if (!displayState.gameState) {
    return (
      <Box>
        <Text>Starting game...</Text>
      </Box>
    );
  }

  if (displayState.gameOver) {
    return (
      <Box flexDirection="column">
        <Box>
          <Board state={displayState.gameState} />
          <PlayerPanel state={displayState.gameState} thinkingPlayer={null} />
        </Box>
        <EventLog events={displayState.eventLog} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Board state={displayState.gameState} />
        <PlayerPanel
          state={displayState.gameState}
          thinkingPlayer={displayState.thinkingPlayer}
        />
      </Box>
      <EventLog events={displayState.eventLog} />
    </Box>
  );
}
