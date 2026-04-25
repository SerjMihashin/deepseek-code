import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../api/index.js';

interface ChatViewProps {
  messages: ChatMessage[];
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const label = isUser ? 'You' : isSystem ? 'System' : 'DeepSeek';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={isUser ? 'green' : 'blue'}>
          {label}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    </Box>
  );
}

export function ChatView({ messages }: ChatViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.length === 0 ? (
        <Box flexDirection="column" alignItems="center" marginTop={3}>
          <Text bold>DeepSeek Code</Text>
          <Text dimColor>AI-powered CLI agent for software development</Text>
          <Text dimColor>Type your request to get started.</Text>
          <Box marginTop={1}>
            <Text dimColor>Tab: cycle approval mode | /help: show commands</Text>
          </Box>
        </Box>
      ) : (
        messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))
      )}
    </Box>
  );
}
