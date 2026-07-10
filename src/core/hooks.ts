import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnShellCommand, killProcessTree } from '../tools/shell.js'

/**
 * Lifecycle hooks — user-defined shell commands that run on agent events.
 *
 * Config: `.deepseek-code/hooks.json` (project) and `~/.deepseek-code/hooks.json`
 * (global), a JSON array of HookConfig. Example — auto-lint after every edit and
 * feed the lint output back to the model:
 *
 *   [{ "name": "lint-after-edit", "event": "PostToolUse",
 *      "matcher": "^(edit|write_file)$",
 *      "command": "npx eslint {{filePath}}",
 *      "addOutput": true }]
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'AgentLoopStart'
  | 'SubagentStart'
  | 'SubagentStop'

export interface HookConfig {
  /** Hook name */
  name: string;
  /** Event that triggers this hook */
  event: HookEvent;
  /** Type of hook */
  type: 'command' | 'http';
  /** Shell command to execute (for 'command' type) */
  command?: string;
  /** URL to POST the context to as JSON (for 'http' type) */
  url?: string;
  /** Optional: only trigger if tool name matches this pattern */
  matcher?: string;
  /** Optional: timeout in ms (default 30000) */
  timeout?: number;
  /** Optional: if true, hook runs fire-and-forget */
  async?: boolean;
  /** PreToolUse only: non-zero exit code blocks the tool call. */
  blocking?: boolean;
  /** PostToolUse/PostToolUseFailure: append the hook's stdout to the tool result the model sees. */
  addOutput?: boolean;
}

export interface HookContext {
  event: HookEvent;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  error?: string;
  projectDir: string;
  messageCount?: number;
}

/** Aggregated outcome of all hooks that ran for one event. */
export interface HookExecutionResult {
  /** True if a blocking PreToolUse hook failed — the tool call must be rejected. */
  blocked: boolean;
  /** Which hook blocked and why. */
  blockReason?: string;
  /** stdout of hooks with addOutput: true (for the model). */
  outputs: Array<{ name: string; output: string }>;
}

const EMPTY_RESULT: HookExecutionResult = { blocked: false, outputs: [] }
const MAX_HOOK_OUTPUT = 8_000

export class HooksManager {
  private hooks: HookConfig[] = []

  async load (configDir?: string): Promise<void> {
    this.hooks = []

    const paths = [...new Set([
      join(configDir ?? process.cwd(), '.deepseek-code', 'hooks.json'),
      join(process.cwd(), '.deepseek-code', 'hooks.json'),
      join(homedir(), '.deepseek-code', 'hooks.json'),
    ])]

    for (const p of paths) {
      if (existsSync(p)) {
        try {
          const content = await readFile(p, 'utf-8')
          const configs = JSON.parse(content) as HookConfig[]
          if (Array.isArray(configs)) this.hooks.push(...configs.filter(h => h && h.name && h.event))
        } catch { /* ignore invalid config files */ }
      }
    }
  }

  getHooks (event: HookEvent): HookConfig[] {
    return this.hooks.filter(h => h.event === event)
  }

  /** All loaded hooks (for the /hooks command). */
  listHooks (): HookConfig[] {
    return [...this.hooks]
  }

  async execute (event: HookEvent, context: HookContext): Promise<HookExecutionResult> {
    const matchingHooks = this.getHooks(event)
    if (matchingHooks.length === 0) return EMPTY_RESULT

    const result: HookExecutionResult = { blocked: false, outputs: [] }

    for (const hook of matchingHooks) {
      // Check matcher
      if (hook.matcher && context.toolName) {
        try {
          const regex = new RegExp(hook.matcher)
          if (!regex.test(context.toolName)) continue
        } catch {
          // Invalid regex, skip
          continue
        }
      }

      if (hook.async) {
        // Fire and forget
        this.runHook(hook, context).catch(() => {})
        continue
      }

      try {
        const run = await this.runHook(hook, context)
        if (run) {
          if (hook.blocking && event === 'PreToolUse' && !run.ok) {
            result.blocked = true
            result.blockReason = `Hook "${hook.name}" blocked this tool call` +
              (run.output.trim() ? `: ${run.output.trim().slice(0, 400)}` : '.')
          }
          if (hook.addOutput && run.output.trim()) {
            result.outputs.push({ name: hook.name, output: run.output.trim().slice(0, MAX_HOOK_OUTPUT) })
          }
        }
      } catch { /* a broken hook must never break the agent */ }
    }

    return result
  }

  private async runHook (hook: HookConfig, context: HookContext): Promise<{ ok: boolean; output: string } | null> {
    if (hook.type === 'http' && hook.url) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), hook.timeout ?? 30000)
        await fetch(hook.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(context),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer))
        return { ok: true, output: '' }
      } catch (err) {
        return { ok: false, output: (err as Error).message }
      }
    }

    if (hook.type !== 'command' || !hook.command) return null

    const cmd = interpolateCommand(hook.command, context)
    return await runHookCommand(cmd, hook.timeout ?? 30000, buildHookEnv(context))
  }
}

/** Async command runner: same shell as the agent's tools, env context, hard timeout. */
function runHookCommand (command: string, timeout: number, env: Record<string, string>): Promise<{ ok: boolean; output: string }> {
  return new Promise(resolve => {
    const child = spawnShellCommand(command, false, env)
    let output = ''
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok, output })
    }
    const timer = setTimeout(() => {
      killProcessTree(child)
      output += `\n[hook timed out after ${timeout}ms]`
      finish(false)
    }, timeout)
    child.stdout?.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { output += d.toString() })
    child.on('error', () => finish(false))
    child.on('close', code => finish(code === 0))
  })
}

function firstFilePath (context: HookContext): string {
  const input = context.toolInput ?? {}
  const candidate = input.file_path ?? input.path ?? input.file ?? ''
  return typeof candidate === 'string' ? candidate : ''
}

function buildHookEnv (context: HookContext): Record<string, string> {
  return {
    DSC_EVENT: context.event,
    DSC_TOOL: context.toolName ?? '',
    DSC_FILE: firstFilePath(context),
    DSC_PROJECT_DIR: context.projectDir,
    DSC_ERROR: context.error ?? '',
    DSC_TOOL_ARGS: safeJson(context.toolInput),
  }
}

function safeJson (value: unknown): string {
  try {
    return value === undefined ? '' : JSON.stringify(value)
  } catch {
    return ''
  }
}

function interpolateCommand (command: string, context: HookContext): string {
  return command
    .replace(/\{\{event\}\}/g, context.event)
    .replace(/\{\{toolName\}\}/g, context.toolName ?? '')
    .replace(/\{\{projectDir\}\}/g, context.projectDir)
    .replace(/\{\{error\}\}/g, context.error ?? '')
    .replace(/\{\{filePath\}\}/g, firstFilePath(context))
}

// Singleton
export const hooksManager = new HooksManager()
