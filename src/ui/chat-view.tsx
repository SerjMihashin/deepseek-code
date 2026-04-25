import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../api/index.js';
import { i18n } from '../core/i18n.js';

interface ChatViewProps {
  messages: ChatMessage[];
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const label = isUser ? i18n.t('you') : isSystem ? i18n.t('system') : i18n.t('assistant');

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
          <Text bold>{i18n.t('welcome')}</Text>
          <Text dimColor>{i18n.t('welcomeSubtitle')}</Text>
          <Text dimColor>{i18n.t('welcomeHint')}</Text>
          <Box marginTop={1}>
            <Text dimColor>/remember, /forget, /memory | /checkpoint, /restore | /compress</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>/mcp, /skills, /agents, /stats, /review | /theme, /lang, /extensions</Text>
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
