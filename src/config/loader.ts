import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, type DeepSeekConfig, CONFIG_DIR_NAME, CONFIG_FILE_NAME } from './defaults.js'

/**
 * Simple deep merge — merges source into target.
 * Only handles plain objects.
 */
function deepMerge (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const val = source[key]
    if (val && typeof val === 'object' && !Array.isArray(val) && key in result) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, val as Record<string, unknown>)
    } else if (val !== undefined) {
      result[key] = val
    }
  }
  return result
}

function getUserConfigDir (): string {
  return join(homedir(), CONFIG_DIR_NAME)
}

function getProjectConfigDir (): string {
  return join(process.cwd(), CONFIG_DIR_NAME)
}

function getUserConfigPath (): string {
  return join(getUserConfigDir(), CONFIG_FILE_NAME)
}

function getProjectConfigPath (): string {
  return join(getProjectConfigDir(), CONFIG_FILE_NAME)
}

async function readJsonFile (path: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function loadConfig (): Promise<DeepSeekConfig> {
  // Load in order: defaults <- user config <- project config <- env vars
  let config: DeepSeekConfig = { ...DEFAULT_CONFIG }

  const userConfig = await readJsonFile(getUserConfigPath())
  if (userConfig) {
    config = deepMerge(config as unknown as Record<string, unknown>, userConfig) as unknown as DeepSeekConfig
  }

  const projectConfig = await readJsonFile(getProjectConfigPath())
  if (projectConfig) {
    config = deepMerge(config as unknown as Record<string, unknown>, projectConfig) as unknown as DeepSeekConfig
  }

  // Environment variables override (only if non-empty)
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 0) {
    config.apiKey = process.env.DEEPSEEK_API_KEY
  }
  if (process.env.DEEPSEEK_BASE_URL && process.env.DEEPSEEK_BASE_URL.trim().length > 0) {
    config.baseUrl = process.env.DEEPSEEK_BASE_URL
  }
  if (process.env.DEEPSEEK_MODEL && process.env.DEEPSEEK_MODEL.trim().length > 0) {
    config.model = process.env.DEEPSEEK_MODEL
  }

  return config
}

export async function saveConfig (config: Partial<DeepSeekConfig>): Promise<void> {
  const configDir = getUserConfigDir()
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }

  const existing = await readJsonFile(getUserConfigPath()) ?? {}
  const merged = deepMerge(existing, config as Record<string, unknown>)
  await writeFile(getUserConfigPath(), JSON.stringify(merged, null, 2), 'utf-8')
}
