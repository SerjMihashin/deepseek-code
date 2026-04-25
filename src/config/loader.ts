import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, type DeepSeekConfig, CONFIG_DIR_NAME, CONFIG_FILE_NAME } from './defaults.js';
import deepmerge from 'deepmerge';

function getUserConfigDir(): string {
  return join(homedir(), CONFIG_DIR_NAME);
}

function getProjectConfigDir(): string {
  return join(process.cwd(), CONFIG_DIR_NAME);
}

function getUserConfigPath(): string {
  return join(getUserConfigDir(), CONFIG_FILE_NAME);
}

function getProjectConfigPath(): string {
  return join(getProjectConfigDir(), CONFIG_FILE_NAME);
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function loadConfig(): Promise<DeepSeekConfig> {
  // Load in order: defaults <- user config <- project config <- env vars
  let config: DeepSeekConfig = { ...DEFAULT_CONFIG };

  const userConfig = await readJsonFile(getUserConfigPath());
  if (userConfig) {
    config = deepmerge(config, userConfig as Partial<DeepSeekConfig>);
  }

  const projectConfig = await readJsonFile(getProjectConfigPath());
  if (projectConfig) {
    config = deepmerge(config, projectConfig as Partial<DeepSeekConfig>);
  }

  // Environment variables override
  if (process.env.DEEPSEEK_API_KEY) {
    config.apiKey = process.env.DEEPSEEK_API_KEY;
  }
  if (process.env.DEEPSEEK_BASE_URL) {
    config.baseUrl = process.env.DEEPSEEK_BASE_URL;
  }
  if (process.env.DEEPSEEK_MODEL) {
    config.model = process.env.DEEPSEEK_MODEL;
  }

  return config;
}

export async function saveConfig(config: Partial<DeepSeekConfig>): Promise<void> {
  const configDir = getUserConfigDir();
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  const existing = await readJsonFile(getUserConfigPath()) ?? {};
  const merged = deepmerge(existing, config as Record<string, unknown>);
  await writeFile(getUserConfigPath(), JSON.stringify(merged, null, 2), 'utf-8');
}

// Need to import writeFile from fs/promises
import { writeFile } from 'node:fs/promises';
