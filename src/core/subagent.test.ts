import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { parseAgentConfig, listAgentConfigs, loadAgentConfig } from './subagent.js'

describe('parseAgentConfig', () => {
  it('parses markdown agent configs', () => {
    expect(parseAgentConfig(`---
name: reviewer
description: Reviews code
tools: read_file, grep_search
model: deepseek-reasoner
temperature: 0.2
---
Focus on bugs.
`)).toEqual({
      name: 'reviewer',
      description: 'Reviews code',
      systemPrompt: 'Focus on bugs.',
      allowedTools: ['read_file', 'grep_search'],
      model: 'deepseek-reasoner',
      temperature: 0.2,
    })
  })

  it('parses CRLF files and empty bodies', () => {
    const config = parseAgentConfig('---\r\nname: win\r\ndescription: CRLF file\r\n---\r\n')
    expect(config).toMatchObject({ name: 'win', description: 'CRLF file' })
    expect(config?.systemPrompt).toBeUndefined()
  })

  it('returns null for invalid agent configs', () => {
    expect(parseAgentConfig('plain text')).toBeNull()
    expect(parseAgentConfig('---\ndescription: missing name\n---\nbody')).toBeNull()
  })
})

describe('listAgentConfigs / loadAgentConfig', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(process.cwd(), '.tmp-subagent-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('lists agent definitions from .deepseek-code/agents', async () => {
    const agentsDir = join(tempDir, '.deepseek-code', 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, 'reviewer.md'), `---
name: reviewer
description: Reviews code
---
Review carefully.
`, 'utf-8')
    await writeFile(join(agentsDir, 'broken.md'), 'no frontmatter here', 'utf-8')

    const agents = listAgentConfigs(tempDir)
    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({ name: 'reviewer', description: 'Reviews code' })
    expect(agents[0].sourcePath).toContain('reviewer.md')
  })

  it('loads a named agent and returns null for missing ones', async () => {
    const agentsDir = join(tempDir, '.deepseek-code', 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, 'tester.md'), `---
name: tester
description: Runs tests
tools: read_file
---
Run the suite.
`, 'utf-8')

    expect(loadAgentConfig('tester', tempDir)).toMatchObject({
      name: 'tester',
      allowedTools: ['read_file'],
    })
    expect(loadAgentConfig('missing', tempDir)).toBeNull()
  })

  it('returns an empty list when no agents dir exists', () => {
    expect(listAgentConfigs(tempDir)).toEqual([])
  })
})
