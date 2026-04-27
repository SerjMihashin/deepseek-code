import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { minimatch } from 'minimatch'

const IGNORE_FILE_NAME = '.deepseekignore'

/**
 * Check if a path should be ignored based on .deepseekignore patterns.
 * Supports full .gitignore glob syntax via minimatch: *, **, ?, [ranges], ! negation.
 */
export async function shouldIgnore (relativePath: string): Promise<boolean> {
  const ignorePath = join(process.cwd(), IGNORE_FILE_NAME)

  if (!existsSync(ignorePath)) {
    return false
  }

  try {
    const content = await readFile(ignorePath, 'utf-8')
    const patterns = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))

    // Process patterns in order; negation patterns (!) override earlier matches
    let ignored = false
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        if (minimatch(relativePath, pattern.slice(1), { dot: true, matchBase: true })) {
          ignored = false
        }
      } else {
        if (minimatch(relativePath, pattern, { dot: true, matchBase: true })) {
          ignored = true
        }
      }
    }
    return ignored
  } catch {
    return false
  }
}
