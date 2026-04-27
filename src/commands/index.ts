import type { ChatMessage } from '../api/index.js'
import { saveMemory, listMemories, deleteMemory, searchMemories } from '../core/memory.js'
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../core/checkpoint.js'
import { mcpManager } from '../core/mcp.js'
import { subAgentManager } from '../core/subagent.js'
import { skillsManager } from '../core/skills.js'
import { reviewCode, formatReviewReport } from '../core/review.js'
import { sandbox } from '../core/sandbox.js'
import { getSandboxUnsupportedCard } from '../ui/activity-cards.js'
import { gitIntegration } from '../core/git.js'
import { scheduler, Scheduler } from '../core/scheduler.js'
import { themeManager } from '../core/themes.js'
import { i18n, type Locale } from '../core/i18n.js'
import { extensionManager } from '../core/extensions.js'
import { DeepSeekAPI } from '../api/index.js'
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js'
import { saveConfig } from '../config/loader.js'
import type { SetupStep } from '../ui/setup-wizard.js'

// ─── Help text ───────────────────────────────────────────────────────────────

const HELP_TEXT = `Available commands:

  /help              Показать справку
  /setup             Настройки (язык, API-ключ, тема, режим разрешений)
  /remember <text>   Сохранить в память
  /forget <text>     Удалить из памяти по поиску
  /memory            Показать все сохранённые записи
  /compress          Сжать историю диалога
  /checkpoint        Сохранить чекпоинт
  /restore [id]      Восстановить чекпоинт
  /mcp <list|connect>  Управление MCP-серверами
  /skills [name]     Список или просмотр навыков агента
  /agents            Список активных под-агентов
  /review <all|diff|auto>  Проверка кода
  /sandbox <cmd>     Выполнить команду в песочнице
  /git <commit|branch|diff|status>  Git-операции
  /loop <interval>   Запланировать повторяющуюся задачу
  /stats             Статистика сессии
  /theme <name>      Сменить тему оформления
  /lang <lang>       Сменить язык (en/ru/zh)
  /extensions        Список расширений
  /followup          Сгенерировать предложения продолжения
  /logs              Показать журнал действий
  /plan              Показать план работы
  /clear             Очистить чат`

// ─── Command handler type ────────────────────────────────────────────────────

export interface SlashCommandContext {
  config: DeepSeekConfig
  approvalMode: ApprovalMode
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setStatusText: React.Dispatch<React.SetStateAction<string>>
  setSetupStep: (step: SetupStep) => void
  /** Called when /theme is entered without arguments — opens interactive picker */
  onThemePicker?: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateFollowups (lastContent: string): string[] {
  const suggestions: string[] = []

  if (/error|Error|failed/.test(lastContent)) {
    suggestions.push('Fix the error and try again')
    suggestions.push('Show me the full error trace')
    suggestions.push('Debug this issue step by step')
  }

  if (/```|code/.test(lastContent)) {
    suggestions.push('Explain this code in detail')
    suggestions.push('Add tests for this code')
    suggestions.push('Optimize this code')
  }

  if (/review|Review/.test(lastContent)) {
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

// ─── Command handlers ────────────────────────────────────────────────────────

async function cmdHelp (ctx: SlashCommandContext): Promise<boolean> {
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: HELP_TEXT,
  }])
  return true
}

async function cmdSetup (ctx: SlashCommandContext): Promise<boolean> {
  ctx.setSetupStep('lang')
  ctx.setMessages([])
  return true
}

async function cmdRemember (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const text = input.slice('/remember'.length).trim()
  if (!text) {
    ctx.setMessages(prev => [...prev, {
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
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: `✓ Saved to memory: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`,
  }])
  return true
}

async function cmdForget (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const query = input.slice('/forget'.length).trim()
  if (!query) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Usage: /forget <query>',
    }])
    return true
  }
  const results = await searchMemories(query)
  if (results.length === 0) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'No matching memories found.',
    }])
    return true
  }
  for (const mem of results) {
    await deleteMemory(mem.name)
  }
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: `✓ Deleted ${results.length} memory/memories matching: "${query}"`,
  }])
  return true
}

async function cmdMemory (ctx: SlashCommandContext): Promise<boolean> {
  const memories = await listMemories()
  if (memories.length === 0) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'No memories saved yet. Use /remember <text> to save something.',
    }])
    return true
  }
  const memoryList = memories.map((m, i) =>
    `${i + 1}. **${m.name}** — ${m.description}`
  ).join('\n')
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: `📝 **Memories** (${memories.length}):\n\n${memoryList}`,
  }])
  return true
}

async function cmdCompress (ctx: SlashCommandContext): Promise<boolean> {
  const totalLen = ctx.messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : ''
    return sum + content.length
  }, 0)
  const msgCount = ctx.messages.length

  if (msgCount > 4 && totalLen > 2000) {
    ctx.setStatusText('Compressing...')
    try {
      const api = new DeepSeekAPI({ ...ctx.config, apiKey: ctx.config.apiKey })
      const result = await api.chat([
        { role: 'system', content: 'Summarize the following conversation concisely. Keep all technical details, errors, decisions, and action items. Output in bullet points.' },
        ...ctx.messages.slice(-10).filter(m => m.role !== 'system').map(m => ({
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
      ])
      const summary = result.content || 'Summary unavailable.'
      const systemMsg = ctx.messages.find(m => m.role === 'system')
      ctx.setMessages([
        ...(systemMsg ? [systemMsg] : []),
        { role: 'assistant', content: `📦 **Context Compressed**\n\nOriginal: ${msgCount} messages (~${(totalLen / 1024).toFixed(1)}KB)\n\n**Summary:**\n${summary}` },
      ])
    } catch {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Context compression failed. Current size: ~${(totalLen / 1024).toFixed(1)}KB across ${msgCount} messages.`,
      }])
    }
  } else {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Context is small (~${(totalLen / 1024).toFixed(1)}KB, ${msgCount} messages). No compression needed.`,
    }])
  }
  ctx.setStatusText('Ready')
  return true
}

async function cmdCheckpoint (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const cpMsg = input.slice('/checkpoint'.length).trim() || `Checkpoint at ${new Date().toLocaleTimeString()}`
  const cp = await createCheckpoint(cpMsg)
  if (!cp) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Checkpoint requires a git repository.',
    }])
    return true
  }
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: `✓ Checkpoint created: **${cp.id}**\nFiles: ${cp.files.length > 0 ? cp.files.join(', ') : '(no changes)'}`,
  }])
  return true
}

async function cmdRestore (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const arg = input.slice('/restore'.length).trim()
  if (!arg) {
    const checkpoints = await listCheckpoints()
    if (checkpoints.length === 0) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'No checkpoints found.',
      }])
      return true
    }
    const list = checkpoints.slice(0, 10).map((cp, i) =>
      `${i + 1}. **${cp.id}** — ${cp.message} (${new Date(cp.timestamp).toLocaleString()})`
    ).join('\n')
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `📋 **Checkpoints:**\n${list}\n\nUse \`/restore <id>\` to restore.`,
    }])
    return true
  }
  ctx.setStatusText('Restoring checkpoint...')
  try {
    const restoredMessages = await restoreCheckpoint(arg)
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: restoredMessages
        ? `✓ Restored checkpoint: ${arg}`
        : `✗ Could not restore checkpoint: ${arg}`,
    }])
  } catch (err) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `❌ Restore failed: ${(err as Error).message}`,
    }])
  }
  ctx.setStatusText('Ready')
  return true
}

async function cmdMcp (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const sub = input.slice('/mcp'.length).trim()
  if (sub === 'list' || !sub) {
    const tools = mcpManager.getAllTools()
    if (tools.length === 0) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'No MCP tools available. Configure servers in `.deepseek-code/mcp.json`.',
      }])
    } else {
      const list = tools.map(t => `- **${t.serverName}/${t.name}**: ${t.description}`).join('\n')
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**MCP Tools (${tools.length}):**\n${list}`,
      }])
    }
  } else if (sub.startsWith('connect ')) {
    const name = sub.slice('connect '.length).trim()
    const server = mcpManager.getServer(name)
    if (!server) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Server "${name}" not found.`,
      }])
      return true
    }
    try {
      await server.connect()
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✓ Connected to MCP server: ${name} (${server.tools.length} tools)`,
      }])
    } catch (err) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ MCP connection failed: ${(err as Error).message}`,
      }])
    }
  } else {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Usage: `/mcp list` or `/mcp connect <server-name>`',
    }])
  }
  return true
}

async function cmdSkills (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const name = input.slice('/skills'.length).trim()
  if (name) {
    const skill = skillsManager.getSkill(name)
    if (!skill) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Skill "${name}" not found.`,
      }])
      return true
    }
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `📖 **Skill: ${skill.name}**\n\n${skill.description || ''}`,
    }])
  } else {
    const skills = skillsManager.listSkills()
    const list = skills.length === 0
      ? 'No skills available. Create one in `.deepseek-code/skills/<name>/SKILL.md`.'
      : skills.map(s => `- **${s.name}**: ${s.description}`).join('\n')
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `📖 **Available Skills**\n\n${list}`,
    }])
  }
  return true
}

async function cmdAgents (ctx: SlashCommandContext): Promise<boolean> {
  const allAgents = subAgentManager['agents']
  if (allAgents.size === 0) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'No subagents configured. Create them in `.deepseek-code/agents/`.',
    }])
  } else {
    const list = Array.from(allAgents.keys()).map(name => `- **${name}**`).join('\n')
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `**Registered Subagents:**\n${list}`,
    }])
  }
  return true
}

async function cmdReview (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const sub = input.slice('/review'.length).trim()
  const options: Record<string, unknown> = {}
  if (sub === 'all') {
    options.files = ['src']
  } else if (sub.startsWith('diff')) {
    options.gitRef = sub.slice('diff'.length).trim() || 'HEAD'
  } else if (sub === 'auto') {
    options.autoFix = true
  }

  ctx.setStatusText('Reviewing code...')
  ctx.setMessages(prev => [...prev, { role: 'assistant', content: '🔍 Running code review...' }])

  try {
    const result = await reviewCode(ctx.config, options)
    const report = formatReviewReport(result)
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `**Code Review Results**\n\nScore: **${result.score}/100**\nIssues: ${result.issues.length}\nDuration: ${(result.durationMs / 1000).toFixed(1)}s\n\n${report || '✅ No issues found.'}\n\n${result.summary}`,
    }])
  } catch (err) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Review failed: ${(err as Error).message}`,
    }])
  }
  ctx.setStatusText('Ready')
  return true
}

async function cmdSandbox (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const cmd = input.slice('/sandbox'.length).trim()
  if (!cmd) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Usage: /sandbox <command> — run command in isolated sandbox',
    }])
    return true
  }

  // Check platform capability
  const cap = sandbox.getCapabilityInfo()
  if (!cap.supported) {
    getSandboxUnsupportedCard()
    ctx.setMessages(prev => [...prev, {
      role: 'tool',
      content: JSON.stringify({
        type: 'tool_activity_card',
        toolCalls: [{
          id: 'sandbox-check',
          name: 'run_shell_command',
          arguments: { command: cmd },
          status: 'failed',
          error: cap.reason,
        }],
        status: 'live'
      }),
    }])
    return true
  }

  ctx.setStatusText('Running in sandbox...')
  try {
    const result = await sandbox.execute(cmd, { timeout: 60000 })
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: result.exitCode === 0
        ? `✅ **Sandbox Result** (${(result.durationMs / 1000).toFixed(1)}s, exit: ${result.exitCode})\n\n${result.stdout.slice(0, 2000)}${result.stderr ? `\n\n**Stderr:**\n${result.stderr.slice(0, 1000)}` : ''}`
        : `❌ **Sandbox Error** (exit: ${result.exitCode})\n\n${result.stderr.slice(0, 2000)}`,
    }])
  } catch (err) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Sandbox error: ${(err as Error).message}`,
    }])
  }
  ctx.setStatusText('Ready')
  return true
}

async function cmdGit (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const parts = input.slice('/git'.length).trim().split(/\s+/)
  const sub = parts[0]
  const args = parts.slice(1).join(' ')

  switch (sub) {
    case 'commit':
    case undefined: {
      const msg = args || 'Update'
      ctx.setStatusText('Committing...')
      try {
        const result = await gitIntegration.commit({ message: msg, all: true })
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.success
            ? `✓ Committed: \`${msg}\` (${result.hash?.slice(0, 7)})`
            : `✗ Commit failed: ${result.error}`,
        }])
      } catch (err) {
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Commit failed: ${(err as Error).message}`,
        }])
      }
      ctx.setStatusText('Ready')
      return true
    }
    case 'branch': {
      const name = args
      if (!name) {
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Usage: /git branch <name>',
        }])
        return true
      }
      try {
        const result = await gitIntegration.createBranch({ name })
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.success
            ? `🌿 Switched to branch: ${name}`
            : `✗ ${result.error}`,
        }])
      } catch (err) {
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Branch failed: ${(err as Error).message}`,
        }])
      }
      return true
    }
    case 'diff': {
      try {
        const diff = await gitIntegration.getDiff(parts[1] || undefined)
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: diff ? `\`\`\`diff\n${diff.slice(0, 3000)}\n\`\`\`` : 'No changes to show.',
        }])
      } catch (err) {
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Diff failed: ${(err as Error).message}`,
        }])
      }
      return true
    }
    case 'status': {
      try {
        const { execSync } = await import('node:child_process')
        const status = execSync('git status', { encoding: 'utf-8', windowsHide: true })
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: `\`\`\`\n${status}\n\`\`\``,
        }])
      } catch (err) {
        ctx.setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Status failed: ${(err as Error).message}`,
        }])
      }
      return true
    }
    default:
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Usage: `/git commit <msg>`, `/git branch <name>`, `/git diff`, `/git status`',
      }])
      return true
  }
}

async function cmdLoop (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const sub = input.slice('/loop'.length).trim()

  if (sub === 'list') {
    const tasks = scheduler.listTasks()
    if (tasks.length === 0) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'No active tasks.',
      }])
    } else {
      const list = tasks.map((t, i) =>
        `${i + 1}. **${t.prompt.slice(0, 40)}** — every ${(t.interval / 1000).toFixed(0)}s (${t.runCount}/${t.maxRuns ?? '∞'})`
      ).join('\n')
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Active Tasks:**\n${list}`,
      }])
    }
  } else if (sub === 'clear') {
    scheduler.clearAll()
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: '✓ All tasks cleared.',
    }])
  } else if (sub) {
    const parts = sub.split(/\s+/)
    const intervalStr = parts[0]
    const prompt = parts.slice(1).join(' ') || 'check status'
    const intervalMs = Scheduler.parseInterval(intervalStr)
    if (!intervalMs) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Invalid interval: "${intervalStr}". Use format like "5m", "1h", "30s".`,
      }])
      return true
    }
    const task = scheduler.addTask(prompt, intervalMs)
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `✓ Task scheduled: "${prompt}" every ${intervalStr} (ID: ${task.id})`,
    }])
  } else {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Usage:\n  /loop <interval> <prompt> — schedule task\n  /loop list — list tasks\n  /loop clear — clear all tasks',
    }])
  }
  return true
}

async function cmdStats (ctx: SlashCommandContext): Promise<boolean> {
  const mcpTools = mcpManager.getAllTools().length
  const skills = skillsManager.listSkills().length
  const agents = subAgentManager['agents'].size
  const tasks = scheduler.count
  const exts = extensionManager.listExtensions().length
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: `**Session Statistics:**\n- Messages: ${ctx.messages.length}\n- MCP Tools: ${mcpTools}\n- Skills: ${skills}\n- Subagents: ${agents}\n- Scheduled Tasks: ${tasks}\n- Extensions: ${exts}\n- Theme: ${themeManager.theme.name}\n- Language: ${i18n.getLocale()}\n- Approval Mode: ${ctx.approvalMode}`,
  }])
  return true
}

async function cmdTheme (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const themeName = input.slice('/theme'.length).trim()
  if (!themeName) {
    if (ctx.onThemePicker) {
      ctx.onThemePicker()
    } else {
      const themes = themeManager.listThemes()
      const list = themes.map(t => `- **${t.name}**: ${t.description}`).join('\n')
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Available Themes:**\n${list}\n\nCurrent: **${themeManager.theme.name}**\nUse \`/theme <name>\` to switch.`,
      }])
    }
    return true
  }
  const success = themeManager.setTheme(themeName)
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: success ? `🎨 Theme changed to: **${themeName}**` : `❌ Theme "${themeName}" not found.`,
  }])
  return true
}

async function cmdLang (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const code = input.split(/\s+/).pop()?.toLowerCase() as Locale | undefined
  if (!code || !['en', 'ru', 'zh'].includes(code)) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Usage: `/lang en|ru|zh`',
    }])
    return true
  }
  i18n.setLocale(code)
  await saveConfig({ ...ctx.config, language: code })
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: `🌐 Language changed to: **${code}**`,
  }])
  return true
}

async function cmdExtensions (ctx: SlashCommandContext): Promise<boolean> {
  const exts = extensionManager.listExtensions()
  if (exts.length === 0) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'No extensions installed. Create them in `.deepseek-code/extensions/<name>/package.json`.',
    }])
  } else {
    const list = exts.map(e => `- **${e.name}** v${e.version}: ${e.description}`).join('\n')
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `**Installed Extensions (${exts.length}):**\n${list}`,
    }])
  }
  return true
}

async function cmdFollowup (ctx: SlashCommandContext): Promise<boolean> {
  const lastMsg = ctx.messages.filter(m => m.role === 'assistant').pop()
  const lastContent = lastMsg && typeof lastMsg.content === 'string' ? lastMsg.content : ''
  const suggestions = generateFollowups(lastContent)
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: `💡 **Follow-up suggestions:**\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
  }])
  return true
}

async function cmdLogs (ctx: SlashCommandContext): Promise<boolean> {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')

  const logDir = join(homedir(), '.deepseek-code', 'logs')
  try {
    const files = readdirSync(logDir).filter(f => f.endsWith('.log')).sort().reverse().slice(0, 10)
    if (files.length === 0) {
      ctx.setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'No log files found in `~/.deepseek-code/logs/`.',
      }])
      return true
    }
    const latestLog = readFileSync(join(logDir, files[0]), 'utf-8').slice(-3000)
    const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n')
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `📋 **Recent Logs** (${files.length} files):\n\n${fileList}\n\n**Tail of ${files[0]}:**\n\`\`\`\n${latestLog}\n\`\`\``,
    }])
  } catch {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'No log files found. Logging directory does not exist.',
    }])
  }
  return true
}

async function cmdPlan (ctx: SlashCommandContext): Promise<boolean> {
  const card = {
    type: 'tool_activity_card' as const,
    toolCalls: [{
      id: 'plan-card',
      name: 'tasks',
      arguments: {} as Record<string, unknown>,
      status: 'completed' as const,
      result: JSON.stringify({
        type: 'tasks' as const,
        current: 'Implementing UX cards for tool actions',
        completed: [
          'Activity card types designed (Shell, File, Error, Unsupported, Tasks)',
          'activity-cards.tsx created with all 5 card components',
          'ChatView integration — tool calls render as proper cards',
          'Sandbox capability guard for Windows',
        ],
        next: [
          'Verify typecheck + build pass',
          'Test card rendering in TUI',
        ],
        errors: [],
      }),
    }],
    status: 'compact' as const,
  }
  ctx.setMessages(prev => [...prev, {
    role: 'tool',
    content: JSON.stringify(card),
  }])
  return true
}

// ─── Command registry ────────────────────────────────────────────────────────

interface CommandEntry {
  name: string
  handler: (ctx: SlashCommandContext, input: string) => Promise<boolean>
}

const commands: CommandEntry[] = [
  { name: '/help', handler: cmdHelp },
  { name: '/setup', handler: cmdSetup },
  { name: '/remember', handler: cmdRemember },
  { name: '/forget', handler: cmdForget },
  { name: '/memory', handler: cmdMemory },
  { name: '/compress', handler: cmdCompress },
  { name: '/checkpoint', handler: cmdCheckpoint },
  { name: '/restore', handler: cmdRestore },
  { name: '/mcp', handler: cmdMcp },
  { name: '/skills', handler: cmdSkills },
  { name: '/agents', handler: cmdAgents },
  { name: '/review', handler: cmdReview },
  { name: '/sandbox', handler: cmdSandbox },
  { name: '/git', handler: cmdGit },
  { name: '/loop', handler: cmdLoop },
  { name: '/stats', handler: cmdStats },
  { name: '/theme', handler: cmdTheme },
  { name: '/lang', handler: cmdLang },
  { name: '/language', handler: cmdLang },
  { name: '/extensions', handler: cmdExtensions },
  { name: '/followup', handler: cmdFollowup },
  { name: '/logs', handler: cmdLogs },
  { name: '/plan', handler: cmdPlan },
]

const commandMap = new Map<string, CommandEntry>()
for (const cmd of commands) {
  commandMap.set(cmd.name, cmd)
}

// ─── Aliases ─────────────────────────────────────────────────────────────────

const commandAliases = new Map<string, string>([
  ['/h', '/help'],
  ['/?', '/help'],
])

// ─── Public API ──────────────────────────────────────────────────────────────

export async function executeSlashCommand (input: string, ctx: SlashCommandContext): Promise<boolean> {
  const parts = input.trim().split(/\s+/)
  let cmdName = parts[0]?.toLowerCase()

  // Resolve alias
  const resolved = commandAliases.get(cmdName)
  if (resolved) {
    cmdName = resolved
  }

  const entry = commandMap.get(cmdName)
  if (!entry) return false
  return entry.handler(ctx, input)
}
