import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
  /** URL to POST to (for 'http' type) */
  url?: string;
  /** Optional: only trigger if tool name matches this pattern */
  matcher?: string;
  /** Optional: timeout in ms */
  timeout?: number;
  /** Optional: if true, hook runs asynchronously */
  async?: boolean;
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

export class HooksManager {
  private hooks: HookConfig[] = []

  async load (configDir?: string): Promise<void> {
    this.hooks = []

    const paths = [
      join(configDir ?? process.cwd(), '.deepseek-code', 'hooks.json'),
      join(process.cwd(), '.deepseek-code', 'hooks.json'),
    ]

    for (const p of paths) {
      if (existsSync(p)) {
        try {
          const content = await readFile(p, 'utf-8')
          const configs = JSON.parse(content) as HookConfig[]
          this.hooks.push(...configs)
        } catch { /* ignore */ }
      }
    }
  }

  getHooks (event: HookEvent): HookConfig[] {
    return this.hooks.filter(h => h.event === event)
  }

  async execute (event: HookEvent, context: HookContext): Promise<void> {
    const matchingHooks = this.getHooks(event)

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
      } else {
        await this.runHook(hook, context)
      }
    }
  }

  private async runHook (hook: HookConfig, context: HookContext): Promise<void> {
    if (hook.type === 'command' && hook.command) {
      try {
        const cmd = interpolateCommand(hook.command, context)
        execSync(cmd, {
          timeout: hook.timeout ?? 30000,
          encoding: 'utf-8',
          windowsHide: true,
          stdio: 'pipe',
        })
      } catch (err) {
        console.error(`[Hook ${hook.name}] Error:`, (err as Error).message)
      }
    }
  }
}

function interpolateCommand (command: string, context: HookContext): string {
  return command
    .replace(/\{\{event\}\}/g, context.event)
    .replace(/\{\{toolName\}\}/g, context.toolName ?? '')
    .replace(/\{\{projectDir\}\}/g, context.projectDir)
    .replace(/\{\{error\}\}/g, context.error ?? '')
}

// Singleton
export const hooksManager = new HooksManager()
