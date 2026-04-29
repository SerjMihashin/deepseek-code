import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_CONFIG, CONFIG_DIR_NAME, CONFIG_FILE_NAME } from './defaults.js'

const dirs = vi.hoisted(() => ({
  home: '',
  project: '',
}))

vi.mock('node:os', () => ({
  homedir: () => dirs.home,
}))

const { loadConfig, saveConfig } = await import('./loader.js')

async function writeConfig (root: string, value: Record<string, unknown>): Promise<void> {
  const dir = join(root, CONFIG_DIR_NAME)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, CONFIG_FILE_NAME), JSON.stringify(value), 'utf-8')
}

describe('config loader', () => {
  beforeEach(() => {
    dirs.home = mkdtempSync(join(process.cwd(), '.tmp-config-home-'))
    dirs.project = mkdtempSync(join(process.cwd(), '.tmp-config-project-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dirs.project)

    delete process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_BASE_URL
    delete process.env.DEEPSEEK_MODEL
  })

  afterEach(async () => {
    await rm(dirs.home, { recursive: true, force: true })
    await rm(dirs.project, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('returns defaults when no config files exist', async () => {
    await expect(loadConfig()).resolves.toEqual(DEFAULT_CONFIG)
  })

  it('merges defaults, user config, project config, then env vars', async () => {
    await writeConfig(dirs.home, {
      apiKey: 'from-user',
      model: 'user-model',
      approvalMode: 'plan',
      temperature: 0.2,
    })
    await writeConfig(dirs.project, {
      model: 'project-model',
      theme: 'project-theme',
    })

    process.env.DEEPSEEK_API_KEY = 'from-env'
    process.env.DEEPSEEK_MODEL = 'env-model'

    const config = await loadConfig()

    expect(config.apiKey).toBe('from-env')
    expect(config.model).toBe('env-model')
    expect(config.approvalMode).toBe('plan')
    expect(config.theme).toBe('project-theme')
    expect(config.temperature).toBe(0.2)
    expect(config.baseUrl).toBe(DEFAULT_CONFIG.baseUrl)
  })

  it('ignores empty env overrides', async () => {
    await writeConfig(dirs.home, {
      apiKey: 'from-user',
      baseUrl: 'https://user.example',
      model: 'user-model',
    })

    process.env.DEEPSEEK_API_KEY = '   '
    process.env.DEEPSEEK_BASE_URL = ''
    process.env.DEEPSEEK_MODEL = ' '

    const config = await loadConfig()

    expect(config.apiKey).toBe('from-user')
    expect(config.baseUrl).toBe('https://user.example')
    expect(config.model).toBe('user-model')
  })

  it('saves partial config by merging with existing user config', async () => {
    await writeConfig(dirs.home, {
      apiKey: 'existing-key',
      model: 'existing-model',
    })

    await saveConfig({ theme: 'new-theme' })

    const content = await readFile(join(dirs.home, CONFIG_DIR_NAME, CONFIG_FILE_NAME), 'utf-8')
    const saved = JSON.parse(content) as Record<string, unknown>

    expect(saved).toMatchObject({
      apiKey: 'existing-key',
      model: 'existing-model',
      theme: 'new-theme',
    })
  })
})
