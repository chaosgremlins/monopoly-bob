import React from 'react';
import { Box, Text } from 'ink';
import { UsageStats } from './ink-renderer';

interface StatsBarProps {
  usage: UsageStats;
}

export function StatsBar({ usage }: StatsBarProps) {
  const totalInput = usage.cacheRead + usage.cacheWrite + usage.inputTokens;
  const cachePct = totalInput > 0 ? Math.round((usage.cacheRead / totalInput) * 100) : 0;

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>API calls  </Text>
        <Text color="white">{usage.apiCalls}</Text>
      </Box>
      <Box>
        <Text dimColor>Input      </Text>
        <Text color="white">{fmt(totalInput)}</Text>
        <Text dimColor> tok</Text>
      </Box>
      <Box>
        <Text dimColor>Cache hit  </Text>
        <Text color={cachePct > 50 ? '#00FF00' : cachePct > 20 ? '#FFFF00' : '#FF6666'}>{cachePct}%</Text>
        <Text dimColor> ({fmt(usage.cacheRead)} / {fmt(totalInput)})</Text>
      </Box>
      <Box>
        <Text dimColor>Output     </Text>
        <Text color="white">{fmt(usage.outputTokens)}</Text>
        <Text dimColor> tok</Text>
      </Box>
      <Text dimColor>{'─'.repeat(36)}</Text>
    </Box>
  );
}

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
