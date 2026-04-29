import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rm, writeFile } from 'node:fs/promises'
import { existsSync, mkdtempSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dirs = vi.hoisted(() => ({
  home: '',
  project: '',
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => dirs.home,
  }
})

const { createCheckpoint, listCheckpoints, restoreCheckpoint } = await import('./checkpoint.js')

function git (command: string): string {
  return execSync(command, { cwd: dirs.project, encoding: 'utf-8', stdio: 'pipe' })
}

describe('checkpoint', () => {
  const originalCwd = process.cwd()

  beforeEach(async () => {
    dirs.home = mkdtempSync(join(tmpdir(), 'dsc-checkpoint-home-'))
    dirs.project = mkdtempSync(join(tmpdir(), 'dsc-checkpoint-project-'))
    process.chdir(dirs.project)

    git('git init')
    git('git config user.email "test@example.com"')
    git('git config user.name "Test User"')
    await writeFile(join(dirs.project, 'file.txt'), 'base\n', 'utf-8')
    git('git add file.txt')
    git('git commit -m "initial"')
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await rm(dirs.home, { recursive: true, force: true })
    await rm(dirs.project, { recursive: true, force: true })
  })

  it('creates and lists checkpoints for current git repository', async () => {
    await writeFile(join(dirs.project, 'file.txt'), 'changed\n', 'utf-8')

    const checkpoint = await createCheckpoint('before risky edit')
    const checkpoints = await listCheckpoints()

    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.message).toBe('before risky edit')
    expect(checkpoint?.files).toContain('file.txt')
    expect(checkpoints[0]).toMatchObject({
      id: checkpoint?.id,
      message: 'before risky edit',
    })
  })

  it('returns null outside git repositories', async () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'dsc-checkpoint-non-git-'))
    process.chdir(nonGitDir)

    await expect(createCheckpoint('no repo')).resolves.toBeNull()
    process.chdir(dirs.project)
    await rm(nonGitDir, { recursive: true, force: true })
  })

  it('returns false for missing checkpoint patches', async () => {
    await expect(restoreCheckpoint('missing')).resolves.toBe(false)
  })

  it('restores a checkpoint patch onto a clean working tree', async () => {
    await writeFile(join(dirs.project, 'file.txt'), 'changed\n', 'utf-8')
    const checkpoint = await createCheckpoint('changed state')
    expect(checkpoint).not.toBeNull()

    git('git checkout -- file.txt')
    expect(git('git status --porcelain')).toBe('')

    await expect(restoreCheckpoint(checkpoint!.id)).resolves.toBe(true)
    expect(git('git status --porcelain')).toContain('M file.txt')
  })

  it('does not create a patch file when there are no changes', async () => {
    const checkpoint = await createCheckpoint('clean state')
    expect(checkpoint).not.toBeNull()

    const checkpointRoot = join(dirs.home, '.deepseek-code', 'checkpoints')
    expect(existsSync(checkpointRoot)).toBe(true)
    await expect(restoreCheckpoint(checkpoint!.id)).resolves.toBe(false)
  })
})
