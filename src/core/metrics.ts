import { execSync } from 'node:child_process'
import { MODEL_PRICING } from '../config/defaults.js'

export interface TokenUsage {
  input: number
  cacheHitInput: number
  cacheMissInput: number
  output: number
  reasoningOutput: number
  total: number
}

export interface GitStatusSnapshot {
  dirty: string[]
  untracked: string[]
  added: string[]
  deleted: string[]
  all: string[]
}

/**
 * Safely capture git status --porcelain output.
 * Returns null outside git repos or on any error.
 */
export function captureGitStatus (cwd: string): GitStatusSnapshot | null {
  try {
    const stdout = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return parsePorcelain(stdout)
  } catch {
    return null
  }
}

/**
 * Parse git status --porcelain output into GitStatusSnapshot.
 */
export function parsePorcelain (stdout: string): GitStatusSnapshot {
  const lines = stdout.split(/\r?\n/).filter(Boolean)

  const dirty: string[] = []
  const untracked: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  const allMap = new Map<string, true>()

  for (const line of lines) {
    // XY <path> or XY "<quoted path>"
    const match = line.match(/^([ MADRC?!]{2})\s+(.+)$/)
    if (!match) continue

    const xy = match[1]!
    let path = match[2]!

    // Remove surrounding quotes that git adds for special characters
    if (path.startsWith('"') && path.endsWith('"')) {
      path = path.slice(1, -1)
    }

    const staged = xy[0]!
    const worktree = xy[1]!

    // Untracked: ??
    if (staged === '?' && worktree === '?') {
      untracked.push(path)
      allMap.set(path, true)
      continue
    }

    // Added (staged): A<space>
    if (staged === 'A') {
      added.push(path)
      allMap.set(path, true)
    }

    // Deleted: D<space> or <space>D
    if (staged === 'D' || worktree === 'D') {
      deleted.push(path)
      allMap.set(path, true)
    }

    // Modified: M<space>, <space>M, MM, or renamed (R)
    if (
      staged === 'M' || worktree === 'M' ||
      staged === 'R' || worktree === 'R'
    ) {
      dirty.push(path)
      allMap.set(path, true)
    }

    // Also handle staged modifications with other indicators
    if (staged !== '?' && worktree !== '?' && !['A', 'D', 'M', 'R'].includes(staged) && !['D', 'M', 'R'].includes(worktree)) {
      // Anything else that's not clean: treat as dirty
      if (staged !== ' ' || worktree !== ' ') {
        dirty.push(path)
        allMap.set(path, true)
      }
    }
  }

  return {
    dirty,
    untracked,
    added,
    deleted,
    all: Array.from(allMap.keys()),
  }
}

export class MetricsCollector {
  private startTime: number = Date.now()
  /** Context window of the active model (set by AgentLoop); conservative default. */
  private _contextWindow: number = 128_000
  private _toolCalls: number = 0
  private _inputTokens: number = 0
  private _cacheHitInputTokens: number = 0
  private _cacheMissInputTokens: number = 0
  private _outputTokens: number = 0
  private _reasoningOutputTokens: number = 0
  private _lastInputTokens: number = 0
  private _apiCalls: number = 0
  private toolTimings: Map<string, { start: number; duration?: number }> = new Map()
  private toolCallLog: Array<{ tool: string; duration: number; success: boolean; label?: string; error?: string }> = []
  private _gitBaseline: GitStatusSnapshot | null = null
  private _gitFinal: GitStatusSnapshot | null = null

  get toolCalls (): number {
    return this._toolCalls
  }

  get inputTokens (): number {
    return this._inputTokens
  }

  get outputTokens (): number {
    return this._outputTokens
  }

  get cacheHitInputTokens (): number {
    return this._cacheHitInputTokens
  }

  get cacheMissInputTokens (): number {
    return this._cacheMissInputTokens
  }

  get reasoningOutputTokens (): number {
    return this._reasoningOutputTokens
  }

  get totalTokens (): number {
    return this._inputTokens + this._outputTokens
  }

  get apiCalls (): number {
    return this._apiCalls
  }

  get elapsedMs (): number {
    return Date.now() - this.startTime
  }

  /** Get a copy of the tool call log for budget/inspection purposes */
  get toolCallLogEntries (): Array<{ tool: string; duration: number; success: boolean; label?: string; error?: string }> {
    return [...this.toolCallLog]
  }

  /** Get count of a specific tool in the call log */
  getToolCallCount (name: string): number {
    return this.toolCallLog.filter(t => t.tool === name).length
  }

  /** Get count of tool calls matching any of the given names */
  getToolCallCountAny (names: string[]): number {
    const nameSet = new Set(names)
    return this.toolCallLog.filter(t => nameSet.has(t.tool)).length
  }

  recordToolCallStart (toolName: string): void {
    this.toolTimings.set(toolName, { start: Date.now() })
  }

  recordToolCallEnd (toolName: string, success: boolean = true, label?: string, error?: string): void {
    const entry = this.toolTimings.get(toolName)
    if (entry) {
      const duration = Date.now() - entry.start
      entry.duration = duration
      this._toolCalls++
      this.toolCallLog.push({ tool: toolName, duration, success, label, error })
    }
  }

  recordTokens (input: number, output: number): void {
    this.recordUsage({ input, cacheMissInput: input, output })
  }

  recordUsage (usage: Partial<TokenUsage>): void {
    const cacheHitInput = usage.cacheHitInput ?? 0
    const explicitCacheMissInput = usage.cacheMissInput ?? 0
    const input = usage.input ?? (cacheHitInput + explicitCacheMissInput)
    const cacheMissInput = (cacheHitInput > 0 || explicitCacheMissInput > 0)
      ? explicitCacheMissInput
      : input

    this._inputTokens += input
    this._cacheHitInputTokens += cacheHitInput
    this._cacheMissInputTokens += cacheMissInput
    this._outputTokens += usage.output ?? 0
    this._reasoningOutputTokens += usage.reasoningOutput ?? 0
    if (input > 0) this._lastInputTokens = input
    this._apiCalls++
  }

  /** Set the context window of the active model (tokens). */
  setContextWindow (tokens: number): void {
    if (tokens > 0) this._contextWindow = tokens
  }

  get contextWindow (): number {
    return this._contextWindow
  }

  /**
   * Get current context window usage as % of max context.
   * Uses last API request's prompt_tokens — the actual size of the current window.
   */
  getCurrentWindowPercent (maxContext: number = this._contextWindow): number {
    if (maxContext <= 0 || this._lastInputTokens === 0) return 0
    return Math.min(100, Math.round((this._lastInputTokens / maxContext) * 100))
  }

  estimatedCostUSD (model: string = 'deepseek-v4-pro'): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['deepseek-v4-pro']
    return (this._cacheHitInputTokens / 1_000_000) * pricing.cacheHitInputPer1M +
      (this._cacheMissInputTokens / 1_000_000) * pricing.cacheMissInputPer1M +
      (this._outputTokens / 1_000_000) * pricing.outputPer1M
  }

  getTokenUsage (): TokenUsage {
    return {
      input: this._inputTokens,
      cacheHitInput: this._cacheHitInputTokens,
      cacheMissInput: this._cacheMissInputTokens,
      output: this._outputTokens,
      reasoningOutput: this._reasoningOutputTokens,
      total: this.totalTokens,
    }
  }

  /**
   * Get context usage percentage based on the active model's max context.
   */
  getContextUsagePercent (maxContext: number = this._contextWindow): number {
    if (maxContext <= 0) return 0
    return Math.min(100, Math.round((this.totalTokens / maxContext) * 100))
  }

  getSummary (model: string = 'deepseek-v4-pro'): string {
    const elapsed = Math.round(this.elapsedMs / 1000)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    const cost = this.estimatedCostUSD(model)
    const costStr = cost > 0 ? ` · $${cost.toFixed(4)}` : ''

    let summary = '\n\n━━━ Execution Summary ━━━\n'

    // API calls count
    const apiCallStr = this._apiCalls > 0
      ? `API calls: ${this._apiCalls}\n`
      : ''
    summary += apiCallStr

    // Session input/output totals (sum across all API calls)
    const inputStr = this._inputTokens.toLocaleString()
    const outputStr = this._outputTokens.toLocaleString()
    const totalStr = this.totalTokens.toLocaleString()
    const reasoningStr = this._reasoningOutputTokens > 0
      ? ` (reasoning: ${this._reasoningOutputTokens.toLocaleString()})`
      : ''

    summary += `  Session input tokens:  ${inputStr}`
    if (this._cacheHitInputTokens > 0 || this._cacheMissInputTokens > 0) {
      summary += ` (cache hit: ${this._cacheHitInputTokens.toLocaleString()}, cache miss: ${this._cacheMissInputTokens.toLocaleString()})`
    }
    summary += '\n'
    summary += `  Session output tokens: ${outputStr}${reasoningStr}\n`
    summary += `  Session total tokens:  ${totalStr}\n`

    // Last request context window (the actual size of the last prompt)
    const contextPercent = this.getCurrentWindowPercent()
    if (contextPercent > 0 && this._lastInputTokens > 0) {
      const windowLabel = this._contextWindow >= 1_000_000
        ? `${(this._contextWindow / 1_000_000).toFixed(this._contextWindow % 1_000_000 === 0 ? 0 : 1)}M`
        : `${Math.round(this._contextWindow / 1000)}k`
      summary += `\nLast request context: ${this._lastInputTokens.toLocaleString()} tokens (${contextPercent}% of ${windowLabel} window)\n`
    }

    // Git change report
    const gitReport = this.getGitChangeReport()
    if (gitReport && (gitReport.duringRun.length > 0 || gitReport.newUntracked.length > 0 || gitReport.beforeRun.length > 0)) {
      const formatList = (items: string[]): string => {
        if (items.length === 0) return '(none)'
        const limited = items.slice(0, 10)
        const suffix = items.length > 10 ? ', ... +' + (items.length - 10) + ' more' : ''
        return limited.join(', ') + suffix
      }
      summary += '\nFiles:\n'
      summary += `  changed during run: ${formatList(gitReport.duringRun)}\n`
      summary += `  new untracked:      ${formatList(gitReport.newUntracked)}\n`
      summary += `  dirty before run:   ${formatList(gitReport.beforeRun)}\n`
    }

    // Tool breakdown
    if (this.toolCallLog.length > 0) {
      summary += '\n'
      const groups = new Map<string, { count: number; totalDuration: number; success: number; fail: number }>()
      for (const call of this.toolCallLog) {
        const g = groups.get(call.tool) ?? { count: 0, totalDuration: 0, success: 0, fail: 0 }
        g.count++
        g.totalDuration += call.duration
        if (call.success) { g.success++ } else { g.fail++ }
        groups.set(call.tool, g)
      }
      const failedCalls = this.toolCallLog.filter(c => !c.success)
      const chromeFailures = failedCalls.filter(c => c.tool === 'chrome').length
      if (failedCalls.length > 0) {
        summary += 'Quality gate: attention required'
        summary += ` (${failedCalls.length} failed tool call${failedCalls.length === 1 ? '' : 's'}`
        if (chromeFailures > 0) summary += `, ${chromeFailures} chrome failure${chromeFailures === 1 ? '' : 's'}`
        summary += ')\n'
        summary += '  Final report must be Partial/Failed unless failures were non-critical and retried successfully.\n'
      } else {
        summary += 'Quality gate: no failed tool calls recorded\n'
      }
      summary += `Tools: ${Array.from(groups.entries()).map(([name, g]) =>
        `${name} x${g.count}${g.fail > 0 ? ` (${g.success} ok ${g.fail} failed)` : ''}`
      ).join(', ')}\n`

      // Failed tool calls detail block (max 3 entries to keep the visible summary readable)
      if (failedCalls.length > 0) {
        summary += '\nFailed tool calls (first 3):\n'
        for (const fc of failedCalls.slice(0, 3)) {
          const label = fc.label
            ? (fc.label.length > 120 ? fc.label.slice(0, 117) + '...' : fc.label)
            : ''
          const error = fc.error
            ? (fc.error.length > 160 ? fc.error.slice(0, 157) + '...' : fc.error)
            : 'failed'
          summary += `- ${fc.tool}${label ? `: ${label}` : ''} -> ${error}\n`
        }
        if (failedCalls.length > 3) {
          summary += `  ... and ${failedCalls.length - 3} more failed call(s)\n`
        }
      }
    }

    summary += `Time: ${mins}m ${secs}s${costStr}\n`
    summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    return summary
  }

  reset (): void {
    this.startTime = Date.now()
    this._toolCalls = 0
    this._inputTokens = 0
    this._cacheHitInputTokens = 0
    this._cacheMissInputTokens = 0
    this._outputTokens = 0
    this._reasoningOutputTokens = 0
    this._lastInputTokens = 0
    this._apiCalls = 0
    this.toolTimings.clear()
    this.toolCallLog = []
    this._gitBaseline = null
    this._gitFinal = null
  }

  /** Capture git baseline at the start of a session. */
  captureGitBaseline (cwd: string): void {
    this._gitBaseline = captureGitStatus(cwd)
  }

  /** Capture git final at the end of a session. */
  captureGitFinal (cwd: string): void {
    this._gitFinal = captureGitStatus(cwd)
  }

  /**
   * Get a structured change report comparing baseline and final statuses.
   * Returns null if either baseline or final hasn't been captured.
   */
  getGitChangeReport (): { beforeRun: string[]; duringRun: string[]; newUntracked: string[] } | null {
    if (this._gitBaseline === null || this._gitFinal === null) return null

    const baselineSet = new Set(this._gitBaseline.all)
    const baselineUntrackedSet = new Set(this._gitBaseline.untracked)

    const duringRun = this._gitFinal.all.filter(p => !baselineSet.has(p))
    const newUntracked = this._gitFinal.untracked.filter(p => !baselineUntrackedSet.has(p))

    return {
      beforeRun: [...this._gitBaseline.all],
      duringRun,
      newUntracked,
    }
  }
}
