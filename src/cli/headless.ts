import { loadConfig } from '../config/loader.js'
import { AgentLoop } from '../core/agent-loop.js'
import { saveSession, writeExecutionBundle, writeSessionHandoff } from '../core/session.js'
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
  bundleFile?: string;
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

  const approvalMode = (options.approvalMode ?? config.approvalMode ?? 'turbo') as 'plan' | 'default' | 'auto-edit' | 'turbo'
  const sessionId = await saveSession({ approvalMode, lastPrompt: prompt })

  const agent = new AgentLoop(config, {
    approvalMode,
    cwd: process.cwd(),
    onApprovalRequest: async (toolName) => {
      if (approvalMode === 'plan') {
        // In plan mode, only reject tools that need approval (write/edit/bash)
        // Read-only tools (read_file, glob, grep_search) have approval='never'
        // and won't reach this callback
        return false
      }
      return true
    },
  })

  try {
    const response = await agent.run(prompt)
    const duration = Date.now() - startTime
    const toolCalls = agent.getToolCallHistory()
    const bundleFile = await writeExecutionBundle({
      sessionId,
      prompt,
      response,
      approvalMode,
      toolCalls: toolCalls.map(toolCall => ({
        id: toolCall.id,
        name: toolCall.name,
        status: toolCall.status,
        durationMs: toolCall.durationMs,
        error: toolCall.error,
        result: toolCall.result,
      })),
    })
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
      bundleFile,
    })

    return {
      response,
      exitCode: 0,
      durationMs: duration,
      messageCount: agent.getMessages().length,
      toolCallCount: toolCalls.length,
      sessionId,
      handoffFile,
      bundleFile,
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
    const bundleFile = await writeExecutionBundle({
      sessionId,
      prompt,
      error,
      approvalMode,
    })
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
      bundleFile,
    })

    return {
      response: '',
      exitCode: 1,
      durationMs: Date.now() - startTime,
      messageCount: 0,
      toolCallCount: 0,
      sessionId,
      handoffFile,
      bundleFile,
      error,
    }
  }
}
