import OpenAI from 'openai'
import { type DeepSeekConfig } from '../config/defaults.js'
import type { OpenAITool } from '../tools/types.js'

// Re-export OpenAI types for convenience
export type { OpenAITool }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'reasoning';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  toolCallId?: string;
}

export interface ToolCallResult {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

export interface ToolCallMessage {
  role: 'assistant';
  content: string | null;
  tool_calls: NonNullable<ChatMessage['tool_calls']>;
}

export class DeepSeekAPI {
  private client: OpenAI
  private model: string
  private systemPrompt: string

  constructor (config: DeepSeekConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '',
      baseURL: config.baseUrl,
    })
    this.model = config.model
    this.systemPrompt = config.systemPrompt ?? ''
  }

  async * streamChat (
    messages: ChatMessage[],
    tools?: OpenAITool[]
  ): AsyncGenerator<StreamChunk> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...buildMessages(messages),
    ]

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      stream: true,
      ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
    })

    let currentToolCallId = ''
    let currentToolName = ''
    let currentToolArgs = ''

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta

      if (!delta) continue

      // Reasoning content (DeepSeek-specific, from deepseek-reasoner model)
      const reasoningContent = (delta as Record<string, unknown>).reasoning_content as string | undefined
      if (reasoningContent) {
        yield {
          type: 'reasoning',
          content: reasoningContent,
        }
        continue
      }

      // Tool call delta
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            // Flush previous tool call if any
            if (currentToolCallId && currentToolName) {
              yield {
                type: 'tool_use',
                content: '',
                toolName: currentToolName,
                toolInput: safeParseJSON(currentToolArgs),
                toolCallId: currentToolCallId,
              }
            }
            currentToolCallId = tc.id
            currentToolName = tc.function?.name ?? ''
            currentToolArgs = tc.function?.arguments ?? ''
          } else if (tc.function?.arguments) {
            currentToolArgs += tc.function.arguments
          }
        }
        continue
      }

      // Flush pending tool call before text
      if (currentToolCallId && currentToolName) {
        yield {
          type: 'tool_use',
          content: '',
          toolName: currentToolName,
          toolInput: safeParseJSON(currentToolArgs),
          toolCallId: currentToolCallId,
        }
        currentToolCallId = ''
        currentToolName = ''
        currentToolArgs = ''
      }

      if (delta?.content) {
        yield {
          type: 'text',
          content: delta.content,
        }
      }
    }

    // Flush remaining tool call at end of stream
    if (currentToolCallId && currentToolName) {
      yield {
        type: 'tool_use',
        content: '',
        toolName: currentToolName,
        toolInput: safeParseJSON(currentToolArgs),
        toolCallId: currentToolCallId,
      }
    }
  }

  /**
   * Non-streaming chat with optional tools support.
   * Returns either text content or tool_calls.
   */
  async chat (
    messages: ChatMessage[],
    tools?: OpenAITool[]
  ): Promise<{ content: string; toolCalls?: ToolCallMessage['tool_calls'] }> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...buildMessages(messages),
    ]

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
    })

    const message = response.choices[0]?.message

    if (message?.tool_calls && message.tool_calls.length > 0) {
      return {
        content: message.content ?? '',
        toolCalls: message.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      }
    }

    return { content: message?.content ?? '' }
  }

  /** Validate API key by making a minimal models list request */
  async validateKey (): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.client.models.list()
      return { valid: true }
    } catch (err: unknown) {
      const msg = (err as Record<string, unknown>)?.message ?? String(err)
      // DeepSeek returns 401 or 403 for invalid keys
      if (typeof msg === 'string' && (msg.includes('401') || msg.includes('403') || msg.includes('Incorrect API key') || msg.includes('invalid') || msg.includes('Unauthorized'))) {
        return { valid: false, error: 'Invalid API key. Please check your key at https://platform.deepseek.com/api_keys' }
      }
      if (typeof msg === 'string' && msg.includes('429')) {
        return { valid: false, error: 'Rate limited. Please wait and try again.' }
      }
      return { valid: false, error: `API error: ${msg}` }
    }
  }
}

// ─── Helper functions ────────────────────────────────────────────────────────

/**
 * Build OpenAI-compatible message array from our internal ChatMessage format.
 */
function buildMessages (messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content,
        tool_call_id: m.tool_call_id ?? '',
      } satisfies OpenAI.Chat.ChatCompletionToolMessageParam
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      } satisfies OpenAI.Chat.ChatCompletionAssistantMessageParam
    }
    return {
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    } satisfies OpenAI.Chat.ChatCompletionSystemMessageParam
      | OpenAI.Chat.ChatCompletionUserMessageParam
      | OpenAI.Chat.ChatCompletionAssistantMessageParam
  })
}

/**
 * Safely parse JSON string, returning empty object on failure.
 */
function safeParseJSON (str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>
  } catch {
    return {}
  }
}
