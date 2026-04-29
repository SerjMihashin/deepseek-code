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
})
