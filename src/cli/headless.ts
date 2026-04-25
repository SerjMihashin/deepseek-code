import { loadConfig } from '../config/loader.js'
import { AgentLoop } from '../core/agent-loop.js'
import type { SessionOptions } from './interactive.js'

export interface HeadlessResult {
  response: string;
  exitCode: number;
  durationMs: number;
  messageCount: number;
  toolCallCount: number;
  error?: string;
}

/**
 * Headless mode for CI/CD pipelines and scripting.
 * No TUI, no interactive input — pure request/response with tool calling.
 */
export async function headlessMode (
  prompt: string,
  options: SessionOptions
): Promise<HeadlessResult> {
  const startTime = Date.now()
  const config = await loadConfig()

  if (options.model) {
    config.model = options.model
  }

  const approvalMode = (options.approvalMode ?? config.approvalMode ?? 'yolo') as 'plan' | 'default' | 'auto-edit' | 'yolo'

  const agent = new AgentLoop(config, {
    approvalMode,
    cwd: process.cwd(),
    // In headless mode, auto-approve everything (YOLO-like)
    onApprovalRequest: async () => approvalMode !== 'plan',
  })

  try {
    const response = await agent.run(prompt)
    const duration = Date.now() - startTime
    const toolCalls = agent.getToolCallHistory()

    return {
      response,
      exitCode: 0,
      durationMs: duration,
      messageCount: agent.getMessages().length,
      toolCallCount: toolCalls.length,
    }
  } catch (err) {
    return {
      response: '',
      exitCode: 1,
      durationMs: Date.now() - startTime,
      messageCount: 0,
      toolCallCount: 0,
      error: (err as Error).message,
    }
  }
}
