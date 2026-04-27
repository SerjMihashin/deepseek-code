export interface TokenUsage {
  input: number
  output: number
  total: number
}

export class MetricsCollector {
  private startTime: number = Date.now()
  private _toolCalls: number = 0
  private _inputTokens: number = 0
  private _outputTokens: number = 0
  private _lastInputTokens: number = 0
  private toolTimings: Map<string, { start: number; duration?: number }> = new Map()
  private toolCallLog: Array<{ tool: string; duration: number; success: boolean }> = []

  get toolCalls(): number {
    return this._toolCalls
  }

  get inputTokens(): number {
    return this._inputTokens
  }

  get outputTokens(): number {
    return this._outputTokens
  }

  get totalTokens(): number {
    return this._inputTokens + this._outputTokens
  }

  get elapsedMs(): number {
    return Date.now() - this.startTime
  }

  recordToolCallStart(toolName: string): void {
    this.toolTimings.set(toolName, { start: Date.now() })
  }

  recordToolCallEnd(toolName: string, success: boolean = true): void {
    const entry = this.toolTimings.get(toolName)
    if (entry) {
      const duration = Date.now() - entry.start
      entry.duration = duration
      this._toolCalls++
      this.toolCallLog.push({ tool: toolName, duration, success })
    }
  }

  recordTokens(input: number, output: number): void {
    this._inputTokens += input
    this._outputTokens += output
    if (input > 0) this._lastInputTokens = input
  }

  /**
   * Get current context window usage as % of max context.
   * Uses last API request's prompt_tokens — the actual size of the current window.
   */
  getCurrentWindowPercent(maxContext: number = 128_000): number {
    if (maxContext <= 0 || this._lastInputTokens === 0) return 0
    return Math.min(100, Math.round((this._lastInputTokens / maxContext) * 100))
  }

  getTokenUsage(): TokenUsage {
    return {
      input: this._inputTokens,
      output: this._outputTokens,
      total: this.totalTokens,
    }
  }

  /**
   * Get context usage percentage based on model's max context (default 128k for deepseek-chat)
   */
  getContextUsagePercent(maxContext: number = 128_000): number {
    if (maxContext <= 0) return 0
    return Math.min(100, Math.round((this.totalTokens / maxContext) * 100))
  }

  getSummary(): string {
    const elapsed = Math.round(this.elapsedMs / 1000)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60

    let summary = `\n\n━━━ Execution Summary ━━━\n`
    summary += `Tool uses: ${this._toolCalls} · Tokens: ${this.totalTokens.toLocaleString()} (in: ${this._inputTokens.toLocaleString()}, out: ${this._outputTokens.toLocaleString()}) · Time: ${mins}m ${secs}s\n`

    // Add compact tool breakdown if there were calls
    if (this.toolCallLog.length > 0) {
      // Group by tool name for compact display
      const groups = new Map<string, { count: number; totalDuration: number; success: number; fail: number }>()
      for (const call of this.toolCallLog) {
        const g = groups.get(call.tool) ?? { count: 0, totalDuration: 0, success: 0, fail: 0 }
        g.count++
        g.totalDuration += call.duration
        if (call.success) { g.success++ } else { g.fail++ }
        groups.set(call.tool, g)
      }
      summary += `Tools: ${Array.from(groups.entries()).map(([name, g]) =>
        `${name} ×${g.count}${g.fail > 0 ? ` (${g.success}✓ ${g.fail}✗)` : ''}`
      ).join(', ')}\n`
    }

    summary += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    return summary
  }

  reset(): void {
    this.startTime = Date.now()
    this._toolCalls = 0
    this._inputTokens = 0
    this._outputTokens = 0
    this._lastInputTokens = 0
    this.toolTimings.clear()
    this.toolCallLog = []
  }
}
