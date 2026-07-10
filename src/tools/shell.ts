import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { platform } from 'node:os'

export type WindowsShell = 'powershell' | 'cmd'

let cached: WindowsShell | null = null

/**
 * Decide which Windows shell `run_shell_command` runs commands through.
 *
 * Default is Windows PowerShell (what the model writes naturally and what ships
 * with every modern Windows), but we gracefully fall back to cmd.exe if
 * PowerShell cannot actually run (locked-down execution policy, stripped image).
 * Override with the DEEPSEEK_CODE_SHELL env var (`cmd` | `powershell`).
 */
function detectWindowsShell (): WindowsShell {
  const override = (process.env.DEEPSEEK_CODE_SHELL ?? '').trim().toLowerCase()
  if (override === 'cmd') return 'cmd'
  if (override === 'powershell' || override === 'pwsh' || override === 'ps') return 'powershell'

  try {
    const probe = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
      timeout: 5000,
      windowsHide: true,
    })
    if (!probe.error && probe.status === 0) return 'powershell'
  } catch {
    /* fall through to cmd */
  }
  return 'cmd'
}

/** Resolved (and cached) Windows shell. On non-Windows this is irrelevant. */
export function resolveWindowsShell (): WindowsShell {
  if (platform() !== 'win32') return 'cmd'
  if (cached === null) cached = detectWindowsShell()
  return cached
}

/**
 * Spawn a shell command through the resolved shell for this OS (PowerShell/cmd on
 * Windows, /bin/sh on POSIX). `detached` should be true on POSIX so the whole
 * process group can be killed later. Shared by run_shell_command and the
 * background process manager.
 */
export function spawnShellCommand (command: string, detached: boolean, extraEnv?: Record<string, string>): ChildProcess {
  const env = extraEnv ? { ...process.env, ...extraEnv } : undefined
  if (platform() === 'win32') {
    return resolveWindowsShell() === 'powershell'
      ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, detached, env })
      : spawn(command, { shell: true, windowsHide: true, detached, env })
  }
  return spawn(command, { shell: true, detached, env })
}

/**
 * Kill a child and its whole process tree. A bare `child.kill()` only signals the
 * shell wrapper; on Windows the real command keeps the stdout pipe open (so the
 * `close` event never fires) and on POSIX it is orphaned.
 */
export function killProcessTree (child: ChildProcess): void {
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
      process.kill(-pid, 'SIGTERM')
    } catch {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
  }
}

/** Synchronous tree kill by pid — for process-exit cleanup of background tasks. */
export function killProcessTreeSync (pid: number): void {
  if (platform() === 'win32') {
    try { spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, timeout: 5000 }) } catch { /* best effort */ }
  } else {
    try { process.kill(-pid, 'SIGKILL') } catch { /* best effort */ }
  }
}
