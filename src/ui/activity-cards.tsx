import React from 'react'
import { Box, Text } from 'ink'
import type { ToolCallEvent } from '../core/agent-loop.js'
import { themeManager } from '../core/themes.js'
import { platform } from 'node:os'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShellCardData {
  type: 'shell';
  command: string;
  cwd?: string;
  status: 'running' | 'success' | 'failed';
  durationMs?: number;
  output?: string;
  error?: string;
}

export interface FileCardData {
  type: 'file';
  toolName: string;
  path: string;
  status: 'running' | 'success' | 'failed';
  result?: string;
  error?: string;
}

export interface ErrorCardData {
  type: 'error';
  toolName: string;
  path?: string;
  reason: string;
  suggestion?: string;
}

export interface UnsupportedCardData {
  type: 'unsupported';
  feature: string;
  os: string;
  reason: string;
  action: string;
}

export interface TasksCardData {
  type: 'tasks';
  current?: string;
  completed: string[];
  next: string[];
  errors?: string[];
}

export type ActivityCardData =
  | ShellCardData
  | FileCardData
  | ErrorCardData
  | UnsupportedCardData
  | TasksCardData

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration (ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Shell Card ──────────────────────────────────────────────────────────────

function ShellCard ({ data }: { data: ShellCardData }) {
  const colors = themeManager.getColors()
  const statusColor = data.status === 'success'
    ? colors.success
    : data.status === 'failed'
      ? colors.error
      : colors.info
  const statusIcon = data.status === 'success'
    ? '✅'
    : data.status === 'failed'
      ? '❌'
      : '🔄'

  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box borderStyle='round' borderColor={colors.border} paddingX={1} paddingY={0}>
        <Box flexDirection='column'>
          <Box>
            <Text bold color={colors.info}>Shell</Text>
          </Box>
          <Box>
            <Text dimColor>{data.command}</Text>
          </Box>
          {data.cwd && (
            <Box>
              <Text dimColor>папка: {data.cwd}</Text>
            </Box>
          )}
          <Box>
            <Text color={statusColor}>
              {statusIcon} Статус: {data.status === 'success' ? 'успешно' : data.status === 'failed' ? 'ошибка' : 'выполняется'}
            </Text>
            {data.durationMs !== undefined && (
              <Text dimColor> · {formatDuration(data.durationMs)}</Text>
            )}
          </Box>
          {data.output && data.output.length > 0 && (
            <Box>
              <Text color={colors.textMuted}>{data.output.slice(0, 200)}{data.output.length > 200 ? '…' : ''}</Text>
            </Box>
          )}
          {data.error && (
            <Box>
              <Text color={colors.error}>Ошибка: {data.error.slice(0, 200)}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ─── File Card ───────────────────────────────────────────────────────────────

function FileCard ({ data }: { data: FileCardData }) {
  const colors = themeManager.getColors()
  const statusColor = data.status === 'success'
    ? colors.success
    : data.status === 'failed'
      ? colors.error
      : colors.info
  const statusIcon = data.status === 'success'
    ? '✅'
    : data.status === 'failed'
      ? '❌'
      : '🔄'

  const toolLabel = data.toolName === 'read_file'
    ? 'ReadFile'
    : data.toolName === 'write_file'
      ? 'WriteFile'
      : data.toolName === 'edit'
        ? 'Edit'
        : data.toolName === 'glob'
          ? 'Glob'
          : data.toolName === 'grep_search'
            ? 'Grep'
            : data.toolName

  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box borderStyle='round' borderColor={colors.border} paddingX={1} paddingY={0}>
        <Box flexDirection='column'>
          <Box>
            <Text bold color={colors.info}>{toolLabel}</Text>
          </Box>
          <Box>
            <Text dimColor>{data.path}</Text>
          </Box>
          <Box>
            <Text color={statusColor}>
              {statusIcon} Статус: {data.status === 'success' ? 'успешно' : data.status === 'failed' ? 'ошибка' : 'выполняется'}
            </Text>
          </Box>
          {data.result && data.result.length > 0 && (
            <Box>
              <Text color={colors.textMuted}>{data.result.slice(0, 150)}{data.result.length > 150 ? '…' : ''}</Text>
            </Box>
          )}
          {data.error && (
            <Box>
              <Text color={colors.error}>
                Причина: {data.error}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ─── Error Card ──────────────────────────────────────────────────────────────

function ErrorCard ({ data }: { data: ErrorCardData }) {
  const colors = themeManager.getColors()

  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box borderStyle='round' borderColor={colors.error} paddingX={1} paddingY={0}>
        <Box flexDirection='column'>
          <Box>
            <Text bold color={colors.error}>❌ Ошибка</Text>
          </Box>
          <Box>
            <Text color={colors.error}>Инструмент: {data.toolName}</Text>
          </Box>
          {data.path && (
            <Box>
              <Text color={colors.error}>Файл: {data.path}</Text>
            </Box>
          )}
          <Box>
            <Text color={colors.error}>Причина: {data.reason}</Text>
          </Box>
          {data.suggestion && (
            <Box>
              <Text color={colors.warning}>Что сделать: {data.suggestion}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ─── Unsupported Card ────────────────────────────────────────────────────────

function UnsupportedCard ({ data }: { data: UnsupportedCardData }) {
  const colors = themeManager.getColors()

  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box borderStyle='round' borderColor={colors.warning} paddingX={1} paddingY={0}>
        <Box flexDirection='column'>
          <Box>
            <Text bold color={colors.warning}>⚠️ {data.feature} недоступен</Text>
          </Box>
          <Box>
            <Text color={colors.textMuted}>ОС: {data.os}</Text>
          </Box>
          <Box>
            <Text color={colors.textMuted}>Причина: {data.reason}</Text>
          </Box>
          <Box>
            <Text color={colors.info}>Что сделать: {data.action}</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ─── Tasks Card ──────────────────────────────────────────────────────────────

function TasksCard ({ data }: { data: TasksCardData }) {
  const colors = themeManager.getColors()

  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box borderStyle='round' borderColor={colors.border} paddingX={1} paddingY={0}>
        <Box flexDirection='column'>
          <Box>
            <Text bold color={colors.info}>📋 План</Text>
          </Box>
          {data.current && (
            <Box>
              <Text color={colors.warning}>🔄 Текущее: {data.current}</Text>
            </Box>
          )}
          {data.completed.length > 0 && (
            <Box flexDirection='column'>
              <Text color={colors.success}>✅ Завершено:</Text>
              {data.completed.map((item, i) => (
                <Box key={i} marginLeft={1}>
                  <Text color={colors.success}>· {item}</Text>
                </Box>
              ))}
            </Box>
          )}
          {data.next.length > 0 && (
            <Box flexDirection='column'>
              <Text color={colors.textMuted}>⬜ Далее:</Text>
              {data.next.map((item, i) => (
                <Box key={i} marginLeft={1}>
                  <Text color={colors.textMuted}>· {item}</Text>
                </Box>
              ))}
            </Box>
          )}
          {data.errors && data.errors.length > 0 && (
            <Box flexDirection='column'>
              <Text color={colors.error}>❌ Ошибки:</Text>
              {data.errors.map((item, i) => (
                <Box key={i} marginLeft={1}>
                  <Text color={colors.error}>· {item}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function ActivityCard ({ data }: { data: ActivityCardData }) {
  switch (data.type) {
    case 'shell':
      return <ShellCard data={data} />
    case 'file':
      return <FileCard data={data} />
    case 'error':
      return <ErrorCard data={data} />
    case 'unsupported':
      return <UnsupportedCard data={data} />
    case 'tasks':
      return <TasksCard data={data} />
    default:
      return null
  }
}

// ─── ToolCallEvent → ActivityCardData converter ──────────────────────────────

/**
 * Convert a ToolCallEvent to one or more ActivityCardData items.
 * Each tool call is classified into shell/file/error based on its name and status.
 */
export function toolCallToCards (tc: ToolCallEvent): ActivityCardData[] {
  const cards: ActivityCardData[] = []

  // Error/rejected calls produce ErrorCard
  if (tc.status === 'failed' || tc.status === 'rejected') {
    const isFileTool = ['read_file', 'write_file', 'edit', 'glob', 'grep_search'].includes(tc.name)
    const path = (tc.arguments.file_path ?? tc.arguments.pattern ?? tc.arguments.path ?? '') as string

    // Suggest similar file for file-not-found errors
    let suggestion: string | undefined
    if (tc.error && /not found|ENOENT|does not exist/i.test(tc.error) && isFileTool && path) {
      const ext = (path as string).split('.').pop()
      if (ext === 'js' || ext === 'ts') {
        const altExt = ext === 'js' ? 'ts' : 'js'
        const altPath = (path as string).replace(new RegExp(`\\.${ext}$`), `.${altExt}`)
        suggestion = `найден похожий файл ${altPath}`
      }
    }

    cards.push({
      type: 'error',
      toolName: tc.name,
      path: path || undefined,
      reason: tc.error ?? 'Unknown error',
      suggestion,
    })
    return cards
  }

  // Shell commands produce ShellCard
  if (tc.name === 'run_shell_command') {
    const command = (tc.arguments.command as string) ?? ''
    const cwd = tc.arguments.cwd as string | undefined
    cards.push({
      type: 'shell',
      command,
      cwd,
      status: tc.status === 'running'
        ? 'running'
        : tc.status === 'completed'
          ? 'success'
          : 'failed',
      durationMs: tc.durationMs,
      output: tc.result,
      error: tc.error,
    })
    return cards
  }

  // File tools produce FileCard
  const fileTools = ['read_file', 'write_file', 'edit', 'glob', 'grep_search']
  if (fileTools.includes(tc.name)) {
    const path = (tc.arguments.file_path ?? tc.arguments.pattern ?? '') as string
    cards.push({
      type: 'file',
      toolName: tc.name,
      path,
      status: tc.status === 'running'
        ? 'running'
        : tc.status === 'completed'
          ? 'success'
          : 'failed',
      result: tc.result,
      error: tc.error,
    })
    return cards
  }

  // Other tools — generic file card
  cards.push({
    type: 'file',
    toolName: tc.name,
    path: '',
    status: tc.status === 'running'
      ? 'running'
      : tc.status === 'completed'
        ? 'success'
        : 'failed',
    result: tc.result,
    error: tc.error,
  })

  return cards
}

// ─── Sandbox capability check ────────────────────────────────────────────────

export function getSandboxUnsupportedCard (): UnsupportedCardData {
  const os = platform()
  return {
    type: 'unsupported',
    feature: 'Sandbox',
    os,
    reason: os === 'win32'
      ? 'текущая реализация песочницы требует Docker/WSL/Linux'
      : 'среда изоляции недоступна',
    action: os === 'win32'
      ? 'используйте WSL/Podman или отключите sandbox-режим'
      : 'установите Docker или настройте песочницу',
  }
}
