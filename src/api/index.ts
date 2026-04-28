import OpenAI from 'openai'
import { type DeepSeekConfig } from '../config/defaults.js'
import type { OpenAITool } from '../tools/types.js'

// Re-export OpenAI types for convenience
export type { OpenAITool }

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
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
  type: 'text' | 'tool_use' | 'tool_result' | 'reasoning' | 'usage';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  toolCallId?: string;
  usage?: {
    input: number;
    output: number;
    total: number;
  };
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

// ─── Retry helpers ───────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3
const STREAM_CHUNK_TIMEOUT_MS = 60_000

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryable (err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err)
  return /429|5[0-9]{2}|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/.test(msg)
}

async function withRetry<T> (fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastErr = err
      if (attempt === MAX_RETRY_ATTEMPTS || !isRetryable(err)) throw err
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 30_000))
    }
  }
  throw lastErr
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
    // Only prepend system prompt if messages don't already contain one
    const hasSystem = messages.some(m => m.role === 'system')
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = hasSystem
      ? buildMessages(messages)
      : [
          { role: 'system', content: this.systemPrompt },
          ...buildMessages(messages),
        ]

    const timeoutController = new AbortController()
    let chunkTimer: ReturnType<typeof setTimeout>

    const resetChunkTimer = () => {
      clearTimeout(chunkTimer)
      chunkTimer = setTimeout(() => {
        timeoutController.abort(new Error(`Stream timeout: no data received for ${STREAM_CHUNK_TIMEOUT_MS / 1000}s`))
      }, STREAM_CHUNK_TIMEOUT_MS)
    }

    const stream = await withRetry(() =>
      this.client.chat.completions.create(
        {
          model: this.model,
          messages: fullMessages,
          stream: true,
          stream_options: { include_usage: true },
          ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
        },
        { signal: timeoutController.signal }
      )
    ) as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>

    let currentToolCallId = ''
    let currentToolName = ''
    let currentToolArgs = ''

    resetChunkTimer()
    try {
      for await (const chunk of stream) {
        resetChunkTimer()

        // Usage chunk (last chunk with stream_options.include_usage)
        if (chunk.usage) {
          yield {
            type: 'usage',
            content: '',
            usage: {
              input: chunk.usage.prompt_tokens ?? 0,
              output: chunk.usage.completion_tokens ?? 0,
              total: chunk.usage.total_tokens ?? 0,
            },
          }
          continue
        }

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
    } finally {
      clearTimeout(chunkTimer!)
    }
  }

  /**
   * Non-streaming chat with optional tools support.
   * Returns either text content or tool_calls.
   */
  async chat (
    messages: ChatMessage[],
    tools?: OpenAITool[]
  ): Promise<{ content: string; toolCalls?: ToolCallMessage['tool_calls']; usage?: { input: number; output: number } }> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...buildMessages(messages),
    ]

    const response = await withRetry(() =>
      this.client.chat.completions.create({
        model: this.model,
        messages: fullMessages,
        ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
      })
    )

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

    return {
      content: message?.content ?? '',
      usage: response.usage
        ? { input: response.usage.prompt_tokens ?? 0, output: response.usage.completion_tokens ?? 0 }
        : undefined,
    }
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

  /**
   * Get embedding vector for a text string using DeepSeek's embeddings API.
   */
  async getEmbedding (text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'deepseek-embedding',
      input: text,
    })
    return response.data[0].embedding
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
        content: typeof m.content === 'string' ? m.content : '',
        tool_call_id: m.tool_call_id ?? '',
      } satisfies OpenAI.Chat.ChatCompletionToolMessageParam
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return {
        role: 'assistant',
        content: (typeof m.content === 'string' ? m.content : null) || null,
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
    // Content can be string or ContentBlock[] (for vision/multimodal messages)
    return {
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content as unknown as string,
    } as OpenAI.Chat.ChatCompletionUserMessageParam
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
