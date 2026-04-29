import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import type { ToolCallEvent } from '../core/agent-loop.js'
import { themeManager } from '../core/themes.js'
import { formatDuration } from '../utils/string-width.js'

const BASH_TIMEOUT_MS = 30_000
const DEFAULT_TIMEOUT_MS = 10_000

interface ToolActivityCardProps {
  toolCalls: ToolCallEvent[];
  status?: 'live' | 'compact';
}

const statusIcons: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  rejected: '🚫',
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
    let status = 'completed'
    for (const e of entries) {
      if (e.status === 'running' || e.status === 'pending') { status = 'running'; break }
      if (e.status === 'failed') { status = 'failed'; break }
      if (e.status === 'rejected') { status = 'rejected'; break }
    }
    result.push({ name, count: entries.length, latest, status })
  }

  result.sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (b.status === 'running' && a.status !== 'running') return 1
    return 0
  })

  return result
}

export const ToolActivityCard = React.memo(function ToolActivityCard ({ toolCalls, status = 'live' }: ToolActivityCardProps) {
  const colors = themeManager.getColors()
  const [now, setNow] = useState(() => Date.now())

  const isAnyRunning = toolCalls.some(tc => tc.status === 'running')
  useEffect(() => {
    if (!isAnyRunning) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [isAnyRunning])

  function elapsedColor (elapsed: number, timeoutMs: number): string {
    const ratio = elapsed / timeoutMs
    if (ratio >= 0.9) return colors.error
    if (ratio >= 0.6) return colors.warning
    return colors.success
  }
  const statusColors: Record<string, string> = {
    pending: colors.warning,
    running: colors.info,
    completed: colors.success,
    failed: colors.error,
    rejected: colors.error,
  }

  if (toolCalls.length === 0) return null

  const groups = groupToolCalls(toolCalls)
  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.durationMs ?? 0), 0)
  const uniqueTypes = groups.length

  // Compact mode: single-line summary
  if (status === 'compact') {
    const toolList = groups.map(g =>
      `${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`
    ).join(', ')
    const hasErrors = groups.some(g => g.status === 'failed' || g.status === 'rejected')
    return (
      <Box marginLeft={2} marginBottom={1}>
        <Text dimColor>
          {hasErrors ? '⚠️ ' : '🔧 '}
          Инструменты: {toolList}
          {' · '}{toolCalls.length} call{toolCalls.length !== 1 ? 's' : ''}
          {totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ''}
        </Text>
      </Box>
    )
  }

  // Live mode: grouped display with border
  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box borderStyle='round' borderColor={colors.border} paddingX={1} paddingY={0}>
        <Box flexDirection='column'>
          {groups.map((group) => {
            const icon = statusIcons[group.status] ?? '✳'
            const color = statusColors[group.status] ?? 'white'
            const isRunning = group.status === 'running'
            const isChrome = group.name === 'chrome'
            const isBash = group.name === 'run_shell_command'
            const displayArgs = isChrome
              ? formatChromeArgs(group.latest.arguments)
              : formatArgs(group.latest.arguments)

            const inlineResult = group.latest.status === 'completed' && group.latest.result && group.latest.result.length > 0
              ? ` → ${group.latest.result.slice(0, 60)}${group.latest.result.length > 60 ? '…' : ''}`
              : null
            const inlineError = group.latest.status === 'failed' && group.latest.error
              ? ` ✗ ${group.latest.error.slice(0, 100)}`
              : null

            let durationDisplay: React.ReactNode = null
            if (isRunning && group.latest.startedAt !== undefined) {
              const elapsed = now - group.latest.startedAt
              const timeoutMs = isBash ? BASH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
              const eColor = elapsedColor(elapsed, timeoutMs)
              const warning = elapsed / timeoutMs >= 0.75 ? ' ⚠' : ''
              durationDisplay = <Text color={eColor}> {formatDuration(elapsed)}{warning}</Text>
            } else if (group.latest.durationMs) {
              durationDisplay = <Text dimColor> - {formatDuration(group.latest.durationMs)}</Text>
            }

            return (
              <Box key={group.name}>
                <Text>
                  <Text color={color}>{icon}</Text>
                  {' '}
                  <Text bold color={color}>{group.name}</Text>
                  {group.count > 1 && <Text color={color}> ×{group.count}</Text>}
                  {displayArgs ? <Text dimColor> {displayArgs}</Text> : null}
                  {durationDisplay}
                  {inlineResult ? <Text dimColor>{inlineResult}</Text> : null}
                  {inlineError ? <Text color={colors.error}>{inlineError}</Text> : null}
                </Text>
              </Box>
            )
          })}
          <Box>
            <Text dimColor>
              {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
              {uniqueTypes > 1 ? ` (${uniqueTypes} types)` : ''}
              {totalDuration > 0 ? ` · ${formatDuration(totalDuration)} total` : ''}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
})
