import { type Tool, type ToolDefinition, type ToolParameter, type ToolResult } from '../tools/types.js'
import { mcpManager, type MCPManager, type MCPTool } from './mcp.js'

/**
 * Bridges connected MCP servers into the agent loop's tool model so the model
 * can actually CALL them (the MCPManager only connected/listed them before).
 *
 * MCP advertises a JSON Schema `inputSchema`; the agent loop expects a flat
 * `ToolParameter[]`. We map the top-level properties, which covers the common
 * case (the ClaudePlus hub tools are flat objects with string/number/array
 * fields). Nested object internals are passed through as a generic `object`.
 */

interface JsonSchemaProp {
  type?: string
  description?: string
  enum?: Array<string | number>
  items?: { type?: string }
}

interface JsonSchema {
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
}

const PARAM_TYPES = new Set(['string', 'number', 'boolean', 'array', 'object'])

function mapType (type: string | undefined): ToolParameter['type'] {
  if (type === 'integer') return 'number'
  if (type && PARAM_TYPES.has(type)) return type as ToolParameter['type']
  return 'string'
}

function mapItemType (type: string | undefined): NonNullable<ToolParameter['items']>['type'] {
  const mapped = mapType(type)
  return mapped === 'array' ? 'string' : mapped
}

export function jsonSchemaToParameters (schema: Record<string, unknown> | undefined): ToolParameter[] {
  const s = (schema ?? {}) as JsonSchema
  const props = s.properties ?? {}
  const required = new Set(s.required ?? [])

  return Object.entries(props).map(([name, spec]) => {
    const param: ToolParameter = {
      name,
      type: mapType(spec.type),
      description: spec.description ?? '',
      required: required.has(name),
    }
    if (param.type === 'array') {
      param.items = { type: mapItemType(spec.items?.type) }
    }
    if (Array.isArray(spec.enum) && spec.enum.length > 0) {
      param.enum = spec.enum
      if (!param.description) param.description = `one of: ${spec.enum.join(', ')}`
    }
    return param
  })
}

/** Flatten an MCP tool result (`{ content: [{ type:'text', text }] }`) to a string. */
export function mcpResultToText (result: unknown): string {
  if (result && typeof result === 'object' && 'content' in result) {
    const content = (result as { content?: unknown }).content
    if (Array.isArray(content)) {
      const text = content
        .filter((c): c is { type: string; text: string } =>
          Boolean(c) && typeof c === 'object' &&
          (c as { type?: unknown }).type === 'text' &&
          typeof (c as { text?: unknown }).text === 'string')
        .map(c => c.text)
        .join('\n')
      if (text) return text
    }
  }
  return typeof result === 'string' ? result : JSON.stringify(result)
}

function toToolDefinition (mcpTool: MCPTool, manager: MCPManager): ToolDefinition {
  const trusted = manager.getServer(mcpTool.serverName)?.config.trusted === true

  const tool: Tool = {
    name: mcpTool.name,
    description: `[mcp:${mcpTool.serverName}] ${mcpTool.description}`,
    parameters: jsonSchemaToParameters(mcpTool.inputSchema),
    async execute (args): Promise<ToolResult> {
      const server = manager.getServer(mcpTool.serverName)
      if (!server || !server.isConnected) {
        return { success: false, output: '', error: `MCP server "${mcpTool.serverName}" is not connected` }
      }
      try {
        const result = await server.callTool(mcpTool.name, args)
        const isError = Boolean(result && typeof result === 'object' && (result as { isError?: unknown }).isError === true)
        const text = mcpResultToText(result)
        return { success: !isError, output: text, error: isError ? text : undefined }
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message }
      }
    },
  }

  // Approval gate only skips when 'never'. A trusted local server (e.g. the
  // user's own context hub) runs without prompts; otherwise confirm each call.
  return { tool, approval: trusted ? 'never' : 'always' }
}

/** Current connected MCP tools as agent-loop ToolDefinitions. */
export function getMcpToolDefinitions (manager: MCPManager = mcpManager): ToolDefinition[] {
  return manager.getAllTools().map(tool => toToolDefinition(tool, manager))
}

/**
 * Derive the ClaudePlus hub project id from an absolute working directory,
 * matching the directory-slug scheme used under ~/.claude/projects
 * (e.g. `D:\Projects\deepseek-code` → `D--Projects-deepseek-code`). Each path
 * separator and the drive colon become a single dash, so `D:\` → `D--`.
 */
export function projectIdFromCwd (cwd: string): string {
  return cwd
    .replace(/[\\/]+$/, '') // drop trailing separators
    .replace(/[\\/:]/g, '-')
}
