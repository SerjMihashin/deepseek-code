import React from 'react'
import { Box, Text, Static } from 'ink'
import { debug } from '../utils/logger.js'
import type { ChatMessage } from '../api/index.js'
import type { ToolCallEvent } from '../core/agent-loop.js'
import { i18n } from '../core/i18n.js'
import { themeManager } from '../core/themes.js'
import { MarkdownView } from './markdown-view.js'
import { visualWidth, formatDuration } from '../utils/string-width.js'

/** Concise target (file/command/pattern) for a tool call, for the history list. */
// How many diff lines to show inline under a write/edit tool card before collapsing.
const DIFF_PREVIEW_LINES = 16

function toolTarget (tc: ToolCallEvent): string {
  const a = (tc.arguments ?? {}) as Record<string, unknown>
  const raw = a.path ?? a.file_path ?? a.filePath ?? a.command ?? a.cmd ?? a.pattern ?? a.query ?? a.url
  if (typeof raw !== 'string') return ''
  const oneLine = raw.replace(/\s+/g, ' ').trim()
  return oneLine.length > 64 ? oneLine.slice(0, 63) + '…' : oneLine
}

interface ChatViewProps {
  messages: ChatMessage[];
  /**
   * While true, the LAST message is the still-mutating "live tail" (streaming
   * text or the active tool batch) and stays in the re-rendering live region;
   * everything before it is committed to the Static scrollback (printed once,
   * natively scrollable). Completed text blocks and tool batches become the
   * not-last message and thus commit incrementally as the turn progresses.
   */
  isProcessing: boolean;
  /** Remount key for Static — bump to reset the scrollback (e.g. on /clear). */
  epoch: number;
  /** Header printed once at the very top of the scrollback (logo/banner). */
  header?: React.ReactNode;
}

/** Whether a message should be shown in the chat (hide raw tool results). */
function isVisibleMessage (msg: ChatMessage): boolean {
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
}

export function MessageBubble ({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isTool = message.role === 'tool'
  const label = isUser ? i18n.t('you') : isSystem ? i18n.t('system') : isTool ? '' : i18n.t('assistant')
  const colors = themeManager.getColors()

  // Tool activity card — committed to history as a readable per-call list so the
  // user can see exactly what the agent did (file/command), without raw output.
  if (isTool) {
    try {
      const parsed = typeof message.content === 'string' ? JSON.parse(message.content) : message.content
      if (parsed?.type === 'tool_activity_card') {
        const toolCalls = (parsed.toolCalls ?? []) as ToolCallEvent[]
        return (
          <Box flexDirection='column' marginLeft={2} marginBottom={1}>
            {toolCalls.map((tc, i) => {
              const failed = tc.status === 'failed' || tc.status === 'rejected'
              const ok = tc.status === 'completed'
              const icon = failed ? '✗' : ok ? '✓' : '·'
              const target = toolTarget(tc)
              const dur = tc.durationMs ? ` · ${formatDuration(tc.durationMs)}` : ''
              const err = failed && tc.error ? ` — ${tc.error.split('\n')[0].slice(0, 80)}` : ''
              const diffLines = ok && tc.diff ? tc.diff.split('\n').slice(0, DIFF_PREVIEW_LINES) : []
              const diffHidden = ok && tc.diff ? tc.diff.split('\n').length - diffLines.length : 0
              return (
                <Box key={`${tc.id}-${i}`} flexDirection='column'>
                  <Text color={failed ? colors.error : colors.textMuted}>
                    {icon} {tc.name}{target ? ` ${target}` : ''}{dur}{err}
                  </Text>
                  {diffLines.map((line, di) => (
                    <Text
                      key={di}
                      color={line[0] === '+' ? colors.success : line[0] === '-' ? colors.error : colors.textMuted}
                    >
                      {'    '}{line.length > 118 ? line.slice(0, 117) + '…' : line}
                    </Text>
                  ))}
                  {diffHidden > 0 && (
                    <Text color={colors.textMuted}>{'    '}… +{diffHidden} more diff lines</Text>
                  )}
                </Box>
              )
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
          ? <Text wrap='wrap' color={colors.text}>{textContent}</Text>
          : <MarkdownView text={textContent} />}
        {hasImage && <Text color={colors.info}>[image attached]</Text>}
      </Box>
    </Box>
  )
}

/** Empty-state welcome banner shown before the first message. */
export function WelcomeScreen () {
  const colors = themeManager.getColors()
  const hint = `/help — помощь  |  /setup — настройки  |  Alt+V — изображение${process.platform === 'win32' ? ' (Win Terminal ≥1.14)' : ''}`

  // The Matrix "digital rain" is a one-time startup intro (see matrix-intro.tsx);
  // the welcome screen itself stays calm so typing is never disrupted by an
  // animation re-rendering underneath it.
  return (
    <Box flexDirection='column' alignItems='center' marginTop={2}>
      <Text bold color={colors.text}>{i18n.t('welcome')}</Text>
      <Text color={colors.textMuted}>{i18n.t('welcomeSubtitle')}</Text>
      <Text color={colors.textMuted}>{i18n.t('welcomeHint')}</Text>
      <Box marginTop={1}>
        <Text color={colors.textMuted}>{hint}</Text>
      </Box>
    </Box>
  )
}

/**
 * Render the still-mutating "live tail" with a bounded height. This is critical:
 * Ink clears the ENTIRE terminal (and reprints all history) on every frame when
 * the dynamic output height reaches the terminal row count — that is the source
 * of the flicker and of the broken mouse scroll. By capping the live tail well
 * under the terminal height we keep Ink on its smooth incremental path and leave
 * the scrollback intact. The finalized message (full markdown) lands in <Static>.
 */
function LiveTail ({ message, maxLines }: { message: ChatMessage; maxLines: number }) {
  const colors = themeManager.getColors()

  // Live tool batch → single compact line (full detail commits to scrollback).
  if (message.role === 'tool') {
    try {
      const parsed = typeof message.content === 'string' ? JSON.parse(message.content) : message.content
      if (parsed?.type === 'tool_activity_card') {
        const toolCalls = (parsed.toolCalls ?? []) as ToolCallEvent[]
        const names = toolCalls.map(t => t.name).join(', ')
        return (
          <Box marginLeft={2}>
            <Text dimColor>[tools] {names || '…'} · {toolCalls.length}</Text>
          </Box>
        )
      }
    } catch (e) {
      debug('chat-view: live tail parse error', e)
    }
  }

  const isUser = message.role === 'user'
  const label = isUser ? i18n.t('you') : message.role === 'system' ? i18n.t('system') : i18n.t('assistant')
  const text = typeof message.content === 'string'
    ? message.content
    : message.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('\n')
  const lines = text.split('\n')

  // Accumulate lines from the bottom, counting WRAPPED rows (not logical lines),
  // so the rendered tail never exceeds `maxLines` terminal rows. Logical-line
  // counting was insufficient — long report lines wrap to several rows and the
  // tail blew past the terminal height, re-triggering Ink's clearTerminal path.
  const availWidth = Math.max(20, (process.stdout.columns || 80) - 2)
  const shown: string[] = []
  let usedRows = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const rows = Math.max(1, Math.ceil(visualWidth(lines[i]) / availWidth))
    if (usedRows + rows > maxLines && shown.length > 0) break
    shown.unshift(lines[i])
    usedRows += rows
    if (usedRows >= maxLines) break
  }
  const truncated = shown.length < lines.length

  return (
    <Box flexDirection='column' marginBottom={1}>
      <Box>
        <Text bold color={isUser ? colors.userBubble : colors.assistantBubble}>{label}</Text>
      </Box>
      {truncated && (
        <Box marginLeft={2}>
          <Text dimColor>… (показан конец; полный текст появится в истории выше)</Text>
        </Box>
      )}
      <Box marginLeft={2}>
        <Text wrap='wrap' color={colors.text}>{shown.join('\n')}</Text>
      </Box>
    </Box>
  )
}

type StaticItem =
  | { kind: 'header' }
  | { kind: 'msg'; message: ChatMessage }

/**
 * Chat history renderer. Finalized messages (and the header) go through Ink's
 * <Static>, which writes them to the terminal scrollback exactly once — this
 * removes the per-frame redraw flicker and lets the terminal's own mouse-wheel
 * scrolling work. Only the current in-progress turn is kept in the live region.
 */
export function ChatView ({ messages, isProcessing, epoch, header }: ChatViewProps) {
  // While processing, keep only the last message live; commit the rest.
  const splitAt = isProcessing && messages.length > 0 ? messages.length - 1 : messages.length
  const committed = messages.slice(0, splitAt).filter(isVisibleMessage)
  const live = messages.slice(splitAt).filter(isVisibleMessage)
  const isEmpty = committed.length === 0 && live.length === 0

  const cols = process.stdout.columns || 80
  // Keep the live tail comfortably under the terminal height (reserve room for
  // the input bar, status bar, notices and dialogs) so Ink never hits its
  // full-screen clearTerminal path.
  const maxLiveLines = Math.max(4, (process.stdout.rows || 24) - 16)
  const staticItems: StaticItem[] = [
    ...(header ? [{ kind: 'header' as const }] : []),
    ...committed.map(message => ({ kind: 'msg' as const, message })),
  ]

  return (
    <>
      <Static key={epoch} items={staticItems}>
        {(item, i) => (
          item.kind === 'header'
            ? <Box key={`s${i}`} width={cols} justifyContent='center'>{header}</Box>
            : <Box key={`s${i}`} paddingX={1}><MessageBubble message={item.message} /></Box>
        )}
      </Static>
      {isEmpty && <WelcomeScreen />}
      {live.length > 0 && (
        <Box flexDirection='column' paddingX={1}>
          {live.map((message, i) => (
            <LiveTail key={`live${i}`} message={message} maxLines={maxLiveLines} />
          ))}
        </Box>
      )}
    </>
  )
}
