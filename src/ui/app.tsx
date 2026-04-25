import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ChatView } from './chat-view.js';
import { InputBar } from './input-bar.js';
import { StatusBar } from './status-bar.js';
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js';
import type { SessionOptions } from '../cli/interactive.js';
import { DeepSeekAPI, type ChatMessage } from '../api/index.js';
import { getToolsForMode } from '../tools/registry.js';

interface AppProps {
  config: DeepSeekConfig;
  options: SessionOptions;
}

export function App({ config, options }: AppProps) {
  const { exit } = useApp();
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(
    (options.approvalMode as ApprovalMode) ?? (options.yolo ? 'yolo' : config.approvalMode),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const apiRef = useRef(new DeepSeekAPI(config));

  const tools = getToolsForMode(approvalMode);

  const handleSubmit = useCallback(async (input: string) => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);
    setStatusText('Processing...');

    try {
      const response = await apiRef.current.chat([...messages, userMessage]);
      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${(err as Error).message}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      setStatusText('Ready');
    }
  }, [messages, isProcessing]);

  // Handle approval mode cycling
  useInput((_input, key) => {
    if (key.tab) {
      setApprovalMode(prev => {
        const modes: ApprovalMode[] = ['plan', 'default', 'auto-edit', 'yolo'];
        const idx = modes.indexOf(prev);
        return modes[(idx + 1) % modes.length];
      });
    }
  });

  const handleClear = useCallback(() => {
    setMessages([]);
  }, []);

  const handleExit = useCallback(() => {
    exit();
  }, [exit]);

  return (
    <Box flexDirection="column" height="100%">
      <ChatView messages={messages} />
      <InputBar
        onSubmit={handleSubmit}
        disabled={isProcessing}
        onClear={handleClear}
        onExit={handleExit}
      />
      <StatusBar
        mode={approvalMode}
        status={statusText}
        messageCount={messages.length}
      />
    </Box>
  );
}
