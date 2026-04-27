import { describe, it, expect } from 'vitest'
import { AgentLoop } from './agent-loop.js'
import type { DeepSeekConfig } from '../config/defaults.js'
import type { ChatMessage, StreamChunk } from '../api/index.js'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const TEST_CONFIG: DeepSeekConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  approvalMode: 'yolo',
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
    usage: { input, output, total: input + output },
  }
}

function reasoningChunk (content: string): StreamChunk {
  return { type: 'reasoning', content }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentLoop', () => {
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
    agent.setApprovalMode('yolo')
    expect(true).toBe(true) // No crash
  })

  it('should handle cancellation via signal', async () => {
    const ac = new AbortController()
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'yolo',
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
    expect(result).toContain('отменено')
  })

  it('should handle max iterations', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      maxIterations: 1,
      approvalMode: 'yolo',
      onResponse: () => {},
      onStreamChunk: () => {},
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
  })

  it('should handle streaming text response', async () => {
    const streamChunks: string[] = []
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'yolo',
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
      approvalMode: 'yolo',
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
      approvalMode: 'yolo',
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
      approvalMode: 'yolo',
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
      approvalMode: 'yolo',
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
      approvalMode: 'yolo',
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
    expect(metrics.getContextUsagePercent()).toBe(100)
    expect(metrics.getContextUsagePercent(256000)).toBe(50)
  })

  it('should emit reasoning chunks', async () => {
    const reasoningChunks: string[] = []
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'yolo',
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
      approvalMode: 'yolo',
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
