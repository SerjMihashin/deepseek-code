import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename, extname } from 'node:path'
import { DeepSeekAPI } from '../api/index.js'
import type { DeepSeekConfig } from '../config/defaults.js'

const MEMORY_DIR = join(homedir(), '.deepseek-code', 'memory')
const INDEX_FILE = join(MEMORY_DIR, 'MEMORY.md')

export interface MemoryEntry {
  name: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryIndexEntry {
  name: string;
  file: string;
  description: string;
}

function sanitizeFileName (name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.md'
}

export async function ensureMemoryDir (): Promise<void> {
  if (!existsSync(MEMORY_DIR)) {
    await mkdir(MEMORY_DIR, { recursive: true })
  }
}

export async function saveMemory (entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt'>): Promise<void> {
  await ensureMemoryDir()

  const now = new Date().toISOString()
  const fileName = sanitizeFileName(entry.name)
  const filePath = join(MEMORY_DIR, fileName)

  const fullEntry: MemoryEntry = {
    ...entry,
    createdAt: now,
    updatedAt: now,
  }

  // Check if file exists to preserve createdAt
  if (existsSync(filePath)) {
    const existing = await readMemoryFile(filePath)
    if (existing) {
      fullEntry.createdAt = existing.createdAt
    }
  }

  const content = `---
name: ${entry.name}
description: ${entry.description}
type: ${entry.type}
---

${entry.content}
`

  await writeFile(filePath, content, 'utf-8')
  await updateIndex(entry.name, fileName, entry.description)
}

export async function listMemories (): Promise<MemoryIndexEntry[]> {
  await ensureMemoryDir()

  if (!existsSync(INDEX_FILE)) {
    return []
  }

  try {
    const content = await readFile(INDEX_FILE, 'utf-8')
    const entries: MemoryIndexEntry[] = []

    for (const line of content.split('\n').filter(Boolean)) {
      const match = line.match(/- \[(.+?)\]\((.+?)\) — (.+)/)
      if (match) {
        entries.push({
          name: match[1],
          file: match[2],
          description: match[3],
        })
      }
    }

    return entries
  } catch {
    return []
  }
}

export async function readMemory (name: string): Promise<MemoryEntry | null> {
  const fileName = sanitizeFileName(name)
  const filePath = join(MEMORY_DIR, fileName)

  if (!existsSync(filePath)) {
    return null
  }

  return readMemoryFile(filePath)
}

export async function deleteMemory (name: string): Promise<boolean> {
  const fileName = sanitizeFileName(name)
  const filePath = join(MEMORY_DIR, fileName)

  if (!existsSync(filePath)) {
    return false
  }

  await unlink(filePath)
  await rebuildIndex()
  return true
}

export async function searchMemories (query: string): Promise<MemoryIndexEntry[]> {
  const all = await listMemories()
  const lowerQuery = query.toLowerCase()

  return all.filter(
    entry =>
      entry.name.toLowerCase().includes(lowerQuery) ||
      entry.description.toLowerCase().includes(lowerQuery)
  )
}

// ─── Semantic Search via Embeddings ──────────────────────────────────────────

let embedApi: DeepSeekAPI | null = null

/**
 * Initialize the embeddings API client.
 */
export function initEmbeddings (config: DeepSeekConfig): void {
  embedApi = new DeepSeekAPI(config)
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity (a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Get embedding vector for a text string via DeepSeek API.
 */
async function getEmbedding (text: string): Promise<number[]> {
  if (!embedApi) {
    throw new Error('Embeddings API not initialized. Call initEmbeddings(config) first.')
  }
  return embedApi.getEmbedding(text)
}

/**
 * Search memories using semantic similarity (embeddings).
 * Falls back to substring search if embeddings are not available.
 * Returns up to `topK` results sorted by relevance.
 */
export async function semanticSearchMemories (
  query: string,
  topK: number = 5
): Promise<Array<MemoryIndexEntry & { score: number }>> {
  if (!embedApi) {
    // Fallback to substring search
    const results = await searchMemories(query)
    return results.slice(0, topK).map(r => ({ ...r, score: 1 }))
  }

  try {
    const [queryEmbedding, allEntries] = await Promise.all([
      getEmbedding(query),
      listMemories(),
    ])

    // Get embeddings for all memory entries
    const entryEmbeddings = await Promise.all(
      allEntries.map(async (entry) => {
        const fullEntry = await readMemory(join(MEMORY_DIR, sanitizeFileName(entry.name)))
        const text = fullEntry ? `${fullEntry.description}\n${fullEntry.content}` : entry.description
        try {
          const embedding = await getEmbedding(text.slice(0, 2000)) // Limit to 2000 chars
          return { entry, embedding, score: cosineSimilarity(queryEmbedding, embedding) }
        } catch {
          return { entry, embedding: [] as number[], score: 0 }
        }
      })
    )

    // Sort by similarity score descending
    entryEmbeddings.sort((a, b) => b.score - a.score)

    return entryEmbeddings.slice(0, topK).map(e => ({
      ...e.entry,
      score: e.score,
    }))
  } catch {
    // Fallback to substring search on error
    const results = await searchMemories(query)
    return results.slice(0, topK).map(r => ({ ...r, score: 1 }))
  }
}

export { cosineSimilarity }

async function readMemoryFile (filePath: string): Promise<MemoryEntry | null> {
  try {
    const content = await readFile(filePath, 'utf-8')

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!frontmatterMatch) return null

    const frontmatter: Record<string, string> = {}
    for (const line of frontmatterMatch[1].split('\n')) {
      const [key, ...rest] = line.split(':')
      if (key && rest.length > 0) {
        frontmatter[key.trim()] = rest.join(':').trim()
      }
    }

    return {
      name: frontmatter.name ?? basename(filePath, extname(filePath)),
      description: frontmatter.description ?? '',
      type: (frontmatter.type as MemoryEntry['type']) ?? 'reference',
      content: frontmatterMatch[2].trim(),
      createdAt: frontmatter.createdAt ?? '',
      updatedAt: frontmatter.updatedAt ?? '',
    }
  } catch {
    return null
  }
}

async function updateIndex (name: string, fileName: string, description: string): Promise<void> {
  await ensureMemoryDir()

  let lines: string[] = []
  if (existsSync(INDEX_FILE)) {
    const content = await readFile(INDEX_FILE, 'utf-8')
    lines = content.split('\n').filter(Boolean)
    // Remove existing entry with same name
    lines = lines.filter(line => !line.includes(`[${name}]`))
  }

  lines.push(`- [${name}](${fileName}) — ${description}`)

  // Sort alphabetically
  lines.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

  await writeFile(INDEX_FILE, lines.join('\n') + '\n', 'utf-8')
}

async function rebuildIndex (): Promise<void> {
  await ensureMemoryDir()

  const files = await readdir(MEMORY_DIR)
  const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')

  const entries: string[] = []
  for (const file of mdFiles) {
    const entry = await readMemoryFile(join(MEMORY_DIR, file))
    if (entry) {
      entries.push(`- [${entry.name}](${file}) — ${entry.description}`)
    }
  }

  entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  await writeFile(INDEX_FILE, entries.join('\n') + '\n', 'utf-8')
}
