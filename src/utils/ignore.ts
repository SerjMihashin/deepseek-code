import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const IGNORE_FILE_NAME = '.deepseekignore'

/**
 * Check if a path should be ignored based on .deepseekignore patterns.
 * Simple implementation — for production use minimatch or ignore package.
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

    for (const pattern of patterns) {
      if (relativePath === pattern) return true
      if (pattern.endsWith('/') && relativePath.startsWith(pattern)) return true
      if (pattern.startsWith('*') && relativePath.endsWith(pattern.slice(1))) return true
      if (pattern.endsWith('*') && relativePath.startsWith(pattern.slice(0, -1))) return true
    }
  } catch {
    // Ignore errors
  }

  return false
}
