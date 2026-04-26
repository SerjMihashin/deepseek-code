import React from 'react'
import { Box, Text } from 'ink'
import type { ChatMessage } from '../api/index.js'
import { i18n } from '../core/i18n.js'
import { themeManager } from '../core/themes.js'
import { MarkdownView } from './markdown-view.js'
import { MatrixRain } from './matrix-rain.js'

interface ChatViewProps {
  messages: ChatMessage[];
  scrollOffset?: number;
}

function MessageBubble ({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const label = isUser ? i18n.t('you') : isSystem ? i18n.t('system') : i18n.t('assistant')
  const colors = themeManager.getColors()

  const textContent = typeof message.content === 'string'
    ? message.content
    : message.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('\n')
  const hasImage = Array.isArray(message.content) && message.content.some(b => b.type === 'image_url')

  return (
    <Box flexDirection='column' marginBottom={1}>
      <Box>
        <Text bold color={isUser ? colors.userBubble : colors.assistantBubble}>
          {label}
        </Text>
      </Box>
      <Box marginLeft={2} flexDirection='column'>
        {isUser || isSystem
          ? <Text wrap='wrap'>{textContent}</Text>
          : <MarkdownView text={textContent} />}
        {hasImage && <Text color={colors.info}>[📎 image attached]</Text>}
      </Box>
    </Box>
  )
}

export const ChatView = React.memo(
  function ChatView ({ messages, scrollOffset = 0 }: ChatViewProps) {
  const colors = themeManager.getColors()

  const visibleMessages = messages.filter(msg => msg.role !== 'tool')
  const hidden = Math.min(scrollOffset, Math.max(0, visibleMessages.length - 1))
  const shown = hidden > 0 ? visibleMessages.slice(hidden) : visibleMessages

  return (
    <Box flexDirection='column' flexGrow={1} paddingX={1}>
      {visibleMessages.length === 0
        ? (
          <Box flexDirection='column' alignItems='center' marginTop={2}>
            {themeManager.theme.name === 'matrix' && <MatrixRain />}
            <Text bold color={colors.text}>{i18n.t('welcome')}</Text>
            <Text color={colors.textMuted}>{i18n.t('welcomeSubtitle')}</Text>
            <Text color={colors.textMuted}>{i18n.t('welcomeHint')}</Text>
            <Box marginTop={1}>
              <Text color={colors.textMuted}>/help — commands  |  /setup — settings  |  Alt+V — paste image</Text>
            </Box>
          </Box>
          )
        : (
          <>
            {hidden > 0 && (
              <Box paddingX={1}>
                <Text dimColor>↑ {hidden} earlier message{hidden > 1 ? 's' : ''} (PageDown to scroll back)</Text>
              </Box>
            )}
            {shown.map((msg, i) => (
              <MessageBubble key={hidden + i} message={msg} />
            ))}
          </>
          )}
    </Box>
  )
  },
  (prev, next) =>
    prev.scrollOffset === next.scrollOffset &&
    prev.messages.length === next.messages.length &&
    prev.messages[prev.messages.length - 1]?.content === next.messages[next.messages.length - 1]?.content
)
