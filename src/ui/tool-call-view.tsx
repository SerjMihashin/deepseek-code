import React from 'react'
import { Box, Text } from 'ink'
import type { ToolCallEvent } from '../core/agent-loop.js'
import { themeManager } from '../core/themes.js'
import { FadeIn } from './fade-in.js'

interface ToolCallViewProps {
  toolCalls: ToolCallEvent[];
  maxItems?: number;
}

const statusIcons: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  rejected: '🚫',
}

function formatDuration (ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatArgs (args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ''

  return entries.map(([key, value]) => {
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    const truncated = str.length > 80 ? `${str.slice(0, 77)}...` : str
    return `${key}: ${truncated}`
  }).join(', ')
}

function formatChromeArgs (args: Record<string, unknown>): string {
  const action = args.action as string
  const url = args.url as string
  const selector = args.selector as string
  const text = args.text as string
  const code = args.code as string
  const sameTab = args.sameTab as boolean
  const headless = args.headless as boolean

  const parts: string[] = []
  if (url) parts.push(url)
  if (selector) parts.push(`"${selector}"`)
  if (text) parts.push(`"${text}"`)
  if (code) {
    const truncated = code.length > 50 ? `${code.slice(0, 47)}...` : code
    parts.push(`\`${truncated}\``)
  }
  if (sameTab) parts.push('(same-tab)')
  if (headless) parts.push('(headless)')

  const actionLabels: Record<string, string> = {
    open: 'Open',
    click: 'Click',
    fill: 'Fill',
    eval: 'Eval',
    text: 'Text',
    html: 'HTML',
    console: 'Console',
    network: 'Network',
    state: 'State',
    shot: 'Screenshot',
    nav: 'Navigate',
    wait: 'Wait',
    scroll: 'Scroll',
    locator: 'Locator',
    cookies: 'Cookies',
    storage: 'Storage',
    quiz: 'Quiz',
  }

  const label = actionLabels[action] ?? action
  return `${label}${parts.length > 0 ? ` ${parts.join(' ')}` : ''}`
}

export const ToolCallView = React.memo(function ToolCallView ({ toolCalls, maxItems }: ToolCallViewProps) {
  const colors = themeManager.getColors()
  const statusColors: Record<string, string> = {
    pending: colors.warning,
    running: colors.info,
    completed: colors.success,
    failed: colors.error,
    rejected: colors.error,
  }

  if (toolCalls.length === 0) return null

  const visible = maxItems !== undefined ? toolCalls.slice(-maxItems) : toolCalls
  const hidden = toolCalls.length - visible.length

  return (
    <Box flexDirection='column' marginLeft={2}>
      {hidden > 0 && (
        <Box>
          <Text dimColor>  ↑ {hidden} more tool call{hidden > 1 ? 's' : ''} above</Text>
        </Box>
      )}
      {visible.map((tc) => {
        const icon = statusIcons[tc.status] ?? '✳'
        const color = statusColors[tc.status] ?? 'white'
        const duration = tc.durationMs ? formatDuration(tc.durationMs) : ''
        const isChrome = tc.name === 'chrome'
        const displayArgs = isChrome ? formatChromeArgs(tc.arguments) : formatArgs(tc.arguments)

        const inlineResult = tc.status === 'completed' && tc.result && tc.result.length > 0
          ? ` → ${tc.result.slice(0, 60)}${tc.result.length > 60 ? '…' : ''}`
          : null
        const inlineError = tc.status === 'failed' && tc.error
          ? ` ✗ ${tc.error.slice(0, 100)}`
          : null

        return (
          <FadeIn key={tc.id} delay={150}>
            <Box>
              <Text>
                {'  '}
                <Text color={color}>{icon}</Text>
                {' '}
                <Text bold color={color}>{tc.name}</Text>
                {displayArgs ? <Text dimColor> {displayArgs}</Text> : null}
                {duration ? <Text dimColor> - {duration}</Text> : null}
                {inlineResult ? <Text dimColor>{inlineResult}</Text> : null}
                {inlineError ? <Text color={colors.error}>{inlineError}</Text> : null}
              </Text>
            </Box>
          </FadeIn>
        )
      })}
    </Box>
  )
})
