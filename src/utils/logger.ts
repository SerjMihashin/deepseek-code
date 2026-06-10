import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEBUG_ENABLED = () => process.env.DEEPSEEK_CODE_DEBUG === '1'

const LOG_DIR = join(homedir(), '.deepseek-code')
const CRASH_LOG_PATH = join(LOG_DIR, 'crash.log')

export function getCrashLogPath (): string {
  return CRASH_LOG_PATH
}

/**
 * Append an error to the crash log. Used by the global process guards so a
 * stray error/rejection is recorded instead of silently killing the session.
 * Never throws — logging must not become a second failure.
 */
export function logCrash (label: string, err: unknown): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const timestamp = new Date().toISOString()
    const detail = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err)
    appendFileSync(CRASH_LOG_PATH, `\n[${timestamp}] ${label}\n${detail}\n`, 'utf-8')
  } catch {
    /* swallow — the crash logger must never throw */
  }
}

const EVENT_LOG_PATH = join(LOG_DIR, 'events.log')

/**
 * Append a diagnostic event to ~/.deepseek-code/events.log. Silent unless debug
 * is enabled (DEEPSEEK_CODE_DEBUG=1 or --debug); trace points are left in place
 * for the deferred Ctrl+C/exit investigation. Synchronous append so entries
 * survive an immediate process exit.
 */
export function logEvent (label: string, detail?: Record<string, unknown>): void {
  if (!DEBUG_ENABLED()) return
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const timestamp = new Date().toISOString()
    const extra = detail ? ' ' + JSON.stringify(detail) : ''
    appendFileSync(EVENT_LOG_PATH, `[${timestamp}] ${label}${extra}\n`, 'utf-8')
  } catch {
    /* swallow */
  }
}

export function getEventLogPath (): string {
  return EVENT_LOG_PATH
}

export function debug (...args: unknown[]): void {
  if (DEBUG_ENABLED()) {
    console.error('[DEBUG]', ...args)
  }
}

export function log (...args: unknown[]): void {
  console.error(...args)
}

export function error (...args: unknown[]): void {
  console.error('[ERROR]', ...args)
}
