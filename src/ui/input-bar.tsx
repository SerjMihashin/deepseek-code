import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputBarProps {
  onSubmit: (input: string) => void;
  disabled: boolean;
  onClear: () => void;
  onExit: () => void;
}

export function InputBar({ onSubmit, disabled, onClear, onExit }: InputBarProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((_input, key) => {
    if (key.return && !key.shift) {
      if (input.trim()) {
        onSubmit(input);
        setHistory(prev => [input, ...prev].slice(0, 100));
        setInput('');
        setHistoryIndex(-1);
      }
    } else if (key.upArrow) {
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (key.ctrl && _input === 'l') {
      onClear();
    } else if (key.ctrl && _input === 'c') {
      onExit();
    }
  });

  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
      <Text bold color="green">{'>'}</Text>
      <Text> {input || (disabled ? ' Processing...' : ' Type your request...')}</Text>
      {input.length > 0 && !disabled && (
        <Text dimColor>  (Enter to send)</Text>
      )}
    </Box>
  );
}
