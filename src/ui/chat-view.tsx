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
  hasNewMessages?: boolean;
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
  function ChatView ({ messages, scrollOffset = 0, hasNewMessages = false }: ChatViewProps) {
  const colors = themeManager.getColors()
  const isMatrix = themeManager.theme.name === 'matrix'

  const visibleMessages = messages.filter(msg => msg.role !== 'tool')
  const WINDOW = 15
  const total = visibleMessages.length
  const endIdx = Math.max(WINDOW, total - scrollOffset)
  const startIdx = Math.max(0, endIdx - WINDOW)
  const shown = visibleMessages.slice(startIdx, endIdx)
  const hiddenAbove = startIdx
  const hiddenBelow = total - endIdx

  return (
    <Box flexDirection='column' flexGrow={1} paddingX={1}>
      {total === 0
        ? (
          <Box flexDirection='column' alignItems='center' marginTop={2}>
            {isMatrix
              ? (
                <>
                  <MatrixRain />
                  <Text bold color={colors.primary}>Wake up, Neo...</Text>
                  <Text color={colors.secondary}>The Matrix has you.</Text>
                  <Text color={colors.textMuted}>Follow the white rabbit.</Text>
                </>
                )
              : (
                <>
                  <Text bold color={colors.text}>{i18n.t('welcome')}</Text>
                  <Text color={colors.textMuted}>{i18n.t('welcomeSubtitle')}</Text>
                  <Text color={colors.textMuted}>{i18n.t('welcomeHint')}</Text>
                </>
                )}
            <Box marginTop={1}>
              <Text color={colors.textMuted}>/help — commands  |  /setup — settings  |  Alt+V — paste image</Text>
            </Box>
          </Box>
          )
        : (
          <>
            {hiddenAbove > 0 && (
              <Box paddingX={1}>
                <Text dimColor>↑ {hiddenAbove} older message{hiddenAbove > 1 ? 's' : ''} — PageUp</Text>
              </Box>
            )}
            {shown.map((msg, i) => (
              <MessageBubble key={startIdx + i} message={msg} />
            ))}
            {hiddenBelow > 0 && (
              <Box paddingX={1}>
                {hasNewMessages
                  ? <Text bold color='yellow'>↓ New messages ({hiddenBelow}) — End to follow</Text>
                  : <Text dimColor>↓ {hiddenBelow} newer message{hiddenBelow > 1 ? 's' : ''} — PageDown</Text>}
              </Box>
            )}
          </>
          )}
    </Box>
  )
  },
  (prev, next) =>
    prev.scrollOffset === next.scrollOffset &&
    prev.hasNewMessages === next.hasNewMessages &&
    prev.messages.length === next.messages.length &&
    prev.messages[prev.messages.length - 1]?.content === next.messages[next.messages.length - 1]?.content
)
