import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DeepSeekAPI, type ChatMessage } from '../api/index.js'
import type { DeepSeekConfig } from '../config/defaults.js'

export interface SubAgentConfig {
  name: string;
  description: string;
  systemPrompt?: string;
  /** Allowlist of tool names (empty = all allowed) */
  allowedTools?: string[];
  /** Blocklist of tool names */
  disallowedTools?: string[];
  /** Model override */
  model?: string;
  /** Temperature override */
  temperature?: number;
}

export interface SubAgentResult {
  name: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export class SubAgent extends EventEmitter {
  private api: DeepSeekAPI
  private config: SubAgentConfig

  constructor (config: SubAgentConfig, apiConfig: DeepSeekConfig) {
    super()
    this.config = config
    this.api = new DeepSeekAPI({
      ...apiConfig,
      model: config.model ?? apiConfig.model,
      temperature: config.temperature ?? apiConfig.temperature,
      systemPrompt: config.systemPrompt ?? apiConfig.systemPrompt,
    })
  }

  async run (task: string, context?: ChatMessage[]): Promise<SubAgentResult> {
    const startTime = Date.now()
    this.emit('start', { name: this.config.name, task })

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: this.config.systemPrompt ?? `You are a specialized sub-agent: ${this.config.description}. Focus on your specific task and provide clear, actionable results.` },
        ...(context ?? []),
        { role: 'user', content: task },
      ]

      const response = await this.api.chat(messages)

      const result: SubAgentResult = {
        name: this.config.name,
        success: true,
        output: response.content,
        durationMs: Date.now() - startTime,
      }

      this.emit('complete', result)
      return result
    } catch (err) {
      const result: SubAgentResult = {
        name: this.config.name,
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - startTime,
      }

      this.emit('error', result)
      return result
    }
  }
}

export class SubAgentManager {
  private agents: Map<string, SubAgent> = new Map()
  private apiConfig: DeepSeekConfig | null = null

  setApiConfig (apiConfig: DeepSeekConfig): void {
    this.apiConfig = apiConfig
  }

  registerAgent (config: SubAgentConfig, apiConfig: DeepSeekConfig): SubAgent {
    this.setApiConfig(apiConfig)
    const agent = new SubAgent(config, apiConfig)
    this.agents.set(config.name, agent)
    return agent
  }

  getAgent (name: string): SubAgent | undefined {
    return this.agents.get(name)
  }

  async runAll (task: string, context?: ChatMessage[]): Promise<SubAgentResult[]> {
    const promises: Promise<SubAgentResult>[] = []
    for (const agent of this.agents.values()) {
      promises.push(agent.run(task, context))
    }
    return Promise.all(promises)
  }

  async runNamed (names: string[], task: string, context?: ChatMessage[]): Promise<SubAgentResult[]> {
    const promises: Promise<SubAgentResult>[] = []
    for (const name of names) {
      const agent = this.agents.get(name)
      if (agent) {
        promises.push(agent.run(task, context))
      }
    }
    return Promise.all(promises)
  }

  /**
   * Load subagent configs from .deepseek-code/agents/ directory
   */
  async loadFromDir (dir?: string): Promise<void> {
    const agentsDir = dir ?? join(process.cwd(), '.deepseek-code', 'agents')

    if (!existsSync(agentsDir)) return

    const files = await (await import('node:fs/promises')).readdir(agentsDir)
    for (const file of files.filter(f => f.endsWith('.md'))) {
      try {
        const content = await readFile(join(agentsDir, file), 'utf-8')
        const config = parseAgentConfig(content)
        if (config && this.apiConfig) {
          this.agents.set(config.name, new SubAgent(config, this.apiConfig))
        }
      } catch { /* ignore */ }
    }
  }
}

function parseAgentConfig (content: string): SubAgentConfig | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!frontmatterMatch) return null

  const frontmatter: Record<string, string> = {}
  for (const line of frontmatterMatch[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length > 0) {
      frontmatter[key.trim()] = rest.join(':').trim()
    }
  }

  if (!frontmatter.name) return null

  return {
    name: frontmatter.name,
    description: frontmatter.description ?? '',
    systemPrompt: frontmatterMatch[2].trim(),
    allowedTools: frontmatter.tools ? frontmatter.tools.split(',').map(t => t.trim()) : undefined,
    disallowedTools: frontmatter.disallowedTools ? frontmatter.disallowedTools.split(',').map(t => t.trim()) : undefined,
    model: frontmatter.model,
    temperature: frontmatter.temperature ? parseFloat(frontmatter.temperature) : undefined,
  }
}

// Singleton
export const subAgentManager = new SubAgentManager()
