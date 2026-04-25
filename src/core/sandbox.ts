import { execSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

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

const DEFAULT_IMAGE = 'node:20-alpine';

/**
 * Sandbox for isolated command execution using Docker.
 * Falls back to direct execution if Docker is not available.
 */
export class Sandbox {
  private dockerAvailable: boolean | null = null;

  async isDockerAvailable(): Promise<boolean> {
    if (this.dockerAvailable !== null) return this.dockerAvailable;

    try {
      execSync('docker --version', { encoding: 'utf-8', stdio: 'pipe', windowsHide: true });
      this.dockerAvailable = true;
    } catch {
      this.dockerAvailable = false;
    }

    return this.dockerAvailable;
  }

  async execute(command: string, options: SandboxOptions = {}): Promise<SandboxResult> {
    const startTime = Date.now();

    if (await this.isDockerAvailable()) {
      return this.executeInDocker(command, options, startTime);
    }

    // Fallback: direct execution
    return this.executeDirect(command, options, startTime);
  }

  private async executeInDocker(command: string, options: SandboxOptions, startTime: number): Promise<SandboxResult> {
    const containerName = `dsc-sandbox-${randomUUID().slice(0, 8)}`;
    const image = options.image ?? DEFAULT_IMAGE;
    const timeout = options.timeout ?? 120000;

    const dockerArgs = [
      'run',
      '--rm',
      '--name', containerName,
      '--network', options.network === 'full' ? 'bridge' : 'none',
      '-w', '/workspace',
    ];

    if (options.mountProject !== false) {
      dockerArgs.push('-v', `${process.cwd()}:/workspace`);
    }

    if (options.mounts) {
      for (const m of options.mounts) {
        dockerArgs.push('-v', `${m.host}:${m.container}`);
      }
    }

    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        dockerArgs.push('-e', `${key}=${value}`);
      }
    }

    dockerArgs.push(image, 'sh', '-c', command);

    try {
      const output = execSync(dockerArgs.join(' '), {
        encoding: 'utf-8',
        timeout,
        windowsHide: true,
        stdio: 'pipe',
      });

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message,
        exitCode: error.status ?? 1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executeDirect(command: string, options: SandboxOptions, startTime: number): Promise<SandboxResult> {
    const timeout = options.timeout ?? 120000;

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message,
        exitCode: error.status ?? 1,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// Singleton
export const sandbox = new Sandbox();
