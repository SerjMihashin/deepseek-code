import { render } from 'ink'
import React from 'react'
import { App } from '../ui/app.js'
import { loadConfig } from '../config/loader.js'
import { themeManager } from '../core/themes.js'
import { i18n } from '../core/i18n.js'

export interface CliOptions {
  query?: string;
  prompt?: string;
  promptInteractive?: string;
  model?: string;
  yolo?: boolean;
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

  // Apply CLI theme/lang overrides
  if (options.theme) {
    themeManager.setTheme(options.theme)
  }
  if (options.lang) {
    i18n.setLocale(options.lang as 'en' | 'ru' | 'zh')
  }

  let cleanup: (() => void) | null = null

  // Double Ctrl+C guard: first Ctrl+C in Ready shows hint, second within 2s exits.
  // App registers process.__agentSoftCancel while isProcessing=true.
  let pendingExitTimer: ReturnType<typeof setTimeout> | null = null

  const onSIGINT = () => {
    const proc = process as NodeJS.Process & {
      __agentSoftCancel?: () => void;
      __pendingExit?: boolean;
    }

    // 1) Agent is running — soft cancel, never exit
    if (proc.__agentSoftCancel) {
      proc.__agentSoftCancel()
      return
    }

    // 2) Agent just finished (pending exit flag from app.tsx) — exit immediately
    if (proc.__pendingExit) {
      proc.__pendingExit = false
      if (cleanup) cleanup()
      process.exit(0)
      return
    }

    // 3) Ready state — double Ctrl+C guard
    if (pendingExitTimer) {
      // Second Ctrl+C within 2s — exit
      clearTimeout(pendingExitTimer)
      pendingExitTimer = null
      if (cleanup) cleanup()
      process.exit(0)
      return
    }

    // First Ctrl+C — show hint, start timer
    pendingExitTimer = setTimeout(() => {
      pendingExitTimer = null
    }, 2000)

    // Write hint to stderr so it appears even if TUI is rendering
    process.stderr.write('\n\x1b[33m⚠ Нажмите Ctrl+C ещё раз для выхода\x1b[0m\n')
  }

  // SIGTERM: always exit gracefully regardless of agent state
  const onSIGTERM = () => {
    if (cleanup) cleanup()
    process.exit(0)
  }

  process.on('SIGINT', onSIGINT)
  process.on('SIGTERM', onSIGTERM)

  const { waitUntilExit, clear } = render(
    React.createElement(App, { config, options }),
    { exitOnCtrlC: false }  // App owns Ctrl+C: useInput handles raw-mode, onSIGINT handles signal
  )

  cleanup = () => {
    clear()
    if (pendingExitTimer) {
      clearTimeout(pendingExitTimer)
      pendingExitTimer = null
    }
    process.removeListener('SIGINT', onSIGINT)
    process.removeListener('SIGTERM', onSIGTERM)
  }

  await waitUntilExit()
  cleanup()
}
