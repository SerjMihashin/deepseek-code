import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SkillDefinition {
  name: string;
  description: string;
  /** The prompt/task to execute when this skill is invoked */
  prompt: string;
  /** Optional: tools this skill needs */
  requiresTools?: string[];
  /** Optional: model override */
  model?: string;
}

export interface SkillResult {
  name: string;
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Skills are modular, reusable capabilities defined in SKILL.md files.
 * They can be invoked by the AI agent or explicitly via /skills <name>.
 *
 * Locations (in order of priority):
 * 1. Project: .deepseek-code/skills/<name>/SKILL.md
 * 2. User: ~/.deepseek-code/skills/<name>/SKILL.md
 * 3. Bundled: src/skills/<name>/SKILL.md (built-in)
 */
export class SkillsManager {
  private skills: Map<string, SkillDefinition> = new Map();

  async loadAll(): Promise<void> {
    this.skills.clear();

    // Load from all locations
    const locations = [
      join(process.cwd(), '.deepseek-code', 'skills'),
      join(homedir(), '.deepseek-code', 'skills'),
    ];

    for (const baseDir of locations) {
      await this.loadFromDir(baseDir);
    }
  }

  private async loadFromDir(baseDir: string): Promise<void> {
    if (!existsSync(baseDir)) return;

    try {
      const entries = await readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = join(baseDir, entry.name);
          const skillFile = join(skillDir, 'SKILL.md');

          if (existsSync(skillFile)) {
            const skill = await this.parseSkillFile(skillFile);
            if (skill) {
              // Project skills override user skills
              if (!this.skills.has(skill.name)) {
                this.skills.set(skill.name, skill);
              }
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  private async parseSkillFile(filePath: string): Promise<SkillDefinition | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) return null;

      const frontmatter: Record<string, string> = {};
      for (const line of frontmatterMatch[1].split('\n')) {
        const [key, ...rest] = line.split(':');
        if (key && rest.length > 0) {
          frontmatter[key.trim()] = rest.join(':').trim();
        }
      }

      if (!frontmatter.name) return null;

      return {
        name: frontmatter.name,
        description: frontmatter.description ?? '',
        prompt: frontmatterMatch[2].trim(),
        requiresTools: frontmatter.tools ? frontmatter.tools.split(',').map(t => t.trim()) : undefined,
        model: frontmatter.model,
      };
    } catch {
      return null;
    }
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  findSkills(query: string): SkillDefinition[] {
    const lower = query.toLowerCase();
    return this.listSkills().filter(
      s => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower),
    );
  }
}

// Singleton
export const skillsManager = new SkillsManager();
