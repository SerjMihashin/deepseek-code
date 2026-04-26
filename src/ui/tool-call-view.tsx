import React from 'react'
import { Box, Text } from 'ink'
import type { ToolCallEvent } from '../core/agent-loop.js'

interface ToolCallViewProps {
  toolCalls: ToolCallEvent[];
}

const statusIcons: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  rejected: '🚫',
}

const statusColors: Record<string, string> = {
  pending: 'yellow',
  running: 'cyan',
  completed: 'green',
  failed: 'red',
  rejected: 'red',
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

export function ToolCallView ({ toolCalls }: ToolCallViewProps) {
  if (toolCalls.length === 0) return null

  return (
    <Box flexDirection='column' marginLeft={2}>
      {toolCalls.map((tc) => {
        const icon = statusIcons[tc.status] ?? '✳'
        const color = statusColors[tc.status] ?? 'white'
        const duration = tc.durationMs ? formatDuration(tc.durationMs) : ''
        const isChrome = tc.name === 'chrome'
        const displayArgs = isChrome ? formatChromeArgs(tc.arguments) : formatArgs(tc.arguments)

        return (
          <Box key={tc.id} flexDirection='column'>
            <Box>
              <Text>
                {'  '}
                <Text color={color}>{icon}</Text>
                {' '}
                <Text bold color={color}>{tc.name}</Text>
                {displayArgs ? <Text dimColor> {displayArgs}</Text> : null}
                {duration ? <Text dimColor> - {duration}</Text> : null}
              </Text>
            </Box>
            {tc.status === 'failed' && tc.error && (
              <Box marginLeft={4}>
                <Text color='red'>{tc.error.slice(0, 200)}</Text>
              </Box>
            )}
            {tc.status === 'completed' && tc.result && tc.result.length > 0 && (
              <Box marginLeft={4} flexDirection='column'>
                <Text dimColor>
                  {tc.result.length > 200
                    ? `${tc.result.slice(0, 197)}...`
                    : tc.result}
                </Text>
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
