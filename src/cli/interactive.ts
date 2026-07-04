import { render } from 'ink'
import React from 'react'
import { App } from '../ui/app.js'
import { ErrorBoundary } from '../ui/error-boundary.js'
import { loadConfig } from '../config/loader.js'
import { themeManager } from '../core/themes.js'
import { i18n } from '../core/i18n.js'
import { logCrash, logEvent, logLifecycle, debug } from '../utils/logger.js'

export interface CliOptions {
  query?: string;
  prompt?: string;
  promptInteractive?: string;
  model?: string;
  turbo?: boolean;
  approvalMode?: string;
  debug?: boolean;
  continue_?: boolean;
  resume?: string;
  json?: boolean;
  headless?: boolean;
  theme?: string;
  lang?: string;
}

export type SessionOptions = CliOptions

export async function startInteractiveSession (options: SessionOptions): Promise<void> {
  const config = await loadConfig()

  // Apply the saved theme from config, then let a CLI flag override it. Without
  // this the persisted theme was never restored on launch (and the Matrix intro
  // never triggered because the theme wasn't active yet at first render).
  await themeManager.loadCustomThemes()
  if (config.theme) {
    themeManager.setTheme(config.theme)
  }
  if (options.theme) {
    themeManager.setTheme(options.theme)
  }
  if (options.lang) {
    i18n.setLocale(options.lang as 'en' | 'ru' | 'zh')
  }

  let cleanup: (() => void) | null = null

  // Global crash guard: a stray rejection (e.g. fallout from aborting an
  // in-flight API stream on Ctrl+C) must never drop the user back to the shell
  // mid-session. Abort-like errors are expected during cancellation and ignored;
  // anything else is recorded to ~/.deepseek-code/crash.log and the session
  // keeps running so no work is lost.
  const isAbortLike = (err: unknown): boolean => {
    const e = err as { name?: string; code?: string; message?: string }
    return e?.name === 'AbortError' || e?.code === 'ABORT_ERR' ||
      /abort|cancel|The operation was aborted/i.test(e?.message ?? '')
  }
  const onUnhandledRejection = (reason: unknown) => {
    if (isAbortLike(reason)) { debug('ignored abort-like unhandledRejection', reason); return }
    logCrash('unhandledRejection', reason)
  }
  const onUncaughtException = (err: Error) => {
    if (isAbortLike(err)) { debug('ignored abort-like uncaughtException', err); return }
    logCrash('uncaughtException', err)
  }
  process.on('unhandledRejection', onUnhandledRejection)
  process.on('uncaughtException', onUncaughtException)

  // Diagnostic (ALWAYS ON): log every process exit/signal/stdin event so a
  // "silent drop to the shell" is diagnosable from the next repro. Written to
  // crash.log via logLifecycle (synchronous append survives the exit).
  const onProcessExit = (code: number) => logLifecycle('process.exit', { code })
  const onBeforeExit = (code: number) => logLifecycle('beforeExit (event loop drained)', { code })
  process.on('exit', onProcessExit)
  process.on('beforeExit', onBeforeExit)

  // stdin end/close is the prime suspect for the Windows drop-to-shell: when a
  // child process or terminal quirk ends stdin, Ink unmounts and the session
  // exits. Record it (and on Windows, swallow a stray 'end' so it cannot tear
  // the session down — the keep-alive handle holds the loop regardless).
  const stdin = process.stdin
  const onStdinEnd = () => logLifecycle('stdin end')
  const onStdinClose = () => logLifecycle('stdin close')
  const onStdinError = (err: Error) => logLifecycle('stdin error', { message: err.message })
  try {
    stdin.on('end', onStdinEnd)
    stdin.on('close', onStdinClose)
    stdin.on('error', onStdinError)
  } catch { /* stdin may not be a stream in some environments */ }

  logLifecycle('session start', { platform: process.platform, isTTY: !!process.stdout.isTTY, ppid: process.ppid })

  // Keep-alive: hold one ref'd handle so the event loop never drains while the
  // TUI is mounted. Without this, on some Windows terminals the only thing
  // keeping Node alive during an agent turn is the in-flight network socket —
  // so aborting it on Ctrl+C drained the loop and dropped the user to the shell
  // instead of pausing. Cleared in cleanup so real exits still work.
  const keepAlive = setInterval(() => {}, 1 << 30)

  // Double Ctrl+C guard: first Ctrl+C in Ready shows hint, second within 3s exits.
  // App registers process.__agentSoftCancel while isProcessing=true.
  let pendingExitTimer: ReturnType<typeof setTimeout> | null = null

  const onSIGINT = () => {
    const proc = process as NodeJS.Process & {
      __agentSoftCancel?: () => void;
      __pendingExit?: boolean;
      __agentAbortController?: AbortController;
    }

    logEvent('SIGINT', {
      hasSoftCancel: !!proc.__agentSoftCancel,
      hasAbortController: !!proc.__agentAbortController,
      pendingExit: !!proc.__pendingExit,
      pendingExitTimer: !!pendingExitTimer,
    })

    // 1) Agent is running — soft cancel, never exit
    if (proc.__agentSoftCancel) {
      logEvent('SIGINT -> softCancel')
      proc.__agentSoftCancel()
      return
    }
    // 1b) Fallback: __agentSoftCancel may not be set yet (useEffect race on Windows),
    // but synchronous AbortController exists from handleSubmit
    if (proc.__agentAbortController) {
      logEvent('SIGINT -> abortController')
      proc.__agentAbortController.abort()
      return
    }

    // 2) Agent just finished (pending exit flag from app.tsx) — exit immediately
    if (proc.__pendingExit) {
      logEvent('SIGINT -> pendingExit -> process.exit(0)')
      proc.__pendingExit = false
      if (cleanup) cleanup()
      process.exit(0)
      return
    }

    // 3) Ready state — double Ctrl+C guard
    if (pendingExitTimer) {
      // Second Ctrl+C within 3s — exit
      logEvent('SIGINT -> doublePress -> process.exit(0)')
      clearTimeout(pendingExitTimer)
      pendingExitTimer = null
      if (cleanup) cleanup()
      process.exit(0)
      return
    }
    logEvent('SIGINT -> firstPress hint')

    // First Ctrl+C — show hint, start timer
    pendingExitTimer = setTimeout(() => {
      pendingExitTimer = null
    }, 3000)

    // Write hint to stderr so it appears even if TUI is rendering
    process.stderr.write(`\n\x1b[33m⚠ ${i18n.t('ctrlCHint')}\x1b[0m\n`)
  }

  // SIGTERM: always exit gracefully regardless of agent state
  const onSIGTERM = () => {
    logLifecycle('SIGTERM -> exit')
    if (cleanup) cleanup()
    process.exit(0)
  }

  process.on('SIGINT', onSIGINT)
  process.on('SIGTERM', onSIGTERM)

  const { waitUntilExit, clear } = render(
    React.createElement(ErrorBoundary, null, React.createElement(App, { config, options })),
    { exitOnCtrlC: false }  // App owns Ctrl+C: useInput handles raw-mode, onSIGINT handles signal
  )

  cleanup = () => {
    clearInterval(keepAlive)
    clear()
    if (pendingExitTimer) {
      clearTimeout(pendingExitTimer)
      pendingExitTimer = null
    }
    process.removeListener('SIGINT', onSIGINT)
    process.removeListener('SIGTERM', onSIGTERM)
    process.removeListener('unhandledRejection', onUnhandledRejection)
    process.removeListener('uncaughtException', onUncaughtException)
    process.removeListener('exit', onProcessExit)
    process.removeListener('beforeExit', onBeforeExit)
    try {
      stdin.removeListener('end', onStdinEnd)
      stdin.removeListener('close', onStdinClose)
      stdin.removeListener('error', onStdinError)
    } catch { /* ignore */ }
  }

  await waitUntilExit()
  logLifecycle('waitUntilExit resolved — Ink unmounted')
  cleanup()
}
