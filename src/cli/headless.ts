import { DeepSeekAPI, type ChatMessage } from '../api/index.js';
import { loadConfig } from '../config/loader.js';
import type { SessionOptions } from './interactive.js';

export interface HeadlessResult {
  response: string;
  exitCode: number;
  durationMs: number;
  messageCount: number;
  error?: string;
}

/**
 * Headless mode for CI/CD pipelines and scripting.
 * No TUI, no interactive input — pure request/response.
 */
export async function headlessMode(
  prompt: string,
  options: SessionOptions,
): Promise<HeadlessResult> {
  const startTime = Date.now();
  const config = await loadConfig();

  if (options.model) {
    config.model = options.model;
  }

  const api = new DeepSeekAPI(config);
  const messages: ChatMessage[] = [
    { role: 'user', content: prompt },
  ];

  try {
    const response = await api.chat(messages);

    return {
      response,
      exitCode: 0,
      durationMs: Date.now() - startTime,
      messageCount: 2, // user + assistant
    };
  } catch (err) {
    return {
      response: '',
      exitCode: 1,
      durationMs: Date.now() - startTime,
      messageCount: 1,
      error: (err as Error).message,
    };
  }
}
