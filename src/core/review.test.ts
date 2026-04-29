import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults.js'
import { formatReviewReport, reviewCode, type ReviewResult } from './review.js'

describe('review', () => {
  it('returns a deterministic result when there are no files to review', async () => {
    const result = await reviewCode(DEFAULT_CONFIG, { prUrl: 'https://example.test/pr/1' })

    expect(result).toMatchObject({
      issues: [],
      summary: 'No files to review.',
      score: 100,
    })
  })

  it('formats reports with no findings', () => {
    const report = formatReviewReport({
      issues: [],
      summary: 'Clean.',
      score: 100,
      durationMs: 1200,
    })

    expect(report).toContain('No issues found.')
    expect(report).toContain('Score: **100/100**')
    expect(report).toContain('Clean.')
  })

  it('formats reports with findings and suggestions', () => {
    const result: ReviewResult = {
      issues: [
        {
          file: 'src/a.ts',
          line: 10,
          severity: 'major',
          category: 'security',
          message: 'Unsafe path handling.',
          suggestion: 'Validate workspace boundaries.',
        },
      ],
      summary: 'Needs work.',
      score: 80,
      durationMs: 500,
    }

    const report = formatReviewReport(result)

    expect(report).toContain('[MAJOR] src/a.ts:10 (security)')
    expect(report).toContain('Suggestion: Validate workspace boundaries.')
    expect(report).toContain('Issues: 1')
    expect(report).toContain('Needs work.')
  })
})
