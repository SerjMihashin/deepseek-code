import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Project file index for @-file mentions in the input bar.
 * Primary source: `git ls-files` (fast, .gitignore-aware). Fallback for
 * non-git folders: a shallow bounded directory walk.
 */

const CACHE_TTL_MS = 30_000
const MAX_FILES = 20_000
const WALK_MAX_DEPTH = 6
const WALK_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', 'vendor'])

let cache: { at: number; cwd: string; files: string[] } | null = null

export async function listProjectFiles (cwd: string = process.cwd()): Promise<string[]> {
  if (cache && cache.cwd === cwd && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.files
  }

  const gitFiles = await new Promise<string[]>(resolve => {
    execFile(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve([])
        resolve(stdout.split('\n').map(line => line.trim()).filter(Boolean).slice(0, MAX_FILES))
      }
    )
  })

  const files = gitFiles.length > 0 ? gitFiles : walkFallback(cwd)
  cache = { at: Date.now(), cwd, files }
  return files
}

function walkFallback (root: string): string[] {
  const results: string[] = []
  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > WALK_MAX_DEPTH || results.length >= MAX_FILES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch { return }
    for (const entry of entries) {
      if (results.length >= MAX_FILES) return
      if (entry.name.startsWith('.') && entry.name !== '.deepseek-code') continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!WALK_SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), rel, depth + 1)
      } else if (entry.isFile()) {
        results.push(rel)
      }
    }
  }
  walk(root, '', 0)
  return results
}

/**
 * Rank project files against an @-mention query.
 * Empty query → shallowest paths first. Otherwise: basename prefix match,
 * then basename substring, then full-path substring; shorter paths win ties.
 */
export function filterFilesForMention (files: string[], query: string, limit: number = 8): string[] {
  const q = query.toLowerCase()
  if (!q) {
    return [...files]
      .sort((a, b) => depthOf(a) - depthOf(b) || a.length - b.length)
      .slice(0, limit)
  }

  const scored: Array<{ file: string; score: number }> = []
  for (const file of files) {
    const path = file.toLowerCase()
    const base = path.slice(path.lastIndexOf('/') + 1)
    const stem = base.replace(/\.[^.]*$/, '')
    let score: number
    if (base === q || stem === q) score = 0
    else if (base.startsWith(q)) score = 1
    else if (base.includes(q)) score = 2
    else if (path.includes(q)) score = 3
    else continue
    scored.push({ file, score })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.file.length - b.file.length)
    .slice(0, limit)
    .map(s => s.file)
}

function depthOf (path: string): number {
  let depth = 0
  for (const ch of path) if (ch === '/') depth++
  return depth
}

/** Test hook: drop the cached file list. */
export function clearFileIndexCache (): void {
  cache = null
}
