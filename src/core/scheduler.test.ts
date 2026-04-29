import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
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

const { Scheduler } = await import('./scheduler.js')

describe('Scheduler', () => {
  beforeEach(() => {
    dirs.home = mkdtempSync(join(process.cwd(), '.tmp-scheduler-home-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(dirs.home, { recursive: true, force: true })
  })

  it('parses interval strings', () => {
    expect(Scheduler.parseInterval('30s')).toBe(30_000)
    expect(Scheduler.parseInterval('5m')).toBe(300_000)
    expect(Scheduler.parseInterval('5min')).toBe(300_000)
    expect(Scheduler.parseInterval('2h')).toBe(7_200_000)
    expect(Scheduler.parseInterval('bad')).toBe(600_000)
  })

  it('runs tasks on interval and removes them after maxRuns', async () => {
    const scheduler = new Scheduler()
    const callback = vi.fn(async (_prompt: string) => {})
    scheduler.setCallback(callback)

    const task = scheduler.addTask('check build', 1000, 1)
    expect(scheduler.count).toBe(1)
    expect(task.prompt).toBe('check build')

    await vi.advanceTimersByTimeAsync(1000)
    expect(callback).toHaveBeenCalledWith('check build')
    expect(scheduler.listTasks()[0].runCount).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(scheduler.count).toBe(0)
  })

  it('removes and clears tasks', () => {
    const scheduler = new Scheduler()
    const first = scheduler.addTask('first', 1000)
    scheduler.addTask('second', 1000)

    expect(scheduler.removeTask(first.id)).toBe(true)
    expect(scheduler.removeTask(first.id)).toBe(false)
    expect(scheduler.count).toBe(1)

    scheduler.clearAll()
    expect(scheduler.count).toBe(0)
  })

  it('saves tasks to disk', async () => {
    const scheduler = new Scheduler()
    scheduler.addTask('persist me', 1000, 3)

    await scheduler.save()

    const content = await readFile(join(dirs.home, '.deepseek-code', 'scheduler-tasks.json'), 'utf-8')
    expect(JSON.parse(content)).toMatchObject([
      {
        prompt: 'persist me',
        interval: 1000,
        maxRuns: 3,
      },
    ])

    scheduler.clearAll()
  })

  it('loads persisted tasks and registers callback', async () => {
    const dir = join(dirs.home, '.deepseek-code')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'scheduler-tasks.json'), JSON.stringify([
      {
        id: 'old',
        prompt: 'loaded prompt',
        interval: 1000,
        lastRun: Date.now(),
        nextRun: Date.now() + 1000,
        runCount: 0,
        maxRuns: 1,
        createdAt: Date.now(),
      },
    ]), 'utf-8')

    const scheduler = new Scheduler()
    const callback = vi.fn(async (_prompt: string) => {})
    await scheduler.load(callback)

    await vi.advanceTimersByTimeAsync(1000)
    expect(scheduler.count).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(callback).toHaveBeenCalledWith('loaded prompt')
    scheduler.clearAll()
  })
})
