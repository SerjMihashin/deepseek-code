import { describe, expect, it, vi } from 'vitest'
import { jsonSchemaToParameters, mcpResultToText, getMcpToolDefinitions } from './mcp-tools.js'
import type { MCPManager, MCPTool } from './mcp.js'

describe('jsonSchemaToParameters', () => {
  it('maps top-level properties, required flags, integer→number, and enums', () => {
    const params = jsonSchemaToParameters({
      properties: {
        project_id: { type: 'string', description: 'slug' },
        max_tokens: { type: 'integer', description: 'budget' },
        type: { type: 'string', enum: ['user', 'project'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_id'],
    })

    const byName = Object.fromEntries(params.map(p => [p.name, p]))
    expect(byName.project_id).toMatchObject({ type: 'string', required: true })
    expect(byName.max_tokens.type).toBe('number')
    expect(byName.type.enum).toEqual(['user', 'project'])
    expect(byName.tags).toMatchObject({ type: 'array', items: { type: 'string' } })
    expect(byName.max_tokens.required).toBe(false)
  })

  it('tolerates a missing/empty schema', () => {
    expect(jsonSchemaToParameters(undefined)).toEqual([])
    expect(jsonSchemaToParameters({})).toEqual([])
  })
})

describe('mcpResultToText', () => {
  it('flattens MCP text content blocks', () => {
    expect(mcpResultToText({ content: [{ type: 'text', text: 'hello' }] })).toBe('hello')
  })

  it('falls back to JSON for non-text results', () => {
    expect(mcpResultToText({ foo: 1 })).toBe('{"foo":1}')
  })
})

describe('getMcpToolDefinitions', () => {
  const mcpTool: MCPTool = {
    serverName: 'claudeplus',
    name: 'memory_write',
    description: 'store a memory',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  }

  function fakeManager (trusted: boolean, callTool = vi.fn()): MCPManager {
    return {
      getAllTools: () => [mcpTool],
      getServer: () => ({ config: { trusted }, isConnected: true, callTool }),
    } as unknown as MCPManager
  }

  it('wraps tools, prefixes the description, and respects trust for approval', () => {
    const trusted = getMcpToolDefinitions(fakeManager(true))[0]
    expect(trusted.tool.name).toBe('memory_write')
    expect(trusted.tool.description).toContain('[mcp:claudeplus]')
    expect(trusted.approval).toBe('never')

    const untrusted = getMcpToolDefinitions(fakeManager(false))[0]
    expect(untrusted.approval).toBe('always')
  })

  it('executes via the server and flattens the result', async () => {
    const callTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    const def = getMcpToolDefinitions(fakeManager(true, callTool))[0]
    const result = await def.tool.execute({ name: 'x' })
    expect(callTool).toHaveBeenCalledWith('memory_write', { name: 'x' })
    expect(result).toEqual({ success: true, output: 'ok', error: undefined })
  })

  it('reports an error result as a failed tool result', async () => {
    const callTool = vi.fn().mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'boom' }] })
    const def = getMcpToolDefinitions(fakeManager(true, callTool))[0]
    const result = await def.tool.execute({ name: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
  })
})
