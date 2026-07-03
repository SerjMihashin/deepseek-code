import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, parse, relative } from 'node:path'

/**
 * Project + global "memory" — Markdown notes that are loaded into the system
 * prompt so the agent actually remembers them across runs (like CLAUDE.md /
 * AGENTS.md). This is separate from the structured fact store in memory.ts;
 * here we read plain Markdown files and inject them verbatim.
 *
 * Resolution order (most general first, most specific last so nearest wins):
 *   1. Global:  ~/.deepseek-code/DEEPSEEK.md  (applies to every project)
 *   2. Saved facts from /remember (the structured store), if any
 *   3. Project: DEEPSEEK.md / DEEPSEEK.local.md / AGENTS.md / CLAUDE.md, walking
 *      up from cwd to the git root (so a monorepo root file is picked up too)
 */

const PROJECT_MEMORY_NAMES = ['DEEPSEEK.md', 'DEEPSEEK.local.md', 'AGENTS.md', 'CLAUDE.md']
const MAX_FILE_BYTES = 32 * 1024
const MAX_TOTAL_CHARS = 12_000

export function getGlobalMemoryPath (): string {
  return join(homedir(), '.deepseek-code', 'DEEPSEEK.md')
}

export function getProjectMemoryPath (cwd: string): string {
  return join(cwd, 'DEEPSEEK.md')
}

function factStoreDir (): string {
  return join(homedir(), '.deepseek-code', 'memory')
}

interface MemoryBlock {
  source: string;
  content: string;
}

function readCapped (path: string): string | null {
  try {
    const st = statSync(path)
    if (!st.isFile() || st.size === 0) return null
    let text = readFileSync(path, 'utf-8')
    if (text.length > MAX_FILE_BYTES) {
      text = text.slice(0, MAX_FILE_BYTES) + '\n…[truncated]'
    }
    return text.trim() || null
  } catch {
    return null
  }
}

/**
 * Walk up from cwd collecting project memory files at each level. Stops at the
 * git root (inclusive) so we stay within the current repository; if there is no
 * `.git` ancestor, only cwd is considered. Returns paths nearest-first.
 */
function findProjectMemoryFiles (cwd: string): string[] {
  const levels: string[] = []
  const root = parse(cwd).root
  let dir = cwd
  while (true) {
    levels.push(dir)
    if (existsSync(join(dir, '.git'))) break // git root reached (inclusive)
    if (dir === root) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // If no .git was found anywhere in the chain, only trust cwd itself — avoid
  // sweeping up unrelated memory files from arbitrary parent directories.
  const hasGit = levels.some(d => existsSync(join(d, '.git')))
  const searchDirs = hasGit ? levels : [cwd]

  const found: string[] = []
  const seen = new Set<string>()
  for (const d of searchDirs) {
    for (const name of PROJECT_MEMORY_NAMES) {
      const p = join(d, name)
      if (!seen.has(p) && existsSync(p)) {
        seen.add(p)
        found.push(p)
      }
    }
  }
  return found
}

/** Read the structured /remember store synchronously (best-effort). */
function loadSavedFacts (): string | null {
  const dir = factStoreDir()
  if (!existsSync(dir)) return null
  let files: string[]
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
  } catch {
    return null
  }
  if (files.length === 0) return null

  const lines: string[] = []
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8')
      const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
      const body = (m ? m[2] : raw).trim().replace(/\s+/g, ' ')
      let desc = ''
      if (m) {
        const d = m[1].split('\n').find(l => l.startsWith('description:'))
        if (d) desc = d.slice('description:'.length).trim()
      }
      const text = body.length > 300 ? body.slice(0, 300) + '…' : body
      lines.push(`- ${desc ? desc + ': ' : ''}${text}`)
    } catch {
      // skip unreadable entry
    }
  }
  return lines.length > 0 ? lines.join('\n') : null
}

function labelFor (path: string, cwd: string): string {
  const rel = relative(cwd, path)
  return rel.startsWith('..') || rel === '' ? path : rel.replace(/\\/g, '/')
}

/**
 * Build the `## Memory` section for the system prompt. Returns '' when there is
 * nothing to inject. Synchronous so it can run inside buildSystemPrompt.
 */
export function loadMemoryContext (cwd: string): string {
  const blocks: MemoryBlock[] = []

  const global = readCapped(getGlobalMemoryPath())
  if (global) blocks.push({ source: '~/.deepseek-code/DEEPSEEK.md (global)', content: global })

  const facts = loadSavedFacts()
  if (facts) blocks.push({ source: 'saved notes (/remember)', content: facts })

  for (const p of findProjectMemoryFiles(cwd)) {
    const content = readCapped(p)
    if (content) blocks.push({ source: labelFor(p, cwd), content })
  }

  if (blocks.length === 0) return ''

  let out = '\n## Memory\n' +
    'Persistent notes loaded from memory files. Treat them as standing user ' +
    'instructions and project context. If a note conflicts with the live ' +
    'conversation, the live conversation wins.\n'

  let total = 0
  for (const b of blocks) {
    const section = `\n### ${b.source}\n${b.content}\n`
    if (total + section.length > MAX_TOTAL_CHARS) {
      out += '\n_(memory truncated — size cap reached)_\n'
      break
    }
    out += section
    total += section.length
  }
  return out
}

export interface LoadedMemorySource {
  path: string;
  label: string;
  exists: boolean;
}

/** List the memory files dsc looks for, for the /memory command. */
export function listMemorySources (cwd: string): LoadedMemorySource[] {
  const sources: LoadedMemorySource[] = []
  const globalPath = getGlobalMemoryPath()
  sources.push({ path: globalPath, label: 'global', exists: existsSync(globalPath) })
  for (const p of findProjectMemoryFiles(cwd)) {
    sources.push({ path: p, label: 'project', exists: true })
  }
  // Always advertise the canonical project file even if it does not exist yet.
  const projectPath = getProjectMemoryPath(cwd)
  if (!sources.some(s => s.path === projectPath)) {
    sources.push({ path: projectPath, label: 'project', exists: false })
  }
  return sources
}

async function appendNote (path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const note = `- ${text.trim()}\n`
  if (!existsSync(path)) {
    const header = path === getGlobalMemoryPath()
      ? '# Global memory\n\nNotes loaded into every dsc session.\n\n## Notes\n'
      : '# Project memory\n\nNotes loaded into dsc sessions for this project.\n\n## Notes\n'
    await writeFile(path, header + note, 'utf-8')
    return
  }
  const existing = await readFile(path, 'utf-8')
  const sep = existing.endsWith('\n') ? '' : '\n'
  await appendFile(path, sep + note, 'utf-8')
}

/** Append a `#` quick-note to the project memory file (`./DEEPSEEK.md`). */
export async function appendProjectMemory (cwd: string, text: string): Promise<string> {
  const path = getProjectMemoryPath(cwd)
  await appendNote(path, text)
  return path
}

/** Append a `##` quick-note to the global memory file. */
export async function appendGlobalMemory (text: string): Promise<string> {
  const path = getGlobalMemoryPath()
  await appendNote(path, text)
  return path
}

// ─── /init — scaffold a project DEEPSEEK.md from real, detected facts ─────────

export interface ProjectFacts {
  name?: string;
  description?: string;
  version?: string;
  packageManager?: string;
  scripts: Record<string, string>;
  stack: string[];
  languages: string[];
  topLevel: string[];
  readmeExcerpt?: string;
}

function detectStack (deps: Record<string, string>): string[] {
  const has = (n: string): boolean => n in deps
  const stack: string[] = []
  if (has('next')) stack.push('Next.js')
  if (has('nuxt')) stack.push('Nuxt')
  if (has('vue')) stack.push('Vue')
  if (has('react') && !has('next')) stack.push('React')
  if (has('vite')) stack.push('Vite')
  if (has('express')) stack.push('Express')
  if (has('fastify')) stack.push('Fastify')
  if (has('@nestjs/core')) stack.push('NestJS')
  if (has('svelte')) stack.push('Svelte')
  if (has('ink')) stack.push('Ink (terminal UI)')
  if (has('electron')) stack.push('Electron')
  if (has('vitest')) stack.push('Vitest')
  else if (has('jest')) stack.push('Jest')
  if (has('eslint')) stack.push('ESLint')
  if (has('typescript')) stack.push('TypeScript')
  return stack
}

/** Gather real, verifiable project facts synchronously (no model, no guessing). */
export function gatherProjectFacts (cwd: string): ProjectFacts {
  const facts: ProjectFacts = { scripts: {}, stack: [], languages: [], topLevel: [] }

  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      facts.name = pkg.name
      facts.description = pkg.description
      facts.version = pkg.version
      facts.scripts = pkg.scripts ?? {}
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      facts.stack = detectStack(deps)
    } catch {
      // ignore malformed package.json
    }
  }

  // Package manager from lockfile
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) facts.packageManager = 'pnpm'
  else if (existsSync(join(cwd, 'yarn.lock'))) facts.packageManager = 'yarn'
  else if (existsSync(join(cwd, 'bun.lockb'))) facts.packageManager = 'bun'
  else if (existsSync(join(cwd, 'package-lock.json'))) facts.packageManager = 'npm'

  // Languages / ecosystems by marker files
  const langMarkers: Array<[string, string]> = [
    ['tsconfig.json', 'TypeScript'],
    ['go.mod', 'Go'],
    ['Cargo.toml', 'Rust'],
    ['pyproject.toml', 'Python'],
    ['requirements.txt', 'Python'],
    ['composer.json', 'PHP'],
    ['Gemfile', 'Ruby'],
    ['pom.xml', 'Java'],
  ]
  for (const [marker, lang] of langMarkers) {
    if (existsSync(join(cwd, marker)) && !facts.languages.includes(lang)) {
      facts.languages.push(lang)
    }
  }

  // Top-level structure
  try {
    const entries = readdirSync(cwd, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') || e.name === '.github')
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name + '/').slice(0, 20)
    facts.topLevel = dirs
  } catch {
    // ignore
  }

  // README excerpt
  for (const readme of ['README.md', 'readme.md', 'README.MD']) {
    const p = join(cwd, readme)
    if (existsSync(p)) {
      try {
        const text = readFileSync(p, 'utf-8').trim()
        facts.readmeExcerpt = text.length > 1200 ? text.slice(0, 1200) + '…' : text
      } catch { /* ignore */ }
      break
    }
  }

  return facts
}

/** Render a DEEPSEEK.md scaffold from gathered facts. */
export function renderInitDoc (facts: ProjectFacts): string {
  const lines: string[] = []
  const title = facts.name ?? 'this project'
  lines.push(`# ${title}`, '')
  if (facts.description) lines.push(facts.description, '')
  lines.push(
    '> Project memory for DeepSeek Code. Loaded into the agent\'s context every session.',
    '> Keep it short and factual — commands, conventions, and gotchas the agent must know.',
    ''
  )

  lines.push('## Stack')
  const stackBits = [...facts.languages, ...facts.stack.filter(s => !facts.languages.includes(s))]
  lines.push(stackBits.length > 0 ? `- ${stackBits.join(', ')}` : '- _(fill in: languages, frameworks)_')
  if (facts.packageManager) lines.push(`- Package manager: ${facts.packageManager}`)
  lines.push('')

  lines.push('## Commands')
  const wanted = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'check']
  const shown = wanted.filter(k => facts.scripts[k])
  if (shown.length > 0) {
    const runner = facts.packageManager ?? 'npm'
    for (const k of shown) {
      lines.push(`- \`${runner} run ${k}\` — ${facts.scripts[k]}`)
    }
  } else {
    lines.push('- _(fill in build/test/run commands)_')
  }
  lines.push('')

  if (facts.topLevel.length > 0) {
    lines.push('## Structure (top-level)')
    lines.push(facts.topLevel.map(d => `- \`${d}\``).join('\n'))
    lines.push('')
  }

  lines.push('## Conventions')
  lines.push('- _(fill in: code style, patterns to follow, things to avoid)_')
  lines.push('')

  lines.push('## Notes for the agent')
  lines.push('- _(fill in: gotchas, do-not-touch areas, deployment steps)_')
  lines.push('')

  return lines.join('\n')
}

/**
 * Create `./DEEPSEEK.md` from detected facts. Returns the path written, or null
 * if the file already exists and `force` is false.
 */
export async function initProjectMemory (cwd: string, force = false): Promise<string | null> {
  const path = getProjectMemoryPath(cwd)
  if (existsSync(path) && !force) return null
  const doc = renderInitDoc(gatherProjectFacts(cwd))
  await writeFile(path, doc, 'utf-8')
  return path
}
