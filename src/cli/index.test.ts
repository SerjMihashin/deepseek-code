import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { getCommanderParseSource, isMainEntrypoint } from './index.js'

describe('cli argument parsing', () => {
  it('parses process.argv style arguments as node argv', () => {
    expect(getCommanderParseSource(['node', 'dist/cli/index.js', '--json'])).toBe('node')
  })

  it('keeps direct user argument arrays supported for tests', () => {
    expect(getCommanderParseSource(['--json'])).toBe('user')
  })
})

describe('entrypoint detection', () => {
  // A stand-in for an installed layout: the real module, and a bin symlink
  // pointing at it from somewhere else entirely.
  const dir = mkdtempSync(join(tmpdir(), 'dsc-entry-'))
  const real = join(dir, 'index.js')
  const bin = join(dir, 'deepseek-code')
  writeFileSync(real, '// module')
  symlinkSync(real, bin)

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('recognises the module when it is run directly', () => {
    expect(isMainEntrypoint(real, pathToFileURL(real).href)).toBe(true)
  })

  it('recognises the module when it is run through a bin symlink', () => {
    // This is every global npm install: argv[1] is the symlink in the bin
    // directory, import.meta.url is the real file. Comparing the two without
    // realpath left the CLI doing nothing at all.
    expect(isMainEntrypoint(bin, pathToFileURL(real).href)).toBe(true)
  })

  it('still says no for an unrelated module', () => {
    const other = join(dir, 'other.js')
    writeFileSync(other, '// other')
    expect(isMainEntrypoint(bin, pathToFileURL(other).href)).toBe(false)
  })

  it('says no when there is no argv[1] at all', () => {
    expect(isMainEntrypoint(undefined, pathToFileURL(real).href)).toBe(false)
  })

  it('falls back to path comparison when a path cannot be resolved', () => {
    const missing = join(dir, 'gone.js')
    expect(isMainEntrypoint(missing, pathToFileURL(missing).href)).toBe(true)
  })
})
