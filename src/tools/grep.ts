import { execSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { minimatch } from 'minimatch'
import { type Tool, type ToolResult } from './types.js'
import { assertPathInWorkspace } from './path-safety.js'

const MAX_MATCHES = 200
const MAX_FILE_BYTES = 1024 * 1024
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.next', '.nuxt', '.output', 'coverage'])

export const grepTool: Tool = {
  name: 'grep_search',
  description: 'Search file contents using regular expressions. Uses ripgrep for fast searching.',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'The regular expression pattern to search for',
      required: true,
    },
    {
      name: 'glob',
      type: 'string',
      description: 'Optional glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")',
      required: false,
    },
    {
      name: 'path',
      type: 'string',
      description: 'Optional directory path to search in (defaults to current directory)',
      required: false,
    },
  ],
  async execute (args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string
    const glob = args.glob as string | undefined
    const searchPath = (args.path as string) ?? process.cwd()

    try {
      let cmd = `rg --no-heading --line-number --color never "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`
      if (glob) {
        cmd += ` --glob "${glob}"`
      }

      const output = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      })

      if (!output.trim()) {
        return {
          success: true,
          output: 'No matches found',
        }
      }

      return {
        success: true,
        output: limitMatches(output.split('\n').filter(Boolean)),
      }
    } catch (err) {
      const error = err as Error & { status?: number }
      // rg returns exit code 1 when no matches found
      if (error.status === 1) {
        return {
          success: true,
          output: 'No matches found',
        }
      }

      return nodeGrep(pattern, searchPath, glob)
    }
  },
}

async function nodeGrep (pattern: string, searchPath: string, glob?: string): Promise<ToolResult> {
  try {
    assertPathInWorkspace(searchPath)
    const regex = new RegExp(pattern)
    const matches: string[] = []

    for await (const filePath of walkFiles(searchPath)) {
      if (glob) {
        const rel = relative(searchPath, filePath).replace(/\\/g, '/')
        if (!minimatch(rel, glob, { matchBase: true })) continue
      }

      const content = await readFile(filePath)
      if (content.length > MAX_FILE_BYTES || content.includes(0)) continue

      const text = content.toString('utf8')
      const lines = text.split(/\r?\n/)
      for (let index = 0; index < lines.length; index++) {
        if (regex.test(lines[index])) {
          matches.push(`${filePath}:${index + 1}:${lines[index]}`)
          if (matches.length >= MAX_MATCHES) {
            return { success: true, output: limitMatches(matches, true) }
          }
        }
      }
    }

    return {
      success: true,
      output: matches.length > 0 ? matches.join('\n') : 'No matches found',
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Failed to search: ${(err as Error).message}`,
    }
  }
}

async function * walkFiles (dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield * walkFiles(join(dir, entry.name))
    } else if (entry.isFile()) {
      yield join(dir, entry.name)
    }
  }
}

function limitMatches (lines: string[], alreadyLimited = false): string {
  const limited = lines.slice(0, MAX_MATCHES)
  let result = limited.join('\n')
  if (alreadyLimited || lines.length > MAX_MATCHES) {
    const remaining = alreadyLimited ? 'more' : String(lines.length - MAX_MATCHES)
    result += `\n... and ${remaining} more matches`
  }
  return result || 'No matches found'
}
