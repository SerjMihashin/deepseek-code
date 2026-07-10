import { describe, it, expect } from 'vitest'
import { AgentLoop, buildSystemPrompt } from './agent-loop.js'
import type { DeepSeekConfig } from '../config/defaults.js'
import type { ChatMessage, StreamChunk } from '../api/index.js'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const TEST_CONFIG: DeepSeekConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  approvalMode: 'turbo',
  theme: 'default-dark',
  language: 'en',
  maxTokens: 128_000,
  temperature: 0.7,
}

function toolUseChunk (toolName: string, toolCallId: string, toolInput?: Record<string, unknown>): StreamChunk {
  return {
    type: 'tool_use',
    content: '',
    toolName,
    toolCallId,
    toolInput,
  } as StreamChunk
}

function textChunk (content: string): StreamChunk {
  return { type: 'text', content }
}

function usageChunk (input: number, output: number): StreamChunk {
  return {
    type: 'usage',
    content: '',
    usage: { input, cacheHitInput: 0, cacheMissInput: input, output, reasoningOutput: 0, total: input + output },
  }
}

function reasoningChunk (content: string): StreamChunk {
  return { type: 'reasoning', content }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentLoop', () => {
  it('should include Windows shell and temp cleanup policy in the system prompt', () => {
    const prompt = buildSystemPrompt('D:\\Projects\\deepseek-code', 'default')

    expect(prompt).toContain('## Windows Shell Policy')
    expect(prompt).toContain('Windows PowerShell 5.1')
    expect(prompt).toContain('Do NOT brute-force command variants')
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('grep_search')
    expect(prompt).toContain('glob')
    expect(prompt).toContain('err.txt')
    expect(prompt).toContain('Before the final report, check the working tree')
  })

  it('should include adaptive runtime and git hygiene rules in the system prompt', () => {
    const prompt = buildSystemPrompt('D:\\Projects\\deepseek-code', 'default')

    expect(prompt).toContain('Runtime/container verification is adaptive')
    expect(prompt).toContain('not Podman-only')
    expect(prompt).toContain('Docker Compose')
    expect(prompt).toContain('Podman/Podman Compose')
    expect(prompt).toContain('After two similar runtime failures')
    expect(prompt).toContain('appropriate .gitignore')
    expect(prompt).toContain('git status has no junk files')
    expect(prompt).toContain('compose references it correctly')
  })

  it('should include the Plan Mode behavioral section only in plan mode', () => {
    const planPrompt = buildSystemPrompt('D:\\Projects\\deepseek-code', 'plan')
    expect(planPrompt).toContain('## Plan Mode (read-only — ACTIVE)')
    expect(planPrompt).toContain('present ONE clear, concrete, step-by-step PLAN')

    const defaultPrompt = buildSystemPrompt('D:\\Projects\\deepseek-code', 'default')
    expect(defaultPrompt).not.toContain('Plan Mode (read-only — ACTIVE)')
  })

  it('should include workspace boundary rules in the system prompt', () => {
    const prompt = buildSystemPrompt('D:\\Projects\\deepseek-code', 'default')

    expect(prompt).toContain('## Workspace Boundary Policy')
    expect(prompt).toContain('Do not silently switch to another project path')
    expect(prompt).toContain('outside the workspace')
    expect(prompt).toContain('Do not bypass the restriction')
    expect(prompt).toContain('gen_helper.py')
  })

  it('should include final report quality gate and browser proof rules', () => {
    const prompt = buildSystemPrompt('D:\\Projects\\deepseek-code', 'default')

    expect(prompt).toContain('Final report must start with a quality verdict')
    expect(prompt).toContain('Passed')
    expect(prompt).toContain('Partial')
    expect(prompt).toContain('Browser proof')
    expect(prompt).toContain('screenshot/rendered-state verdict')
    expect(prompt).toContain('visual acceptance is required')
    expect(prompt).toContain('sidebar-only')
  })

  it('should create an instance with default options', () => {
    const agent = new AgentLoop(TEST_CONFIG)
    expect(agent).toBeInstanceOf(AgentLoop)
    expect(agent.getIterationCount()).toBe(0)
    expect(agent.getMessages()).toHaveLength(0)
    expect(agent.getToolCallHistory()).toHaveLength(0)
  })

  it('should return empty messages initially', () => {
    const agent = new AgentLoop(TEST_CONFIG)
    expect(agent.getMessages()).toEqual([])
  })

  it('should return empty tool call history initially', () => {
    const agent = new AgentLoop(TEST_CONFIG)
    expect(agent.getToolCallHistory()).toEqual([])
  })

  it('should return metrics collector', () => {
    const agent = new AgentLoop(TEST_CONFIG)
    const metrics = agent.getMetrics()
    expect(metrics).toBeTruthy()
    expect(metrics.toolCalls).toBe(0)
    expect(metrics.totalTokens).toBe(0)
  })

  it('should set approval mode and update tools', () => {
    const agent = new AgentLoop(TEST_CONFIG, { approvalMode: 'plan' })
    agent.setApprovalMode('turbo')
    expect(true).toBe(true) // No crash
  })

  it('should handle cancellation via signal', async () => {
    const ac = new AbortController()
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      signal: ac.signal,
      onResponse: () => {},
      onStreamChunk: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ac.abort()
    const result = await agent.run('test prompt')
    expect(result).toContain('cancelled')
  })

  it('should surface unexpected stream errors through onError', async () => {
    const errors: Error[] = []
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onResponse: () => {},
      onStreamChunk: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: (error) => { errors.push(error) },
    })

    ;(agent as any).api.streamChat = async function * () {
      throw new Error('Stream timeout: no data received for 60s')
    }

    await expect(agent.run('test prompt')).rejects.toThrow('Stream timeout')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Stream timeout')
  })

  it('should handle max iterations', async () => {
    const streamChunks: string[] = []
    const agent = new AgentLoop(TEST_CONFIG, {
      maxIterations: 1,
      approvalMode: 'turbo',
      onResponse: () => {},
      onStreamChunk: (chunk: string) => { streamChunks.push(chunk) },
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      yield toolUseChunk('read_file', 'call_1', { file_path: '/test/file.txt' })
    }

    ;(agent as any).api.chat = async () => ({
      content: '',
      toolCalls: [{
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'read_file', arguments: '{"file_path":"/test/file.txt"}' },
      }],
    })

    const result = await agent.run('test')
    expect(result).toContain('итераций')
    expect(streamChunks.join('')).toContain('Execution Summary')
  })

  it('should auto-compact context between iterations when context is high', async () => {
    const compactProgress: number[] = []
    let streamCalls = 0
    const agent = new AgentLoop(TEST_CONFIG, {
      maxIterations: 3,
      approvalMode: 'turbo',
      autoCompact: { enabled: true, thresholdPercent: 1, minMessages: 1, keepRecentMessages: 0 },
      onCompactProgress: event => { compactProgress.push(event.progress) },
      onResponse: () => {},
      onStreamChunk: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      streamCalls++
      if (streamCalls === 1) {
        yield toolUseChunk('read_file', 'call_1', { file_path: '/test/file.txt' })
        yield usageChunk(100000, 5)
        return
      }
      yield textChunk('done')
      yield usageChunk(1000, 5)
    }

    ;(agent as any).api.chat = async () => ({
      content: '- User asked for a test task.\n- One read_file call failed and should be reported honestly.',
      usage: { input: 1000, cacheHitInput: 0, cacheMissInput: 1000, output: 100, reasoningOutput: 0, total: 1100 },
    })

    await agent.run('test')

    expect(compactProgress.length).toBeGreaterThan(0)
    expect(agent.getMessages().some(message =>
      typeof message.content === 'string' && message.content.includes('Context Auto-Compacted')
    )).toBe(true)
  })

  it('should handle streaming text response', async () => {
    const streamChunks: string[] = []
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onStreamChunk: (chunk: string) => { streamChunks.push(chunk) },
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      yield textChunk('Hello')
      yield textChunk(' World')
      yield usageChunk(10, 5)
    }

    const result = await agent.run('say hello')
    expect(result.startsWith('Hello World')).toBe(true)
    expect(streamChunks.join('').startsWith('Hello World')).toBe(true)
    expect(agent.getMetrics().totalTokens).toBe(15)
  })

  it('should handle tool calls and execute them', async () => {
    const toolCalls: Array<{ name: string; status: string }> = []
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onToolCall: (tc) => { toolCalls.push({ name: tc.name, status: tc.status }) },
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    let callCount = 0
    ;(agent as any).api.streamChat = async function * () {
      callCount++
      if (callCount === 1) {
        yield toolUseChunk('read_file', 'call_1', { file_path: '/test/file.txt' })
      } else {
        yield textChunk('Done reading file.')
      }
    }

    ;(agent as any).api.chat = async () => {
      if (callCount === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call_1',
            type: 'function' as const,
            function: { name: 'read_file', arguments: '{"file_path":"/test/file.txt"}' },
          }],
        }
      }
      return { content: 'Done reading file.', toolCalls: undefined }
    }

    const result = await agent.run('read file')
    expect(result).toBeTruthy()
    expect(toolCalls.length).toBeGreaterThan(0)
    expect(toolCalls[0].name).toBe('read_file')

    const history = agent.getToolCallHistory()
    expect(history.length).toBeGreaterThan(0)
    expect(history[0].name).toBe('read_file')
  })

  it('should handle tool execution errors', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    let callCount = 0
    ;(agent as any).api.streamChat = async function * () {
      callCount++
      if (callCount === 1) {
        yield toolUseChunk('nonexistent_tool', 'call_1', {})
      } else {
        yield textChunk('Tool failed.')
      }
    }

    ;(agent as any).api.chat = async () => {
      if (callCount === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call_1',
            type: 'function' as const,
            function: { name: 'nonexistent_tool', arguments: '{}' },
          }],
        }
      }
      return { content: 'Tool failed.', toolCalls: undefined }
    }

    const result = await agent.run('test')
    expect(result).toBeTruthy()
    const history = agent.getToolCallHistory()
    expect(history[0].status).toBe('failed')
    expect(history[0].error).toBeTruthy()
  })

  it('should handle approval rejection', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'default',
      onApprovalRequest: async () => false,
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      yield toolUseChunk('write_file', 'call_1', { file_path: '/test/file.txt', content: 'test' })
    }

    ;(agent as any).api.chat = async () => ({
      content: '',
      toolCalls: [{
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'write_file', arguments: '{"file_path":"/test/file.txt","content":"test"}' },
      }],
    })

    const result = await agent.run('write file')
    expect(result).toBeTruthy()

    const history = agent.getToolCallHistory()
    expect(history[0].status).toBe('rejected')
  })

  it('should handle empty response with fallback', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      // No yield — empty stream
    }

    ;(agent as any).api.chat = async () => ({ content: '', toolCalls: undefined })

    const result = await agent.run('test')
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('should track metrics during execution', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      yield textChunk('Hello')
      yield usageChunk(50, 25)
    }

    await agent.run('test')
    const metrics = agent.getMetrics()
    expect(metrics.totalTokens).toBe(75)
    expect(metrics.inputTokens).toBe(50)
    expect(metrics.outputTokens).toBe(25)
    expect(metrics.elapsedMs).toBeGreaterThan(0)
  })

  it('should provide context usage percentage', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      yield textChunk('Test')
      yield usageChunk(64000, 64000)
    }

    await agent.run('test')
    const metrics = agent.getMetrics()
    // 128k total tokens against the v4 1M context window (see MODEL_CONTEXT_WINDOW)
    expect(metrics.getContextUsagePercent()).toBe(13)
    expect(metrics.getContextUsagePercent(256000)).toBe(50)
    expect(metrics.contextWindow).toBe(1_000_000)
  })

  it('should emit reasoning chunks', async () => {
    const reasoningChunks: string[] = []
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onReasoningChunk: (chunk: string) => { reasoningChunks.push(chunk) },
      onStreamChunk: () => {},
      onResponse: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      yield reasoningChunk('Thinking step 1...')
      yield reasoningChunk('Thinking step 2...')
      yield textChunk('Final answer')
    }

    await agent.run('test')
    expect(reasoningChunks).toHaveLength(2)
    expect(reasoningChunks[0]).toBe('Thinking step 1...')
    expect(reasoningChunks[1]).toBe('Thinking step 2...')
  })

  it('should handle continueWithMessages', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function * () {
      yield textChunk('Continued response')
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'continue' },
    ]

    const result = await agent.continueWithMessages(messages)
    expect(result).toBe('Continued response')
  })
})

describe('AgentLoop subagents (run_agent)', () => {
  const noopCallbacks = {
    onStreamChunk: () => {},
    onResponse: () => {},
    onReasoningChunk: () => {},
    onToolCall: () => {},
    onToolResult: () => {},
    onError: () => {},
  }

  it('exposes run_agent at depth 0 and hides it for subagents', () => {
    const main = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', ...noopCallbacks })
    const mainTools = (main as any).buildActiveTools() as Array<{ tool: { name: string } }>
    expect(mainTools.map(t => t.tool.name)).toContain('run_agent')

    const sub = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', subagentDepth: 1, ...noopCallbacks })
    const subTools = (sub as any).buildActiveTools() as Array<{ tool: { name: string } }>
    expect(subTools.map(t => t.tool.name)).not.toContain('run_agent')
  })

  it('filters tools via allowedTools', () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      subagentDepth: 1,
      allowedTools: ['read_file', 'glob', 'grep_search'],
      ...noopCallbacks,
    })
    const names = ((agent as any).buildActiveTools() as Array<{ tool: { name: string } }>).map(t => t.tool.name)
    expect(names.sort()).toEqual(['glob', 'grep_search', 'read_file'])
  })

  it('rejects run_agent without a task and beyond depth 1', async () => {
    const main = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', ...noopCallbacks })
    await expect((main as any).executeSubagent({})).resolves.toMatchObject({ success: false })

    const sub = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', subagentDepth: 1, ...noopCallbacks })
    const result = await (sub as any).executeSubagent({ task: 'do something' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('cannot spawn')
  })

  it('runs a nested loop, returns its report with a ledger and absorbs its cost', async () => {
    const events: Array<{ phase: string; agent: string }> = []
    const main = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'turbo',
      ...noopCallbacks,
      onSubagentEvent: e => events.push({ phase: e.phase, agent: e.agent }),
    })
    let capturedOptions: Record<string, unknown> | null = null

    ;(main as any).createSubagentLoop = (cfg: DeepSeekConfig, opts: Record<string, unknown>) => {
      capturedOptions = opts
      const sub = new AgentLoop(cfg, opts)
      ;(sub as any).api.streamChat = async function * () {
        yield textChunk('Report: found 3 usages in src/foo.ts')
        yield usageChunk(1000, 200)
      }
      return sub
    }

    const result = await (main as any).executeSubagent({ task: 'find usages of foo', mode: 'read-only' })

    expect(result.success).toBe(true)
    expect(result.output).toContain('Report: found 3 usages')
    expect(result.output).toContain('[subagent subagent:')
    expect(capturedOptions).toMatchObject({ subagentDepth: 1, approvalMode: 'turbo' })
    expect((capturedOptions as any).allowedTools).toEqual(['read_file', 'glob', 'grep_search'])
    // Cost accounting: the child's 1200 tokens landed in the parent collector.
    expect(main.getMetrics().totalTokens).toBe(1200)
    expect(events.map(e => e.phase)).toEqual(['start', 'done'])
  })

  it('gives edit-mode subagents write/shell tools', async () => {
    const main = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', ...noopCallbacks })
    let capturedOptions: Record<string, unknown> | null = null
    ;(main as any).createSubagentLoop = (cfg: DeepSeekConfig, opts: Record<string, unknown>) => {
      capturedOptions = opts
      const sub = new AgentLoop(cfg, opts)
      ;(sub as any).api.streamChat = async function * () {
        yield textChunk('done')
      }
      return sub
    }

    await (main as any).executeSubagent({ task: 'fix the bug', mode: 'edit' })
    expect((capturedOptions as any).allowedTools).toEqual(
      ['read_file', 'glob', 'grep_search', 'write_file', 'edit', 'run_shell_command'])
  })

  it('runs a batch of run_agent calls in parallel', async () => {
    const agent = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', ...noopCallbacks })

    let apiCallCount = 0
    ;(agent as any).api.streamChat = async function * () {
      apiCallCount++
      if (apiCallCount === 1) {
        yield toolUseChunk('run_agent', 'call_a', { task: 'explore src/ui', mode: 'read-only' })
        yield toolUseChunk('run_agent', 'call_b', { task: 'explore src/tools', mode: 'read-only' })
        return
      }
      yield textChunk('Both areas explored.')
    }

    const windows: Array<{ start: number; end: number }> = []
    ;(agent as any).createSubagentLoop = (cfg: DeepSeekConfig, opts: Record<string, unknown>) => {
      const sub = new AgentLoop(cfg, opts)
      ;(sub as any).api.streamChat = async function * () {
        const window = { start: Date.now(), end: 0 }
        windows.push(window)
        await new Promise(resolve => setTimeout(resolve, 120))
        window.end = Date.now()
        yield textChunk('area report')
      }
      return sub
    }

    const result = await agent.run('explore both')

    expect(result).toBe('Both areas explored.')
    const calls = agent.getToolCallHistory()
    expect(calls).toHaveLength(2)
    expect(calls.every(c => c.status === 'completed')).toBe(true)
    expect(calls.every(c => (c.result ?? '').includes('area report'))).toBe(true)
    // Parallel proof: the second subagent started before the first finished.
    expect(windows).toHaveLength(2)
    const [first, second] = windows
    expect(second.start).toBeLessThan(first.end)
  })

  it('keeps the mode toolset when a named agent lists unknown tool names', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const tempDir = mkdtempSync(join(process.cwd(), '.tmp-agents-'))
    try {
      const agentsDir = join(tempDir, '.deepseek-code', 'agents')
      mkdirSync(agentsDir, { recursive: true })
      writeFileSync(join(agentsDir, 'legacy.md'), '---\nname: legacy\ndescription: Claude-style tool names\ntools: Read, Glob, Grep\n---\nReview.\n', 'utf-8')

      const main = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', cwd: tempDir, ...noopCallbacks })
      let capturedOptions: Record<string, unknown> | null = null
      ;(main as any).createSubagentLoop = (cfg: DeepSeekConfig, opts: Record<string, unknown>) => {
        capturedOptions = opts
        const sub = new AgentLoop(cfg, opts)
        ;(sub as any).api.streamChat = async function * () {
          yield textChunk('ok')
        }
        return sub
      }

      await (main as any).executeSubagent({ task: 'review something', agent: 'legacy' })
      // Unknown names must NOT collapse the allowlist to [] (= no filter at all).
      expect((capturedOptions as any).allowedTools).toEqual(['read_file', 'glob', 'grep_search'])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('errors clearly when a named agent does not exist', async () => {
    const main = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', ...noopCallbacks })
    const result = await (main as any).executeSubagent({ task: 'x', agent: 'ghost' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('"ghost" not found')
  })

  it('appends the subagent contract to the child system prompt', async () => {
    const main = new AgentLoop(TEST_CONFIG, { approvalMode: 'turbo', ...noopCallbacks })
    let capturedOptions: Record<string, unknown> | null = null
    ;(main as any).createSubagentLoop = (cfg: DeepSeekConfig, opts: Record<string, unknown>) => {
      capturedOptions = opts
      const sub = new AgentLoop(cfg, opts)
      ;(sub as any).api.streamChat = async function * () {
        yield textChunk('ok')
      }
      return sub
    }

    await (main as any).executeSubagent({ task: 'inspect', max_tool_calls: 10 })
    const appendix = (capturedOptions as any).systemPromptAppendix as string
    expect(appendix).toContain('## Subagent Contract')
    expect(appendix).toContain('at most 10 tool calls')
    expect(appendix).toContain('READ-ONLY')
  })
})
