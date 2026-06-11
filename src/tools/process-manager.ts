import net from 'node:net'
import { platform } from 'node:os'
import { type ChildProcess } from 'node:child_process'
import { spawnShellCommand, killProcessTree, killProcessTreeSync } from './shell.js'

interface BackgroundProcess {
  pid: number;
  command: string;
  child: ChildProcess;
  output: string; // bounded tail of stdout+stderr
  exited: boolean;
  exitInfo?: string;
}

const MAX_BG_OUTPUT = 16 * 1024
const registry = new Map<number, BackgroundProcess>()
let exitHookInstalled = false

/** Kill any still-running background processes when the CLI exits (no orphaned dev servers). */
function ensureExitHook (): void {
  if (exitHookInstalled) return
  exitHookInstalled = true
  process.once('exit', () => {
    for (const proc of registry.values()) {
      if (!proc.exited) killProcessTreeSync(proc.pid)
    }
  })
}

/** Start a long-running command in the background. Returns its pid (or an error). */
export function startBackground (command: string): { pid: number | null; error?: string } {
  ensureExitHook()
  const child = spawnShellCommand(command, platform() !== 'win32')
  if (child.pid == null) return { pid: null, error: 'Failed to start background process.' }

  const entry: BackgroundProcess = { pid: child.pid, command, child, output: '', exited: false }
  registry.set(child.pid, entry)

  const append = (chunk: string) => {
    entry.output += chunk
    if (entry.output.length > MAX_BG_OUTPUT) entry.output = entry.output.slice(-MAX_BG_OUTPUT)
  }
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  child.on('error', (err) => { entry.exited = true; entry.exitInfo = `error: ${(err as Error).message}` })
  child.on('close', (code, signal) => {
    entry.exited = true
    entry.exitInfo = `exited (code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''})`
  })

  return { pid: child.pid }
}

export function getBackgroundOutput (pid: number): string {
  return registry.get(pid)?.output ?? ''
}

export function isBackgroundRunning (pid: number): boolean {
  const proc = registry.get(pid)
  return !!proc && !proc.exited
}

export function getBackgroundExitInfo (pid: number): string | undefined {
  return registry.get(pid)?.exitInfo
}

/** Stop a background process (kills its whole tree) and return its captured output. */
export function stopBackground (pid: number): { stopped: boolean; output: string; error?: string } {
  const proc = registry.get(pid)
  if (!proc) return { stopped: false, output: '', error: `No background process with pid ${pid}.` }
  if (!proc.exited) killProcessTree(proc.child)
  const output = proc.output
  registry.delete(pid)
  return { stopped: true, output }
}

/** Poll a TCP port until it accepts a connection or the timeout elapses. */
export function waitForPort (port: number, host: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ port, host })
      let settled = false
      const retryOrFail = () => {
        if (settled) return
        settled = true
        socket.destroy()
        if (Date.now() >= deadline) resolve(false)
        else setTimeout(attempt, 300)
      }
      socket.once('connect', () => {
        if (settled) return
        settled = true
        socket.destroy()
        resolve(true)
      })
      socket.once('error', retryOrFail)
      socket.setTimeout(2000, retryOrFail)
    }
    attempt()
  })
}
