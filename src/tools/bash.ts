import { execSync } from 'node:child_process'
import { type Tool, type ToolResult } from './types.js'

/**
 * Dangerous commands that should never be auto-approved.
 * These can destroy the system or data.
 */
const DANGEROUS_PATTERNS = [
  /^\s*rm\s+-rf\s+\/\s*$/m,
  /^\s*mkfs\s/m,
  /^\s*dd\s+if=\/dev\/zero/m,
  /^\s*format\s/m,
  /^\s*del\s+\/f\s+\/s\s/m,
  /^\s*rd\s+\/s\s+\/q\s/m,
  /^\s*shutdown\s/m,
  /^\s*reboot\s/m,
  /^\s*init\s+0/m,
  /^\s*:\(\)\s*\{/m, // fork bomb
  /^\s*>+\s+\/dev\//m, // destructive redirects
]

function isDangerousCommand (command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Command matches dangerous pattern: ${pattern}`
    }
  }
  return null
}

export const bashTool: Tool = {
  name: 'run_shell_command',
  description: 'Execute a shell command. Use for running build tools, tests, git operations, etc.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The shell command to execute',
      required: true,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Optional timeout in milliseconds (default: 120000)',
      required: false,
    },
    {
      name: 'description',
      type: 'string',
      description: 'Brief description of what the command does',
      required: false,
    },
  ],
  async execute (args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string
    const timeout = (args.timeout as number) ?? 120_000

    // Security check — reject dangerous commands
    const danger = isDangerousCommand(command)
    if (danger) {
      return {
        success: false,
        output: '',
        error: `Blocked for security: ${danger}`,
      }
    }

    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        windowsHide: true,
      })

      return {
        success: true,
        output: output || '(command completed with no output)',
      }
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string }
      const stdout = error.stdout ?? ''
      const stderr = error.stderr ?? ''
      return {
        success: false,
        output: stdout,
        error: stderr || error.message,
      }
    }
  },
}
