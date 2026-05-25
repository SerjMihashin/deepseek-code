import { globby } from 'globby'
import { isAbsolute, join, parse, relative, sep } from 'node:path'
import { type Tool, type ToolResult } from './types.js'

function normalizeGlobInput (pattern: string): { cwd: string; pattern: string } {
  if (!isAbsolute(pattern)) {
    return { cwd: process.cwd(), pattern }
  }

  const normalized = pattern.replaceAll('\\', '/')
  const root = parse(pattern).root
  const rootNormalized = root.replaceAll('\\', '/')
  const withoutRoot = normalized.slice(rootNormalized.length)
  const segments = withoutRoot.split('/').filter(Boolean)
  const firstGlobIndex = segments.findIndex(segment => /[*?[\]{}()!+@]/u.test(segment))

  if (firstGlobIndex === -1) {
    const fileName = segments.at(-1) ?? ''
    const baseSegments = segments.slice(0, -1)
    return {
      cwd: join(root, ...baseSegments),
      pattern: fileName || '*',
    }
  }

  const baseSegments = segments.slice(0, firstGlobIndex)
  const globSegments = segments.slice(firstGlobIndex)
  const cwd = baseSegments.length > 0 ? join(root, ...baseSegments) : root

  return {
    cwd,
    pattern: globSegments.join('/'),
  }
}

function toDisplayPath (path: string, cwd: string): string {
  if (isAbsolute(path)) return path
  const abs = join(cwd, path)
  const rel = relative(process.cwd(), abs)
  return rel && !rel.startsWith('..' + sep) && rel !== '..'
    ? rel
    : abs
}

export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Supports **/*.ts, src/**/*.tsx, etc.',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'The glob pattern to search for',
      required: true,
    },
  ],
  async execute (args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string

    try {
      const normalized = normalizeGlobInput(pattern)
      const paths = await globby(normalized.pattern, {
        cwd: normalized.cwd,
        onlyFiles: true,
        gitignore: true,
      })

      if (paths.length === 0) {
        return {
          success: true,
          output: 'No files found matching pattern',
        }
      }

      return {
        success: true,
        output: paths.map(path => toDisplayPath(path, normalized.cwd)).join('\n'),
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to search files: ${(err as Error).message}`,
      }
    }
  },
}
