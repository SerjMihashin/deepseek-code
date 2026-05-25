import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('grep_search fallback', () => {
  it('searches with the Node fallback when rg is unavailable', async () => {
    vi.resetModules()
    vi.doMock('node:child_process', () => ({
      execSync: () => {
        const error = new Error('rg not found') as Error & { status?: number }
        error.status = 127
        throw error
      },
    }))

    const { grepTool } = await import('./grep.js')
    const tmpDir = mkdtempSync(join(process.cwd(), '.tmp-grep-fallback-'))

    try {
      mkdirSync(join(tmpDir, 'src'), { recursive: true })
      writeFileSync(join(tmpDir, 'src', 'sample.ts'), 'alpha\nneedle here\nomega\n', 'utf8')
      writeFileSync(join(tmpDir, 'notes.md'), 'needle outside glob\n', 'utf8')

      const result = await grepTool.execute({
        pattern: 'needle',
        glob: '*.ts',
        path: tmpDir,
      })

      expect(result.success).toBe(true)
      expect(result.output).toContain('sample.ts:2:needle here')
      expect(result.output).not.toContain('notes.md')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
      vi.doUnmock('node:child_process')
      vi.resetModules()
    }
  })
})
