import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import type { DeepSeekConfig } from '../config/defaults.js'
import { resolveWindowsShell } from '../tools/shell.js'
import { listAgentConfigs } from './subagent.js'
import { skillsManager } from './skills.js'
import { hooksManager } from './hooks.js'

/**
 * `/doctor` — environment diagnostics. Answers "why doesn't it work on this
 * machine" in one report instead of a support ping-pong.
 */

export type DoctorStatus = 'ok' | 'warn' | 'fail'

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
}

const MIN_NODE_MAJOR = 20

export function checkNodeVersion (version: string = process.versions.node): DoctorCheck {
  const major = parseInt(version.split('.')[0] ?? '0', 10)
  return {
    name: 'Node.js',
    status: major >= MIN_NODE_MAJOR ? 'ok' : 'fail',
    detail: major >= MIN_NODE_MAJOR
      ? `v${version}`
      : `v${version} — Node.js ${MIN_NODE_MAJOR}+ is required`,
  }
}

function execFileText (cmd: string, args: string[], timeout = 5000): Promise<string | null> {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : stdout.trim())
    })
  })
}

async function checkGit (): Promise<DoctorCheck> {
  const version = await execFileText('git', ['--version'])
  if (!version) {
    return { name: 'Git', status: 'fail', detail: 'git not found in PATH — checkpoints, @-mentions index and change verification degrade' }
  }
  const inRepo = await execFileText('git', ['rev-parse', '--is-inside-work-tree'])
  return {
    name: 'Git',
    status: 'ok',
    detail: `${version}${inRepo === 'true' ? ', inside a repository' : ', NOT a repository (git-based features limited)'}`,
  }
}

function checkShell (): DoctorCheck {
  if (platform() !== 'win32') {
    return { name: 'Shell', status: 'ok', detail: '/bin/sh (POSIX)' }
  }
  const shell = resolveWindowsShell()
  return {
    name: 'Shell',
    status: shell === 'powershell' ? 'ok' : 'warn',
    detail: shell === 'powershell'
      ? 'Windows PowerShell 5.1'
      : 'cmd.exe fallback — powershell.exe not found; agent commands assume PowerShell syntax',
  }
}

async function checkApi (config: DeepSeekConfig): Promise<DoctorCheck> {
  if (!config.apiKey) {
    return { name: 'DeepSeek API', status: 'fail', detail: 'no API key configured — run /setup' }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/models`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))
    if (response.status === 401) {
      return { name: 'DeepSeek API', status: 'fail', detail: 'API key rejected (401) — check the key in /setup' }
    }
    if (!response.ok) {
      return { name: 'DeepSeek API', status: 'warn', detail: `unexpected status ${response.status} from ${config.baseUrl}` }
    }
    return { name: 'DeepSeek API', status: 'ok', detail: `key accepted, model "${config.model}"` }
  } catch (err) {
    return { name: 'DeepSeek API', status: 'warn', detail: `unreachable: ${(err as Error).message} (offline or proxy?)` }
  }
}

async function checkChrome (): Promise<DoctorCheck> {
  try {
    const puppeteer = await import('puppeteer')
    const path = puppeteer.executablePath()
    if (existsSync(path)) {
      return { name: 'Chrome (browser tool)', status: 'ok', detail: path }
    }
    return { name: 'Chrome (browser tool)', status: 'warn', detail: `puppeteer browser not downloaded (expected at ${path}) — run: npx puppeteer browsers install chrome` }
  } catch (err) {
    return { name: 'Chrome (browser tool)', status: 'warn', detail: `puppeteer unavailable: ${(err as Error).message}` }
  }
}

function checkUia (): DoctorCheck {
  if (platform() !== 'win32') {
    return { name: 'Desktop automation (windows_ui)', status: 'warn', detail: 'not available (Windows only)' }
  }
  return { name: 'Desktop automation (windows_ui)', status: 'ok', detail: 'UI Automation via Windows PowerShell' }
}

function checkExtensions (cwd: string): DoctorCheck[] {
  const memoryFiles = ['DEEPSEEK.md', 'DEEPSEEK.local.md', 'AGENTS.md', 'CLAUDE.md']
    .filter(f => existsSync(join(cwd, f)))
  const globalMemory = existsSync(join(homedir(), '.deepseek-code', 'DEEPSEEK.md'))
  const agents = listAgentConfigs(cwd).length
  const skills = skillsManager.listSkills().length
  const hooks = hooksManager.listHooks().length
  return [
    {
      name: 'Memory',
      status: 'ok',
      detail: `project: ${memoryFiles.length > 0 ? memoryFiles.join(', ') : 'none'}; global: ${globalMemory ? 'yes' : 'none'} (see /memory, /init)`,
    },
    {
      name: 'Extensions',
      status: 'ok',
      detail: `${agents} named agents (/agents), ${skills} skills (/skills), ${hooks} hooks (/hooks)`,
    },
  ]
}

export async function runDoctor (config: DeepSeekConfig, cwd: string = process.cwd()): Promise<DoctorCheck[]> {
  const [git, api, chrome] = await Promise.all([checkGit(), checkApi(config), checkChrome()])
  return [
    checkNodeVersion(),
    checkShell(),
    git,
    api,
    chrome,
    checkUia(),
    ...checkExtensions(cwd),
  ]
}

const STATUS_ICON: Record<DoctorStatus, string> = { ok: '[ok]', warn: '[warn]', fail: '[FAIL]' }

export function formatDoctorReport (checks: DoctorCheck[]): string {
  const lines = checks.map(c => `${STATUS_ICON[c.status]} **${c.name}** — ${c.detail}`)
  const fails = checks.filter(c => c.status === 'fail').length
  const warns = checks.filter(c => c.status === 'warn').length
  const verdict = fails > 0
    ? `${fails} problem(s) need fixing.`
    : warns > 0
      ? `Working, with ${warns} warning(s).`
      : 'All systems go.'
  return `**Doctor**\n\n${lines.join('\n')}\n\n${verdict}`
}
