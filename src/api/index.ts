import OpenAI from 'openai';
import { type DeepSeekConfig } from '../config/defaults.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
}

export class DeepSeekAPI {
  private client: OpenAI;
  private model: string;
  private systemPrompt: string;

  constructor(config: DeepSeekConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '',
      baseURL: config.baseUrl,
    });
    this.model = config.model;
    this.systemPrompt = config.systemPrompt ?? '';
  }

  async *streamChat(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield {
          type: 'text',
          content: delta.content,
        };
      }
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: fullMessages,
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
