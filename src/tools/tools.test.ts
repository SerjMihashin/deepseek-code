import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'

// ─── Test helpers ────────────────────────────────────────────────────────────

let tmpDir: string

function createTempFile (name: string, content: string): string {
  const filePath = join(tmpDir, name)
  mkdirSync(join(tmpDir, name.split('/').slice(0, -1).join('/')), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('read_file tool', () => {
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dsc-test-'))
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should read a file', async () => {
    const filePath = createTempFile('test.txt', 'Hello World\nLine 2\nLine 3')
    const result = await readTool.execute({ file_path: filePath })
    assert.ok(result.success)
    assert.equal(result.output, 'Hello World\nLine 2\nLine 3')
  })

  it('should read with offset', async () => {
    const filePath = createTempFile('offset_test.txt', 'Line 0\nLine 1\nLine 2\nLine 3')
    const result = await readTool.execute({ file_path: filePath, offset: 2 })
    assert.ok(result.success, `Failed: ${result.error}`)
    assert.equal(result.output, 'Line 2\nLine 3')
  })

  it('should read with offset 0 (default)', async () => {
    const filePath = createTempFile('test2.txt', 'Line 0\nLine 1\nLine 2\nLine 3')
    const result = await readTool.execute({ file_path: filePath })
    assert.ok(result.success)
    assert.equal(result.output, 'Line 0\nLine 1\nLine 2\nLine 3')
  })

  it('should read with offset and limit', async () => {
    const filePath = createTempFile('test.txt', 'Line 0\nLine 1\nLine 2\nLine 3\nLine 4')
    const result = await readTool.execute({ file_path: filePath, offset: 1, limit: 2 })
    assert.ok(result.success)
    assert.equal(result.output, 'Line 1\nLine 2')
  })

  it('should fail for nonexistent file', async () => {
    const result = await readTool.execute({ file_path: '/nonexistent/path/file.txt' })
    assert.ok(!result.success)
    assert.ok(result.error)
  })
})

describe('write_file tool', () => {
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dsc-test-'))
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should write a file', async () => {
    const filePath = join(tmpDir, 'new-file.txt')
    const result = await writeTool.execute({ file_path: filePath, content: 'Hello World' })
    assert.ok(result.success)
    assert.ok(result.output.includes('bytes'))
  })

  it('should create parent directories', async () => {
    const filePath = join(tmpDir, 'nested', 'dir', 'file.txt')
    const result = await writeTool.execute({ file_path: filePath, content: 'nested' })
    assert.ok(result.success)
    assert.ok(result.output.includes('nested'))
  })

  it('should reject files over 1MB', async () => {
    const filePath = join(tmpDir, 'large.txt')
    const largeContent = 'x'.repeat(1_048_577) // > 1MB
    const result = await writeTool.execute({ file_path: filePath, content: largeContent })
    assert.ok(!result.success)
    assert.ok(result.error?.includes('1MB'))
  })

  it('should fail for invalid path', async () => {
    const result = await writeTool.execute({ file_path: '', content: 'test' })
    assert.ok(!result.success)
  })
})

describe('edit tool', () => {
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dsc-test-'))
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should replace text in a file', async () => {
    const filePath = createTempFile('edit.txt', 'Hello World')
    const result = await editTool.execute({
      file_path: filePath,
      old_string: 'World',
      new_string: 'Universe',
    })
    assert.ok(result.success)
    assert.ok(result.output.includes('edited'))
  })

  it('should fail if string not found', async () => {
    const filePath = createTempFile('edit.txt', 'Hello World')
    const result = await editTool.execute({
      file_path: filePath,
      old_string: 'Nonexistent',
      new_string: 'Replacement',
    })
    assert.ok(!result.success)
    assert.ok(result.error?.includes('not found'))
  })

  it('should replace all occurrences', async () => {
    const filePath = createTempFile('edit.txt', 'foo bar foo bar')
    const result = await editTool.execute({
      file_path: filePath,
      old_string: 'foo',
      new_string: 'baz',
      replace_all: true,
    })
    assert.ok(result.success)
    assert.ok(result.output.includes('all'))
  })

  it('should fail for nonexistent file', async () => {
    const result = await editTool.execute({
      file_path: '/nonexistent/file.txt',
      old_string: 'foo',
      new_string: 'bar',
    })
    assert.ok(!result.success)
  })
})

describe('bash tool', () => {
  it('should execute a simple command', async () => {
    const result = await bashTool.execute({ command: 'echo hello' })
    assert.ok(result.success)
    assert.ok(result.output.includes('hello'))
  })

  it('should handle timeout', async () => {
    const result = await bashTool.execute({ command: 'echo quick', timeout: 1000 })
    assert.ok(result.success)
  })

  it('should reject dangerous commands', async () => {
    const result = await bashTool.execute({ command: 'rm -rf /' })
    assert.ok(!result.success)
    assert.ok(result.error?.includes('dangerous'))
  })

  it('should reject fork bomb', async () => {
    const result = await bashTool.execute({ command: ':(){ :|:& };:' })
    assert.ok(!result.success)
    assert.ok(result.error?.includes('dangerous'))
  })

  it('should handle command failure', async () => {
    const result = await bashTool.execute({ command: 'nonexistent_command_xyz' })
    assert.ok(!result.success)
  })
})

describe('glob tool', () => {
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dsc-test-'))
    createTempFile('src/index.ts', '')
    createTempFile('src/utils/helper.ts', '')
    createTempFile('README.md', '')
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should find files matching pattern', async () => {
    const result = await globTool.execute({ pattern: join(tmpDir, 'src/**/*.ts') })
    assert.ok(result.success)
    assert.ok(result.output.length > 0)
  })

  it('should return empty for no matches', async () => {
    const result = await globTool.execute({ pattern: join(tmpDir, '*.nonexistent') })
    assert.ok(result.success)
    assert.equal(result.output, 'No files found matching pattern')
  })
})

describe('grep_search tool', () => {
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dsc-test-'))
    createTempFile('search.txt', 'hello world\nfoo bar\nHELLO')
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should find matching lines', async () => {
    const result = await grepTool.execute({ pattern: 'hello', path: tmpDir })
    assert.ok(result.success)
    assert.ok(result.output.length > 0)
  })

  it('should return no matches for nonexistent pattern', async () => {
    const result = await grepTool.execute({ pattern: 'zzz_nonexistent_zzz', path: tmpDir })
    assert.ok(result.success)
    assert.equal(result.output, 'No matches found')
  })

  it('should filter by glob', async () => {
    const result = await grepTool.execute({ pattern: 'hello', glob: '*.txt', path: tmpDir })
    assert.ok(result.success)
  })
})
