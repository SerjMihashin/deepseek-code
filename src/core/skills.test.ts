import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { SkillsManager, buildSkillsPromptSection } from './skills.js'

async function writeSkill (baseDir: string, name: string, description: string, prompt: string): Promise<void> {
  const dir = join(baseDir, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n${prompt}\n`, 'utf-8')
}

describe('SkillsManager', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(process.cwd(), '.tmp-skills-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads skills with prompt and source path', async () => {
    const dir = join(tempDir, 'skills')
    await writeSkill(dir, 'release-check', 'Pre-release checklist', 'Run lint and tests.')

    const manager = new SkillsManager()
    await manager.loadAll([dir])

    const skill = manager.getSkill('release-check')
    expect(skill).toMatchObject({
      name: 'release-check',
      description: 'Pre-release checklist',
      prompt: 'Run lint and tests.',
    })
    expect(skill?.sourcePath).toContain('SKILL.md')
  })

  it('lets the first location (project) shadow later ones (global)', async () => {
    const projectDir = join(tempDir, 'project-skills')
    const globalDir = join(tempDir, 'global-skills')
    await writeSkill(projectDir, 'deploy', 'Project deploy', 'project version')
    await writeSkill(globalDir, 'deploy', 'Global deploy', 'global version')

    const manager = new SkillsManager()
    await manager.loadAll([projectDir, globalDir])

    expect(manager.getSkill('deploy')?.prompt).toBe('project version')
    expect(manager.listSkills()).toHaveLength(1)
  })
})

describe('buildSkillsPromptSection', () => {
  it('returns an empty string without skills', () => {
    expect(buildSkillsPromptSection([])).toBe('')
  })

  it('lists skills with descriptions and paths', () => {
    const section = buildSkillsPromptSection([
      { name: 'release-check', description: 'Pre-release checklist', prompt: 'x', sourcePath: 'C:/proj/.deepseek-code/skills/release-check/SKILL.md' },
    ])
    expect(section).toContain('## Skills')
    expect(section).toContain('**release-check** — Pre-release checklist')
    expect(section).toContain('SKILL.md')
    expect(section).toContain('/skills <name>')
  })
})
