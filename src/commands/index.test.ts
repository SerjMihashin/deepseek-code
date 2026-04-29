import { describe, expect, it } from 'vitest'
import { COMMAND_NAMES, executeSlashCommand, type SlashCommandContext } from './index.js'
import { DEFAULT_CONFIG } from '../config/defaults.js'
import type { ChatMessage } from '../api/index.js'

function createContext (): { ctx: SlashCommandContext; messages: ChatMessage[] } {
  const messages: ChatMessage[] = []
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
