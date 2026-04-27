import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Box, Text, useInput, useApp, useStdin } from 'ink'
import { ChatView } from './chat-view.js'
import { InputBar } from './input-bar.js'
import { StatusBar } from './status-bar.js'
import { ToolActivityCard } from './tool-activity-card.js'
import { MatrixRain } from './matrix-rain.js'
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js'
import { saveConfig } from '../config/loader.js'
import type { SessionOptions } from '../cli/interactive.js'
import { DeepSeekAPI, type ChatMessage } from '../api/index.js'
import { AgentLoop, type ToolCallEvent } from '../core/agent-loop.js'
import { saveMemory, listMemories, deleteMemory, searchMemories } from '../core/memory.js'
import { saveSession, getLastSessionId, writeExecutionBundle, writeSessionHandoff } from '../core/session.js'
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../core/checkpoint.js'
import { mcpManager } from '../core/mcp.js'
import { subAgentManager } from '../core/subagent.js'
import { skillsManager } from '../core/skills.js'
import { hooksManager } from '../core/hooks.js'
import { lspManager } from '../core/lsp.js'
import { reviewCode, formatReviewReport, type ReviewOptions } from '../core/review.js'
import { sandbox } from '../core/sandbox.js'
import { gitIntegration } from '../core/git.js'
import { scheduler, Scheduler } from '../core/scheduler.js'
import { themeManager } from '../core/themes.js'
import { i18n, type Locale } from '../core/i18n.js'
import { extensionManager } from '../core/extensions.js'
import { Logo, SetupWizard, useSetupWizard, type SetupStep } from './setup-wizard.js'


/** Empty input hint timeout in ms before showing the guide text */
const EMPTY_INPUT_HINT_DELAY = 2000

interface AppProps {
  config: DeepSeekConfig;
  options: SessionOptions;
}

/**
 * Generate contextual follow-up suggestions based on the last assistant message
 */
function generateFollowups (lastContent: string): string[] {
  const suggestions: string[] = []

  if (lastContent.includes('error') || lastContent.includes('Error') || lastContent.includes('failed')) {
    suggestions.push('Fix the error and try again')
    suggestions.push('Show me the full error trace')
    suggestions.push('Debug this issue step by step')
  }

  if (lastContent.includes('```') || lastContent.includes('code')) {
    suggestions.push('Explain this code in detail')
    suggestions.push('Add tests for this code')
    suggestions.push('Optimize this code')
  }

  if (lastContent.includes('review') || lastContent.includes('Review')) {
    suggestions.push('Apply the suggested fixes')
    suggestions.push('Run a deeper review')
    suggestions.push('Check for security issues')
  }

  if (suggestions.length === 0) {
    suggestions.push('Continue with the next step')
    suggestions.push('Explain what was done')
    suggestions.push('Show me alternative approaches')
  }

  return suggestions
}

// Setup wizard step components are now in ./setup-wizard.tsx
// Logo, LangStep, ApiKeyStep, ThemeStep, ModeStep imported from there

export function App ({ config, options }: AppProps) {
  const { exit } = useApp()
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(
    (options.approvalMode as ApprovalMode) ?? (options.yolo ? 'yolo' : config.approvalMode)
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusText, setStatusText] = useState('Ready')
  const [apiKeyError, setApiKeyError] = useState('')
  const [localApiKey, setLocalApiKey] = useState(config.apiKey || '')
  const [localTheme, setLocalTheme] = useState(config.theme || 'default-dark')
  const apiRef = useRef(new DeepSeekAPI({ ...config, apiKey: config.apiKey || '' }))
  const agentLoopRef = useRef<AgentLoop | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pendingApprovalResolveRef = useRef<((value: boolean) => void) | null>(null)
  const liveToolMessageIndexRef = useRef(-1)
  const prevToolCallsRef = useRef<ToolCallEvent[]>([])
  const [toolCalls, setToolCalls] = useState<ToolCallEvent[]>([])
  const [reasoning, setReasoning] = useState('')
  const reasoningPendingRef = useRef('')
  const reasoningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showReasoning, setShowReasoning] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    args: Record<string, unknown>;
    resolve: (value: boolean) => void;
  } | null>(null)
  const sessionIdRef = useRef<string>('')
  const initializedRef = useRef(false)
  const [emptyInputHint, setEmptyInputHint] = useState(false)
  const emptyInputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [chatScrollOffset, setChatScrollOffset] = useState(0)
  const [scrollMode, setScrollMode] = useState<'follow' | 'paused'>('follow')
  const [newMessagesWhilePaused, setNewMessagesWhilePaused] = useState(false)
  const visibleMessageCountRef = useRef(0)
  const [contextPercent, setContextPercent] = useState(0)
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string } | null>(null)

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

  // Setup wizard state
  const [setupStep, setSetupStep] = useState<'lang' | 'apikey' | 'theme' | 'mode' | 'done'>(
    hasApiKey ? 'done' : 'lang'
  )
  const setupStepRef = useRef(setupStep)
  setupStepRef.current = setupStep
  const [langCursor, setLangCursor] = useState(0)
  const [themeCursor, setThemeCursor] = useState(0)
  const [modeCursor, setModeCursor] = useState(0)
  const langOptions: Array<'ru' | 'en' | 'zh'> = ['ru', 'en', 'zh']
  const langLabels: Record<string, string> = { ru: 'Русский', en: 'English', zh: '中文' }
  const modeOptions: ApprovalMode[] = ['plan', 'default', 'auto-edit', 'yolo']

  const handleLangSelect = useCallback(() => {
    const lang = langOptions[langCursor]
    i18n.setLocale(lang)
    setSetupStep('apikey')
    setLangCursor(0)
  }, [langCursor])

  const handleApiKeySubmit = useCallback(async (input: string) => {
    const key = input.trim()
    if (!key.startsWith('sk-')) {
      setApiKeyError(i18n.t('apiKeyInvalid'))
      return
    }
    // Test the key before saving
    const testApi = new DeepSeekAPI({ ...config, apiKey: key })
    const result = await testApi.validateKey()
    if (!result.valid) {
      setApiKeyError(result.error || 'Invalid API key')
      return
    }
    setLocalApiKey(key)
    await saveConfig({ ...config, apiKey: key })
    apiRef.current = new DeepSeekAPI({ ...config, apiKey: key })
    setApiKeyError('')
    // Add warning about plain-text storage
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '⚠️ **Security Notice:** Your API key is stored in plain text at `~/.deepseek-code/config.json`. For better security, consider using the `DEEPSEEK_API_KEY` environment variable instead.',
    }])
    setSetupStep('theme')
  }, [config])

  // Theme selection is handled inline via useInput

  const handleModeSelect = useCallback((mode: ApprovalMode) => {
    setApprovalMode(mode)
  }, [])

  const finishSetup = useCallback(async () => {
    await saveConfig({
      ...config,
      apiKey: localApiKey,
      theme: localTheme,
      approvalMode,
    })
    setSetupStep('done')
    setStatusText('Ready')
  }, [config, localApiKey, localTheme, approvalMode])

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

      setStatusText('Ready')
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
      }
    } else {
      proc.__agentSoftCancel = undefined
    }
    return () => { proc.__agentSoftCancel = undefined }
  }, [isProcessing])

  const { stdin } = useStdin()

  // Compensate scroll offset when new visible messages arrive while paused
  useEffect(() => {
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

  const handleSlashCommand = useCallback(async (input: string): Promise<boolean> => {
    const parts = input.trim().split(/\s+/)
    const cmd = parts[0]?.toLowerCase()

    switch (cmd) {
      // === Help command ===
      case '/help': {
        const helpText = [
          '**DeepSeek Code — команды**',
          '',
          '**Память:**',
          '  /remember <текст>  — сохранить в память',
          '  /forget <текст>    — удалить из памяти',
          '  /memory            — показать все воспоминания',
          '',
          '**Код и ревью:**',
          '  /review            — провести ревью кода',
          '  /checkpoint        — создать чекпоинт',
          '  /restore           — восстановить чекпоинт',
          '  /compress          — сжать историю диалога',
          '',
          '**Инструменты:**',
          '  /sandbox <cmd>     — выполнить в изолированной среде',
          '  /git <cmd>         — git-команды',
          '  /mcp               — управление MCP-серверами',
          '  /skills [name]     — скиллы агента',
          '  /agents            — список субагентов',
          '  /extensions        — управление расширениями',
          '  /loop <n> <задача> — запустить задачу N раз',
          '',
          '**Настройки:**',
          '  /setup             — мастер первоначальной настройки',
          '  /theme [name]      — сменить тему',
          '  /lang [code]       — сменить язык (ru/en/zh)',
          '  /stats             — статистика сессии',
          '',
          '**Горячие клавиши:**',
          '  Tab                — переключить режим разрешений',
          '  r                  — показать/скрыть рассуждения',
          '  Ctrl+C             — отменить выполнение',
          '  Ctrl+L             — очистить диалог',
          '  PageUp/PageDown    — прокрутить историю чата',
        ].join('\n')
        setMessages(prev => [...prev, { role: 'assistant', content: helpText }])
        return true
      }

      // === Setup command ===
      case '/setup': {
        setSetupStep('lang')
        setMessages([])
        return true
      }

      // === Memory commands ===
      case '/remember': {
        const text = parts.slice(1).join(' ')
        if (!text) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Usage: /remember <text> — save something to memory',
          }])
          return true
        }
        await saveMemory({
          name: `note_${Date.now()}`,
          description: text.slice(0, 80),
          type: 'reference',
          content: text,
        })
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Saved to memory: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`,
        }])
        return true
      }

      case '/forget': {
        const query = parts.slice(1).join(' ')
        if (!query) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /forget <query>' }])
          return true
        }
        const matches = await searchMemories(query)
        if (matches.length === 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'No memories found.' }])
          return true
        }
        for (const m of matches) await deleteMemory(m.name)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Removed ${matches.length} memory/memories matching "${query}"`,
        }])
        return true
      }

      case '/memory': {
        const allMemories = await listMemories()
        if (allMemories.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No memories saved yet. Use /remember <text> to save something.',
          }])
          return true
        }
        const list = allMemories.map((m, i) => `${i + 1}. **${m.name}** — ${m.description}`).join('\n')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**Saved Memories (${allMemories.length}):**\n${list}`,
        }])
        return true
      }

      // === Context commands ===
      case '/compress': {
        const totalLen = messages.reduce((sum, m) => sum + m.content.length, 0)
        const msgCount = messages.length

        // Use API to summarize if we have enough messages
        if (msgCount > 4 && totalLen > 2000) {
          setStatusText('Compressing context...')
          try {
            const compressApi = new DeepSeekAPI({ ...config, apiKey: localApiKey || config.apiKey || '' })
            const summaryMessages: ChatMessage[] = [
              { role: 'system', content: 'Summarize the following conversation concisely. Keep all technical details, errors, decisions, and action items. Output in bullet points.' },
              ...messages.slice(-10).filter(m => m.role !== 'system'),
            ]
            const result = await compressApi.chat(summaryMessages)
            const summary = result.content || 'Summary unavailable.'

            // Replace old messages with summary
            const systemMsg = messages.find(m => m.role === 'system')
            setMessages([
              ...(systemMsg ? [systemMsg] : []),
              { role: 'assistant', content: `📦 **Context Compressed**\n\nOriginal: ${msgCount} messages (~${(totalLen / 1024).toFixed(1)}KB)\n\n**Summary:**\n${summary}` },
            ])
          } catch {
            // Fallback: just report size
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Context compression failed. Current size: ~${(totalLen / 1024).toFixed(1)}KB across ${msgCount} messages.`,
            }])
          }
          setStatusText('Ready')
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Context is small (~${(totalLen / 1024).toFixed(1)}KB, ${msgCount} messages). No compression needed.`,
          }])
        }
        return true
      }

      // === Checkpoint commands ===
      case '/checkpoint': {
        const cpMsg = parts.slice(1).join(' ') || `Checkpoint at ${new Date().toLocaleTimeString()}`
        const cp = await createCheckpoint(cpMsg)
        if (!cp) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Checkpoint requires a git repository.',
          }])
          return true
        }
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Checkpoint created: **${cp.id}**\nFiles: ${cp.files.length > 0 ? cp.files.join(', ') : '(no changes)'}`,
        }])
        return true
      }

      case '/restore': {
        const cpId = parts[1]
        if (!cpId) {
          const cps = await listCheckpoints()
          if (cps.length === 0) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'No checkpoints found.' }])
            return true
          }
          const list = cps.slice(0, 10).map((cp, i) =>
            `${i + 1}. **${cp.id}** — ${cp.message} (${new Date(cp.timestamp).toLocaleString()})`
          ).join('\n')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Recent Checkpoints:**\n${list}\n\nUse \`/restore <id>\` to restore.`,
          }])
          return true
        }
        const ok = await restoreCheckpoint(cpId)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: ok ? `✓ Restored checkpoint: ${cpId}` : `✗ Could not restore checkpoint: ${cpId}`,
        }])
        return true
      }

      // === MCP commands ===
      case '/mcp': {
        const sub = parts[1]?.toLowerCase()
        if (sub === 'list' || !sub) {
          const tools = mcpManager.getAllTools()
          if (tools.length === 0) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'No MCP tools available. Configure servers in `.deepseek-code/mcp.json`.',
            }])
          } else {
            const list = tools.map(t => `- **${t.serverName}/${t.name}**: ${t.description}`).join('\n')
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**MCP Tools (${tools.length}):**\n${list}`,
            }])
          }
        } else if (sub === 'connect') {
          const name = parts.slice(2).join(' ')
          if (!name) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /mcp connect <server-name>' }])
            return true
          }
          const server = mcpManager.getServer(name)
          if (!server) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Server "${name}" not found.` }])
            return true
          }
          await server.connect()
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✓ Connected to MCP server: ${name} (${server.tools.length} tools)`,
          }])
        }
        return true
      }

      // === Skills commands ===
      case '/skills': {
        const name = parts.slice(1).join(' ')
        if (!name) {
          const all = skillsManager.listSkills()
          if (all.length === 0) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'No skills available. Create one in `.deepseek-code/skills/<name>/SKILL.md`.',
            }])
          } else {
            const list = all.map(s => `- **${s.name}**: ${s.description}`).join('\n')
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**Available Skills (${all.length}):**\n${list}\n\nUse \`/skills <name>\` to run a skill.`,
            }])
          }
        } else {
          const skill = skillsManager.getSkill(name)
          if (!skill) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Skill "${name}" not found.` }])
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**Running skill: ${skill.name}**\n\n${skill.prompt}`,
            }])
          }
        }
        return true
      }

      // === Subagent commands ===
      case '/agents': {
        const allAgents = subAgentManager['agents']
        if (allAgents.size === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No subagents configured. Create them in `.deepseek-code/agents/`.',
          }])
        } else {
          const list = Array.from(allAgents.keys()).map(name => `- **${name}**`).join('\n')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Registered Subagents:**\n${list}`,
          }])
        }
        return true
      }

      // === Review ===
      case '/review': {
        const sub = parts[1]?.toLowerCase()
        const reviewOptions: ReviewOptions = {}

        if (sub === 'all') {
          reviewOptions.files = ['src']
        } else if (sub === 'diff') {
          reviewOptions.gitRef = parts[2] ?? 'HEAD'
        } else if (sub === 'auto') {
          reviewOptions.autoFix = true
        }

        setStatusText('Reviewing code...')
        setMessages(prev => [...prev, { role: 'assistant', content: '🔍 Running code review...' }])

        try {
          const result = await reviewCode(config, reviewOptions)
          const issueList = formatReviewReport(result)
          String(result.issues.slice(0, 20).map(i =>
            `- [${i.severity.toUpperCase()}] ${i.file}:${i.line} — ${i.message}`
          ).join('\n'))

          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Code Review Results**\n\nScore: **${result.score}/100**\nIssues: ${result.issues.length}\nDuration: ${(result.durationMs / 1000).toFixed(1)}s\n\n${issueList || '✅ No issues found.'}\n\n${result.summary}`,
          }])
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Review failed: ${(err as Error).message}`,
          }])
        }

        setStatusText('Ready')
        return true
      }

      // === Sandbox ===
      case '/sandbox': {
        const cmd = parts.slice(1).join(' ')
        if (!cmd) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Usage: /sandbox <command> — run command in isolated sandbox',
          }])
          return true
        }

        setStatusText('Running in sandbox...')
        try {
          const result = await sandbox.execute(cmd, { timeout: 60000 })
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Sandbox Result** (${(result.durationMs / 1000).toFixed(1)}s, exit: ${result.exitCode})\n\n${result.stdout.slice(0, 2000)}${result.stderr ? `\n\n**Stderr:**\n${result.stderr.slice(0, 1000)}` : ''}`,
          }])
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Sandbox error: ${(err as Error).message}`,
          }])
        }
        setStatusText('Ready')
        return true
      }

      // === Git commands ===
      case '/git': {
        const sub = parts[1]?.toLowerCase()

        if (sub === 'commit' || !sub) {
          const msg = parts.slice(2).join(' ') || 'Update'
          const result = await gitIntegration.commit({ message: msg, all: true })
          if (result.success) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✓ Committed: \`${msg}\` (${result.hash?.slice(0, 7)})`,
            }])
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✗ Commit failed: ${result.error}`,
            }])
          }
        } else if (sub === 'branch') {
          const name = parts[2]
          if (!name) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /git branch <name>' }])
            return true
          }
          const result = await gitIntegration.createBranch({ name })
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: result.success ? `✓ Switched to branch: ${name}` : `✗ ${result.error}`,
          }])
        } else if (sub === 'diff') {
          const diff = await gitIntegration.getDiff(parts[2])
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `\`\`\`diff\n${diff.slice(0, 3000)}\n\`\`\``,
          }])
        } else if (sub === 'status') {
          const { execSync } = await import('node:child_process')
          const status = execSync('git status', { encoding: 'utf-8', windowsHide: true })
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `\`\`\`\n${status}\n\`\`\``,
          }])
        }
        return true
      }

      // === Loop / Scheduler ===
      case '/loop': {
        const sub = parts[1]?.toLowerCase()

        if (sub === 'list') {
          const tasks = scheduler.listTasks()
          if (tasks.length === 0) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'No active tasks.' }])
          } else {
            const list = tasks.map((t, i) =>
              `${i + 1}. **${t.prompt.slice(0, 40)}** — every ${(t.interval / 1000).toFixed(0)}s (${t.runCount}/${t.maxRuns ?? '∞'})`
            ).join('\n')
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**Active Tasks:**\n${list}`,
            }])
          }
        } else if (sub === 'clear') {
          scheduler.clearAll()
          setMessages(prev => [...prev, { role: 'assistant', content: '✓ All tasks cleared.' }])
        } else if (sub) {
          // Parse interval and prompt
          const intervalStr = sub
          const prompt = parts.slice(2).join(' ') || 'check status'
          const intervalMs = Scheduler.parseInterval(intervalStr)
          const task = scheduler.addTask(prompt, intervalMs)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✓ Task scheduled: "${prompt}" every ${intervalStr} (ID: ${task.id})`,
          }])
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Usage:\n  /loop <interval> <prompt> — schedule task\n  /loop list — list tasks\n  /loop clear — clear all tasks',
          }])
        }
        return true
      }

      // === Stats ===
      case '/stats': {
        const mcpTools = mcpManager.getAllTools().length
        const skills = skillsManager.listSkills().length
        const agents = subAgentManager['agents'].size
        const tasks = scheduler.count
        const exts = extensionManager.listExtensions().length
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**Session Statistics:**\n- Messages: ${messages.length}\n- MCP Tools: ${mcpTools}\n- Skills: ${skills}\n- Subagents: ${agents}\n- Scheduled Tasks: ${tasks}\n- Extensions: ${exts}\n- Theme: ${themeManager.theme.name}\n- Language: ${i18n.getLocale()}\n- Approval Mode: ${approvalMode}`,
        }])
        return true
      }

      // === Theme ===
      case '/theme': {
        const name = parts[1]
        if (!name) {
          const themes = themeManager.listThemes().map(t => `- **${t.name}**: ${t.description}`).join('\n')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Available Themes:**\n${themes}\n\nCurrent: **${themeManager.theme.name}**\nUse \`/theme <name>\` to switch.`,
          }])
        } else if (themeManager.setTheme(name)) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✓ Theme switched to: **${name}**`,
          }])
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✗ Theme "${name}" not found. Use \`/theme\` to list available themes.`,
          }])
        }
        return true
      }

      // === Language / i18n ===
      case '/lang':
      case '/language': {
        const code = parts[1] as Locale | undefined
        if (!code) {
          const locales = i18n.listLocales().map(l => `- **${l.code}**: ${l.name}`).join('\n')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Available Languages:**\n${locales}\n\nCurrent: **${i18n.getLocale()}**\nUse \`/lang <code>\` to switch.`,
          }])
        } else {
          i18n.setLocale(code)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✓ Language switched to: **${code}**`,
          }])
        }
        return true
      }

      // === Extensions ===
      case '/extensions': {
        const all = extensionManager.listExtensions()
        if (all.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No extensions installed. Create them in `.deepseek-code/extensions/<name>/package.json`.',
          }])
        } else {
          const list = all.map(e => `- **${e.name}** v${e.version}: ${e.description}`).join('\n')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Installed Extensions (${all.length}):**\n${list}`,
          }])
        }
        return true
      }

      // === Followup Suggestions ===
      case '/followup': {
        const lastMsg = messages[messages.length - 1]
        if (!lastMsg || lastMsg.role !== 'assistant') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No assistant message to suggest followups for.',
          }])
        } else {
          const msgText = typeof lastMsg.content === 'string' ? lastMsg.content : ''
          const suggestions = generateFollowups(msgText)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Suggested Follow-ups:**\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
          }])
        }
        return true
      }

      default:
        return false
    }
  }, [messages, approvalMode])

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
        content: 'Please complete the setup first. Use /setup to restart.',
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
          content: `Command error: ${(err as Error).message}`,
        }])
        return
      }
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
    setStatusText('Processing...')
    setToolCalls([])
    setReasoning('')
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
            setStatusText(result.success ? `✅ ${result.toolName} done` : `❌ ${result.toolName} failed`)
          },
          onReasoningChunk: (chunk) => {
            // Debounce reasoning updates to 100ms to avoid UI jitter
            reasoningPendingRef.current += chunk
            if (!reasoningTimerRef.current) {
              reasoningTimerRef.current = setTimeout(() => {
                setReasoning(reasoningPendingRef.current)
                reasoningTimerRef.current = null
              }, 100)
            }
          },
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
          onError: (error) => {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Error: ${error.message}`,
            }])
          },
          onApprovalRequest: async (toolName, args) => {
            if (approvalMode === 'yolo') return true
            if (approvalMode === 'auto-edit' && (toolName === 'write_file' || toolName === 'edit' || toolName === 'chrome')) return true
            if (approvalMode === 'plan') return false

            // Default mode — ask user for confirmation
            return new Promise<boolean>((resolve) => {
              pendingApprovalResolveRef.current = resolve
              setPendingApproval({ toolName, args, resolve })
            })
          },
        }
      )

      const finalResponse = await agentLoopRef.current.run(input, messages)

      // Flush pending reasoning before any I/O
      if (reasoningTimerRef.current) {
        clearTimeout(reasoningTimerRef.current)
        reasoningTimerRef.current = null
      }
      const finalReasoning = reasoningPendingRef.current
      reasoningPendingRef.current = ''

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
      if (finalReasoning) setReasoning(finalReasoning)
      setIsProcessing(false)
      setStatusText('Ready')

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
        friendlyMsg = 'API authentication failed. Your API key may be invalid. Run `/setup` to enter a new key.'
      } else if (msg.includes('429') || msg.includes('rate limit')) {
        friendlyMsg = 'Rate limited by API. Please wait a moment and try again.'
      } else if (msg.includes('5') || msg.includes('server error') || msg.includes('Service Unavailable')) {
        friendlyMsg = 'DeepSeek API server error. Please try again later.'
      } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
        friendlyMsg = 'Cannot reach DeepSeek API. Check your internet connection.'
      } else if (msg.includes('timed out')) {
        friendlyMsg = 'Request timed out. Check your internet connection or API endpoint.'
      } else {
        friendlyMsg = `Error: ${msg}`
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
      setStatusText('Ready')
      // Clear any pending approval (covers error/abort exit paths)
      if (pendingApprovalResolveRef.current) {
        pendingApprovalResolveRef.current(false)
        pendingApprovalResolveRef.current = null
      }
      setPendingApproval(null)
      // Flush pending reasoning
      if (reasoningTimerRef.current) {
        clearTimeout(reasoningTimerRef.current)
        reasoningTimerRef.current = null
      }
      if (reasoningPendingRef.current) {
        setReasoning(reasoningPendingRef.current)
        reasoningPendingRef.current = ''
      }
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
        setStatusText('Cancelled')
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
      // Handle approval dialog
      if (pendingApproval) {
        if (_input === 'y' || _input === 'Y' || key.return) {
          const resolve = pendingApproval.resolve
          setPendingApproval(null)
          pendingApprovalResolveRef.current = null
          resolve(true)
        } else if (_input === 'n' || _input === 'N' || key.escape) {
          const resolve = pendingApproval.resolve
          setPendingApproval(null)
          pendingApprovalResolveRef.current = null
          resolve(false)
        }
        return
      }
      // R key to toggle reasoning view
      if (_input === 'r' && !key.ctrl && !key.meta) {
        setShowReasoning(prev => !prev)
        return
      }
      // Tab for approval mode cycling + save to config
      if (key.tab) {
        setApprovalMode(prev => {
          const modes: ApprovalMode[] = ['plan', 'default', 'auto-edit', 'yolo']
          const newMode = modes[(modes.indexOf(prev) + 1) % modes.length]
          // Save mode change to config
          saveConfig({ ...config, approvalMode: newMode }).catch(() => {})
          return newMode
        })
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
        setLangCursor(prev => Math.min(prev + 1, langOptions.length - 1))
      } else if (key.upArrow) {
        setLangCursor(prev => Math.max(prev - 1, 0))
      } else if (key.return) {
        handleLangSelect()
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
        setLocalTheme(themes[next].name)
      } else if (key.upArrow) {
        const prev = Math.max(themeCursor - 1, 0)
        themeManager.setTheme(themes[prev].name)
        setThemeCursor(prev)
        setLocalTheme(themes[prev].name)
      } else if (key.return) {
        setSetupStep('mode')
        setModeCursor(0)
      }
      return
    }

    // Step 4: Mode selection — arrows + Enter + Escape
    if (step === 'mode') {
      if (key.escape) {
        setSetupStep('theme')
        setThemeCursor(0)
        return
      }
      if (key.downArrow) {
        setModeCursor(prev => Math.min(prev + 1, modeOptions.length - 1))
      } else if (key.upArrow) {
        setModeCursor(prev => Math.max(prev - 1, 0))
      } else if (key.return) {
        handleModeSelect(modeOptions[modeCursor])
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
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [isProcessing])

  const handleClear = useCallback(() => {
    setMessages([])
    setScrollMode('follow')
    setNewMessagesWhilePaused(false)
    setChatScrollOffset(0)
  }, [])
  const handleExit = useCallback(() => { exit() }, [exit])

  return (
    <Box flexDirection='column' height='100%'>
      {setupStep !== 'done'
        ? <SetupWizard state={{
            step: setupStep,
            apiKeyError,
            langCursor,
            themeCursor,
            modeCursor,
            langOptions,
            modeOptions,
          }} />
        : (
                <Box flexDirection='column' flexGrow={1}>
                  <Logo />
                  <ChatView messages={messages} scrollOffset={chatScrollOffset} hasNewMessages={newMessagesWhilePaused} />
                  {pendingApproval && (
                    <Box flexDirection='column' marginLeft={2} marginBottom={1} borderStyle='round' borderColor='yellow'>
                      <Box>
                        <Text bold color='yellow'>🔔 Approve tool call?</Text>
                      </Box>
                      <Box marginLeft={1}>
                        <Text bold>{pendingApproval.toolName}</Text>
                      </Box>
                      <Box marginLeft={1}>
                        <Text dimColor>{JSON.stringify(pendingApproval.args, null, 2).slice(0, 200)}</Text>
                      </Box>
                      <Box marginTop={1}>
                        <Text>
                          <Text bold color='green'>y</Text>
                          <Text>/</Text>
                          <Text bold color='red'>n</Text>
                          <Text> — approve/reject  </Text>
                          <Text dimColor>Enter=approve  Esc=reject</Text>
                        </Text>
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
        emptyHint={emptyInputHint}
        onImagePaste={(base64, mimeType) => {
          const model = config.model ?? ''
          if (!model.includes('vl') && !model.includes('vision')) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `⚠️ Image paste requires a vision-capable model.\nCurrent model: ${model || 'unknown'}\nUse a model with "vl" or "vision" in its name.`,
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
      />
    </Box>
  )
}
