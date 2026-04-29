import { platform } from 'node:os'
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
import type { MetricsCollector } from '../core/metrics.js'
import { saveConfig } from '../config/loader.js'
import type { SetupStep } from '../ui/setup-wizard.js'
import { getDefaultTools, getToolsForMode } from '../tools/registry.js'
import { browserTest, getLastBrowserTestResult, browserRealTest } from '../tools/chrome.js'
import { chromeManager } from '../tools/chrome-manager.js'

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
  /** Show a transient service notice (does NOT add to chat messages, does NOT break empty-state) */
  addServiceNotice?: (text: string) => void
  /** Returns current session metrics (tokens, cost, tool calls) */
  getMetrics?: () => MetricsCollector
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
  const lines = ['**Available commands:**', '']
  for (const cmd of COMMANDS) {
    if (cmd.name === '/language') continue
    lines.push(`  ${cmd.name.padEnd(22)} ${cmd.description}`)
  }
  lines.push('', '  /clear                 Clear chat history (with confirmation)')
  lines.push('', '**Keyboard shortcuts:**', '')
  lines.push('  Ctrl+L                 Clear chat (opens confirmation dialog)')
  lines.push('  Ctrl+C                 Cancel running agent / double-tap to exit')
  lines.push('  Alt+V                  Paste image from clipboard (vision models only)')
  if (platform() === 'win32') {
    lines.push('  **Windows note:** If Alt+V does not work, ensure your terminal sends')
    lines.push('  proper Alt/Meta sequences. Windows Terminal ≥ 1.14 works correctly.')
    lines.push('  In older terminals try: Settings → Compatibility → "Use Alt as Meta key".')
  }
  lines.push('  Tab                    Cycle approval mode: plan → default → auto-edit → turbo')
  lines.push('  PageUp / PageDown      Scroll chat history')
  lines.push('  End                    Jump to latest message')
  lines.push('  Shift+Enter            Insert newline in input')
  ctx.setMessages(prev => [...prev, { role: 'assistant', content: lines.join('\n') }])
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
  const metrics = ctx.getMetrics?.()
  const usage = metrics?.getTokenUsage()
  const cost = metrics ? metrics.estimatedCostUSD(ctx.config.model) : 0

  let content = `**Session Statistics:**\n- Messages: ${ctx.messages.length}\n- MCP Tools: ${mcpTools}\n- Skills: ${skills}\n- Subagents: ${agents}\n- Scheduled Tasks: ${tasks}\n- Extensions: ${exts}\n- Theme: ${themeManager.theme.name}\n- Language: ${i18n.getLocale()}\n- Approval Mode: ${ctx.approvalMode}`

  if (usage && usage.total > 0) {
    content += `\n\n**Token Usage:**\n- Input: ${usage.input.toLocaleString()} tokens\n- Output: ${usage.output.toLocaleString()} tokens\n- Total: ${usage.total.toLocaleString()} tokens\n- Est. Cost: $${cost.toFixed(4)}`
  }

  ctx.setMessages(prev => [...prev, { role: 'assistant', content }])
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
  if (success) {
    ctx.addServiceNotice?.(`🎨 Тема изменена: ${themeName}`)
    ctx.setStatusText(`Тема: ${themeName}`)
  } else {
    ctx.addServiceNotice?.(`❌ Тема "${themeName}" не найдена`)
  }
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
  ctx.addServiceNotice?.(`🌐 Язык изменён: ${code}`)
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
  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: 'Use **/capabilities** to see all agent capabilities, or **/stats** for session statistics.',
  }])
  return true
}

async function cmdTools (ctx: SlashCommandContext): Promise<boolean> {
  const allTools = getDefaultTools()
  const modeTools = getToolsForMode(ctx.approvalMode)
  const modeToolNames = new Set(modeTools.map(t => t.tool.name))

  const toolLines = allTools.map(def => {
    const t = def.tool
    const inMode = modeToolNames.has(t.name) ? '✅' : '⛔'
    let approvalLabel: string
    if (def.approval === 'never') {
      approvalLabel = 'read-only'
    } else if (def.approval === 'auto') {
      approvalLabel = 'auto-approve'
    } else {
      approvalLabel = 'ask'
    }
    return `  ${inMode} **${t.name}** — ${t.description} (${approvalLabel})`
  })

  const content = [
    `**Инструменты агента (${allTools.length} всего, ${modeTools.length} в текущем режиме)**\n`,
    ...toolLines,
    '',
    `**Текущий режим:** \`${ctx.approvalMode}\``,
    ...(ctx.approvalMode === 'plan'
      ? ['> ⚠️ В PLAN mode доступны только read-only инструменты. Для записи используйте `/setup` и смените режим на default/auto-edit/turbo.']
      : []),
  ].filter(Boolean).join('\n')

  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content,
  }])
  return true
}

async function cmdBrowserTest (ctx: SlashCommandContext, input: string): Promise<boolean> {
  // Parse flags: /browser-test --headed or /browser-test --headless
  const parts = input.trim().split(/\s+/)
  const flag = parts.length > 1 ? parts[1].toLowerCase() : ''

  let headless: boolean
  if (flag === '--headed') {
    headless = false
  } else if (flag === '--headless') {
    headless = true
  } else {
    headless = false // default: headed (видимое окно)
  }

  ctx.setStatusText('🧪 Запуск browser test...')

  // Сохраняем текущий режим Chrome, чтобы восстановить после теста
  const prevState = chromeManager.getState()
  const prevHeadless = prevState.headless

  try {
    const report = await browserTest({ headless })
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: report,
    }])
  } catch (err) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `## ❌ Browser Test Error\n\n\`\`\`\n${String(err)}\n\`\`\``,
    }])
  } finally {
    // Восстанавливаем предыдущий режим Chrome (не ломаем агента после теста)
    if (chromeManager.isConnected()) {
      await chromeManager.ensureMode(prevHeadless).catch(() => {})
    }
  }

  ctx.setStatusText('')
  return true
}

async function cmdBrowserRealTest (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const parts = input.trim().split(/\s+/).slice(1)
  const saveReport = parts.includes('--save-report')
  const headless = parts.includes('--headless')
  const siteArgs = parts.filter(p => !p.startsWith('--'))
  const sites = siteArgs.length > 0 ? siteArgs : undefined

  ctx.setStatusText('🌐 Real site smoke-test...')
  const prevState = chromeManager.getState()

  try {
    const report = await browserRealTest({ sites, headless })

    if (saveReport) {
      const { writeFile } = await import('node:fs/promises')
      await writeFile('BROWSER_REAL_TEST_REPORT.md', report, 'utf8')
      ctx.addServiceNotice?.('📄 Report saved: BROWSER_REAL_TEST_REPORT.md')
    }

    ctx.setMessages(prev => [...prev, { role: 'assistant', content: report }])
  } catch (err) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: `## ❌ browser-real-test error\n\`\`\`\n${String(err)}\n\`\`\``,
    }])
  } finally {
    if (chromeManager.isConnected()) {
      await chromeManager.ensureMode(prevState.headless ?? false).catch(() => {})
    }
    ctx.setStatusText('')
  }

  return true
}

async function cmdChrome (ctx: SlashCommandContext, input: string): Promise<boolean> {
  const parts = input.trim().split(/\s+/)
  const flag = parts.length > 1 ? parts[1].toLowerCase() : ''

  // No flag — show status
  if (!flag || flag === '--status' || flag === '-s') {
    const state = chromeManager.getState()
    const modeStr = state.connected
      ? (state.headless ? 'headless (фоновый)' : 'headed (видимое окно)')
      : 'не запущен'
    ctx.addServiceNotice?.(
      `🌐 Chrome: ${modeStr}${state.connected ? ` | PID: ${state.managedProcessPid ?? '—'} | Порт: ${state.debugPort}` : ''}`
    )
    return true
  }

  // Determine desired mode
  let desiredHeadless: boolean
  if (flag === '--headless' || flag === '-h') {
    desiredHeadless = true
  } else if (flag === '--headed' || flag === '-v') {
    desiredHeadless = false
  } else {
    ctx.addServiceNotice?.('❌ /chrome: используйте --headed, --headless или без флага для статуса')
    return true
  }

  try {
    await chromeManager.ensureMode(desiredHeadless)
    const state = chromeManager.getState()
    const modeStr = state.headless ? 'headless (фоновый)' : 'headed (видимое окно)'

    // Save to config
    ctx.config.chromeHeadless = state.headless
    saveConfig({ chromeHeadless: state.headless }).catch(() => {})

    ctx.addServiceNotice?.(`🌐 Chrome: ${modeStr} | PID: ${state.managedProcessPid ?? '—'} | Порт: ${state.debugPort}`)
  } catch (err) {
    ctx.addServiceNotice?.(`❌ Chrome: ${String(err)}`)
  }

  return true
}

async function cmdLastBrowserTest (ctx: SlashCommandContext): Promise<boolean> {
  const result = getLastBrowserTestResult()

  if (!result) {
    ctx.setMessages(prev => [...prev, {
      role: 'assistant',
      content: '## 📋 Последний browser test\n\nНет сохранённого отчёта последнего теста. Запустите `/browser-test` сначала.',
    }])
    return true
  }

  const lines: string[] = [
    '## 📋 Последний browser test',
    '',
    `> **Timestamp:** ${result.timestamp}`,
    '> **Источник:** сохранённый structured result (не LLM-реконструкция)',
    '',
    '| Шаг | Статус | Длительность |',
    '|-----|--------|-------------|',
  ]

  for (const step of result.steps) {
    const icon = step.status === 'passed' ? '✅' : step.status === 'failed' ? '❌' : '⏭️'
    const dur = step.durationMs > 0 ? `${step.durationMs}ms` : '—'
    lines.push(`| ${icon} ${step.name} | ${step.status} | ${dur} |`)
  }

  lines.push('')
  lines.push(`**Итого:** ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.skipped} skipped`)

  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: lines.join('\n'),
  }])
  return true
}

async function cmdCapabilities (ctx: SlashCommandContext): Promise<boolean> {
  const allTools = getDefaultTools()
  const modeTools = getToolsForMode(ctx.approvalMode)

  const readTools = allTools.filter(t => t.approval === 'never')
  const writeTools = allTools.filter(t => t.approval !== 'never')

  const modeReadTools = modeTools.filter(t => t.approval === 'never')
  const modeWriteTools = modeTools.filter(t => t.approval !== 'never')

  const lines: string[] = [
    '## Возможности агента',
    '',
    `**Режим:** \`${ctx.approvalMode}\``,
    '',
    '### Чтение и поиск',
    ...modeReadTools.map(t => `  - ✅ \`${t.tool.name}\` — ${t.tool.description}`),
    ...readTools
      .filter(t => !modeReadTools.some(mt => mt.tool.name === t.tool.name))
      .map(t => `  - ⛔ \`${t.tool.name}\` — заблокирован в PLAN mode`),
    '',
    '### Запись и исполнение',
    ...modeWriteTools.map(t => `  - ✅ \`${t.tool.name}\` — ${t.tool.description} (${t.approval === 'auto' ? 'авто-подтверждение' : 'требует подтверждения'})`),
    ...writeTools
      .filter(t => !modeWriteTools.some(mt => mt.tool.name === t.tool.name))
      .map(t => `  - ⛔ \`${t.tool.name}\` — заблокирован в PLAN mode`),
    '',
  ]

  if (ctx.approvalMode === 'plan') {
    lines.push(
      '> ⚠️ **Вы в PLAN mode.**',
      '> У меня есть инструменты write_file и edit, но в этом режиме они отключены.',
      '> Я могу предложить изменения, но не могу применить их напрямую.',
      '> Используйте `/setup` и выберите другой режим (default, auto-edit, turbo) для включения записи.',
      ''
    )
  }

  lines.push('### Дополнительно')
  lines.push('  - 🌐 **MCP серверы** — подключаемые внешние инструменты')
  lines.push('  - 🧩 **Расширения** — плагины, добавляющие функциональность')
  lines.push('  - 🧠 **Навыки (Skills)** — предустановленные сценарии работы')
  lines.push('  - 🤖 **Под-агенты** — дочерние агенты для параллельных задач')

  ctx.setMessages(prev => [...prev, {
    role: 'assistant',
    content: lines.join('\n'),
  }])
  return true
}

// ─── Command registry ────────────────────────────────────────────────────────

export interface CommandEntry {
  name: string
  description: string
  handler: (ctx: SlashCommandContext, input: string) => Promise<boolean>
}

export const COMMANDS: CommandEntry[] = [
  { name: '/help', description: 'Show this help', handler: cmdHelp },
  { name: '/setup', description: 'Settings: language, API key, theme, mode', handler: cmdSetup },
  { name: '/remember', description: 'Save to memory: /remember <text>', handler: cmdRemember },
  { name: '/forget', description: 'Delete from memory by search', handler: cmdForget },
  { name: '/memory', description: 'Show all saved memories', handler: cmdMemory },
  { name: '/compress', description: 'Compress chat history', handler: cmdCompress },
  { name: '/checkpoint', description: 'Create git checkpoint', handler: cmdCheckpoint },
  { name: '/restore', description: 'List or restore checkpoint: /restore [id]', handler: cmdRestore },
  { name: '/mcp', description: 'MCP servers: /mcp list | connect', handler: cmdMcp },
  { name: '/skills', description: 'List or describe an agent skill', handler: cmdSkills },
  { name: '/agents', description: 'List active subagents', handler: cmdAgents },
  { name: '/review', description: 'Code review: /review all|diff|auto', handler: cmdReview },
  { name: '/sandbox', description: 'Run command in sandbox', handler: cmdSandbox },
  { name: '/git', description: 'Git: /git commit|branch|diff|status', handler: cmdGit },
  { name: '/loop', description: 'Schedule recurring task: /loop <interval> <prompt>', handler: cmdLoop },
  { name: '/stats', description: 'Session statistics with token usage', handler: cmdStats },
  { name: '/theme', description: 'Switch theme or open picker', handler: cmdTheme },
  { name: '/lang', description: 'Change language: /lang en|ru|zh', handler: cmdLang },
  { name: '/language', description: 'Alias for /lang', handler: cmdLang },
  { name: '/extensions', description: 'List installed extensions', handler: cmdExtensions },
  { name: '/followup', description: 'Generate follow-up suggestions', handler: cmdFollowup },
  { name: '/logs', description: 'Show recent log files', handler: cmdLogs },
  { name: '/plan', description: 'Show capabilities overview', handler: cmdPlan },
  { name: '/tools', description: 'Show available tools and approval status', handler: cmdTools },
  { name: '/capabilities', description: 'Show full capability matrix', handler: cmdCapabilities },
  { name: '/browser-test', description: 'Run Chrome browser test suite', handler: cmdBrowserTest },
  { name: '/browser-real-test', description: 'Smoke test on real websites', handler: cmdBrowserRealTest },
  { name: '/last-browser-test', description: 'Show last browser test report', handler: cmdLastBrowserTest },
  { name: '/chrome', description: 'Chrome mode: --headed|--headless|-s', handler: cmdChrome },
]

export const COMMAND_NAMES: string[] = COMMANDS.map(c => c.name)

export const COMMAND_MAP: ReadonlyMap<string, string> = new Map(
  COMMANDS.map(c => [c.name, c.description])
)

const commandMap = new Map<string, CommandEntry>()
for (const cmd of COMMANDS) {
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
