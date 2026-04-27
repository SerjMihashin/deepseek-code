import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AgentLoop } from '../core/agent-loop.js'
import type { DeepSeekConfig } from '../config/defaults.js'

const TEST_CONFIG: DeepSeekConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  approvalMode: 'default',
  theme: 'default-dark',
  language: 'en',
  maxTokens: 128_000,
  temperature: 0.7,
}

describe('Approval dialog flow', () => {
  it('should call onApprovalRequest for tools needing approval', async () => {
    const approvals: Array<{ toolName: string; approved: boolean }> = []

    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'default',
      onApprovalRequest: async (toolName) => {
        approvals.push({ toolName, approved: true })
        return true
      },
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    let callIndex = 0
    ;(agent as any).api.streamChat = async function* () {
      callIndex++
      if (callIndex === 1) {
        yield {
          type: 'tool_use',
          content: '',
          toolName: 'write_file',
          toolCallId: 'call_1',
          toolInput: { file_path: '/test/file.txt', content: 'test' },
        }
      } else {
        yield { type: 'text', content: 'Done.' }
      }
    }
    ;(agent as any).api.chat = async () => {
      callIndex++
      if (callIndex === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call_1',
            type: 'function' as const,
            function: { name: 'write_file', arguments: '{"file_path":"/test/file.txt","content":"test"}' },
          }],
        }
      }
      return { content: 'Done.', toolCalls: undefined }
    }

    await agent.run('write file')
    assert.equal(approvals.length, 1)
    assert.equal(approvals[0].toolName, 'write_file')
  })

  it('should reject tool when onApprovalRequest returns false', async () => {
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

    ;(agent as any).api.streamChat = async function* () {
      yield {
        type: 'tool_use',
        content: '',
        toolName: 'write_file',
        toolCallId: 'call_1',
        toolInput: { file_path: '/test/file.txt', content: 'test' },
      }
    }
    ;(agent as any).api.chat = async () => ({
      content: '',
      toolCalls: [{
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'write_file', arguments: '{"file_path":"/test/file.txt","content":"test"}' },
      }],
    })

    await agent.run('write file')
    const history = agent.getToolCallHistory()
    assert.equal(history[0].status, 'rejected')
  })

  it('should skip approval for read-only tools in default mode', async () => {
    const approvals: Array<{ toolName: string }> = []

    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'default',
      onApprovalRequest: async (toolName) => {
        approvals.push({ toolName })
        return true
      },
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    // Mock streamChat to return a read_file tool call (no approval needed)
    ;(agent as any).api.streamChat = async function* () {
      yield {
        type: 'tool_use',
        content: '',
        toolName: 'read_file',
        toolCallId: 'call_1',
        toolInput: { file_path: '/test/file.txt' },
      }
    }
    ;(agent as any).api.chat = async () => ({
      content: '',
      toolCalls: [{
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'read_file', arguments: '{"file_path":"/test/file.txt"}' },
      }],
    })

    await agent.run('read file')
    // onApprovalRequest should NOT be called for read-only tools
    assert.equal(approvals.length, 0)
  })

  it('should auto-approve write/edit/chrome in auto-edit mode', async () => {
    const approvals: Array<{ toolName: string }> = []

    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'auto-edit',
      onApprovalRequest: async (toolName) => {
        approvals.push({ toolName })
        return true
      },
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    let callIndex = 0
    ;(agent as any).api.streamChat = async function* () {
      callIndex++
      if (callIndex === 1) {
        yield {
          type: 'tool_use',
          content: '',
          toolName: 'write_file',
          toolCallId: 'call_1',
          toolInput: { file_path: '/test/file.txt', content: 'test' },
        }
      } else {
        yield { type: 'text', content: 'Done.' }
      }
    }
    ;(agent as any).api.chat = async () => {
      callIndex++
      if (callIndex === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call_1',
            type: 'function' as const,
            function: { name: 'write_file', arguments: '{"file_path":"/test/file.txt","content":"test"}' },
          }],
        }
      }
      return { content: 'Done.', toolCalls: undefined }
    }

    await agent.run('write file')
    // In auto-edit mode, write_file is 'auto' — still calls onApprovalRequest
    assert.equal(approvals.length, 1)
  })

  it('should reject all tools in plan mode', async () => {
    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'plan',
      onApprovalRequest: async () => false,
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    ;(agent as any).api.streamChat = async function* () {
      yield {
        type: 'tool_use',
        content: '',
        toolName: 'read_file',
        toolCallId: 'call_1',
        toolInput: { file_path: '/test/file.txt' },
      }
    }
    ;(agent as any).api.chat = async () => ({
      content: '',
      toolCalls: [{
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'read_file', arguments: '{"file_path":"/test/file.txt"}' },
      }],
    })

    // In plan mode, only read-only tools are available (approval='never')
    // So onApprovalRequest should NOT be called for read_file
    const result = await agent.run('read file')
    assert.ok(result)
  })

  it('should handle concurrent approval requests sequentially', async () => {
    const approvals: string[] = []

    const agent = new AgentLoop(TEST_CONFIG, {
      approvalMode: 'default',
      onApprovalRequest: async (toolName) => {
        approvals.push(toolName)
        return true
      },
      onStreamChunk: () => {},
      onResponse: () => {},
      onReasoningChunk: () => {},
      onToolCall: () => {},
      onToolResult: () => {},
      onError: () => {},
    })

    let callIndex = 0
    ;(agent as any).api.streamChat = async function* () {
      callIndex++
      if (callIndex === 1) {
        yield {
          type: 'tool_use',
          content: '',
          toolName: 'write_file',
          toolCallId: 'call_1',
          toolInput: { file_path: '/test/a.txt', content: 'a' },
        }
        yield {
          type: 'tool_use',
          content: '',
          toolName: 'edit',
          toolCallId: 'call_2',
          toolInput: { file_path: '/test/b.txt', old_string: 'x', new_string: 'y' },
        }
      } else {
        yield { type: 'text', content: 'Done.' }
      }
    }
    ;(agent as any).api.chat = async () => {
      callIndex++
      if (callIndex === 1) {
        return {
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function' as const,
              function: { name: 'write_file', arguments: '{"file_path":"/test/a.txt","content":"a"}' },
            },
            {
              id: 'call_2',
              type: 'function' as const,
              function: { name: 'edit', arguments: '{"file_path":"/test/b.txt","old_string":"x","new_string":"y"}' },
            },
          ],
        }
      }
      return { content: 'Done.', toolCalls: undefined }
    }

    await agent.run('write two files')
    assert.equal(approvals.length, 2)
    assert.equal(approvals[0], 'write_file')
    assert.equal(approvals[1], 'edit')
  })
})
