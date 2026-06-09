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
  /** Timestamp of last npm update check (ms since epoch) */
  lastUpdateCheckAt?: number;
}

export type ApprovalMode = 'plan' | 'default' | 'auto-edit' | 'turbo'

export const DEFAULT_CONFIG: DeepSeekConfig = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  approvalMode: 'default',
  theme: 'default-dark',
  language: 'en',
  maxTokens: 128_000,
  temperature: 0.7,
  chromeHeadless: false, // false = headed (visible), true = headless (background)
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

export const MODEL_PRICING: Record<string, { cacheHitInputPer1M: number; cacheMissInputPer1M: number; outputPer1M: number }> = {
  'deepseek-chat': { cacheHitInputPer1M: 0.0028, cacheMissInputPer1M: 0.14, outputPer1M: 0.28 },
  'deepseek-reasoner': { cacheHitInputPer1M: 0.0028, cacheMissInputPer1M: 0.14, outputPer1M: 0.28 },
  'deepseek-v4-flash': { cacheHitInputPer1M: 0.0028, cacheMissInputPer1M: 0.14, outputPer1M: 0.28 },
  'deepseek-v4-pro': { cacheHitInputPer1M: 0.003625, cacheMissInputPer1M: 0.435, outputPer1M: 0.87 },
}

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
}

export const DEEPSEEK_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4-Flash',
    description: 'Fast & efficient — best for light coding, chat, and general tasks',
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4-Pro',
    description: 'Full power — best for complex coding, deep reasoning, and production tasks',
  },
]
