import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { isPathInWorkspace } from './path-safety.js'

describe('path safety', () => {
  const root = process.cwd()

  it('allows paths inside the workspace', () => {
    expect(isPathInWorkspace(join(root, 'src', 'index.ts'), root)).toBe(true)
  })

  it('rejects sibling paths outside the workspace', () => {
    expect(isPathInWorkspace(join(root, '..', 'outside.txt'), root)).toBe(false)
  })

  it('rejects empty paths', () => {
    expect(isPathInWorkspace('', root)).toBe(false)
  })
})
