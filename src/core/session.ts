import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const SESSIONS_DIR = join(homedir(), '.deepseek-code', 'sessions')

export interface SessionData {
  id: string;
  projectHash: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  summary?: string;
}

function getProjectHash (): string {
  return createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16)
}

export async function saveSession (data: Partial<SessionData>): Promise<string> {
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true })
  }

  const projectHash = getProjectHash()
  const projectDir = join(SESSIONS_DIR, projectHash)

  if (!existsSync(projectDir)) {
    await mkdir(projectDir, { recursive: true })
  }

  const sessionId = data.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = join(projectDir, `${sessionId}.json`)

  let existing: Partial<SessionData> = {}
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(await readFile(filePath, 'utf-8'))
    } catch { /* ignore */ }
  }

  const session: SessionData = {
    id: sessionId,
    projectHash,
    startedAt: existing.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: data.messageCount ?? existing.messageCount ?? 0,
    summary: data.summary ?? existing.summary,
  }

  await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
  return sessionId
}

export async function getLastSessionId (): Promise<string | null> {
  const projectHash = getProjectHash()
  const projectDir = join(SESSIONS_DIR, projectHash)

  if (!existsSync(projectDir)) return null

  const files = (await import('node:fs/promises')).readdir
  const entries = await files(projectDir)
  const sessionFiles = entries.filter(f => f.endsWith('.json'))

  if (sessionFiles.length === 0) return null

  // Return most recent
  sessionFiles.sort()
  return sessionFiles[sessionFiles.length - 1].replace('.json', '')
}

export async function getSessionList (): Promise<SessionData[]> {
  const projectHash = getProjectHash()
  const projectDir = join(SESSIONS_DIR, projectHash)

  if (!existsSync(projectDir)) return []

  const entries = await (await import('node:fs/promises')).readdir(projectDir)
  const sessions: SessionData[] = []

  for (const file of entries.filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(await readFile(join(projectDir, file), 'utf-8'))
      sessions.push(data)
    } catch { /* ignore */ }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
