import { spawnSync } from 'node:child_process'
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
