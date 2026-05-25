import { describe, expect, it } from 'vitest'
import { COMMAND_NAMES, executeSlashCommand, type SlashCommandContext } from './index.js'
import { DEFAULT_CONFIG } from '../config/defaults.js'
import type { ChatMessage } from '../api/index.js'
import type { TaskBudget } from '../tools/types.js'

function createContext (): { ctx: SlashCommandContext; messages: ChatMessage[] } {
  const messages: ChatMessage[] = []
  let budget: TaskBudget | undefined
  const ctx: SlashCommandContext = {
    config: { ...DEFAULT_CONFIG },
    approvalMode: 'default',
    messages,
    setMessages: updater => {
      const next = typeof updater === 'function' ? updater(messages) : updater
      messages.splice(0, messages.length, ...next)
    },
    setStatusText: () => {},
    setSetupStep: () => {},
    getBudget: () => budget,
    setBudget: next => { budget = next },
  }

  return { ctx, messages }
}

describe('slash commands', () => {
  it('should expose unique command names', () => {
    expect(new Set(COMMAND_NAMES).size).toBe(COMMAND_NAMES.length)
  })

  it('should run /stats before an agent loop exists', async () => {
    const { ctx, messages } = createContext()

    await expect(executeSlashCommand('/stats', ctx)).resolves.toBe(true)
    expect(messages.at(-1)?.role).toBe('assistant')
    expect(messages.at(-1)?.content).toContain('Session Statistics')
  })

  it('should return false for unknown commands', async () => {
    const { ctx } = createContext()

    await expect(executeSlashCommand('/does-not-exist', ctx)).resolves.toBe(false)
  })

  it('should document keyboard scroll controls without mouse capture', async () => {
    const { ctx, messages } = createContext()

    await expect(executeSlashCommand('/help', ctx)).resolves.toBe(true)
    const content = String(messages.at(-1)?.content ?? '')
    expect(content).toContain('PageUp / PageDown')
    expect(content).toContain('End')
    expect(content).toContain('Mouse wheel')
    expect(content).toContain('Not captured')
  })

  it('should switch explicit budget modes without enabling a default budget', async () => {
    const { ctx, messages } = createContext()

    await expect(executeSlashCommand('/budget status', ctx)).resolves.toBe(true)
    expect(messages.at(-1)?.content).toBe('Budget: off')

    await expect(executeSlashCommand('/budget normal', ctx)).resolves.toBe(true)
    expect(messages.at(-1)?.content).toContain('Budget: normal enabled')
    expect(messages.at(-1)?.content).toContain('maxIterations')

    await expect(executeSlashCommand('/budget large', ctx)).resolves.toBe(true)
    expect(messages.at(-1)?.content).toContain('Budget: large enabled')
    expect(messages.at(-1)?.content).toContain('maxToolCalls: 120')

    await expect(executeSlashCommand('/budget off', ctx)).resolves.toBe(true)
    expect(messages.at(-1)?.content).toBe('Budget: off')
  })

  it('should smoke-test safe command handlers', async () => {
    const safeCommands = [
      '/help',
      '/remember',
      '/memory',
      '/mcp',
      '/skills',
      '/agents',
      '/sandbox',
      '/git unknown',
      '/loop',
      '/stats',
      '/lang',
      '/language',
      '/extensions',
      '/followup',
      '/logs',
      '/plan',
      '/tools',
      '/capabilities',
      '/last-browser-test',
      '/chrome',
    ]

    for (const command of safeCommands) {
      const { ctx } = createContext()
      await expect(executeSlashCommand(command, ctx), command).resolves.toBe(true)
    }
  })
})
