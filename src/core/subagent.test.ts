import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '../config/defaults.js'

const apiMock = vi.hoisted(() => ({
  chat: vi.fn(),
  configs: [] as unknown[],
}))

vi.mock('../api/index.js', () => ({
  DeepSeekAPI: class {
    constructor (config: unknown) {
      apiMock.configs.push(config)
    }

    async chat (messages: unknown): Promise<{ content: string }> {
      return apiMock.chat(messages)
    }
  },
}))

const { SubAgent, SubAgentManager, parseAgentConfig } = await import('./subagent.js')

describe('SubAgent', () => {
  beforeEach(() => {
    apiMock.chat.mockReset()
    apiMock.configs.length = 0
  })

  it('parses markdown agent configs', () => {
    expect(parseAgentConfig(`---
name: reviewer
description: Reviews code
tools: read_file, grep_search
disallowedTools: bash
model: deepseek-reasoner
temperature: 0.2
---
Focus on bugs.
`)).toEqual({
      name: 'reviewer',
      description: 'Reviews code',
      systemPrompt: 'Focus on bugs.',
      allowedTools: ['read_file', 'grep_search'],
      disallowedTools: ['bash'],
      model: 'deepseek-reasoner',
      temperature: 0.2,
    })
  })

  it('returns null for invalid agent configs', () => {
    expect(parseAgentConfig('plain text')).toBeNull()
    expect(parseAgentConfig('---\ndescription: missing name\n---\nbody')).toBeNull()
  })

  it('runs a sub-agent with config overrides and emits lifecycle events', async () => {
    apiMock.chat.mockResolvedValue({ content: 'done' })
    const agent = new SubAgent({
      name: 'worker',
      description: 'Does work',
      systemPrompt: 'System override',
      model: 'deepseek-reasoner',
      temperature: 0.1,
    }, DEFAULT_CONFIG)
    const events: string[] = []
    agent.on('start', () => events.push('start'))
    agent.on('complete', () => events.push('complete'))

    const result = await agent.run('task', [{ role: 'user', content: 'context' }])

    expect(apiMock.configs[0]).toMatchObject({
      model: 'deepseek-reasoner',
      temperature: 0.1,
      systemPrompt: 'System override',
    })
    expect(apiMock.chat).toHaveBeenCalledWith([
      { role: 'system', content: 'System override' },
      { role: 'user', content: 'context' },
      { role: 'user', content: 'task' },
    ])
    expect(result).toMatchObject({ name: 'worker', success: true, output: 'done' })
    expect(events).toEqual(['start', 'complete'])
  })

  it('returns failed results without throwing when API fails and no error listener exists', async () => {
    apiMock.chat.mockRejectedValue(new Error('api down'))
    const agent = new SubAgent({ name: 'worker', description: 'Does work' }, DEFAULT_CONFIG)

    await expect(agent.run('task')).resolves.toMatchObject({
      name: 'worker',
      success: false,
      output: '',
      error: 'api down',
    })
  })
})

describe('SubAgentManager', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(process.cwd(), '.tmp-subagent-'))
    apiMock.chat.mockReset()
    apiMock.configs.length = 0
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads agents from markdown files after API config is set', async () => {
    const agentsDir = join(tempDir, 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, 'reviewer.md'), `---
name: reviewer
description: Reviews code
---
Review carefully.
`, 'utf-8')

    const manager = new SubAgentManager()
    await manager.loadFromDir(agentsDir)
    expect(manager.getAgent('reviewer')).toBeUndefined()

    manager.setApiConfig(DEFAULT_CONFIG)
    await manager.loadFromDir(agentsDir)
    expect(manager.getAgent('reviewer')).toBeDefined()
  })

  it('runs named agents and ignores missing names', async () => {
    apiMock.chat.mockResolvedValue({ content: 'ok' })
    const manager = new SubAgentManager()
    manager.registerAgent({ name: 'a', description: 'A' }, DEFAULT_CONFIG)
    manager.registerAgent({ name: 'b', description: 'B' }, DEFAULT_CONFIG)

    const results = await manager.runNamed(['b', 'missing'], 'task')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ name: 'b', success: true, output: 'ok' })
  })
})
