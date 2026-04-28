export interface DeepSeekConfig {
  /** DeepSeek API key */
  apiKey?: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Model name */
  model: string;
  /** Approval mode: plan | default | auto-edit | turbo */
  approvalMode: ApprovalMode;
  /** Theme name */
  theme: string;
  /** Language for UI */
  language: string;
  /** Maximum tokens in context window */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
  /** System prompt */
  systemPrompt?: string;
  /** Chrome browser mode: false = headed (visible), true = headless (background) */
  chromeHeadless?: boolean;
}

export type ApprovalMode = 'plan' | 'default' | 'auto-edit' | 'turbo'

export const DEFAULT_CONFIG: DeepSeekConfig = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  approvalMode: 'default',
  theme: 'default-dark',
  language: 'en',
  maxTokens: 128_000,
  temperature: 0.7,
  systemPrompt: `You are DeepSeek Code, an AI-powered CLI agent for software development.

You help users write, debug, refactor, and understand code. You have access to tools
that allow you to read and write files, execute commands, search code, and more.

Guidelines:
- Write clean, idiomatic, well-structured code
- Follow the project's existing conventions
- Explain your reasoning when making significant changes
- Ask clarifying questions when requirements are ambiguous
- Always verify changes by running tests when applicable`,
}

export const CONFIG_FILE_NAME = 'settings.json'
export const CONFIG_DIR_NAME = '.deepseek-code'

export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'deepseek-chat': { inputPer1M: 0.14, outputPer1M: 0.28 },
  'deepseek-reasoner': { inputPer1M: 0.55, outputPer1M: 2.19 },
}
