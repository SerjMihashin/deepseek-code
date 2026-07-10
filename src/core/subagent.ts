import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Named subagent definitions.
 *
 * A subagent is a REAL nested agent loop (spawned via the `run_agent` tool in
 * agent-loop.ts) with its own fresh context, restricted tools and budget.
 * This module only handles the optional named-agent definition files:
 *
 *   .deepseek-code/agents/<name>.md   (project)
 *   ~/.deepseek-code/agents/<name>.md (global)
 *
 * File format — YAML-ish frontmatter + markdown body used as the agent's
 * extra system-prompt instructions:
 *
 *   ---
 *   name: security-reviewer
 *   description: Reviews code for security issues
 *   tools: read_file, grep_search, glob
 *   model: deepseek-chat
 *   temperature: 0.2
 *   ---
 *   You are a security reviewer. Look for ...
 */
export interface SubAgentConfig {
  name: string;
  description: string;
  /** Markdown body — appended to the subagent's system prompt. */
  systemPrompt?: string;
  /** Allowlist of tool names (undefined = mode default). */
  allowedTools?: string[];
  /** Model override */
  model?: string;
  /** Temperature override */
  temperature?: number;
  /** Where the definition was loaded from (project/global path). */
  sourcePath?: string;
}

export function parseAgentConfig (content: string): SubAgentConfig | null {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!frontmatterMatch) return null

  const frontmatter: Record<string, string> = {}
  for (const line of frontmatterMatch[1].split(/\r?\n/)) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length > 0) {
      frontmatter[key.trim()] = rest.join(':').trim()
    }
  }

  if (!frontmatter.name) return null

  return {
    name: frontmatter.name,
    description: frontmatter.description ?? '',
    systemPrompt: frontmatterMatch[2].trim() || undefined,
    allowedTools: frontmatter.tools ? frontmatter.tools.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    model: frontmatter.model,
    temperature: frontmatter.temperature ? parseFloat(frontmatter.temperature) : undefined,
  }
}

function agentDirs (cwd: string): string[] {
  return [
    join(cwd, '.deepseek-code', 'agents'),
    join(homedir(), '.deepseek-code', 'agents'),
  ]
}

/**
 * List all named agent definitions visible from `cwd`.
 * Project definitions shadow global ones with the same name.
 */
export function listAgentConfigs (cwd: string): SubAgentConfig[] {
  const seen = new Map<string, SubAgentConfig>()
  for (const dir of agentDirs(cwd)) {
    if (!existsSync(dir)) continue
    let files: string[] = []
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.md'))
    } catch { continue }
    for (const file of files) {
      try {
        const path = join(dir, file)
        const config = parseAgentConfig(readFileSync(path, 'utf-8'))
        if (config && !seen.has(config.name)) {
          config.sourcePath = path
          seen.set(config.name, config)
        }
      } catch { /* skip unreadable/invalid definitions */ }
    }
  }
  return [...seen.values()]
}

/** Load a single named agent definition, or null if not found. */
export function loadAgentConfig (name: string, cwd: string): SubAgentConfig | null {
  return listAgentConfigs(cwd).find(a => a.name === name) ?? null
}
