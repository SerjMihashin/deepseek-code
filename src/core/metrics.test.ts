import { describe, expect, it } from 'vitest'
import { MetricsCollector } from './metrics.js'

describe('MetricsCollector', () => {
  it('calculates DeepSeek cost with cache hit and cache miss input buckets', () => {
    const metrics = new MetricsCollector()

    metrics.recordUsage({
      input: 5_887_992,
      cacheHitInput: 5_640_806,
      cacheMissInput: 247_186,
      output: 34_289,
      reasoningOutput: 0,
      total: 5_922_281,
    })

    expect(metrics.inputTokens).toBe(5_887_992)
    expect(metrics.cacheHitInputTokens).toBe(5_640_806)
    expect(metrics.cacheMissInputTokens).toBe(247_186)
    expect(metrics.outputTokens).toBe(34_289)
    expect(metrics.totalTokens).toBe(5_922_281)
    expect(metrics.estimatedCostUSD('deepseek-chat')).toBeCloseTo(0.0600012168, 8)
  })

  it('treats legacy input-only usage as cache miss for conservative cost estimates', () => {
    const metrics = new MetricsCollector()

    metrics.recordTokens(1_000_000, 1_000_000)

    expect(metrics.cacheHitInputTokens).toBe(0)
    expect(metrics.cacheMissInputTokens).toBe(1_000_000)
    expect(metrics.estimatedCostUSD('deepseek-chat')).toBeCloseTo(0.42, 6)
  })

  it('shows failed tool calls in getSummary with label and error', () => {
    const metrics = new MetricsCollector()

    // Successful call — should not appear in Failed tool calls
    metrics.recordToolCallStart('read_file')
    metrics.recordToolCallEnd('read_file', true)

    // Failed call with label and error
    metrics.recordToolCallStart('run_shell_command')
    metrics.recordToolCallEnd('run_shell_command', false, 'npx vitest', 'Command failed with exit code 1')

    // Failed call without label/error — should fallback to "failed"
    metrics.recordToolCallStart('edit')
    metrics.recordToolCallEnd('edit', false)

    const summary = metrics.getSummary('deepseek-chat')

    expect(summary).toContain('Failed tool calls:')
    expect(summary).toContain('run_shell_command')
    expect(summary).toContain('npx vitest')
    expect(summary).toContain('Command failed with exit code 1')
    expect(summary).toContain('edit')
    expect(summary).toContain('failed')
    // read_file appears in the Tools summary but not in Failed tool calls block
    // The block starts after "Failed tool calls:" — check read_file isn't listed as failed
    const failedIdx = summary.indexOf('Failed tool calls:')
    const timeIdx = summary.indexOf('Time:')
    const failedBlock = failedIdx >= 0 ? summary.slice(failedIdx, timeIdx >= 0 ? timeIdx : undefined) : ''
    expect(failedBlock).not.toContain('read_file')
  })

  it('limits failed tool calls block to max 5 entries', () => {
    const metrics = new MetricsCollector()

    for (let i = 0; i < 7; i++) {
      metrics.recordToolCallStart(`tool_${i}`)
      metrics.recordToolCallEnd(`tool_${i}`, false, `cmd_${i}`, `error_${i}`)
    }

    const summary = metrics.getSummary('deepseek-chat')

    // Should contain first 5
    for (let i = 0; i < 5; i++) {
      expect(summary).toContain(`cmd_${i}`)
    }
    // Should mention remaining
    expect(summary).toContain('2 more failed call(s)')
  })

  it('omits Failed tool calls block when no failures', () => {
    const metrics = new MetricsCollector()

    metrics.recordToolCallStart('read_file')
    metrics.recordToolCallEnd('read_file', true)

    const summary = metrics.getSummary('deepseek-chat')
    expect(summary).not.toContain('Failed tool calls:')
  })
})
