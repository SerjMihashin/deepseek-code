import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'

const hasRg = (() => { try { execSync('rg --version', { stdio: 'ignore' }); return true } catch { return false } })()

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
  beforeAll(() => {
    tmpDir = mkdtempSync(join(process.cwd(), '.tmp-dsc-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should read a file', async () => {
    const filePath = createTempFile('test.txt', 'Hello World\nLine 2\nLine 3')
    const result = await readTool.execute({ file_path: filePath })
    expect(result.success).toBe(true)
    expect(result.output).toBe('Hello World\nLine 2\nLine 3')
  })

  it('should read with offset', async () => {
    const filePath = createTempFile('offset_test.txt', 'Line 0\nLine 1\nLine 2\nLine 3')
    const result = await readTool.execute({ file_path: filePath, offset: 2 })
    expect(result.success).toBe(true)
    expect(result.output).toBe('Line 2\nLine 3')
  })

  it('should read with offset 0 (default)', async () => {
    const filePath = createTempFile('test2.txt', 'Line 0\nLine 1\nLine 2\nLine 3')
    const result = await readTool.execute({ file_path: filePath })
    expect(result.success).toBe(true)
    expect(result.output).toBe('Line 0\nLine 1\nLine 2\nLine 3')
  })

  it('should read with offset and limit', async () => {
    const filePath = createTempFile('test.txt', 'Line 0\nLine 1\nLine 2\nLine 3\nLine 4')
    const result = await readTool.execute({ file_path: filePath, offset: 1, limit: 2 })
    expect(result.success).toBe(true)
    expect(result.output).toBe('Line 1\nLine 2')
  })

  it('should fail for nonexistent file', async () => {
    const result = await readTool.execute({ file_path: '/nonexistent/path/file.txt' })
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('should reject paths outside the workspace', async () => {
    const outsidePath = join(process.cwd(), '..', 'outside.txt')
    const result = await readTool.execute({ file_path: outsidePath })
    expect(result.success).toBe(false)
    expect(result.error).toContain('outside the workspace')
  })
})

describe('write_file tool', () => {
  beforeAll(() => {
    tmpDir = mkdtempSync(join(process.cwd(), '.tmp-dsc-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should write a file', async () => {
    const filePath = join(tmpDir, 'new-file.txt')
    const result = await writeTool.execute({ file_path: filePath, content: 'Hello World' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('bytes')
  })

  it('should create parent directories', async () => {
    const filePath = join(tmpDir, 'nested', 'dir', 'file.txt')
    const result = await writeTool.execute({ file_path: filePath, content: 'nested' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('nested')
  })

  it('should reject files over 1MB', async () => {
    const filePath = join(tmpDir, 'large.txt')
    const largeContent = 'x'.repeat(1_048_577) // > 1MB
    const result = await writeTool.execute({ file_path: filePath, content: largeContent })
    expect(result.success).toBe(false)
    expect(result.error).toContain('1MB')
  })

  it('should fail for invalid path', async () => {
    const result = await writeTool.execute({ file_path: '', content: 'test' })
    expect(result.success).toBe(false)
  })

  it('should reject writes outside the workspace', async () => {
    const outsidePath = join(process.cwd(), '..', 'outside.txt')
    const result = await writeTool.execute({ file_path: outsidePath, content: 'test' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('outside the workspace')
  })
})

describe('edit tool', () => {
  beforeAll(() => {
    tmpDir = mkdtempSync(join(process.cwd(), '.tmp-dsc-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should replace text in a file', async () => {
    const filePath = createTempFile('edit.txt', 'Hello World')
    const result = await editTool.execute({
      file_path: filePath,
      old_string: 'World',
      new_string: 'Universe',
    })
    expect(result.success).toBe(true)
    expect(result.output).toContain('edited')
  })

  it('should fail if string not found', async () => {
    const filePath = createTempFile('edit.txt', 'Hello World')
    const result = await editTool.execute({
      file_path: filePath,
      old_string: 'Nonexistent',
      new_string: 'Replacement',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('should replace all occurrences', async () => {
    const filePath = createTempFile('edit.txt', 'foo bar foo bar')
    const result = await editTool.execute({
      file_path: filePath,
      old_string: 'foo',
      new_string: 'baz',
      replace_all: true,
    })
    expect(result.success).toBe(true)
    expect(result.output).toContain('all')
  })

  it('should fail for nonexistent file', async () => {
    const result = await editTool.execute({
      file_path: '/nonexistent/file.txt',
      old_string: 'foo',
      new_string: 'bar',
    })
    expect(result.success).toBe(false)
  })

  it('should reject edits outside the workspace', async () => {
    const outsidePath = join(process.cwd(), '..', 'outside.txt')
    const result = await editTool.execute({
      file_path: outsidePath,
      old_string: 'foo',
      new_string: 'bar',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('outside the workspace')
  })
})

describe('bash tool', () => {
  it('should execute a simple command', async () => {
    const result = await bashTool.execute({ command: 'echo hello' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('hello')
  })

  it('should handle timeout', async () => {
    const result = await bashTool.execute({ command: 'echo quick', timeout: 1000 })
    expect(result.success).toBe(true)
  })

  it('should reject dangerous commands', async () => {
    const result = await bashTool.execute({ command: 'rm -rf /' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('dangerous')
  })

  it('should reject fork bomb', async () => {
    const result = await bashTool.execute({ command: ':(){ :|:& };:' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('dangerous')
  })

  it('should reject dangerous PowerShell commands', async () => {
    const commands = [
      'Remove-Item C:\\ -Recurse -Force',
      'Stop-Computer',
      'Restart-Computer',
      'Clear-Disk -Number 0',
      'Format-Volume -DriveLetter C',
    ]

    for (const command of commands) {
      const result = await bashTool.execute({ command })
      expect(result.success).toBe(false)
      expect(result.error).toContain('dangerous')
    }
  })

  it('should handle command failure', async () => {
    const result = await bashTool.execute({ command: 'nonexistent_command_xyz' })
    expect(result.success).toBe(false)
  })
})

describe('glob tool', () => {
  beforeAll(() => {
    tmpDir = mkdtempSync(join(process.cwd(), '.tmp-dsc-test-'))
    createTempFile('src/index.ts', '')
    createTempFile('src/utils/helper.ts', '')
    createTempFile('README.md', '')
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should find files matching pattern', async () => {
    const result = await globTool.execute({ pattern: join(tmpDir, 'src/**/*.ts') })
    expect(result.success).toBe(true)
    expect(result.output.length).toBeGreaterThan(0)
  })

  it('should return empty for no matches', async () => {
    const result = await globTool.execute({ pattern: join(tmpDir, '*.nonexistent') })
    expect(result.success).toBe(true)
    expect(result.output).toBe('No files found matching pattern')
  })
})

describe.skipIf(!hasRg)('grep_search tool', () => {
  beforeAll(() => {
    tmpDir = mkdtempSync(join(process.cwd(), '.tmp-dsc-test-'))
    createTempFile('search.txt', 'hello world\nfoo bar\nHELLO')
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should find matching lines', async () => {
    const result = await grepTool.execute({ pattern: 'hello', path: tmpDir })
    expect(result.success).toBe(true)
    expect(result.output.length).toBeGreaterThan(0)
  })

  it('should return no matches for nonexistent pattern', async () => {
    const result = await grepTool.execute({ pattern: 'zzz_nonexistent_zzz', path: tmpDir })
    expect(result.success).toBe(true)
    expect(result.output).toBe('No matches found')
  })

  it('should filter by glob', async () => {
    const result = await grepTool.execute({ pattern: 'hello', glob: '*.txt', path: tmpDir })
    expect(result.success).toBe(true)
  })
})
