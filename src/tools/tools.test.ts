import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'

// Keep a direct child-process smoke in this file; grep_search itself must also
// work without rg via its Node fallback.

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

  // ── Image & Jupyter support ──────────────────────────────────────────

  it('should read a PNG image as base64 data URL', async () => {
    // Minimal valid 1x1 pink PNG
    const pngBuf = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    )
    const filePath = join(tmpDir, 'image.png')
    writeFileSync(filePath, pngBuf)
    const result = await readTool.execute({ file_path: filePath })
    expect(result.success).toBe(true)
    expect(result.output).toContain('[Image:')
    expect(result.output).toContain('data:image/png;base64,')
    expect(result.output).toContain('Size:')
    expect(result.output).toContain('Type: image/png')
  })

  it('should read a JPG image as base64 data URL', async () => {
    // Minimal valid JPEG (1x1)
    const jpgBuf = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM',
      'base64'
    )
    const filePath = join(tmpDir, 'photo.jpg')
    writeFileSync(filePath, jpgBuf)
    const result = await readTool.execute({ file_path: filePath })
    // May fail validation but should still be detected as image
    expect(result.output).toContain('data:image/jpeg;base64,')
  })

  it('should read a Jupyter notebook', async () => {
    const notebook = {
      cells: [
        { cell_type: 'markdown', source: ['# Title\n', 'Some description'] },
        { cell_type: 'code', source: ['print("hello")\n', '# comment'] },
        { cell_type: 'raw', source: ['raw content'] },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    }
    const filePath = join(tmpDir, 'notebook.ipynb')
    writeFileSync(filePath, JSON.stringify(notebook), 'utf-8')
    const result = await readTool.execute({ file_path: filePath })
    expect(result.success).toBe(true)
    expect(result.output).toContain('### [markdown]')
    expect(result.output).toContain('# Title')
    expect(result.output).toContain('### [code]')
    expect(result.output).toContain('print("hello")')
    // raw cell should be filtered out
    expect(result.output).not.toContain('raw')
  })

  it('should handle empty notebook', async () => {
    const notebook = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 }
    const filePath = join(tmpDir, 'empty.ipynb')
    writeFileSync(filePath, JSON.stringify(notebook), 'utf-8')
    const result = await readTool.execute({ file_path: filePath })
    expect(result.success).toBe(true)
    expect(result.output).toContain('no code or markdown cells')
  })

  it('should read a PDF and extract text', async () => {
    // Minimal PDF with embedded text
    const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Hello PDF World) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000340 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
446
%%EOF`
    const filePath = join(tmpDir, 'doc.pdf')
    writeFileSync(filePath, pdf, 'utf-8')
    const result = await readTool.execute({ file_path: filePath })
    expect(result.success).toBe(true)
    expect(result.output).toContain('[PDF:')
    expect(result.output).toContain('data:application/pdf;base64,')
    expect(result.output).toContain('Extracted text:')
    expect(result.output).toContain('Hello PDF World')
  })

  it('should read a PDF with no extractable text', async () => {
    // PDF with only binary stream content (no readable text)
    const buf = Buffer.from('%PDF-1.4\n%\xFF\xFE\x00\x01\x02\x03\x04\x05\x06\x07')
    const filePath = join(tmpDir, 'binary.pdf')
    writeFileSync(filePath, buf)
    const result = await readTool.execute({ file_path: filePath })
    expect(result.success).toBe(true)
    expect(result.output).toContain('[PDF:')
    expect(result.output).toContain('data:application/pdf;base64,')
    // With real binary PDF streams the text extraction is minimal; always has data URL
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

  it('should reject broad process-kill commands that can terminate the agent', async () => {
    const commands = [
      'taskkill /F /IM node.exe',
      'taskkill /IM node.exe /F',
      'Stop-Process -Name node -Force',
      'pkill node',
      'killall node',
    ]

    for (const command of commands) {
      const result = await bashTool.execute({ command })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Blocked for security')
      expect(result.error).toContain('broad process-kill')
    }
  })

  it('should reject common Unix inspection commands on Windows', async () => {
    if (process.platform !== 'win32') return

    const result = await bashTool.execute({ command: 'head package.json' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Windows shell policy')
    expect(result.error).toContain('Get-Content')
  })

  it('should reject mkdir -p on Windows to avoid literal dash-p directories', async () => {
    if (process.platform !== 'win32') return

    const result = await bashTool.execute({ command: 'mkdir -p frontend/app/components' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('mkdir -p')
    expect(result.error).toContain('"-p" directory')
  })

  it('should execute PowerShell commands through PowerShell on Windows', async () => {
    if (process.platform !== 'win32') return

    const result = await bashTool.execute({ command: 'Write-Output "powershell-ok"' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('powershell-ok')
  })

  it('should execute PowerShell pipeline cmdlets through PowerShell on Windows', async () => {
    if (process.platform !== 'win32') return

    const result = await bashTool.execute({ command: 'Write-Output "one","two" | Select-Object -First 1' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('one')
  })

  it('should reject cmd chaining mixed with PowerShell cmdlets on Windows', async () => {
    if (process.platform !== 'win32') return

    const result = await bashTool.execute({ command: 'cd "." && Remove-Item "temp.txt" -Force' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('PowerShell cmdlets')
    expect(result.error).toContain('&&')
  })

  it('should reject changing directory outside the workspace', async () => {
    const outsideProject = join(process.cwd(), '..', 'AgentOS')
    const result = await bashTool.execute({ command: `cd "${outsideProject}"` })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Workspace policy')
    expect(result.error).toContain('outside the current workspace')
  })

  it('should reject mutating PowerShell paths outside the workspace on Windows', async () => {
    if (process.platform !== 'win32') return

    const outsideProject = join(process.cwd(), '..', 'AgentOS', 'frontend')
    const result = await bashTool.execute({ command: `Remove-Item "${outsideProject}" -Recurse -Force` })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Workspace policy')
    expect(result.error).toContain('outside the current workspace')
  })

  it('should allow recursive Remove-Item for explicit paths inside the workspace on Windows', async () => {
    if (process.platform !== 'win32') return

    const safeDir = mkdtempSync(join(process.cwd(), '.tmp-dsc-test-safe-remove-'))
    writeFileSync(join(safeDir, 'file.txt'), 'safe', 'utf-8')
    const result = await bashTool.execute({ command: `Remove-Item "${safeDir}" -Recurse -Force` })
    expect(result.success).toBe(true)
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
  }, 15000)

  it('should return empty for no matches', async () => {
    const result = await globTool.execute({ pattern: join(tmpDir, '*.nonexistent') })
    expect(result.success).toBe(true)
    expect(result.output).toBe('No files found matching pattern')
  })
})

describe('grep_search tool', () => {
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
