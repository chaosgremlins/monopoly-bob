import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Board } from './ink-board';
import { PlayerPanel } from './ink-player-panel';
import { EventLog } from './ink-event-log';
import { StatsBar } from './ink-stats-bar';
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

  return (
    <Box flexDirection="column">
      {/* Top: Board on left, Event Log on right */}
      <Box>
        <Board state={displayState.gameState} />
        <Box flexDirection="column" paddingLeft={2} width={40}>
          <StatsBar usage={displayState.usage} />
          <EventLog events={displayState.eventLog} />
        </Box>
      </Box>
      {/* Bottom: Players in a horizontal row */}
      <PlayerPanel
        state={displayState.gameState}
        thinkingPlayer={displayState.thinkingPlayer}
      />
    </Box>
  );
}
