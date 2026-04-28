import { DeepSeekAPI, type ChatMessage } from '../api/index.js'
import { type ToolDefinition, type ApprovalRequirement, toOpenAITools, sanitizeArgs } from '../tools/types.js'
import { getDefaultTools, getToolsForMode } from '../tools/registry.js'
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js'
import { EventEmitter } from 'node:events'
import { i18n } from './i18n.js'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { platform, release, type } from 'node:os'
import { MetricsCollector } from './metrics.js'
import { hooksManager } from './hooks.js'

export interface AgentLoopOptions {
  /** Maximum number of tool call iterations before stopping (default: 100) */
  maxIterations?: number;
  /** Timeout per tool execution in ms (default: 30000 for bash, 10000 for others) */
  toolTimeout?: number;
  /** Approval mode controlling which tools need confirmation */
  approvalMode?: ApprovalMode;
  /** Current working directory (project root) */
  cwd?: string;
  /** Callback when a tool call is made — used by UI for display */
  onToolCall?: (toolCall: ToolCallEvent) => void;
  /** Callback when a tool result is received */
  onToolResult?: (result: ToolResultEvent) => void;
  /** Callback for streaming text chunks */
  onStreamChunk?: (chunk: string) => void;
  /** Callback for streaming reasoning content from the model */
  onReasoningChunk?: (chunk: string) => void;
  /** Callback when agent produces final text response */
  onResponse?: (response: string) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Callback for approval requests — return true to approve, false to reject */
  onApprovalRequest?: (toolName: string, args: Record<string, unknown>, approval: ApprovalRequirement) => Promise<boolean>;
  /** Custom system prompt to prepend */
  systemPrompt?: string;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
}

export interface ToolCallEvent {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rejected';
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface ToolResultEvent {
  toolCallId: string;
  toolName: string;
  success: boolean;
  output: string;
  durationMs: number;
  error?: string;
}

/**
 * Build a dynamic system prompt with project context.
 */
function buildSystemPrompt (cwd?: string, approvalMode?: ApprovalMode): string {
  const osInfo = `${type()} ${release()} (${platform()})`
  let projectInfo = ''

  if (cwd) {
    projectInfo += '\n## Project Context\n'
    projectInfo += `- **Working directory:** \`${cwd}\`\n`
    projectInfo += `- **OS:** ${osInfo}\n`

    // Try to read package.json for project name and description
    const pkgPath = join(cwd, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        if (pkg.name) projectInfo += `- **Project:** ${pkg.name}\n`
        if (pkg.version) projectInfo += `- **Version:** ${pkg.version}\n`
        if (pkg.description) projectInfo += `- **Description:** ${pkg.description}\n`
      } catch {
        // Ignore parse errors
      }
    }

    // List top-level directory structure (non-recursive, max 30 entries)
    try {
      const entries = readdirSync(cwd, { withFileTypes: true })
      const dirs = entries.filter(e => e.isDirectory()).map(e => `  📁 ${e.name}/`).slice(0, 15)
      const files = entries.filter(e => e.isFile()).map(e => `  📄 ${e.name}`).slice(0, 15)
      if (dirs.length > 0 || files.length > 0) {
        projectInfo += '\n### Project Structure (top-level)\n'
        projectInfo += [...dirs, ...files].join('\n')
        if (entries.length > 30) {
          projectInfo += `\n  ... and ${entries.length - 30} more entries`
        }
      }
    } catch {
      // Ignore read errors
    }

    // Check for common config files
    const configFiles = ['.gitignore', '.env', '.editorconfig', 'tsconfig.json', 'eslint.config.js', '.prettierrc']
    const foundConfigs = configFiles.filter(f => existsSync(join(cwd, f)))
    if (foundConfigs.length > 0) {
      projectInfo += '\n### Config Files\n'
      projectInfo += foundConfigs.map(f => `  - \`${f}\``).join('\n')
    }
  }

  // Build tools capability section from registry
  const allTools = getDefaultTools()
  const mode = approvalMode ?? 'default'
  const modeTools = getToolsForMode(mode)
  const modeToolNames = new Set(modeTools.map(t => t.tool.name))

  const toolListLines = allTools.map(def => {
    const t = def.tool
    const available = modeToolNames.has(t.name)
    const note = available ? '' : ' (заблокирован в текущем режиме)'
    return `  - \`${t.name}\` — ${t.description}${note}`
  })

  const capabilitiesSection = [
    `\n## Current Mode: ${mode}`,
    '',
    ...toolListLines,
  ].join('\n')

  return `You are DeepSeek Code, an AI-powered CLI agent for software development.

You have access to a set of tools that allow you to read, write, and edit files, run shell commands, search code, and use a real browser when rendered UI or web behavior matters.${projectInfo}${capabilitiesSection}

## Guidelines
1. **Plan first** — Before making changes, explore the codebase to understand the context.
2. **Use the right tool** — Choose the most appropriate tool for each task.
3. **Be precise** — When editing files, provide exact text matches.
4. **Verify** — After changes, run tests or linting to ensure correctness.
5. **Explain** — After completing a task, summarize what was done.

## Tool Usage
- Read files with \`read_file\` before editing them
- Search with \`grep_search\` or \`glob\` to find relevant code
- Use \`run_shell_command\` to run build/test commands
- Create or overwrite files with \`write_file\`
- Make targeted edits with \`edit\` (prefer over write_file for small changes)
- Use \`chrome\` proactively for UI flows, localhost app validation, rendered DOM state, screenshots, console logs, and network inspection

When you need to run multiple tools, call them one at a time and wait for results before deciding the next step.

## Important
- ALWAYS use absolute paths when referring to files. The project root is \`${cwd || 'the current working directory'}\`.
- When asked to audit or explore the project, start with \`glob\`, \`grep_search\`, and targeted reads to discover structure.
- If the task implies a browser or rendered UI check, do not wait for the user to explicitly say "open browser" before using \`chrome\`.
- Do NOT guess file paths — use \`glob\` or \`grep_search\` to discover them first.
- When asked about your capabilities, answer based on the tools listed in the "Current Mode" section above. Do NOT claim you lack tools that are listed there but blocked by mode — instead explain that the current mode restricts them.
- If the user asks "what tools do you have" or "what are your capabilities", refer to this prompt's tool list. If write_file or edit are listed as blocked, explain that they exist but are restricted in the current mode.
- **CRITICAL: Never claim an action was performed without an actual tool call.** Do not say "opening browser", "running eval", "taking screenshot", "passing captcha", "navigating to page", or any other action unless you have actually called the corresponding tool and received a result. If a tool call was not made, state honestly that it was not executed. If a tool is blocked by the current mode, do not promise to use it — explain that it is unavailable in this mode. If a captcha or site protection is encountered, do not claim to bypass it — stop and report the issue honestly.
- **CRITICAL: No post-factum reports without tool calls.** If Tool uses is 0 in the current response, do not claim "I checked the log", "I reviewed the previous run", "step X was successful", or any other retrospective analysis. You may only say: "I did not perform a check right now. Based on visible context I can assume..." Always separate findings into: **Verified** (confirmed by actual tool calls this turn), **Assumption** (inferred from visible context), **Not checked** (not examined this turn). Do not write "successful" for a step that was not actually executed or has no saved result. Use the \`/last-browser-test\` command to retrieve the last saved browser test report — do not reconstruct it from memory.`
}

/**
 * AgentLoop — manages the "request → tool call → result → next request" cycle.
 *
 * This is the core loop that turns DeepSeek Code from a chat wrapper
 * into a real AI agent with tool access.
 */
export class AgentLoop extends EventEmitter {
  private api: DeepSeekAPI
  private tools: ToolDefinition[]
  private options: Required<Omit<AgentLoopOptions, 'signal'>> & { signal?: AbortSignal }
  private messages: ChatMessage[] = []
  private toolCallHistory: Map<string, ToolCallEvent> = new Map()
  private metrics: MetricsCollector = new MetricsCollector()
  private iterationCount = 0

  constructor (config: DeepSeekConfig, options: AgentLoopOptions = {}) {
    super()
    this.api = new DeepSeekAPI(config)
    const defaultSystemPrompt = buildSystemPrompt(options.cwd || process.cwd(), options.approvalMode)
    this.options = {
      maxIterations: 100,
      toolTimeout: 30000,
      approvalMode: 'default',
      cwd: process.cwd(),
      onToolCall: () => {},
      onToolResult: () => {},
      onStreamChunk: () => {},
      onReasoningChunk: () => {},
      onResponse: () => {},
      onError: () => {},
      onApprovalRequest: async () => true,
      systemPrompt: defaultSystemPrompt,
      signal: undefined,
      ...options,
    } as Required<AgentLoopOptions>
    this.tools = getToolsForMode(this.options.approvalMode)
  }

  /** Get the current message history */
  getMessages (): ChatMessage[] {
    return [...this.messages]
  }

  /** Get tool call history for the current session */
  getToolCallHistory (): ToolCallEvent[] {
    return Array.from(this.toolCallHistory.values())
  }

  /** Get the current iteration count */
  getIterationCount (): number {
    return this.iterationCount
  }

  /** Get the metrics collector for this session */
  getMetrics (): MetricsCollector {
    return this.metrics
  }

  /**
   * Set approval mode — updates which tools are available and rebuilds system prompt.
   */
  setApprovalMode (mode: ApprovalMode): void {
    this.options.approvalMode = mode
    this.tools = getToolsForMode(mode)
    // Rebuild system prompt with updated mode info
    this.options.systemPrompt = buildSystemPrompt(this.options.cwd, mode)
    // Update the system message if it exists
    const sysIdx = this.messages.findIndex(m => m.role === 'system')
    if (sysIdx !== -1) {
      this.messages[sysIdx] = { role: 'system', content: this.options.systemPrompt }
    }
  }

  /**
   * Run the agent loop with a user prompt.
   * Returns the final assistant response text.
   */
  async run (prompt: string, history?: ChatMessage[]): Promise<string> {
    this.iterationCount = 0
    this.toolCallHistory.clear()

    // Start with system prompt
    this.messages = [
      { role: 'system', content: this.options.systemPrompt },
      ...(history ?? []),
      { role: 'user', content: prompt },
    ]

    return this.executeLoop()
  }

  /**
   * Continue the loop with additional context (e.g., after a tool result was added externally).
   */
  async continueWithMessages (messages: ChatMessage[]): Promise<string> {
    this.messages = messages
    return this.executeLoop()
  }

  /**
   * Execute the agent loop until a text response is received or max iterations reached.
   * Uses streaming for real-time text output via onStreamChunk callback.
   */
  private async executeLoop (): Promise<string> {
    const openAITools = toOpenAITools(this.tools)

    // Execute hooks at start of loop
    await hooksManager.execute('AgentLoopStart', {
      event: 'AgentLoopStart',
      projectDir: this.options.cwd,
      messageCount: this.messages.length,
    }).catch(() => {})

    while (this.iterationCount < this.options.maxIterations) {
      this.iterationCount++

      try {
        // Use streaming chat to get real-time output
        const stream = this.api.streamChat(this.messages, openAITools)
        let responseContent = ''
        let toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = []

        // Check for cancellation
        if (this.options.signal?.aborted) {
          const cancelledMsg = i18n.t('agentCancelled')
          this.messages.push({ role: 'assistant', content: cancelledMsg })
          this.options.onResponse(cancelledMsg)
          return cancelledMsg
        }

        for await (const chunk of stream) {
          // Check for cancellation during streaming
          if (this.options.signal?.aborted) {
            const cancelledMsg = i18n.t('agentCancelled')
            this.messages.push({ role: 'assistant', content: cancelledMsg })
            this.options.onResponse(cancelledMsg)
            return cancelledMsg
          }

          if (chunk.type === 'usage' && chunk.usage) {
            this.metrics.recordTokens(chunk.usage.input, chunk.usage.output)
          } else if (chunk.type === 'reasoning') {
            this.options.onReasoningChunk(chunk.content)
          } else if (chunk.type === 'text') {
            responseContent += chunk.content
            this.options.onStreamChunk(chunk.content)
          } else if (chunk.type === 'tool_use') {
            // Collect tool call from stream
            if (chunk.toolCallId && chunk.toolName) {
              toolCalls.push({
                id: chunk.toolCallId,
                type: 'function',
                function: {
                  name: chunk.toolName,
                  arguments: JSON.stringify(chunk.toolInput ?? {}),
                },
              })
            }
          }
        }

        if (toolCalls.length === 0 && (!responseContent || responseContent.trim().length === 0)) {
          // Streaming не дал результата — пробуем non-streaming как fallback
          const fallbackResult = await this.api.chat(this.messages, openAITools)

          if (fallbackResult.toolCalls && fallbackResult.toolCalls.length > 0) {
            toolCalls = fallbackResult.toolCalls
            responseContent = fallbackResult.content ?? ''
          } else if (fallbackResult.content && fallbackResult.content.trim().length > 0) {
            responseContent = fallbackResult.content
            this.options.onStreamChunk(responseContent)
          } else {
            const fallback = i18n.t('agentEmptyResponse')
            this.messages.push({ role: 'assistant', content: fallback })
            this.options.onResponse(fallback)
            return fallback
          }
        }

        if (toolCalls.length > 0) {
          // Add assistant message with tool calls to history
          this.messages.push({
            role: 'assistant',
            content: responseContent,
            tool_calls: toolCalls,
          })

          // Execute each tool call
          for (const tc of toolCalls) {
            const args = this.parseArguments(tc.function.arguments)
            const toolCallEvent: ToolCallEvent = {
              id: tc.id,
              name: tc.function.name,
              arguments: args,
              status: 'pending',
            }

            this.toolCallHistory.set(tc.id, toolCallEvent)
            this.options.onToolCall(toolCallEvent)

            // Check approval — skip only for 'never' (read-only tools)
            const approval = this.getToolApproval(tc.function.name)
            if (approval !== 'never') {
              // If signal is already aborted, reject without asking
              if (this.options.signal?.aborted) {
                toolCallEvent.status = 'rejected'
                this.toolCallHistory.set(tc.id, toolCallEvent)
                this.messages.push({
                  role: 'tool',
                  content: `Tool call "${tc.function.name}" aborted (cancellation signal).`,
                  tool_call_id: tc.id,
                })
                continue
              }
              const approved = await this.options.onApprovalRequest(
                tc.function.name,
                args,
                approval
              )
              if (!approved) {
                toolCallEvent.status = 'rejected'
                this.toolCallHistory.set(tc.id, toolCallEvent)
                this.messages.push({
                  role: 'tool',
                  content: `Tool call "${tc.function.name}" rejected by user.`,
                  tool_call_id: tc.id,
                })
                continue
              }
              // Re-check signal after approval dialog (user may have taken long)
              if (this.options.signal?.aborted) {
                toolCallEvent.status = 'rejected'
                this.toolCallHistory.set(tc.id, toolCallEvent)
                this.messages.push({
                  role: 'tool',
                  content: `Tool call "${tc.function.name}" aborted after approval.`,
                  tool_call_id: tc.id,
                })
                continue
              }
            }

            // Execute the tool
            toolCallEvent.status = 'running'
            this.toolCallHistory.set(tc.id, toolCallEvent)
            this.metrics.recordToolCallStart(tc.function.name)

            const startTime = Date.now()
            try {
              const toolResult = await this.executeTool(tc.function.name, args)
              const duration = Date.now() - startTime

              this.metrics.recordToolCallEnd(tc.function.name, toolResult.success)

              toolCallEvent.status = toolResult.success ? 'completed' : 'failed'
              toolCallEvent.result = toolResult.output
              toolCallEvent.error = toolResult.error
              toolCallEvent.durationMs = duration
              this.toolCallHistory.set(tc.id, toolCallEvent)

              this.options.onToolResult({
                toolCallId: tc.id,
                toolName: tc.function.name,
                success: toolResult.success,
                output: toolResult.output,
                durationMs: duration,
                error: toolResult.error,
              })

              // Add tool result to message history
              this.messages.push({
                role: 'tool',
                content: this.formatToolResult(toolResult, duration),
                tool_call_id: tc.id,
              })
            } catch (err) {
              const duration = Date.now() - startTime
              const errorMsg = (err as Error).message

              this.metrics.recordToolCallEnd(tc.function.name, false)

              toolCallEvent.status = 'failed'
              toolCallEvent.error = errorMsg
              toolCallEvent.durationMs = duration
              this.toolCallHistory.set(tc.id, toolCallEvent)

              this.options.onToolResult({
                toolCallId: tc.id,
                toolName: tc.function.name,
                success: false,
                output: '',
                durationMs: duration,
                error: errorMsg,
              })

              this.messages.push({
                role: 'tool',
                content: `Tool "${tc.function.name}" execution error: ${errorMsg}`,
                tool_call_id: tc.id,
              })
            }
          }

          // Continue loop — send results back to AI
          continue
        }

        // Text response — agent is done
        if (!responseContent || responseContent.trim().length === 0) {
          // DeepSeek API returned empty response — model may have "changed its mind", add fallback
          const fallback = 'I have completed the requested actions. What else would you like me to do?'
          this.messages.push({ role: 'assistant', content: fallback })
          this.options.onResponse(fallback)
          const summary = this.metrics.getSummary()
          this.options.onStreamChunk(summary)
          return fallback
        }
        this.messages.push({ role: 'assistant', content: responseContent })
        this.options.onResponse(responseContent)

        // Output execution summary
        const summary = this.metrics.getSummary()
        this.options.onStreamChunk(summary)

        return responseContent
      } catch (err) {
        const error = err as Error
        this.options.onError(error)
        throw error
      }
    }

    // Max iterations reached
    const timeoutMsg = `Агент достиг максимального числа итераций (${this.options.maxIterations}). Задача может быть не завершена.`
    this.messages.push({ role: 'assistant', content: timeoutMsg })
    this.options.onResponse(timeoutMsg)
    return timeoutMsg
  }

  /**
   * Parse tool arguments from JSON string.
   */
  private parseArguments (argsStr: string): Record<string, unknown> {
    try {
      return JSON.parse(argsStr) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  /**
   * Get the approval requirement for a tool by name.
   */
  private getToolApproval (toolName: string): ApprovalRequirement {
    const def = this.tools.find(t => t.tool.name === toolName)
    return def?.approval ?? 'always'
  }

  /**
   * Execute a tool by name with given arguments.
   */
  private async executeTool (
    name: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const def = this.tools.find(t => t.tool.name === name)
    if (!def) {
      return { success: false, output: '', error: `Неизвестный инструмент: "${name}"` }
    }

    // Sanitize arguments before execution
    try {
      args = sanitizeArgs(args, def.tool.parameters)
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Argument validation error for "${name}": ${(err as Error).message}`,
      }
    }

    try {
      const result = await def.tool.execute(args)
      return {
        success: result.success,
        output: result.output,
        error: result.error,
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: (err as Error).message,
      }
    }
  }

  /**
   * Format tool result for the AI model.
   * Truncate very long outputs to save tokens.
   */
  private formatToolResult (
    result: { success: boolean; output: string; error?: string },
    durationMs: number
  ): string {
    const maxOutputLength = 50000 // 50KB max for tool output
    let output = result.output

    if (output.length > maxOutputLength) {
      output = output.slice(0, maxOutputLength) +
        `\n\n... [truncated ${output.length - maxOutputLength} chars]`
    }

    if (!result.success) {
      return `Tool execution error (${durationMs}ms):\n${result.error ?? result.output}`
    }

    return `Tool output (${durationMs}ms):\n${output}`
  }
}
