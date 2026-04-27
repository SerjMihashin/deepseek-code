import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { sep } from 'node:path'
import { platform } from 'node:os'

/** Convert Windows backslash paths to forward-slash paths for Docker mount syntax */
function toDockerPath (p: string): string {
  return p.split(sep).join('/')
}

export interface SandboxOptions {
  /** Docker image to use */
  image?: string;
  /** Timeout in ms */
  timeout?: number;
  /** Network access: none, isolated, full */
  network?: 'none' | 'isolated' | 'full';
  /** Mount current project directory */
  mountProject?: boolean;
  /** Additional directories to mount */
  mounts?: Array<{ host: string; container: string }>;
  /** Environment variables */
  env?: Record<string, string>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

const DEFAULT_IMAGE = 'node:20-alpine'

/**
 * Sandbox for isolated command execution using Docker.
 * Falls back to direct execution if Docker is not available.
 */
export class Sandbox {
  private dockerAvailable: boolean | null = null

  /**
   * Check if sandbox is supported on the current platform.
   * On Windows, sandbox requires Docker/WSL which may not be available.
   */
  isSupported (): boolean {
    // Direct execution fallback works on all platforms,
    // but Docker-based isolation is only meaningful with Docker/WSL.
    return true // direct execution always works
  }

  /**
   * Check if Docker-based sandbox (with isolation) is available.
   */
  async isDockerAvailable (): Promise<boolean> {
    if (this.dockerAvailable !== null) return this.dockerAvailable

    try {
      execSync('docker --version', { encoding: 'utf-8', stdio: 'pipe', windowsHide: true })
      this.dockerAvailable = true
    } catch {
      this.dockerAvailable = false
    }

    return this.dockerAvailable
  }

  /**
   * Get a human-readable reason why sandbox might be limited on this platform.
   */
  getCapabilityInfo (): { supported: boolean; reason?: string; action?: string } {
    const os = platform()
    if (os === 'win32') {
      return {
        supported: false,
        reason: 'current sandbox implementation requires Docker/WSL/Linux runtime',
        action: 'use WSL/Podman or disable sandbox command',
      }
    }
    return { supported: true }
  }

  async execute (command: string, options: SandboxOptions = {}): Promise<SandboxResult> {
    const startTime = Date.now()

    if (await this.isDockerAvailable()) {
      return this.executeInDocker(command, options, startTime)
    }

    // Fallback: direct execution
    return this.executeDirect(command, options, startTime)
  }

  private async executeInDocker (command: string, options: SandboxOptions, startTime: number): Promise<SandboxResult> {
    const containerName = `dsc-sandbox-${randomUUID().slice(0, 8)}`
    const image = options.image ?? DEFAULT_IMAGE
    const timeout = options.timeout ?? 120000

    const dockerArgs = [
      'run',
      '--rm',
      '--name', containerName,
      '--network', options.network === 'full' ? 'bridge' : 'none',
      '-w', '/workspace',
    ]

    if (options.mountProject !== false) {
      dockerArgs.push('-v', `${toDockerPath(process.cwd())}:/workspace`)
    }

    if (options.mounts) {
      for (const m of options.mounts) {
        dockerArgs.push('-v', `${toDockerPath(m.host)}:${m.container}`)
      }
    }

    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        dockerArgs.push('-e', `${key}=${value}`)
      }
    }

    dockerArgs.push(image, 'sh', '-c', command)

    try {
      const output = execSync(dockerArgs.join(' '), {
        encoding: 'utf-8',
        timeout,
        windowsHide: true,
        stdio: 'pipe',
      })

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      }
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string; status?: number }
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message,
        exitCode: error.status ?? 1,
        durationMs: Date.now() - startTime,
      }
    }
  }

  private async executeDirect (command: string, options: SandboxOptions, startTime: number): Promise<SandboxResult> {
    const timeout = options.timeout ?? 120000

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      })

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      }
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string; status?: number }
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message,
        exitCode: error.status ?? 1,
        durationMs: Date.now() - startTime,
      }
    }
  }
}

// Singleton
export const sandbox = new Sandbox()
