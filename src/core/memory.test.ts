import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const dirs = vi.hoisted(() => ({
  home: '',
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => dirs.home,
  }
})

const {
  cosineSimilarity,
  deleteMemory,
  listMemories,
  readMemory,
  saveMemory,
  searchMemories,
  semanticSearchMemories,
} = await import('./memory.js')

describe('memory', () => {
  beforeEach(() => {
    dirs.home = mkdtempSync(join(process.cwd(), '.tmp-memory-home-'))
  })

  afterEach(async () => {
    await rm(dirs.home, { recursive: true, force: true })
  })

  it('saves, lists, and reads memory entries', async () => {
    await saveMemory({
      name: 'Project Rules',
      description: 'Coding style for this project',
      type: 'project',
      content: 'Use TypeScript and focused tests.',
    })

    expect(await listMemories()).toEqual([
      {
        name: 'Project Rules',
        file: 'project_rules.md',
        description: 'Coding style for this project',
      },
    ])

    const entry = await readMemory('Project Rules')
    expect(entry).toMatchObject({
      name: 'Project Rules',
      description: 'Coding style for this project',
      type: 'project',
      content: 'Use TypeScript and focused tests.',
    })
  })

  it('updates an existing memory index entry instead of duplicating it', async () => {
    await saveMemory({
      name: 'Project Rules',
      description: 'old',
      type: 'project',
      content: 'old content',
    })
    await saveMemory({
      name: 'Project Rules',
      description: 'new',
      type: 'project',
      content: 'new content',
    })

    const memories = await listMemories()
    expect(memories).toHaveLength(1)
    expect(memories[0].description).toBe('new')
    expect((await readMemory('Project Rules'))?.content).toBe('new content')
  })

  it('searches by name and description', async () => {
    await saveMemory({
      name: 'User Preference',
      description: 'likes compact reports',
      type: 'user',
      content: 'Keep final answers short.',
    })

    expect(await searchMemories('compact')).toHaveLength(1)
    expect(await searchMemories('preference')).toHaveLength(1)
    expect(await searchMemories('missing')).toHaveLength(0)
  })

  it('deletes memory and rebuilds the index', async () => {
    await saveMemory({
      name: 'A',
      description: 'first',
      type: 'reference',
      content: 'one',
    })
    await saveMemory({
      name: 'B',
      description: 'second',
      type: 'reference',
      content: 'two',
    })

    await expect(deleteMemory('A')).resolves.toBe(true)
    await expect(deleteMemory('A')).resolves.toBe(false)

    const index = await readFile(join(dirs.home, '.deepseek-code', 'memory', 'MEMORY.md'), 'utf-8')
    expect(index).not.toContain('[A]')
    expect(index).toContain('[B]')
  })

  it('falls back to substring search when embeddings are not initialized', async () => {
    await saveMemory({
      name: 'Review Notes',
      description: 'security checklist',
      type: 'feedback',
      content: 'Check path traversal.',
    })

    await expect(semanticSearchMemories('security')).resolves.toEqual([
      {
        name: 'Review Notes',
        file: 'review_notes.md',
        description: 'security checklist',
        score: 1,
      },
    ])
  })

  it('computes cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
    expect(cosineSimilarity([1], [1, 0])).toBe(0)
  })
})
