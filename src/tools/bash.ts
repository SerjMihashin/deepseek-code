import { execSync } from 'node:child_process'
import { platform } from 'node:os'
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
  /^\s*remove-item\b.*\s-(?:recurse|r)\b/im,
  /^\s*rm\b.*\s-(?:recurse|r)\b/im,
  /^\s*clear-disk\b/im,
  /^\s*format-volume\b/im,
  /^\s*stop-computer\b/im,
  /^\s*restart-computer\b/im,
  /^\s*shutdown\s/m,
  /^\s*reboot\s/m,
  /^\s*init\s+0/m,
  /^\s*:\(\)\s*\{/m, // fork bomb
  /^\s*>+\s+\/dev\//m, // destructive redirects
]

const WINDOWS_UNIX_COMMAND_REPLACEMENTS: Record<string, string> = {
  sed: 'Use PowerShell string replacement, Select-String, or read_file/edit instead.',
  head: 'Use Get-Content <path> -TotalCount <n>.',
  tail: 'Use Get-Content <path> -Tail <n>.',
  cat: 'Use Get-Content <path>.',
  grep: 'Use grep_search, Select-String, or rg if available.',
  xargs: 'Use PowerShell pipelines with ForEach-Object.',
  touch: 'Use New-Item -ItemType File or Set-Content.',
  rm: 'Use Remove-Item with an explicit safe path.',
}

function findBareCommandAtSegmentStart (command: string, names: Set<string>): string | null {
  let atSegmentStart = true
  let quote: '"' | "'" | null = null

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if (quote) {
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/[|&;()]/.test(char)) {
      atSegmentStart = true
      continue
    }

    if (/\s/.test(char)) continue

    if (!atSegmentStart) continue

    const rest = command.slice(i)
    const match = rest.match(/^([A-Za-z][\w.-]*)\b/)
    if (!match) {
      atSegmentStart = false
      continue
    }

    const name = match[1].toLowerCase()
    if (names.has(name)) return name
    atSegmentStart = false
  }

  return null
}

function isDangerousCommand (command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Command matches dangerous pattern: ${pattern}`
    }
  }
  return null
}

function getWindowsShellPolicyError (command: string): string | null {
  if (platform() !== 'win32') return null

  const commandName = findBareCommandAtSegmentStart(command, new Set(Object.keys(WINDOWS_UNIX_COMMAND_REPLACEMENTS)))
  if (!commandName) return null

  return `Windows shell policy: '${commandName}' is usually a Unix command and may fail in cmd/PowerShell. ${WINDOWS_UNIX_COMMAND_REPLACEMENTS[commandName]}`
}

export const bashTool: Tool = {
  name: 'run_shell_command',
  description: 'Execute an OS-compatible shell command. Use for build/test/git commands; prefer read_file, grep_search, and glob for repository inspection. On Windows, use PowerShell/cmd-compatible commands unless Unix tools were verified.',
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

    const windowsPolicyError = getWindowsShellPolicyError(command)
    if (windowsPolicyError) {
      return {
        success: false,
        output: '',
        error: windowsPolicyError,
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
