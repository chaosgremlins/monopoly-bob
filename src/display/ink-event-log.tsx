import React from 'react';
import { Box, Text } from 'ink';

const MAX_VISIBLE_LINES = 30;

interface EventLogProps {
  events: string[];
}

export function EventLog({ events }: EventLogProps) {
  const visible = events.slice(-MAX_VISIBLE_LINES);

  return (
    <Box flexDirection="column">
      <Text bold color="white">Event Log</Text>
      <Text dimColor>{'─'.repeat(36)}</Text>
      {visible.map((line, i) => (
        <Text key={events.length - MAX_VISIBLE_LINES + i} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}
