import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
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
  toolCallCount?: number;
  approvalMode?: string;
  summary?: string;
  lastPrompt?: string;
  lastResponse?: string;
  lastError?: string;
  handoffFile?: string;
  bundleFile?: string;
}

export interface SessionHandoffInput {
  sessionId: string;
  prompt: string;
  response?: string;
  error?: string;
  approvalMode?: string;
  toolCalls?: Array<{
    name: string;
    status: string;
    durationMs?: number;
    error?: string;
  }>;
}

export interface SessionExecutionBundleInput {
  sessionId: string;
  prompt: string;
  response?: string;
  error?: string;
  approvalMode?: string;
  toolCalls?: Array<{
    id?: string;
    name: string;
    status: string;
    durationMs?: number;
    error?: string;
    result?: string;
  }>;
}

function getProjectHash (): string {
  return createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16)
}

async function ensureProjectSessionDir (): Promise<string> {
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true })
  }

  const projectDir = join(SESSIONS_DIR, getProjectHash())
  if (!existsSync(projectDir)) {
    await mkdir(projectDir, { recursive: true })
  }

  return projectDir
}

function summarizeText (text?: string, limit = 240): string | undefined {
  if (!text) return text
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

export async function saveSession (data: Partial<SessionData>): Promise<string> {
  const projectHash = getProjectHash()
  const projectDir = await ensureProjectSessionDir()

  const sessionId = data.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = join(projectDir, `${sessionId}.json`)

  let existing: Partial<SessionData> = {}
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(await readFile(filePath, 'utf-8'))
    } catch {
      // Ignore malformed existing session data.
    }
  }

  const session: SessionData = {
    id: sessionId,
    projectHash,
    startedAt: existing.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: data.messageCount ?? existing.messageCount ?? 0,
    toolCallCount: data.toolCallCount ?? existing.toolCallCount,
    approvalMode: data.approvalMode ?? existing.approvalMode,
    summary: data.summary ?? existing.summary,
    lastPrompt: summarizeText(data.lastPrompt ?? existing.lastPrompt),
    lastResponse: summarizeText(data.lastResponse ?? existing.lastResponse),
    lastError: summarizeText(data.lastError ?? existing.lastError),
    handoffFile: data.handoffFile ?? existing.handoffFile,
    bundleFile: data.bundleFile ?? existing.bundleFile,
  }

  await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
  return sessionId
}

export async function writeSessionHandoff (input: SessionHandoffInput): Promise<string> {
  const projectDir = await ensureProjectSessionDir()
  const handoffFile = join(projectDir, `${input.sessionId}.handoff.md`)

  const toolSummary = (input.toolCalls ?? []).length > 0
    ? input.toolCalls!.map((toolCall, index) =>
      `${index + 1}. ${toolCall.name} — ${toolCall.status}${toolCall.durationMs !== undefined ? ` (${toolCall.durationMs}ms)` : ''}${toolCall.error ? ` — ${toolCall.error}` : ''}`
    ).join('\n')
    : 'No tool calls recorded.'

  const content = [
    `# Session Handoff: ${input.sessionId}`,
    '',
    `- Time: ${new Date().toISOString()}`,
    `- Project: ${process.cwd()}`,
    `- Approval mode: ${input.approvalMode ?? 'unknown'}`,
    '',
    '## Prompt',
    input.prompt || '(empty)',
    '',
    input.error ? '## Error' : '## Response',
    input.error ?? input.response ?? '(empty)',
    '',
    '## Tool Calls',
    toolSummary,
    '',
  ].join('\n')

  await writeFile(handoffFile, content, 'utf-8')
  return handoffFile
}

export async function writeExecutionBundle (input: SessionExecutionBundleInput): Promise<string> {
  const projectDir = await ensureProjectSessionDir()
  const bundleFile = join(projectDir, `${input.sessionId}.bundle.json`)

  const bundle = {
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
    projectDir: process.cwd(),
    approvalMode: input.approvalMode,
    prompt: input.prompt,
    response: input.response,
    error: input.error,
    toolCalls: input.toolCalls ?? [],
  }

  await writeFile(bundleFile, JSON.stringify(bundle, null, 2), 'utf-8')
  return bundleFile
}

export async function getLastSessionId (): Promise<string | null> {
  const projectDir = join(SESSIONS_DIR, getProjectHash())
  if (!existsSync(projectDir)) return null

  const entries = await readdir(projectDir)
  const sessionFiles = entries.filter(file => file.endsWith('.json'))
  if (sessionFiles.length === 0) return null

  sessionFiles.sort()
  return sessionFiles[sessionFiles.length - 1].replace('.json', '')
}

export async function getSessionList (): Promise<SessionData[]> {
  const projectDir = join(SESSIONS_DIR, getProjectHash())
  if (!existsSync(projectDir)) return []

  const entries = await readdir(projectDir)
  const sessions: SessionData[] = []

  for (const file of entries.filter(entry => entry.endsWith('.json'))) {
    try {
      const data = JSON.parse(await readFile(join(projectDir, file), 'utf-8')) as SessionData
      sessions.push(data)
    } catch {
      // Ignore malformed session files.
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
