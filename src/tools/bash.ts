import { execFileSync, execSync } from 'node:child_process'
import { platform } from 'node:os'
import { isAbsolute, relative } from 'node:path'
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
  /^\s*remove-item\b\s+["']?(?:[A-Z]:\\|\/)["']?\s+-(?:recurse|r)\b/im,
  /^\s*rm\b\s+["']?(?:[A-Z]:\\|\/)["']?\s+-(?:recurse|r)\b/im,
  /^\s*clear-disk\b/im,
  /^\s*format-volume\b/im,
  /^\s*stop-computer\b/im,
  /^\s*restart-computer\b/im,
  /^\s*taskkill\b(?=.*(?:\/f|-f)\b)(?=.*(?:\/im|-im)\s+(?:node(?:\.exe)?|npm(?:\.cmd)?|pnpm(?:\.cmd)?|yarn(?:\.cmd)?|tsx(?:\.cmd)?|vite(?:\.cmd)?|nuxt(?:\.cmd)?|next(?:\.cmd)?|react-scripts(?:\.cmd)?|powershell(?:\.exe)?|cmd(?:\.exe)?))\b/im,
  /^\s*taskkill\b(?=.*(?:\/im|-im)\s+\*)/im,
  /^\s*stop-process\b(?=.*-(?:name|processname)\s+(?:node|npm|pnpm|yarn|tsx|vite|nuxt|next|react-scripts|powershell|cmd)\b)/im,
  /^\s*(?:kill|pkill|killall)\b.*\b(?:node|npm|pnpm|yarn|tsx|vite|nuxt|next|react-scripts)\b/im,
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

const POWERSHELL_COMMANDS = new Set([
  'add-content',
  'copy-item',
  'get-childitem',
  'get-content',
  'move-item',
  'new-item',
  'remove-item',
  'select-object',
  'select-string',
  'set-content',
  'test-path',
  'foreach-object',
  'where-object',
  'write-output',
])

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

function isInsideWorkspace (targetPath: string): boolean {
  if (!isAbsolute(targetPath)) return true
  const rel = relative(process.cwd(), targetPath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function extractFirstPathArgument (rest: string): string | null {
  const trimmed = rest.trim()
  const quoted = trimmed.match(/^["']([^"']+)["']/u)
  if (quoted) return quoted[1]
  const bare = trimmed.match(/^([^\s;|&]+)/u)
  return bare?.[1] ?? null
}

function getWorkspacePolicyError (command: string): string | null {
  const cdPattern = /(?:^|[;&|()])\s*(?:cd|chdir|set-location)\s+((?:"[^"]+")|(?:'[^']+')|[^\s;&|)]+)/gim
  let match: RegExpExecArray | null
  while ((match = cdPattern.exec(command)) !== null) {
    const target = match[1].replace(/^["']|["']$/g, '')
    if (isAbsolute(target) && !isInsideWorkspace(target)) {
      return `Workspace policy: refusing to change directory outside the current workspace (${process.cwd()}): ${target}. Start the CLI in the intended project directory instead of switching projects inside a shell command.`
    }
  }

  if (platform() !== 'win32') return null

  const mutatingCmdletPattern = /(?:^|[;&|()])\s*(remove-item|new-item|set-content|add-content|copy-item|move-item)\b([^;&|)]*)/gim
  while ((match = mutatingCmdletPattern.exec(command)) !== null) {
    const target = extractFirstPathArgument(match[2])
    if (target && isAbsolute(target) && !isInsideWorkspace(target)) {
      return `Workspace policy: refusing to run ${match[1]} on a path outside the current workspace (${process.cwd()}): ${target}. Use the CLI from that project directory or ask for confirmation with the correct workspace.`
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

function getWindowsUnixFlagPolicyError (command: string): string | null {
  if (platform() !== 'win32') return null

  const mkdirP = /(?:^|[;&|()])\s*mkdir\s+-p(?:\s|$)/im
  if (mkdirP.test(command)) {
    return 'Windows shell policy: mkdir -p is Unix syntax and can create a literal "-p" directory in Windows shells. Use New-Item -ItemType Directory -Force <path> or mkdir <path> without -p.'
  }

  return null
}

function shouldRunWithPowerShell (command: string): boolean {
  if (platform() !== 'win32') return false
  return findBareCommandAtSegmentStart(command, POWERSHELL_COMMANDS) !== null
}

function hasUnquotedWindowsShellChaining (command: string): boolean {
  let quote: '"' | "'" | null = null

  for (let i = 0; i < command.length - 1; i++) {
    const char = command[i]

    if (quote) {
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    const pair = command.slice(i, i + 2)
    if (pair === '&&' || pair === '||') return true
  }

  return false
}

function getPowerShellSyntaxPolicyError (command: string): string | null {
  if (!shouldRunWithPowerShell(command)) return null
  if (!hasUnquotedWindowsShellChaining(command)) return null

  return 'Windows shell policy: this command uses PowerShell cmdlets together with cmd/bash chaining operators && or ||. Use separate tool calls, or PowerShell-compatible separators such as ; with explicit error checks.'
}

function executeCommand (command: string, timeout: number): string {
  const options = {
    timeout,
    encoding: 'utf-8' as const,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  }

  if (shouldRunWithPowerShell(command)) {
    return execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
    ], options)
  }

  return execSync(command, options)
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
      const isBroadProcessKill = /\b(?:taskkill|stop-process|pkill|killall)\b/iu.test(command)
      return {
        success: false,
        output: '',
        error: isBroadProcessKill
          ? `Blocked for security: ${danger}. Avoid broad process-kill commands. If you started a dev server, stop only that specific process by its known PID or use the child process handle managed by the tool.`
          : `Blocked for security: ${danger}. This command is potentially destructive. Use explicit safe paths inside the current workspace and avoid broad recursive deletion.`,
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

    const windowsUnixFlagPolicyError = getWindowsUnixFlagPolicyError(command)
    if (windowsUnixFlagPolicyError) {
      return {
        success: false,
        output: '',
        error: windowsUnixFlagPolicyError,
      }
    }

    const workspacePolicyError = getWorkspacePolicyError(command)
    if (workspacePolicyError) {
      return {
        success: false,
        output: '',
        error: workspacePolicyError,
      }
    }

    const powershellSyntaxPolicyError = getPowerShellSyntaxPolicyError(command)
    if (powershellSyntaxPolicyError) {
      return {
        success: false,
        output: '',
        error: powershellSyntaxPolicyError,
      }
    }

    try {
      const output = executeCommand(command, timeout)

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
