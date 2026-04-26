import { loadConfig } from '../config/loader.js'
import { AgentLoop } from '../core/agent-loop.js'
import { saveSession, writeSessionHandoff } from '../core/session.js'
import type { SessionOptions } from './interactive.js'

export interface HeadlessToolCallSummary {
  id: string;
  name: string;
  status: string;
  durationMs?: number;
  error?: string;
}

export interface HeadlessResult {
  response: string;
  exitCode: number;
  durationMs: number;
  messageCount: number;
  toolCallCount: number;
  sessionId?: string;
  handoffFile?: string;
  toolCalls?: HeadlessToolCallSummary[];
  error?: string;
}

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
  const sessionId = await saveSession({ approvalMode, lastPrompt: prompt })

  const agent = new AgentLoop(config, {
    approvalMode,
    cwd: process.cwd(),
    onApprovalRequest: async () => approvalMode !== 'plan',
  })

  try {
    const response = await agent.run(prompt)
    const duration = Date.now() - startTime
    const toolCalls = agent.getToolCallHistory()
    const handoffFile = await writeSessionHandoff({
      sessionId,
      prompt,
      response,
      approvalMode,
      toolCalls: toolCalls.map(toolCall => ({
        name: toolCall.name,
        status: toolCall.status,
        durationMs: toolCall.durationMs,
        error: toolCall.error,
      })),
    })

    await saveSession({
      id: sessionId,
      approvalMode,
      messageCount: agent.getMessages().length,
      toolCallCount: toolCalls.length,
      lastPrompt: prompt,
      lastResponse: response,
      summary: response,
      handoffFile,
    })

    return {
      response,
      exitCode: 0,
      durationMs: duration,
      messageCount: agent.getMessages().length,
      toolCallCount: toolCalls.length,
      sessionId,
      handoffFile,
      toolCalls: toolCalls.map(toolCall => ({
        id: toolCall.id,
        name: toolCall.name,
        status: toolCall.status,
        durationMs: toolCall.durationMs,
        error: toolCall.error,
      })),
    }
  } catch (err) {
    const error = (err as Error).message
    const handoffFile = await writeSessionHandoff({
      sessionId,
      prompt,
      error,
      approvalMode,
    })

    await saveSession({
      id: sessionId,
      approvalMode,
      messageCount: 0,
      toolCallCount: 0,
      lastPrompt: prompt,
      lastError: error,
      summary: error,
      handoffFile,
    })

    return {
      response: '',
      exitCode: 1,
      durationMs: Date.now() - startTime,
      messageCount: 0,
      toolCallCount: 0,
      sessionId,
      handoffFile,
      error,
    }
  }
}
