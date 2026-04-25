import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface GitCommitOptions {
  message: string;
  all?: boolean;
  files?: string[];
}

export interface GitBranchOptions {
  name: string;
  base?: string;
}

export interface GitPRInfo {
  number: number;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface WorktreeOptions {
  name?: string;
  branch?: string;
  prNumber?: number;
}

export class GitIntegration {
  /**
   * Create a commit with AI-generated or user-provided message
   */
  async commit(options: GitCommitOptions): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      // Stage files
      if (options.all) {
        execSync('git add -A', { encoding: 'utf-8', windowsHide: true });
      } else if (options.files && options.files.length > 0) {
        execSync(`git add ${options.files.map(f => `"${f}"`).join(' ')}`, {
          encoding: 'utf-8',
          windowsHide: true,
        });
      }

      // Check if there's anything to commit
      const status = execSync('git status --porcelain', { encoding: 'utf-8', windowsHide: true });
      if (!status.trim()) {
        return { success: false, error: 'No changes to commit' };
      }

      // Commit
      execSync(`git commit -m "${options.message.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        windowsHide: true,
      });

      const hash = execSync('git rev-parse HEAD', { encoding: 'utf-8', windowsHide: true }).trim();
      return { success: true, hash };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Create and switch to a new branch
   */
  async createBranch(options: GitBranchOptions): Promise<{ success: boolean; error?: string }> {
    try {
      if (options.base) {
        execSync(`git checkout -b "${options.name}" "${options.base}"`, {
          encoding: 'utf-8',
          windowsHide: true,
        });
      } else {
        execSync(`git checkout -b "${options.name}"`, {
          encoding: 'utf-8',
          windowsHide: true,
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Get diff for review
   */
  async getDiff(ref?: string): Promise<string> {
    try {
      const target = ref ?? 'HEAD';
      return execSync(`git diff ${target}`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });
    } catch {
      return '';
    }
  }

  /**
   * Get changed files
   */
  async getChangedFiles(ref?: string): Promise<string[]> {
    try {
      const target = ref ?? 'HEAD';
      const output = execSync(`git diff --name-only ${target}`, {
        encoding: 'utf-8',
        windowsHide: true,
      });
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Create a git worktree for isolated changes
   */
  async createWorktree(options: WorktreeOptions = {}): Promise<{ path: string; name: string } | null> {
    const name = options.name ?? `dsc-worktree-${randomUUID().slice(0, 8)}`;
    const baseDir = join(tmpdir(), '.deepseek-code-worktrees');
    const worktreePath = join(baseDir, name);

    if (!existsSync(baseDir)) {
      await mkdir(baseDir, { recursive: true });
    }

    try {
      const branch = options.branch ?? name;
      execSync(`git worktree add "${worktreePath}" "${branch}" 2>/dev/null || git worktree add -b "${branch}" "${worktreePath}" HEAD`, {
        encoding: 'utf-8',
        windowsHide: true,
      });
      return { path: worktreePath, name };
    } catch {
      return null;
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(path: string): Promise<boolean> {
    try {
      execSync(`git worktree remove "${path}"`, { encoding: 'utf-8', windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate commit message from diff using AI
   */
  async generateCommitMessage(api: { chat: (messages: Array<{ role: string; content: string }>) => Promise<string> }): Promise<string> {
    const diff = await this.getDiff('--cached');
    if (!diff) return 'chore: update';

    const response = await api.chat([
      {
        role: 'system',
        content: 'Generate a concise git commit message from the diff. Use conventional commits format (feat:, fix:, chore:, refactor:, docs:, test:). Max 72 chars for first line.',
      },
      { role: 'user', content: `Diff:\n${diff.slice(0, 4000)}` },
    ]);

    return response.trim().split('\n')[0].slice(0, 72);
  }
}

// Singleton
export const gitIntegration = new GitIntegration();
