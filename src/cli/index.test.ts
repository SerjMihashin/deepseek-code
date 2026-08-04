import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getCommanderParseSource, isMainModule } from './index.js'

describe('cli argument parsing', () => {
  it('parses process.argv style arguments as node argv', () => {
    expect(getCommanderParseSource(['node', 'dist/cli/index.js', '--json'])).toBe('node')
  })

  it('keeps direct user argument arrays supported for tests', () => {
    expect(getCommanderParseSource(['--json'])).toBe('user')
  })
})

describe('isMainModule', () => {
  it('matches when argv[1] reaches the module through a symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsc-entrypoint-'))
    try {
      const real = join(dir, 'real.js')
      const link = join(dir, 'bin.js')
      writeFileSync(real, '// stub\n')
      symlinkSync(real, link)
      // import.meta.url is always the realpath; argv[1] may be the symlink.
      expect(isMainModule(link, pathToFileURL(real).href)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a different module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsc-entrypoint-'))
    try {
      const a = join(dir, 'a.js')
      const b = join(dir, 'b.js')
      writeFileSync(a, '// a\n')
      writeFileSync(b, '// b\n')
      expect(isMainModule(a, pathToFileURL(b).href)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a missing argv[1]', () => {
    expect(isMainModule(undefined, 'file:///whatever.js')).toBe(false)
  })
})
