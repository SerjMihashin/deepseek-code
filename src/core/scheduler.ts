import { EventEmitter } from 'node:events'

export interface ScheduledTask {
  id: string;
  prompt: string;
  interval: number; // in milliseconds
  lastRun: number;
  nextRun: number;
  runCount: number;
  maxRuns?: number;
  createdAt: number;
}

export type TaskCallback = (prompt: string) => Promise<void>

/**
 * Simple in-memory scheduler for recurring tasks (/loop command).
 * Tasks run within the CLI session and are lost on exit.
 */
export class Scheduler extends EventEmitter {
  private tasks: Map<string, ScheduledTask> = new Map()
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map()
  private callback: TaskCallback | null = null

  setCallback (cb: TaskCallback): void {
    this.callback = cb
  }

  /**
   * Add a recurring task
   */
  addTask (prompt: string, intervalMs: number, maxRuns?: number): ScheduledTask {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const now = Date.now()

    const task: ScheduledTask = {
      id,
      prompt,
      interval: intervalMs,
      lastRun: 0,
      nextRun: now + intervalMs,
      runCount: 0,
      maxRuns,
      createdAt: now,
    }

    this.tasks.set(id, task)

    const timer = setInterval(async () => {
      const current = this.tasks.get(id)
      if (!current) {
        clearInterval(timer)
        return
      }

      // Check max runs
      if (current.maxRuns && current.runCount >= current.maxRuns) {
        this.removeTask(id)
        return
      }

      current.lastRun = Date.now()
      current.nextRun = current.lastRun + current.interval
      current.runCount++

      this.emit('taskRun', current)

      if (this.callback) {
        await this.callback(current.prompt)
      }
    }, intervalMs)

    this.timers.set(id, timer)

    return task
  }

  /**
   * Parse interval string (e.g., "5m", "1h", "30s") to milliseconds
   */
  static parseInterval (str: string): number {
    const match = str.match(/^(\d+)\s*(s|m|h|min)?$/)
    if (!match) return 10 * 60 * 1000 // default 10m

    const value = parseInt(match[1], 10)
    const unit = match[2] ?? 'm'

    switch (unit) {
      case 's': return value * 1000
      case 'm':
      case 'min': return value * 60 * 1000
      case 'h': return value * 3600 * 1000
      default: return value * 60 * 1000
    }
  }

  /**
   * Remove a task
   */
  removeTask (id: string): boolean {
    const timer = this.timers.get(id)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(id)
    }
    return this.tasks.delete(id)
  }

  /**
   * List all active tasks
   */
  listTasks (): ScheduledTask[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => a.nextRun - b.nextRun)
  }

  /**
   * Clear all tasks
   */
  clearAll (): void {
    for (const [id, timer] of this.timers) {
      clearInterval(timer)
      this.timers.delete(id)
    }
    this.tasks.clear()
  }

  /**
   * Get task count
   */
  get count (): number {
    return this.tasks.size
  }
}

// Singleton
export const scheduler = new Scheduler()
