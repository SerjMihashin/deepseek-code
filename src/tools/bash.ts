import { spawn, type ChildProcess } from 'node:child_process'
import { platform } from 'node:os'
import { resolveWindowsShell } from './shell.js'
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

// Commands with NO Windows PowerShell 5.1 equivalent (would just fail). Note we
// no longer list cat/rm/ls/cp/mv/echo here: under PowerShell those are aliases
// (Get-Content/Remove-Item/Get-ChildItem/...) and work fine.
const WINDOWS_UNIX_COMMAND_REPLACEMENTS: Record<string, string> = {
  sed: 'Use PowerShell string replacement, Select-String, or read_file/edit instead.',
  head: 'Use Get-Content <path> -TotalCount <n>.',
  tail: 'Use Get-Content <path> -Tail <n>.',
  grep: 'Use grep_search, Select-String, or rg if available.',
  xargs: 'Use PowerShell pipelines with ForEach-Object.',
  touch: 'Use New-Item -ItemType File or Set-Content.',
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
  if (platform() !== 'win32') return null
  if (resolveWindowsShell() !== 'powershell') return null
  if (!hasUnquotedWindowsShellChaining(command)) return null

  return 'Windows shell policy: commands run through Windows PowerShell 5.1, which does NOT support the && or || operators. Use ; to run sequentially, or "; if ($?) { <next> }" to run the next command only if the previous one succeeded. Or split into separate tool calls.'
}

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  aborted: boolean;
  timedOut: boolean;
}

/**
 * Kill a child and its whole process tree. A bare `child.kill()` only signals
 * the direct child (the shell wrapper); on Windows the actual command keeps the
 * stdout pipe open so the `close` event never fires, and on Unix the command is
 * orphaned. We therefore kill the entire tree/process group.
 */
function killProcessTree (child: ChildProcess): void {
  const pid = child.pid
  if (pid == null) return
  if (platform() === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
    } catch {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
  } else {
    try {
      // Negative pid targets the process group (requires detached spawn).
      process.kill(-pid, 'SIGTERM')
    } catch {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
  }
}

/**
 * Run a shell command asynchronously so the event loop (and therefore the TUI
 * and Ctrl+C handling) stays responsive while the command runs. The command is
 * killed if `signal` aborts (user cancellation) or the timeout elapses.
 */
function executeCommand (command: string, timeout: number, signal?: AbortSignal): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({ stdout: '', stderr: '', code: null, aborted: true, timedOut: false })
      return
    }

    // detached on POSIX makes the child a process-group leader so the whole
    // group can be killed; on Windows the tree is killed via taskkill /t.
    const detached = platform() !== 'win32'
    // On Windows commands run through a single, predictable shell — PowerShell by
    // default (what the model writes naturally: $env:, ;, 2>$null), with a cmd.exe
    // fallback when PowerShell can't run (resolveWindowsShell). This removes the
    // "wrote PowerShell, ran under cmd" failures that produced junk like a literal
    // "$null" file. The active shell is announced in the system prompt.
    let child: ChildProcess
    if (platform() === 'win32') {
      child = resolveWindowsShell() === 'powershell'
        ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, detached })
        : spawn(command, { shell: true, windowsHide: true, detached })
    } else {
      child = spawn(command, { shell: true, detached })
    }

    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let truncated = false
    let aborted = false
    let timedOut = false

    const onAbort = () => { aborted = true; killProcessTree(child) }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    const timer = setTimeout(() => { timedOut = true; killProcessTree(child) }, timeout)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk)
      if (stdoutBytes <= MAX_OUTPUT_BYTES) stdout += chunk
      else truncated = true
    })
    child.stderr?.on('data', (chunk: string) => { stderr += chunk })

    const cleanup = () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    child.on('error', (err) => {
      cleanup()
      reject(err)
    })
    child.on('close', (code) => {
      cleanup()
      if (truncated) stdout += `\n\n... [output truncated at ${MAX_OUTPUT_BYTES} bytes]`
      resolve({ stdout, stderr, code, aborted, timedOut })
    })
  })
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
  async execute (args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
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
      const { stdout, stderr, code, aborted, timedOut } = await executeCommand(command, timeout, signal)

      if (aborted) {
        return { success: false, output: stdout, error: 'Command aborted by user (Ctrl+C).' }
      }
      if (timedOut) {
        return {
          success: false,
          output: stdout,
          error: `Command timed out after ${timeout}ms.${stderr ? `\n${stderr}` : ''}`,
        }
      }
      if (code === 0) {
        return { success: true, output: stdout || '(command completed with no output)' }
      }
      return {
        success: false,
        output: stdout,
        error: stderr || `Command exited with code ${code}`,
      }
    } catch (err) {
      const error = err as Error & { code?: string }
      if (signal?.aborted || error.code === 'ABORT_ERR' || error.name === 'AbortError') {
        return { success: false, output: '', error: 'Command aborted by user (Ctrl+C).' }
      }
      return { success: false, output: '', error: error.message }
    }
  },
}
