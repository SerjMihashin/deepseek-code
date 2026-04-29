import { describe, expect, it } from 'vitest'
import { resolveCommandSubmission } from './input-bar.js'

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
