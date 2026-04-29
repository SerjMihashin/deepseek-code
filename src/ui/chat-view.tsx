import React from 'react'
import { Box, Text } from 'ink'
import { debug } from '../utils/logger.js'
import type { ChatMessage } from '../api/index.js'
import type { ToolCallEvent } from '../core/agent-loop.js'
import { i18n } from '../core/i18n.js'
import { themeManager } from '../core/themes.js'
import { MarkdownView } from './markdown-view.js'
import { ActivityCard, toolCallToCards } from './activity-cards.js'
import { MatrixRain } from './matrix-rain.js'

interface ChatViewProps {
  messages: ChatMessage[];
  scrollOffset?: number;
  hasNewMessages?: boolean;
}

function MessageBubble ({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isTool = message.role === 'tool'
  const label = isUser ? i18n.t('you') : isSystem ? i18n.t('system') : isTool ? '' : i18n.t('assistant')
  const colors = themeManager.getColors()

  // Tool activity card — render inline in chat using new ActivityCard components
  if (isTool) {
    try {
      const parsed = typeof message.content === 'string' ? JSON.parse(message.content) : message.content
      if (parsed?.type === 'tool_activity_card') {
        const toolCalls = parsed.toolCalls as ToolCallEvent[]
        const status = parsed.status as 'live' | 'compact' | undefined

        // Compact mode: single-line summary
        if (status === 'compact') {
          const groups = toolCalls.reduce((acc, tc) => {
            const existing = acc.find(g => g.name === tc.name)
            if (existing) {
              existing.count++
            } else {
              acc.push({ name: tc.name, count: 1 })
            }
            return acc
          }, [] as Array<{ name: string; count: number }>)
          const toolList = groups.map(g => `${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`).join(', ')
          const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.durationMs ?? 0), 0)
          const hasErrors = toolCalls.some(tc => tc.status === 'failed' || tc.status === 'rejected')
          return (
            <Box marginLeft={2} marginBottom={1}>
              <Text dimColor>
                {hasErrors ? '[warn] ' : '[tools] '}
                Инструменты: {toolList}
                {' · '}{toolCalls.length} {toolCalls.length === 1 ? 'вызов' : 'вызова'}
                {totalDuration > 0 ? ` · ${(totalDuration < 1000 ? `${totalDuration}мс` : `${(totalDuration / 1000).toFixed(1)}с`)}` : ''}
              </Text>
            </Box>
          )
        }

        // Live mode: render each tool call as an ActivityCard
        return (
          <Box flexDirection='column'>
            {toolCalls.map(tc => {
              const cards = toolCallToCards(tc)
              return cards.map((card, i) => <ActivityCard key={`${tc.id}-${i}`} data={card} />)
            })}
          </Box>
        )
      }
    } catch (e) {
      debug('chat-view: tool card parse error', e)
      // fall through to normal rendering
    }
  }

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
        {hasImage && <Text color={colors.info}>[image attached]</Text>}
      </Box>
    </Box>
  )
}

export const ChatView = React.memo(
  function ChatView ({ messages, scrollOffset = 0, hasNewMessages = false }: ChatViewProps) {
    const colors = themeManager.getColors()
    const isMatrix = themeManager.theme.name === 'matrix'

    const visibleMessages = messages.filter(msg => {
    // Hide raw tool results, show tool activity cards
      if (msg.role === 'tool') {
        try {
          const parsed = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
          return parsed?.type === 'tool_activity_card'
        } catch (e) {
          debug('chat-view: message filter parse error', e)
          return false
        }
      }
      return true
    })
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
                    <Box position='absolute' flexDirection='column' alignItems='center'>
                      <Text bold color={colors.primary}>deepseek-code</Text>
                      <Text color={colors.textMuted}>/help — помощь  |  /setup — настройки  |  Alt+V — изображение{process.platform === 'win32' ? ' (Win Terminal ≥1.14)' : ''}</Text>
                    </Box>
                  </>
                  )
                : (
                  <>
                    <Text bold color={colors.text}>{i18n.t('welcome')}</Text>
                    <Text color={colors.textMuted}>{i18n.t('welcomeSubtitle')}</Text>
                    <Text color={colors.textMuted}>{i18n.t('welcomeHint')}</Text>
                    <Box marginTop={1}>
                      <Text color={colors.textMuted}>/help — помощь  |  /setup — настройки  |  Alt+V — изображение{process.platform === 'win32' ? ' (Win Terminal ≥1.14)' : ''}</Text>
                    </Box>
                  </>
                  )}
            </Box>
            )
          : (
            <>
              {hiddenAbove > 0 && (
                <Box paddingX={1}>
                  <Text dimColor>↑ {hiddenAbove} {hiddenAbove === 1 ? 'сообщение' : 'сообщений'} — PageUp</Text>
                </Box>
              )}
              {shown.map((msg, i) => (
                <MessageBubble key={startIdx + i} message={msg} />
              ))}
              {hiddenBelow > 0 && (
                <Box paddingX={1}>
                  {hasNewMessages
                    ? <Text bold color={colors.warning}>↓ {hiddenBelow} новых — End для перехода</Text>
                    : <Text dimColor>↓ {hiddenBelow} новее — PageDown</Text>}
                </Box>
              )}
            </>
            )}
      </Box>
    )
  },
  (prev, next) =>
    prev.messages === next.messages &&
    prev.scrollOffset === next.scrollOffset &&
    prev.hasNewMessages === next.hasNewMessages
)
