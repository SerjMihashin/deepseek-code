import { type ChildProcess } from 'node:child_process'
import { platform } from 'node:os'
import { spawnShellCommand, killProcessTree, resolveWindowsShell } from './shell.js'
import { startBackground, stopBackground, getBackgroundOutput, isBackgroundRunning, getBackgroundExitInfo, listBackground, hasBackground, waitForPort } from './process-manager.js'
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

const DEFAULT_TIMEOUT_MS = 120_000
const LONG_TIMEOUT_MS = 600_000

/**
 * Pick a default timeout for a command. Dependency installs and full builds on
 * real projects routinely exceed the 120s default — timing them out made the
 * agent thrash (delete node_modules, reinstall, repeat). Give those a long
 * default; the caller can still override with an explicit `timeout`.
 */
export function defaultTimeoutFor (command: string | undefined): number {
  if (!command) return DEFAULT_TIMEOUT_MS
  // npm/pnpm/yarn/bun install|ci|add, and common build steps
  if (/(?:^|[\s;&|(])(?:npm|pnpm|yarn|bun)\s+(?:install|ci|i|add|dedupe|rebuild)\b/i.test(command)) return LONG_TIMEOUT_MS
  if (/(?:^|[\s;&|(])(?:npx\s+)?(?:nuxi|vite|next|nuxt|tsc|webpack|turbo)\b.*\bbuild\b/i.test(command)) return LONG_TIMEOUT_MS
  if (/(?:^|[\s;&|(])(?:npm|pnpm|yarn)\s+run\s+build\b/i.test(command)) return LONG_TIMEOUT_MS
  return DEFAULT_TIMEOUT_MS
}

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  aborted: boolean;
  timedOut: boolean;
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
    const child: ChildProcess = spawnShellCommand(command, platform() !== 'win32')

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
  description: 'Execute an OS-compatible shell command (build/test/git). Prefer read_file, grep_search, glob for inspection. For long-running processes like dev/preview servers, set background:true (optionally with wait_for_port) so the call returns instead of hanging; check its logs anytime with read_pid (does not stop it), see all with list_processes, stop it with stop_pid. The active shell dialect is described in the system prompt.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The shell command to execute. Omit only when using stop_pid, or wait_for_port alone.',
      required: false,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Timeout in ms (default 120000; 600000 for dependency installs and builds; 30000 for wait_for_port). Override for unusually long commands.',
      required: false,
    },
    {
      name: 'background',
      type: 'boolean',
      description: 'Run the command as a long-running background process (e.g. a dev server) and return immediately with its pid instead of waiting for it to finish.',
      required: false,
    },
    {
      name: 'wait_for_port',
      type: 'number',
      description: 'After starting (or by itself), poll this localhost TCP port until it accepts connections or the timeout elapses. Use to wait for a dev server before a browser check.',
      required: false,
    },
    {
      name: 'stop_pid',
      type: 'number',
      description: 'Stop a previously started background process by its pid (kills the whole process tree). No command needed.',
      required: false,
    },
    {
      name: 'read_pid',
      type: 'number',
      description: 'Read the captured output (stdout+stderr tail) of a background process by pid WITHOUT stopping it. Use to check dev-server logs after a failed page load. No command needed.',
      required: false,
    },
    {
      name: 'list_processes',
      type: 'boolean',
      description: 'List background processes started this session (pid, command, running/exited). No command needed.',
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
    const command = args.command as string | undefined
    const timeout = (args.timeout as number) ?? defaultTimeoutFor(command)
    const background = args.background === true
    const waitForPortNum = args.wait_for_port as number | undefined
    const stopPid = args.stop_pid as number | undefined
    const readPid = args.read_pid as number | undefined

    // ── Stop a background process ──────────────────────────────────────────
    if (typeof stopPid === 'number') {
      const result = stopBackground(stopPid)
      if (!result.stopped) return { success: false, output: '', error: result.error }
      const tail = result.output ? `\n--- last output ---\n${result.output.slice(-4000)}` : ''
      return { success: true, output: `Stopped background process pid=${stopPid}.${tail}` }
    }

    // ── Read output of a background process without stopping it ────────────
    if (typeof readPid === 'number') {
      if (!hasBackground(readPid)) {
        return { success: false, output: '', error: `No background process with pid ${readPid}. Use list_processes to see active ones.` }
      }
      const running = isBackgroundRunning(readPid)
      const state = running ? 'running' : `not running — ${getBackgroundExitInfo(readPid) ?? 'exited'}`
      const out = getBackgroundOutput(readPid)
      return {
        success: true,
        output: `Background process pid=${readPid} is ${state}.${out ? `\n--- output tail ---\n${out.slice(-6000)}` : '\n(no output captured yet)'}`,
      }
    }

    // ── List background processes ───────────────────────────────────────────
    if (args.list_processes === true) {
      const procs = listBackground()
      if (procs.length === 0) return { success: true, output: 'No background processes in this session.' }
      const lines = procs.map(p =>
        `pid=${p.pid} [${p.running ? 'running' : p.exitInfo ?? 'exited'}] ${p.command.length > 80 ? p.command.slice(0, 79) + '…' : p.command}`
      )
      return { success: true, output: `Background processes (${procs.length}):\n${lines.join('\n')}` }
    }

    // ── Wait for a port with no command (server already started elsewhere) ──
    if (!command && typeof waitForPortNum === 'number') {
      const portTimeout = (args.timeout as number) ?? 30_000
      const ready = await waitForPort(waitForPortNum, '127.0.0.1', portTimeout)
      return ready
        ? { success: true, output: `Port ${waitForPortNum} is accepting connections.` }
        : { success: false, output: '', error: `Port ${waitForPortNum} not ready within ${portTimeout}ms.` }
    }

    if (!command) {
      return { success: false, output: '', error: 'No command provided. Pass `command`, or use `stop_pid` / `wait_for_port`.' }
    }

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

    // ── Background process (dev/preview servers etc.) ──────────────────────
    if (background) {
      const { pid, error } = startBackground(command)
      if (pid == null) return { success: false, output: '', error }

      let portMsg = ''
      let portReady = true
      if (typeof waitForPortNum === 'number') {
        const portTimeout = (args.timeout as number) ?? 30_000
        portReady = await waitForPort(waitForPortNum, '127.0.0.1', portTimeout)
        portMsg = portReady
          ? `\nPort ${waitForPortNum} is ready.`
          : `\nWARNING: port ${waitForPortNum} did not become ready within ${portTimeout}ms.`
      } else {
        // brief grace period to surface startup output / immediate crashes
        await new Promise(resolve => setTimeout(resolve, 800))
      }

      const running = isBackgroundRunning(pid)
      const exitInfo = getBackgroundExitInfo(pid)
      const out = getBackgroundOutput(pid)
      const tail = out ? `\n--- output so far ---\n${out.slice(-4000)}` : ''
      const success = running && portReady
      return {
        success,
        output: `Started background process pid=${pid}.${running ? '' : ` Process already ${exitInfo}.`}${portMsg}\nStop it later with stop_pid=${pid}.${tail}`,
        error: success ? undefined : (running ? `Port ${waitForPortNum} not ready.` : `Background process exited immediately: ${exitInfo}`),
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
