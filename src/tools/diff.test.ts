import { describe, it, expect } from 'vitest'
import { lineDiff } from './diff.js'

describe('lineDiff', () => {
  it('returns empty string for identical input', () => {
    expect(lineDiff('a\nb', 'a\nb')).toBe('')
  })

  it('marks removed and added lines with -/+', () => {
    const d = lineDiff('line one\nline two\nline three', 'line one\nline TWO\nline three')
    expect(d).toContain('-line two')
    expect(d).toContain('+line TWO')
    // unchanged lines are omitted (no context)
    expect(d).not.toContain(' line one')
    expect(d).not.toContain('line three\n')
  })

  it('treats a brand-new file as all additions', () => {
    const d = lineDiff('', 'a\nb')
    expect(d).toBe('+a\n+b')
  })

  it('marks pure deletions', () => {
    const d = lineDiff('a\nb\nc', 'a\nc')
    expect(d).toBe('-b')
  })

  it('truncates very long diffs with a summary', () => {
    const big = Array.from({ length: 100 }, (_, i) => `new${i}`).join('\n')
    const d = lineDiff('', big)
    expect(d).toMatch(/truncated/)
    expect(d.split('\n').length).toBeLessThan(30)
  })

  it('falls back to a summary for huge inputs (no LCS blowup)', () => {
    const a = Array.from({ length: 2500 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 2500 }, (_, i) => `b${i}`).join('\n')
    expect(lineDiff(a, b)).toMatch(/large change/)
  })
})
