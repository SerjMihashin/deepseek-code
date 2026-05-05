import { MODEL_PRICING } from '../config/defaults.js'

export interface TokenUsage {
  input: number
  cacheHitInput: number
  cacheMissInput: number
  output: number
  reasoningOutput: number
  total: number
}

export class MetricsCollector {
  private startTime: number = Date.now()
  private _toolCalls: number = 0
  private _inputTokens: number = 0
  private _cacheHitInputTokens: number = 0
  private _cacheMissInputTokens: number = 0
  private _outputTokens: number = 0
  private _reasoningOutputTokens: number = 0
  private _lastInputTokens: number = 0
  private _apiCalls: number = 0
  private toolTimings: Map<string, { start: number; duration?: number }> = new Map()
  private toolCallLog: Array<{ tool: string; duration: number; success: boolean }> = []

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
  get toolCallLogEntries (): Array<{ tool: string; duration: number; success: boolean }> {
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

  recordToolCallEnd (toolName: string, success: boolean = true): void {
    const entry = this.toolTimings.get(toolName)
    if (entry) {
      const duration = Date.now() - entry.start
      entry.duration = duration
      this._toolCalls++
      this.toolCallLog.push({ tool: toolName, duration, success })
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

  /**
   * Get current context window usage as % of max context.
   * Uses last API request's prompt_tokens — the actual size of the current window.
   */
  getCurrentWindowPercent (maxContext: number = 128_000): number {
    if (maxContext <= 0 || this._lastInputTokens === 0) return 0
    return Math.min(100, Math.round((this._lastInputTokens / maxContext) * 100))
  }

  estimatedCostUSD (model: string = 'deepseek-chat'): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['deepseek-chat']
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
   * Get context usage percentage based on model's max context (default 128k for deepseek-chat)
   */
  getContextUsagePercent (maxContext: number = 128_000): number {
    if (maxContext <= 0) return 0
    return Math.min(100, Math.round((this.totalTokens / maxContext) * 100))
  }

  getSummary (model: string = 'deepseek-chat'): string {
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
      summary += `\nLast request context: ${this._lastInputTokens.toLocaleString()} tokens (${contextPercent}% of 128k window)\n`
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
      summary += `Tools: ${Array.from(groups.entries()).map(([name, g]) =>
        `${name} x${g.count}${g.fail > 0 ? ` (${g.success} ok ${g.fail} failed)` : ''}`
      ).join(', ')}\n`
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
  }
}
