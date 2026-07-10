import { platform } from 'node:os'
import { type ToolDefinition, type ApprovalRequirement } from './types.js'
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'
import { chromeTool } from './chrome.js'
import { windowsUiTool } from './windows-ui.js'

export function getDefaultTools (): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    { tool: readTool, approval: 'never' },
    { tool: writeTool, approval: 'always' },
    { tool: editTool, approval: 'always' },
    { tool: bashTool, approval: 'always' },
    { tool: chromeTool, approval: 'always' },
    { tool: globTool, approval: 'never' },
    { tool: grepTool, approval: 'never' },
  ]
  if (platform() === 'win32') {
    tools.push({ tool: windowsUiTool, approval: 'always' })
  }
  return tools
}

export function getToolsForMode (mode: 'plan' | 'default' | 'auto-edit' | 'turbo'): ToolDefinition[] {
  const tools = getDefaultTools()

  switch (mode) {
    case 'plan':
      // Plan mode: only read/search tools
      return tools.filter(t => t.approval === 'never')
    case 'auto-edit':
      // Auto-edit: auto-approve write/edit, still ask for shell and chrome
      return tools.map(t => ({
        ...t,
        approval: t.tool.name === 'write_file' || t.tool.name === 'edit'
          ? 'auto' as ApprovalRequirement
          : t.approval,
      }))
    case 'turbo':
      // Turbo: auto-approve everything
      return tools.map(t => ({
        ...t,
        approval: 'auto' as ApprovalRequirement,
      }))
    default:
      return tools
  }
}
