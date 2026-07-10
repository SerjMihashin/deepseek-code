import { describe, expect, it } from 'vitest'
import { resolveCommandSubmission, findAtToken, applyFileCompletion } from './input-bar.js'
import { filterFilesForMention } from '../utils/file-index.js'

describe('resolveCommandSubmission', () => {
  it('should submit the first visible suggestion when none is selected explicitly', () => {
    expect(resolveCommandSubmission('/sta', ['/stats'], -1)).toBe('/stats')
  })

  it('should submit the selected suggestion', () => {
    expect(resolveCommandSubmission('/ch', ['/checkpoint', '/chrome'], 1)).toBe('/chrome')
  })

  it('should fall back to typed input when there are no suggestions', () => {
    expect(resolveCommandSubmission('/unknown ', [], -1)).toBe('/unknown')
  })
})

describe('findAtToken', () => {
  it('finds a token at the start of the input', () => {
    expect(findAtToken('@src/ut', 7)).toEqual({ start: 0, query: 'src/ut' })
  })

  it('finds a token after whitespace', () => {
    expect(findAtToken('fix the bug in @inp', 19)).toEqual({ start: 15, query: 'inp' })
  })

  it('returns an empty query right after @', () => {
    expect(findAtToken('see @', 5)).toEqual({ start: 4, query: '' })
  })

  it('ignores emails and mid-word @', () => {
    expect(findAtToken('mail user@example.com', 21)).toBeNull()
  })

  it('returns null when whitespace separates the cursor from @', () => {
    expect(findAtToken('@src/foo.ts and more', 20)).toBeNull()
  })

  it('returns null without any @', () => {
    expect(findAtToken('plain text', 5)).toBeNull()
  })
})

describe('applyFileCompletion', () => {
  it('replaces the token with the chosen path plus a trailing space', () => {
    const result = applyFileCompletion('fix @inp now', 8, { start: 4, query: 'inp' }, 'src/ui/input-bar.tsx')
    expect(result.text).toBe('fix @src/ui/input-bar.tsx  now')
    expect(result.cursorIndex).toBe('fix @src/ui/input-bar.tsx '.length)
  })

  it('works at the end of the input', () => {
    const result = applyFileCompletion('check @rea', 10, { start: 6, query: 'rea' }, 'src/tools/read.ts')
    expect(result.text).toBe('check @src/tools/read.ts ')
    expect(result.cursorIndex).toBe(result.text.length)
  })
})

describe('filterFilesForMention', () => {
  const files = [
    'src/ui/input-bar.tsx',
    'src/tools/read.ts',
    'src/tools/registry.ts',
    'README.md',
    'docs/deep/nested/readme-notes.md',
  ]

  it('prefers basename prefix matches', () => {
    const result = filterFilesForMention(files, 'read')
    expect(result[0]).toBe('src/tools/read.ts')
    expect(result).toContain('README.md')
  })

  it('matches path substrings', () => {
    expect(filterFilesForMention(files, 'tools/reg')).toEqual(['src/tools/registry.ts'])
  })

  it('is case-insensitive', () => {
    expect(filterFilesForMention(files, 'readme')[0]).toBe('README.md')
  })

  it('returns shallow files first for an empty query', () => {
    const result = filterFilesForMention(files, '')
    expect(result[0]).toBe('README.md')
  })

  it('respects the limit', () => {
    expect(filterFilesForMention(files, '', 2)).toHaveLength(2)
  })
})
