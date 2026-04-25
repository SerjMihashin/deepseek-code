import React from 'react';
import { Box, Text } from 'ink';
import type { ApprovalMode } from '../config/defaults.js';

interface StatusBarProps {
  mode: ApprovalMode;
  status: string;
  messageCount: number;
}

const modeColors: Record<ApprovalMode, string> = {
  plan: 'yellow',
  default: 'blue',
  'auto-edit': 'green',
  yolo: 'red',
};

const modeLabels: Record<ApprovalMode, string> = {
  plan: 'PLAN',
  default: 'DEFAULT',
  'auto-edit': 'AUTO-EDIT',
  yolo: 'YOLO',
};

export function StatusBar({ mode, status, messageCount }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Box flexGrow={1}>
        <Text bold color={modeColors[mode] as 'yellow' | 'blue' | 'green' | 'red'}>
          [{modeLabels[mode]}]
        </Text>
        <Text> </Text>
        <Text dimColor>{status}</Text>
      </Box>
      <Box>
        <Text dimColor>Messages: {messageCount}</Text>
      </Box>
    </Box>
  );
}
