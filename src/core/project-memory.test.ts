import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadMemoryContext, appendProjectMemory, getProjectMemoryPath, gatherProjectFacts, renderInitDoc, initProjectMemory } from './project-memory.js'

describe('project-memory', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsc-mem-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty string when there are no memory files', () => {
    expect(loadMemoryContext(dir)).toBe('')
  })

  it('loads a project DEEPSEEK.md into a ## Memory section', () => {
    writeFileSync(join(dir, 'DEEPSEEK.md'), '# Notes\n- always use tabs', 'utf-8')
    const out = loadMemoryContext(dir)
    expect(out).toContain('## Memory')
    expect(out).toContain('always use tabs')
  })

  it('also picks up AGENTS.md (Codex compat) and CLAUDE.md', () => {
    writeFileSync(join(dir, 'AGENTS.md'), 'codex note here', 'utf-8')
    writeFileSync(join(dir, 'CLAUDE.md'), 'claude note here', 'utf-8')
    const out = loadMemoryContext(dir)
    expect(out).toContain('codex note here')
    expect(out).toContain('claude note here')
  })

  it('ignores empty files', () => {
    writeFileSync(join(dir, 'DEEPSEEK.md'), '   \n  ', 'utf-8')
    expect(loadMemoryContext(dir)).toBe('')
  })

  it('appendProjectMemory creates the file and appends bullets', async () => {
    const p1 = await appendProjectMemory(dir, 'first note')
    expect(p1).toBe(getProjectMemoryPath(dir))
    expect(existsSync(p1)).toBe(true)
    await appendProjectMemory(dir, 'second note')
    const content = readFileSync(p1, 'utf-8')
    expect(content).toContain('- first note')
    expect(content).toContain('- second note')
    // and it loads back into context
    expect(loadMemoryContext(dir)).toContain('second note')
  })

  it('gatherProjectFacts extracts name, scripts and stack from package.json', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'demo-app',
      description: 'a demo',
      version: '1.2.3',
      scripts: { build: 'tsc', test: 'vitest run' },
      dependencies: { react: '^18.0.0' },
      devDependencies: { typescript: '^5.0.0', vitest: '^4.0.0' },
    }), 'utf-8')
    writeFileSync(join(dir, 'package-lock.json'), '{}', 'utf-8')
    const facts = gatherProjectFacts(dir)
    expect(facts.name).toBe('demo-app')
    expect(facts.scripts.build).toBe('tsc')
    expect(facts.packageManager).toBe('npm')
    expect(facts.stack).toContain('React')
    expect(facts.stack).toContain('TypeScript')
  })

  it('renderInitDoc includes real commands and structure', () => {
    const doc = renderInitDoc({
      name: 'demo-app',
      scripts: { build: 'tsc', test: 'vitest run' },
      stack: ['TypeScript'],
      languages: ['TypeScript'],
      topLevel: ['src/'],
      packageManager: 'npm',
    })
    expect(doc).toContain('# demo-app')
    expect(doc).toContain('npm run build')
    expect(doc).toContain('`src/`')
  })

  it('initProjectMemory writes the file once and refuses to overwrite without force', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app' }), 'utf-8')
    const p1 = await initProjectMemory(dir)
    expect(p1).toBe(getProjectMemoryPath(dir))
    expect(readFileSync(p1!, 'utf-8')).toContain('# demo-app')
    // second call without force → null (no overwrite)
    expect(await initProjectMemory(dir)).toBeNull()
    // force → rewrites
    expect(await initProjectMemory(dir, true)).toBe(p1)
  })
})
