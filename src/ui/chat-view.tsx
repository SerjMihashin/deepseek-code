import React from 'react'
import { Box, Text } from 'ink'
import type { ChatMessage } from '../api/index.js'
import { i18n } from '../core/i18n.js'
import { themeManager } from '../core/themes.js'

interface ChatViewProps {
  messages: ChatMessage[];
}

function MessageBubble ({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const label = isUser ? i18n.t('you') : isSystem ? i18n.t('system') : i18n.t('assistant')
  const colors = themeManager.getColors()

  return (
    <Box flexDirection='column' marginBottom={1}>
      <Box>
        <Text bold color={isUser ? colors.userBubble : colors.assistantBubble}>
          {label}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text wrap='wrap'>{message.content}</Text>
      </Box>
    </Box>
  )
}

export function ChatView ({ messages }: ChatViewProps) {
  const colors = themeManager.getColors()

  // Filter out tool messages — they are displayed in ToolCallView instead
  const visibleMessages = messages.filter(msg => msg.role !== 'tool')

  return (
    <Box flexDirection='column' flexGrow={1} paddingX={1}>
      {visibleMessages.length === 0
        ? (
          <Box flexDirection='column' alignItems='center' marginTop={3}>
            <Text bold color={colors.text}>{i18n.t('welcome')}</Text>
            <Text color={colors.textMuted}>{i18n.t('welcomeSubtitle')}</Text>
            <Text color={colors.textMuted}>{i18n.t('welcomeHint')}</Text>
            <Box marginTop={1}>
              <Text color={colors.textMuted}>/remember, /forget, /memory | /checkpoint, /restore | /compress | /setup</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.textMuted}>/mcp, /skills, /agents, /stats, /review | /theme, /lang, /extensions</Text>
            </Box>
          </Box>
          )
        : (
            visibleMessages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))
          )}
    </Box>
  )
}
