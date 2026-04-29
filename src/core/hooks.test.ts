import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { HooksManager, type HookConfig } from './hooks.js'

async function writeHooksConfig (root: string, hooks: HookConfig[] | string): Promise<void> {
  const dir = join(root, '.deepseek-code')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'hooks.json'),
    typeof hooks === 'string' ? hooks : JSON.stringify(hooks),
    'utf-8'
  )
}

function nodeCommand (script: string, ...args: string[]): string {
  return [execPath, '-e', script, ...args].map(part => JSON.stringify(part)).join(' ')
}

describe('HooksManager', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(process.cwd(), '.tmp-hooks-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads hooks from config directory', async () => {
    await writeHooksConfig(tempDir, [
      { name: 'pre-read', event: 'PreToolUse', type: 'command', command: 'echo read' },
      { name: 'session', event: 'SessionStart', type: 'command', command: 'echo start' },
    ])

    const manager = new HooksManager()
    await manager.load(tempDir)

    expect(manager.getHooks('PreToolUse').map(hook => hook.name)).toEqual(['pre-read'])
    expect(manager.getHooks('SessionStart').map(hook => hook.name)).toEqual(['session'])
  })

  it('ignores invalid hook config files', async () => {
    await writeHooksConfig(tempDir, '{not json')

    const manager = new HooksManager()
    await manager.load(tempDir)

    expect(manager.getHooks('PreToolUse')).toEqual([])
  })

  it('executes matching command hooks with interpolation', async () => {
    const outPath = join(tempDir, 'hook-output.txt')
    await writeHooksConfig(tempDir, [
      {
        name: 'write-tool-name',
        event: 'PreToolUse',
        type: 'command',
        matcher: '^read_',
        command: nodeCommand(
          'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
          outPath,
          '{{toolName}}'
        ),
      },
    ])

    const manager = new HooksManager()
    await manager.load(tempDir)
    await manager.execute('PreToolUse', {
      event: 'PreToolUse',
      toolName: 'read_file',
      projectDir: tempDir,
    })

    await expect(readFile(outPath, 'utf-8')).resolves.toBe('read_file')
  })

  it('skips hooks with non-matching or invalid matchers', async () => {
    const outPath = join(tempDir, 'hook-output.txt')
    await writeHooksConfig(tempDir, [
      {
        name: 'non-match',
        event: 'PreToolUse',
        type: 'command',
        matcher: '^write_',
        command: nodeCommand('require("node:fs").writeFileSync(process.argv[1], "bad")', outPath),
      },
      {
        name: 'invalid-regex',
        event: 'PreToolUse',
        type: 'command',
        matcher: '[',
        command: nodeCommand('require("node:fs").writeFileSync(process.argv[1], "bad")', outPath),
      },
    ])

    const manager = new HooksManager()
    await manager.load(tempDir)
    await manager.execute('PreToolUse', {
      event: 'PreToolUse',
      toolName: 'read_file',
      projectDir: tempDir,
    })

    await expect(readFile(outPath, 'utf-8')).rejects.toThrow()
  })
})
