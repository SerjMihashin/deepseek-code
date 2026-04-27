import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
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

/**
 * Helper to create a minimal valid StreamChunk for tool_use type.
 * StreamChunk requires `content` for all types, but tool_use uses toolName/toolCallId.
 */
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
    assert.ok(agent instanceof AgentLoop)
    assert.equal(agent.getIterationCount(), 0)
    assert.equal(agent.getMessages().length, 0)
    assert.equal(agent.getToolCallHistory().length, 0)
  })

  it('should return empty messages initially', () => {
    const agent = new AgentLoop(TEST_CONFIG)
    assert.deepEqual(agent.getMessages(), [])
  })

  it('should return empty tool call history initially', () => {
    const agent = new AgentLoop(TEST_CONFIG)
    assert.deepEqual(agent.getToolCallHistory(), [])
  })

  it('should return metrics collector', () => {
    const agent = new AgentLoop(TEST_CONFIG)
    const metrics = agent.getMetrics()
    assert.ok(metrics)
    assert.equal(metrics.toolCalls, 0)
    assert.equal(metrics.totalTokens, 0)
  })

  it('should set approval mode and update tools', () => {
    const agent = new AgentLoop(TEST_CONFIG, { approvalMode: 'plan' })
    agent.setApprovalMode('yolo')
    assert.ok(true) // No crash
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
    assert.ok(result.includes('cancelled'))
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

    // Mock streamChat to return a tool call (loop will continue)
    let callCount = 0
    ;(agent as any).api.streamChat = async function* () {
      callCount++
      yield toolUseChunk('read_file', 'call_1', { file_path: '/test/file.txt' })
    }

    // Mock chat (non-streaming fallback) to also return tool call
    ;(agent as any).api.chat = async () => ({
      content: '',
      toolCalls: [{
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'read_file', arguments: '{"file_path":"/test/file.txt"}' },
      }],
    })

    const result = await agent.run('test')
    assert.ok(result.includes('maximum iterations'))
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

    // Mock streamChat to yield text chunks
    ;(agent as any).api.streamChat = async function* () {
      yield textChunk('Hello')
      yield textChunk(' World')
      yield usageChunk(10, 5)
    }

    const result = await agent.run('say hello')
    assert.ok(result.startsWith('Hello World'))
    // streamChunks includes the summary at the end — just check it starts with our text
    assert.ok(streamChunks.join('').startsWith('Hello World'))
    assert.equal(agent.getMetrics().totalTokens, 15)
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
    ;(agent as any).api.streamChat = async function* () {
      callCount++
      if (callCount === 1) {
        yield toolUseChunk('read_file', 'call_1', { file_path: '/test/file.txt' })
      } else {
        yield textChunk('Done reading file.')
      }
    }

    // Non-streaming fallback for first call
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
    assert.ok(result)
    assert.ok(toolCalls.length > 0)
    assert.equal(toolCalls[0].name, 'read_file')

    // Tool call should have been executed (status completed)
    const history = agent.getToolCallHistory()
    assert.ok(history.length > 0)
    assert.equal(history[0].name, 'read_file')
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

    // Mock streamChat to return a tool call for an unknown tool (will fail)
    let callCount = 0
    ;(agent as any).api.streamChat = async function* () {
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
    assert.ok(result)
    const history = agent.getToolCallHistory()
    // Unknown tool should fail
    assert.equal(history[0].status, 'failed')
    assert.ok(history[0].error)
  })

  it('should handle approval rejection', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'default',
      onApprovalRequest: async () => false, // Always reject
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function* () {
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
    assert.ok(result)

    // Tool should be rejected
    const history = agent.getToolCallHistory()
    assert.equal(history[0].status, 'rejected')
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

    // Stream returns nothing
    ;(agent as any).api.streamChat = async function* () {
      // No yield — empty stream
    }

    // Non-streaming also returns empty
    ;(agent as any).api.chat = async () => ({ content: '', toolCalls: undefined })

    const result = await agent.run('test')
    assert.ok(result)
    assert.ok(result.length > 0) // Should have fallback
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

    ;(agent as any).api.streamChat = async function* () {
      yield textChunk('Hello')
      yield usageChunk(50, 25)
    }

    await agent.run('test')
    const metrics = agent.getMetrics()
    assert.equal(metrics.totalTokens, 75)
    assert.equal(metrics.inputTokens, 50)
    assert.equal(metrics.outputTokens, 25)
    assert.ok(metrics.elapsedMs > 0)
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

    ;(agent as any).api.streamChat = async function* () {
      yield textChunk('Test')
      yield usageChunk(64000, 64000)
    }

    await agent.run('test')
    const metrics = agent.getMetrics()
    assert.equal(metrics.getContextUsagePercent(), 100)
    assert.equal(metrics.getContextUsagePercent(256000), 50)
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

    ;(agent as any).api.streamChat = async function* () {
      yield reasoningChunk('Thinking step 1...')
      yield reasoningChunk('Thinking step 2...')
      yield textChunk('Final answer')
    }

    await agent.run('test')
    assert.equal(reasoningChunks.length, 2)
    assert.equal(reasoningChunks[0], 'Thinking step 1...')
    assert.equal(reasoningChunks[1], 'Thinking step 2...')
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

    ;(agent as any).api.streamChat = async function* () {
      yield textChunk('Continued response')
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'continue' },
    ]

    const result = await agent.continueWithMessages(messages)
    assert.equal(result, 'Continued response')
  })
})
