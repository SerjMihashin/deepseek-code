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
  pending: '[wait]',
  running: '[run]',
  completed: '[ok]',
  failed: '[err]',
  rejected: '[no]',
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

/**
 * Group tool calls by name, returning summary entries.
 * Each group shows: name × count, status icon of latest, latest target.
 */
function groupToolCalls (calls: ToolCallEvent[]): Array<{
  name: string;
  count: number;
  latest: ToolCallEvent;
  status: string;
}> {
  const groups = new Map<string, ToolCallEvent[]>()
  for (const tc of calls) {
    const existing = groups.get(tc.name) ?? []
    existing.push(tc)
    groups.set(tc.name, existing)
  }

  const result: Array<{ name: string; count: number; latest: ToolCallEvent; status: string }> = []
  for (const [name, entries] of groups) {
    const latest = entries[entries.length - 1]
    // Determine aggregate status: if any failed, group is failed; if any running, group is running
    let status = 'completed'
    for (const e of entries) {
      if (e.status === 'running' || e.status === 'pending') { status = 'running'; break }
      if (e.status === 'failed') { status = 'failed'; break }
      if (e.status === 'rejected') { status = 'rejected'; break }
    }
    result.push({ name, count: entries.length, latest, status })
  }

  // Sort: running first, then by recency
  result.sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (b.status === 'running' && a.status !== 'running') return 1
    return 0
  })

  return result
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

  // Group tool calls for compact display
  const groups = groupToolCalls(toolCalls)
  const visible = maxItems !== undefined ? groups.slice(0, maxItems) : groups
  const hidden = groups.length - visible.length

  return (
    <Box flexDirection='column' marginLeft={2}>
      {hidden > 0 && (
        <Box>
          <Text dimColor>  ↑ {hidden} more tool type{hidden > 1 ? 's' : ''}</Text>
        </Box>
      )}
      {visible.map((group) => {
        const icon = statusIcons[group.status] ?? '[?]'
        const color = statusColors[group.status] ?? 'white'
        const duration = group.latest.durationMs ? formatDuration(group.latest.durationMs) : ''
        const isChrome = group.name === 'chrome'
        const displayArgs = isChrome
          ? formatChromeArgs(group.latest.arguments)
          : formatArgs(group.latest.arguments)

        const inlineResult = group.latest.status === 'completed' && group.latest.result && group.latest.result.length > 0
          ? ` → ${group.latest.result.slice(0, 60)}${group.latest.result.length > 60 ? '…' : ''}`
          : null
        const inlineError = group.latest.status === 'failed' && group.latest.error
          ? ` [err] ${group.latest.error.slice(0, 100)}`
          : null

        return (
          <FadeIn key={group.name} delay={150}>
            <Box>
              <Text>
                {'  '}
                <Text color={color}>{icon}</Text>
                {' '}
                <Text bold color={color}>{group.name}</Text>
                {group.count > 1 && <Text color={color}> ×{group.count}</Text>}
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
