import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Box, Text, useInput, useApp, useStdin } from 'ink'
import { ChatView } from './chat-view.js'
import { InputBar } from './input-bar.js'
import { StatusBar } from './status-bar.js'
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js'
import { DEEPSEEK_MODELS } from '../config/defaults.js'
import { saveConfig } from '../config/loader.js'
import type { SessionOptions } from '../cli/interactive.js'
import { type ChatMessage } from '../api/index.js'
import { AgentLoop, type ToolCallEvent } from '../core/agent-loop.js'
import { saveSession, getLastSessionId, writeExecutionBundle, writeSessionHandoff } from '../core/session.js'
import { hooksManager } from '../core/hooks.js'
import { mcpManager } from '../core/mcp.js'
import { subAgentManager } from '../core/subagent.js'
import { skillsManager } from '../core/skills.js'
import { lspManager } from '../core/lsp.js'
import { scheduler } from '../core/scheduler.js'
import { themeManager } from '../core/themes.js'
import { i18n, type Locale } from '../core/i18n.js'
import { Logo, SetupWizard, useSetupWizard, type SetupStep } from './setup-wizard.js'
import { executeSlashCommand, type SlashCommandContext } from '../commands/index.js'

/** Empty input hint timeout in ms before showing the guide text */
const EMPTY_INPUT_HINT_DELAY = 2000

interface AppProps {
  config: DeepSeekConfig;
  options: SessionOptions;
}

// Setup wizard step components are now in ./setup-wizard.tsx
// Logo, SetupWizard, useSetupWizard imported from there

export function App ({ config, options }: AppProps) {
  const { exit } = useApp()
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(
    (options.approvalMode as ApprovalMode) ?? (options.turbo ? 'turbo' : config.approvalMode)
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusText, setStatusText] = useState(i18n.t('ready'))
  const [localApiKey, setLocalApiKey] = useState(config.apiKey || '')
  const agentLoopRef = useRef<AgentLoop | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pendingApprovalResolveRef = useRef<((value: boolean) => void) | null>(null)
  const liveToolMessageIndexRef = useRef(-1)
  const prevToolCallsRef = useRef<ToolCallEvent[]>([])
  const [toolCalls, setToolCalls] = useState<ToolCallEvent[]>([])
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    args: Record<string, unknown>;
    resolve: (value: boolean) => void;
  } | null>(null)
  const [approvalCursor, setApprovalCursor] = useState(0)
  const [pendingClear, setPendingClear] = useState(false)
  const [clearCursor, setClearCursor] = useState(0)
  const exemptedToolsRef = useRef<Set<string>>(new Set())
  const approvalModeRef = useRef<ApprovalMode>(approvalMode)
  const sessionIdRef = useRef<string>('')
  const initializedRef = useRef(false)
  const [emptyInputHint, setEmptyInputHint] = useState(false)
  const emptyInputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [chatScrollOffset, setChatScrollOffset] = useState(0)
  const [scrollMode, setScrollMode] = useState<'follow' | 'paused'>('follow')
  const [newMessagesWhilePaused, setNewMessagesWhilePaused] = useState(false)
  const visibleMessageCountRef = useRef(0)
  const [contextPercent, setContextPercent] = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string } | null>(null)
  const [themePicker, setThemePicker] = useState<{ themes: { name: string; description: string }[]; selectedIndex: number } | null>(null)
  const [modelPicker, setModelPicker] = useState<{ selectedIndex: number } | null>(null)
  const [serviceNotice, setServiceNotice] = useState<string | null>(null)
  const serviceNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const addServiceNotice = useCallback((text: string) => {
    setServiceNotice(text)
    if (serviceNoticeTimerRef.current) clearTimeout(serviceNoticeTimerRef.current)
    serviceNoticeTimerRef.current = setTimeout(() => setServiceNotice(null), 3000)
  }, [])

  // Keep approvalModeRef in sync so onApprovalRequest always uses the current mode
  // even when changed via Tab while the agent is running
  useEffect(() => { approvalModeRef.current = approvalMode }, [approvalMode])

  // Check if API key is configured (non-empty) — used early for locale detection
  const hasApiKey = !!(config.apiKey || process.env.DEEPSEEK_API_KEY) &&
    (config.apiKey || process.env.DEEPSEEK_API_KEY || '').trim().length > 0

  // Set locale from config on mount (before first render)
  // Auto-detect system locale on first launch (when no API key is configured)
  const localeRef = useRef(false)
  if (!localeRef.current) {
    localeRef.current = true
    const lang = (config.language || (hasApiKey ? 'en' : i18n.detectLocale())) as Locale
    i18n.setLocale(lang)
  }

  // Setup wizard — use the hook from setup-wizard.tsx
  const initialStep = hasApiKey ? 'done' as SetupStep : 'lang' as SetupStep
  const [setupWizardState, setupWizardActions] = useSetupWizard(
    config,
    initialStep,
    (updatedConfig) => {
      setLocalApiKey(updatedConfig.apiKey || '')
      setApprovalMode(updatedConfig.approvalMode || 'default')
    },
    (msg) => {
      setMessages(prev => [...prev, msg])
    }
  )
  const { step: setupStep, apiKeyError, langCursor, themeCursor, modelCursor, modeCursor, langOptions, modeOptions } = setupWizardState
  const { handleApiKeySubmit, finishSetup, setLangCursor, setThemeCursor, setModelCursor, setModeCursor, setStep: setSetupStep, setApiKeyError } = setupWizardActions
  const setupStepRef = useRef(setupStep)
  setupStepRef.current = setupStep

  // Initialize session and services on mount
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true;

    // Set locale from config on startup
    // (already set above, but keep for safety)

    (async () => {
      if (options.continue_) {
        const lastId = await getLastSessionId()
        if (lastId) sessionIdRef.current = lastId
      }
      if (!sessionIdRef.current) {
        sessionIdRef.current = await saveSession({})
      }

      subAgentManager.setApiConfig({ ...config, apiKey: localApiKey || config.apiKey })

      // Initialize services in background
      await Promise.allSettled([
        mcpManager.loadConfig().then(() => mcpManager.connectAll()),
        skillsManager.loadAll(),
        hooksManager.load(),
        lspManager.load().then(() => lspManager.initializeAll()),
        subAgentManager.loadFromDir(),
        scheduler.load(),
      ])

      // Chrome не инициализируется при старте.
      // Он запускается только когда:
      //   - агент вызывает chrome tool
      //   - пользователь запускает /browser-test
      //   - пользователь запускает /chrome

      setStatusText(i18n.t('ready'))
    })()
  }, [])

  // Register soft-cancel hook for the SIGINT handler in interactive.ts.
  // While isProcessing, interactive.ts's onSIGINT calls this instead of process.exit().
  useEffect(() => {
    const proc = process as NodeJS.Process & { __agentSoftCancel?: () => void }
    if (isProcessing) {
      proc.__agentSoftCancel = () => {
        abortControllerRef.current?.abort()
        if (pendingApprovalResolveRef.current) {
          pendingApprovalResolveRef.current(false)
          pendingApprovalResolveRef.current = null
        }
        setPendingApproval(null)
        setStatusText(i18n.t('cancelled'))
      }
    } else {
      proc.__agentSoftCancel = undefined
    }
    return () => { proc.__agentSoftCancel = undefined }
  }, [isProcessing])

  const { stdin } = useStdin()

  // Compensate scroll offset when new visible messages arrive while paused
  useEffect(() => {
    if (setupStepRef.current !== 'done') return
    const visible = messages.filter(m => m.role !== 'tool').length
    if (scrollMode === 'paused' && visible > visibleMessageCountRef.current) {
      const diff = visible - visibleMessageCountRef.current
      setChatScrollOffset(prev => prev + diff)
      setNewMessagesWhilePaused(true)
    }
    visibleMessageCountRef.current = visible
  }, [messages.length, scrollMode])

  // Sync prevToolCallsRef with toolCalls state
  useEffect(() => {
    prevToolCallsRef.current = toolCalls
  }, [toolCalls])

  // Detect End key from raw stdin (Ink does not expose it in useInput)
  useEffect(() => {
    if (!stdin) return
    const handler = (data: Buffer) => {
      if (setupStepRef.current !== 'done') return
      const seq = data.toString()
      if (seq === '\x1b[F' || seq === '\x1b[4~' || seq === '\x1b[8~' || seq === '\x1bOF') {
        setChatScrollOffset(0)
        setScrollMode('follow')
        setNewMessagesWhilePaused(false)
      }
    }
    stdin.on('data', handler)
    return () => { stdin.off('data', handler) }
  }, [stdin])

  // Slash commands — delegated to commands/index.ts
  const handleSlashCommand = useCallback(async (input: string): Promise<boolean> => {
    const ctx: SlashCommandContext = {
      config,
      approvalMode,
      messages,
      setMessages,
      setStatusText,
      setSetupStep,
      addServiceNotice,
      getMetrics: () => agentLoopRef.current!.getMetrics(),
      onThemePicker: () => {
        const themes = themeManager.listThemes()
        const currentName = themeManager.theme.name
        const idx = themes.findIndex(t => t.name === currentName)
        setThemePicker({ themes, selectedIndex: Math.max(0, idx) })
      },
      onModelPicker: () => {
        const idx = DEEPSEEK_MODELS.findIndex(m => m.id === config.model)
        setModelPicker({ selectedIndex: Math.max(0, idx) })
      },
    }
    return executeSlashCommand(input, ctx)
  }, [config, approvalMode, messages, addServiceNotice])

  const handleSubmit = useCallback(async (input: string) => {
    // Show hint on empty input
    if (!input.trim()) {
      setEmptyInputHint(true)
      if (emptyInputTimerRef.current) clearTimeout(emptyInputTimerRef.current)
      emptyInputTimerRef.current = setTimeout(() => setEmptyInputHint(false), EMPTY_INPUT_HINT_DELAY)
      return
    }
    if (isProcessing) return

    // Handle setup wizard steps
    if (setupStep === 'apikey') {
      await handleApiKeySubmit(input)
      return
    }
    if (setupStep === 'theme' || setupStep === 'mode') {
      return
    }
    if (setupStep !== 'done') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Сначала завершите настройку. Используйте /setup для повторного запуска.',
      }])
      return
    }

    if (input.startsWith('/')) {
      try {
        const handled = await handleSlashCommand(input)
        if (handled) return
      } catch (err) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `${i18n.t('error')}: ${(err as Error).message}`,
        }])
        return
      }
      // Unknown slash command — show local error, do NOT send to model
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Неизвестная команда: \`${input.trim().split(/\s+/)[0]}\`. Введите \`/help\` для списка команд.`,
      }])
      return
    }

    // Abort previous request if still running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let userContent: ChatMessage['content'] = input
    if (pendingImage) {
      userContent = [
        { type: 'text', text: input },
        { type: 'image_url', image_url: { url: `data:${pendingImage.mimeType};base64,${pendingImage.base64}` } },
      ]
      setPendingImage(null)
    }
    const userMessage: ChatMessage = { role: 'user', content: userContent }
    setMessages(prev => [...prev, userMessage])
    setIsProcessing(true)
    setStatusText(i18n.t('working'))
    setToolCalls([])
    liveToolMessageIndexRef.current = -1
    setChatScrollOffset(0)
    setScrollMode('follow')
    setNewMessagesWhilePaused(false)

    try {
      await hooksManager.execute('UserPromptSubmit', {
        event: 'UserPromptSubmit',
        projectDir: process.cwd(),
      })

      // Create fresh AgentLoop every time (avoids stale closures)
      agentLoopRef.current = new AgentLoop(
        { ...config, apiKey: localApiKey || config.apiKey },
        {
          approvalMode,
          cwd: process.cwd(),
          signal: abortController.signal,
          onToolCall: (tc) => {
            const updatedCalls = [...prevToolCallsRef.current, tc]
            prevToolCallsRef.current = updatedCalls
            setToolCalls(updatedCalls)
            setStatusText(`🔧 ${tc.name}...`)

            // Add/update live tool activity card in chat messages
            setMessages(prev => {
              const idx = liveToolMessageIndexRef.current
              const card = { type: 'tool_activity_card', toolCalls: updatedCalls, status: 'live' as const }
              if (idx >= 0 && idx < prev.length && prev[idx]?.role === 'tool') {
                // Update existing card
                const updated = [...prev]
                updated[idx] = { role: 'tool', content: JSON.stringify(card) }
                return updated
              }
              // Add new card
              liveToolMessageIndexRef.current = prev.length
              return [...prev, { role: 'tool', content: JSON.stringify(card) }]
            })
          },
          onToolResult: (result) => {
            setStatusText(result.success ? `✅ ${result.toolName} ${i18n.t('toolDone')}` : `❌ ${result.toolName} ${i18n.t('toolError')}`)
          },
          onReasoningChunk: () => {},
          onStreamChunk: (chunk) => {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.role === 'assistant') {
                // If last content is empty, replace with chunk; otherwise append
                const updated = [...prev]
                updated[updated.length - 1] = { ...last, content: last.content + chunk }
                return updated
              }
              return [...prev, { role: 'assistant', content: chunk }]
            })
          },
          // onResponse intentionally removed — onStreamChunk handles all text
          // Avoids duplicate "assistant" message push that caused text doubling
          onResponse: () => {},
          onError: () => {
            // Handled by handleSubmit catch block — adding here would create duplicate
            // assistant messages, breaking the conversation structure for the next request
          },
          onApprovalRequest: async (toolName, args) => {
            if (approvalModeRef.current === 'turbo') return true
            if (approvalModeRef.current === 'auto-edit' && (toolName === 'write_file' || toolName === 'edit')) return true
            if (approvalModeRef.current === 'plan') return false
            if (exemptedToolsRef.current.has(toolName)) return true

            // Default mode — ask user for confirmation
            return new Promise<boolean>((resolve) => {
              pendingApprovalResolveRef.current = resolve
              setPendingApproval({ toolName, args, resolve })
            })
          },
        }
      )

      const finalResponse = await agentLoopRef.current.run(input, messages.filter(m => {
        // Filter out tool activity cards — they are UI-only and not valid API messages
        if (m.role === 'tool') {
          try {
            const parsed = typeof m.content === 'string' ? JSON.parse(m.content) : m.content
            if (parsed?.type === 'tool_activity_card') return false
          } catch { /* not JSON, keep it */ }
        }
        return true
      }))

      const toolHistory = agentLoopRef.current.getToolCallHistory()
      const bundleFile = await writeExecutionBundle({
        sessionId: sessionIdRef.current,
        prompt: input,
        response: finalResponse,
        approvalMode,
        toolCalls: toolHistory.map(toolCall => ({
          id: toolCall.id,
          name: toolCall.name,
          status: toolCall.status,
          durationMs: toolCall.durationMs,
          error: toolCall.error,
          result: toolCall.result,
        })),
      })
      const handoffFile = await writeSessionHandoff({
        sessionId: sessionIdRef.current,
        prompt: input,
        response: finalResponse,
        approvalMode,
        toolCalls: toolHistory.map(toolCall => ({
          name: toolCall.name,
          status: toolCall.status,
          durationMs: toolCall.durationMs,
          error: toolCall.error,
        })),
      })

      await saveSession({
        id: sessionIdRef.current,
        messageCount: messages.length + 2,
        toolCallCount: toolHistory.length,
        approvalMode,
        lastPrompt: input,
        lastResponse: finalResponse,
        summary: finalResponse,
        handoffFile,
        bundleFile,
      })

      // Single batch: all final UI updates at once (no await between setState calls)
      setIsProcessing(false)
      setStatusText(i18n.t('ready'))

      // Convert live tool activity card to compact summary
      if (liveToolMessageIndexRef.current >= 0 && toolHistory.length > 0) {
        setMessages(prev => {
          const idx = liveToolMessageIndexRef.current
          if (idx >= 0 && idx < prev.length && prev[idx]?.role === 'tool') {
            const updated = [...prev]
            updated[idx] = {
              role: 'tool',
              content: JSON.stringify({ type: 'tool_activity_card', toolCalls: toolHistory, status: 'compact' as const }),
            }
            return updated
          }
          return prev
        })
      }
      liveToolMessageIndexRef.current = -1
    } catch (err) {
      const error = err as Error
      // Don't show error on cancellation
      if (error.name === 'AbortError' || error.message.includes('abort') || error.message.includes('cancel')) {
        return
      }
      const msg = error.message || ''
      let friendlyMsg: string
      if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized')) {
        friendlyMsg = i18n.t('apiErrorAuth')
      } else if (msg.includes('429') || msg.includes('rate limit')) {
        friendlyMsg = i18n.t('apiErrorRateLimit')
      } else if (/5\d{2}|server error|Service Unavailable/i.test(msg)) {
        friendlyMsg = i18n.t('apiErrorServer')
      } else if (/ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
        friendlyMsg = i18n.t('apiErrorNetwork')
      } else if (/ETIMEDOUT|timed out/i.test(msg)) {
        friendlyMsg = i18n.t('apiErrorTimeout')
      } else {
        friendlyMsg = `${i18n.t('error')}: ${msg}`
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: friendlyMsg,
      }])
      const handoffFile = await writeSessionHandoff({
        sessionId: sessionIdRef.current,
        prompt: input,
        error: friendlyMsg,
        approvalMode,
      })
      const bundleFile = await writeExecutionBundle({
        sessionId: sessionIdRef.current,
        prompt: input,
        error: friendlyMsg,
        approvalMode,
      })
      await saveSession({
        id: sessionIdRef.current,
        messageCount: messages.length + 2,
        approvalMode,
        lastPrompt: input,
        lastError: friendlyMsg,
        summary: friendlyMsg,
        handoffFile,
        bundleFile,
      })
    } finally {
      // Safety net: ensure UI is always reset regardless of exit path
      setIsProcessing(false)
      setStatusText(i18n.t('ready'))
      // Clear any pending approval (covers error/abort exit paths)
      if (pendingApprovalResolveRef.current) {
        pendingApprovalResolveRef.current(false)
        pendingApprovalResolveRef.current = null
      }
      setPendingApproval(null)
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
    }
  }, [messages, isProcessing, setupStep, handleApiKeySubmit, handleSlashCommand, approvalMode, config, localApiKey])

  useInput((_input, key) => {
    const step = setupStepRef.current

    // Ctrl+C: delegate to interactive.ts SIGINT handler.
    // - During processing: soft cancel (via __agentSoftCancel)
    // - During Ready: double Ctrl+C guard (first shows hint, second exits)
    // - Never call exit() here — that would bypass the double-Ctrl+C guard.
    if (key.ctrl && _input === 'c') {
      if (isProcessing && abortControllerRef.current) {
        abortControllerRef.current.abort()
        setStatusText(i18n.t('cancelled'))
        if (pendingApprovalResolveRef.current) {
          pendingApprovalResolveRef.current(false)
          pendingApprovalResolveRef.current = null
        }
        setPendingApproval(null)
        return
      }
      // When not processing: set flag so SIGINT handler can exit immediately
      // (interactive.ts checks __pendingExit for immediate exit after agent finishes)
      const proc = process as NodeJS.Process & { __pendingExit?: boolean }
      proc.__pendingExit = true
      return
    }

    // When not in setup mode, let InputBar handle all keyboard input
    if (step === 'done') {
      // Handle clear confirmation dialog
      if (pendingClear) {
        if (key.upArrow) {
          setClearCursor(prev => Math.max(0, prev - 1))
        } else if (key.downArrow) {
          setClearCursor(prev => Math.min(1, prev + 1))
        } else if (key.return) {
          if (clearCursor === 0) executeClear()
          else setPendingClear(false)
        } else if (key.escape) {
          setPendingClear(false)
        }
        return
      }
      // Handle approval dialog
      if (pendingApproval) {
        if (key.upArrow) {
          setApprovalCursor(prev => Math.max(0, prev - 1))
        } else if (key.downArrow) {
          setApprovalCursor(prev => Math.min(3, prev + 1))
        } else if (key.return) {
          const cursor = approvalCursor
          const resolve = pendingApproval.resolve
          const toolName = pendingApproval.toolName
          setApprovalCursor(0)
          setPendingApproval(null)
          pendingApprovalResolveRef.current = null
          if (cursor === 0) {
            resolve(true)
          } else if (cursor === 1) {
            resolve(false)
          } else if (cursor === 2) {
            exemptedToolsRef.current.add(toolName)
            addServiceNotice(`🔇 ${toolName}: больше не спрашивать в этой сессии`)
            resolve(true)
          } else {
            setApprovalMode('turbo')
            saveConfig({ ...config, approvalMode: 'turbo' }).catch(() => {})
            addServiceNotice('⚡ Turbo режим включён: инструменты выполняются без подтверждения.')
            resolve(true)
          }
        } else if (key.escape) {
          setApprovalCursor(0)
          const resolve = pendingApproval.resolve
          setPendingApproval(null)
          pendingApprovalResolveRef.current = null
          resolve(false)
        }
        return
      }
      // Tab for approval mode cycling — instant switch, no y/n confirmation
      if (key.tab) {
        setApprovalMode(prev => {
          const modes: ApprovalMode[] = ['plan', 'default', 'auto-edit', 'turbo']
          const nextIdx = (modes.indexOf(prev) + 1) % modes.length
          const newMode = modes[nextIdx]
          saveConfig({ ...config, approvalMode: newMode }).catch(() => {})

          // Local warning — NOT an agent message, NOT sent to model
          if (newMode === 'turbo') {
            addServiceNotice('⚡ Включён режим Turbo: инструменты будут выполняться без подтверждения.')
          } else if (prev === 'turbo') {
            addServiceNotice('Режим Turbo выключен.')
          } else {
            addServiceNotice(`Режим: ${newMode}`)
          }

          return newMode
        })
        return
      }
      // Scroll chat history — always works regardless of processing state.
      // PageUp: scroll up by ~half a screen
      if (key.pageUp) {
        const visibleCount = messages.filter(m => m.role !== 'tool').length
        const next = Math.min(chatScrollOffset + 10, Math.max(0, visibleCount - 1))
        if (next > 0) setScrollMode('paused')
        setChatScrollOffset(next)
        return
      }
      // PageDown: scroll down by ~half a screen
      if (key.pageDown) {
        const next = Math.max(0, chatScrollOffset - 10)
        setChatScrollOffset(next)
        if (next === 0) {
          setScrollMode('follow')
          setNewMessagesWhilePaused(false)
        }
        return
      }
      // Theme picker: interactive selection
      if (themePicker) {
        if (key.escape) {
          setThemePicker(null)
          return
        }
        if (key.upArrow) {
          setThemePicker(prev => {
            if (!prev) return null
            return { ...prev, selectedIndex: Math.max(0, prev.selectedIndex - 1) }
          })
          return
        }
        if (key.downArrow) {
          setThemePicker(prev => {
            if (!prev) return null
            return { ...prev, selectedIndex: Math.min(prev.themes.length - 1, prev.selectedIndex + 1) }
          })
          return
        }
        if (key.return) {
          const picker = themePicker
          const chosen = picker.themes[picker.selectedIndex]
          themeManager.setTheme(chosen.name)
          setThemePicker(null)
          addServiceNotice(`🎨 Тема изменена: ${chosen.name}`)
          return
        }
        return
      }
      // Model picker: interactive selection
      if (modelPicker) {
        if (key.escape) {
          setModelPicker(null)
          return
        }
        if (key.upArrow) {
          setModelPicker(prev => prev ? { selectedIndex: Math.max(0, prev.selectedIndex - 1) } : null)
          return
        }
        if (key.downArrow) {
          setModelPicker(prev => prev ? { selectedIndex: Math.min(DEEPSEEK_MODELS.length - 1, prev.selectedIndex + 1) } : null)
          return
        }
        if (key.return) {
          const chosen = DEEPSEEK_MODELS[modelPicker.selectedIndex]
          if (chosen) {
            saveConfig({ ...config, model: chosen.id }).catch(() => {})
            config.model = chosen.id
            setModelPicker(null)
            addServiceNotice(`🤖 Модель: ${chosen.label} (${chosen.id})`)
          }
          return
        }
        return
      }
      // ArrowUp/ArrowDown: scroll by 1 line, but only when InputBar is disabled (processing)
      // When InputBar is active, arrows belong to input history/suggestions.
      if (key.upArrow && isProcessing) {
        const visibleCount = messages.filter(m => m.role !== 'tool').length
        const next = Math.min(chatScrollOffset + 1, Math.max(0, visibleCount - 1))
        if (next > 0) setScrollMode('paused')
        setChatScrollOffset(next)
        return
      }
      if (key.downArrow && isProcessing) {
        const next = Math.max(0, chatScrollOffset - 1)
        setChatScrollOffset(next)
        if (next === 0) {
          setScrollMode('follow')
          setNewMessagesWhilePaused(false)
        }
        return
      }
      return
    }

    // Step 1: Language selection — arrows + Enter + Escape
    if (step === 'lang') {
      if (key.escape) {
        exit()
        return
      }
      if (key.downArrow) {
        setLangCursor(Math.min(langCursor + 1, langOptions.length - 1))
      } else if (key.upArrow) {
        setLangCursor(Math.max(langCursor - 1, 0))
      } else if (key.return) {
        const lang = langOptions[langCursor]
        i18n.setLocale(lang)
        setSetupStep('apikey')
        setLangCursor(0)
      }
      return
    }

    // Step 2: API key — handled via InputBar, Escape to go back
    if (step === 'apikey') {
      if (key.escape) {
        setSetupStep('lang')
        setLangCursor(0)
      }
      return
    }

    // Step 3: Theme selection — arrows + Enter + Escape
    if (step === 'theme') {
      if (key.escape) {
        setSetupStep('apikey')
        setApiKeyError('')
        return
      }
      const themes = themeManager.listThemes()
      if (key.downArrow) {
        const next = Math.min(themeCursor + 1, themes.length - 1)
        themeManager.setTheme(themes[next].name)
        setThemeCursor(next)
      } else if (key.upArrow) {
        const prev = Math.max(themeCursor - 1, 0)
        themeManager.setTheme(themes[prev].name)
        setThemeCursor(prev)
      } else if (key.return) {
        setSetupStep('model')
        setModelCursor(0)
      }
      return
    }

    // Step 4: Model selection — arrows + Enter + Escape
    if (step === 'model') {
      if (key.escape) {
        setSetupStep('theme')
        return
      }
      if (key.downArrow) {
        setModelCursor(Math.min(modelCursor + 1, DEEPSEEK_MODELS.length - 1))
      } else if (key.upArrow) {
        setModelCursor(Math.max(modelCursor - 1, 0))
      } else if (key.return) {
        setSetupStep('mode')
        setModeCursor(0)
      }
      return
    }

    // Step 5: Mode selection — arrows + Enter + Escape
    if (step === 'mode') {
      if (key.escape) {
        setSetupStep('model')
        return
      }
      if (key.downArrow) {
        setModeCursor(Math.min(modeCursor + 1, modeOptions.length - 1))
      } else if (key.upArrow) {
        setModeCursor(Math.max(modeCursor - 1, 0))
      } else if (key.return) {
        finishSetup()
      }
    }
  })

  // Get context usage percent from AgentLoop metrics
  useEffect(() => {
    if (!isProcessing || !agentLoopRef.current) {
      return
    }
    const interval = setInterval(() => {
      if (agentLoopRef.current) {
        const metrics = agentLoopRef.current.getMetrics()
        setContextPercent(metrics.getCurrentWindowPercent())
        setTotalTokens(metrics.totalTokens)
        setEstimatedCost(metrics.estimatedCostUSD(config.model))
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [isProcessing])

  const executeClear = useCallback(() => {
    setMessages([])
    setToolCalls([])
    setPendingApproval(null)
    setPendingImage(null)
    setScrollMode('follow')
    setNewMessagesWhilePaused(false)
    setChatScrollOffset(0)
    liveToolMessageIndexRef.current = -1
    setServiceNotice(null)
    if (serviceNoticeTimerRef.current) {
      clearTimeout(serviceNoticeTimerRef.current)
      serviceNoticeTimerRef.current = null
    }
    setPendingClear(false)
  }, [])

  const handleClear = useCallback(() => {
    if (messages.length === 0 && toolCalls.length === 0) {
      executeClear()
      return
    }
    setPendingClear(true)
    setClearCursor(0)
  }, [messages.length, toolCalls.length, executeClear])
  const handleExit = useCallback(() => { exit() }, [exit])
  const colors = themeManager.getColors()

  return (
    <Box flexDirection='column' height='100%'>
      {setupStep !== 'done'
        ? <SetupWizard state={{
          step: setupStep,
          apiKeyError,
          langCursor,
          themeCursor,
          modelCursor,
          modeCursor,
          langOptions,
          modeOptions,
        }}
          />
        : (
          <Box flexDirection='column' flexGrow={1}>
            <Logo />
            <ChatView messages={messages} scrollOffset={chatScrollOffset} hasNewMessages={newMessagesWhilePaused} />
            {serviceNotice && (
              <Box marginLeft={2} marginBottom={1}>
                <Text color={colors.primary}>{serviceNotice}</Text>
              </Box>
            )}
            {themePicker && (
              <Box flexDirection='column' marginLeft={2} marginBottom={1} borderStyle='round' borderColor={colors.primary}>
                <Box marginLeft={1} marginTop={1}>
                  <Text bold color={colors.primary}>🎨 Выберите тему</Text>
                </Box>
                <Box marginLeft={1} marginTop={1} flexDirection='column'>
                  {themePicker.themes.map((t, i) => (
                    <Box key={t.name}>
                      <Text color={i === themePicker.selectedIndex ? colors.primary : colors.textMuted}>
                        {i === themePicker.selectedIndex ? '▸ ' : '  '}
                        {t.name}
                        {t.name === themeManager.theme.name ? ' (текущая)' : ''}
                      </Text>
                    </Box>
                  ))}
                </Box>
                <Box marginLeft={1} marginBottom={1} marginTop={1}>
                  <Text color={colors.textMuted}>↑↓ — навигация  Enter — применить  Esc — отмена</Text>
                </Box>
              </Box>
            )}
            {modelPicker && (
              <Box flexDirection='column' marginLeft={2} marginBottom={1} borderStyle='round' borderColor={colors.primary}>
                <Box marginLeft={1} marginTop={1}>
                  <Text bold color={colors.primary}>🤖 Выберите модель</Text>
                </Box>
                <Box marginLeft={1} marginTop={1} flexDirection='column'>
                  {DEEPSEEK_MODELS.map((m, i) => (
                    <Box key={m.id} flexDirection='column'>
                      <Text color={i === modelPicker.selectedIndex ? colors.primary : colors.textMuted}>
                        {i === modelPicker.selectedIndex ? '▸ ' : '  '}
                        <Text bold={i === modelPicker.selectedIndex}>{m.label}</Text>
                        {m.id === config.model ? <Text dimColor> (текущая)</Text> : null}
                      </Text>
                      <Text dimColor>{'    '}{m.description}</Text>
                    </Box>
                  ))}
                </Box>
                <Box marginLeft={1} marginBottom={1} marginTop={1}>
                  <Text color={colors.textMuted}>↑↓ — навигация  Enter — применить  Esc — отмена</Text>
                </Box>
              </Box>
            )}
            {pendingApproval && (
              <Box flexDirection='column' marginLeft={2} marginBottom={1} borderStyle='round' borderColor={colors.warning}>
                <Box>
                  <Text bold color={colors.warning}>🔔 Подтвердить вызов инструмента?</Text>
                </Box>
                <Box marginLeft={1}>
                  <Text bold color={colors.text}>{pendingApproval.toolName}</Text>
                </Box>
                <Box marginLeft={1}>
                  <Text color={colors.textMuted}>{JSON.stringify(pendingApproval.args, null, 2).slice(0, 200)}</Text>
                </Box>
                <Box flexDirection='column' marginTop={1}>
                  {[
                    '✅  Подтвердить',
                    '❌  Отклонить',
                    `🔇  Не спрашивать для "${pendingApproval.toolName}"`,
                    '⚡  Turbo — выполнять всё без вопросов',
                  ].map((label, i) => (
                    <Box key={i} marginLeft={1}>
                      <Text color={approvalCursor === i ? colors.primary : colors.text}>
                        {approvalCursor === i ? '❯ ' : '  '}{label}
                      </Text>
                    </Box>
                  ))}
                  <Box marginLeft={1} marginTop={1}>
                    <Text color={colors.textMuted}>↑↓ — навигация  Enter — выбрать  Esc — отклонить</Text>
                  </Box>
                </Box>
              </Box>
            )}
            {pendingClear && (
              <Box flexDirection='column' marginLeft={2} marginBottom={1} borderStyle='round' borderColor={colors.warning}>
                <Box>
                  <Text bold color={colors.warning}>⚠️  Очистить историю чата?</Text>
                </Box>
                <Box marginLeft={1}>
                  <Text color={colors.textMuted}>{messages.length} сообщений будет удалено. Отмену нельзя.</Text>
                </Box>
                <Box flexDirection='column' marginTop={1}>
                  {['✅  Да, очистить', '❌  Отмена'].map((label, i) => (
                    <Box key={i} marginLeft={1}>
                      <Text color={clearCursor === i ? colors.primary : colors.text}>
                        {clearCursor === i ? '❯ ' : '  '}{label}
                      </Text>
                    </Box>
                  ))}
                  <Box marginLeft={1} marginTop={1}>
                    <Text color={colors.textMuted}>↑↓ — навигация  Enter — выбрать  Esc — отмена</Text>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
          )}
      <InputBar
        onSubmit={handleSubmit}
        disabled={isProcessing}
        onClear={handleClear}
        onExit={handleExit}
        isMasked={setupStep === 'apikey'}
        isSetupMode={setupStep !== 'done'}
        blockInput={setupStep === 'done' && (pendingApproval !== null || pendingClear)}
        emptyHint={emptyInputHint}
        onImagePaste={(base64, mimeType) => {
          const model = config.model ?? ''
          if (!model.includes('vl') && !model.includes('vision')) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `⚠️ Вставка изображения требует модель с поддержкой vision.\nТекущая модель: ${model || 'неизвестно'}\nИспользуйте модель с "vl" или "vision" в названии.`,
            }])
            return
          }
          setPendingImage({ base64, mimeType })
        }}
      />
      <StatusBar
        mode={approvalMode}
        status={statusText}
        messageCount={messages.length}
        isProcessing={isProcessing}
        contextPercent={contextPercent}
        totalTokens={totalTokens}
        estimatedCost={estimatedCost}
        model={config.model}
      />
    </Box>
  )
}
