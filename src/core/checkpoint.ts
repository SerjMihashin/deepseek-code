import { execSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export interface Checkpoint {
  id: string;
  timestamp: string;
  message: string;
  files: string[];
}

function getCheckpointsDir (): string {
  return join(homedir(), '.deepseek-code', 'checkpoints')
}

function getProjectHash (): string {
  return createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16)
}

export async function createCheckpoint (message: string): Promise<Checkpoint | null> {
  // Only works in git repos
  try {
    execSync('git rev-parse --git-dir', { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    return null
  }

  const projectHash = getProjectHash()
  const checkpointDir = join(getCheckpointsDir(), projectHash)

  if (!existsSync(checkpointDir)) {
    await mkdir(checkpointDir, { recursive: true })
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const timestamp = new Date().toISOString()

  // Get list of changed files
  let files: string[] = []
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' })
    files = status.split('\n')
      .filter(Boolean)
      .map(line => line.slice(3).trim())
  } catch { /* ignore */ }

  // Create a patch file
  try {
    const patch = execSync('git diff', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    if (patch.trim()) {
      await writeFile(join(checkpointDir, `${id}.patch`), patch, 'utf-8')
    }
  } catch { /* ignore */ }

  // Save metadata
  const checkpoint: Checkpoint = {
    id,
    timestamp,
    message,
    files,
  }

  // Append to checkpoint log
  const logPath = join(checkpointDir, 'checkpoints.jsonl')
  await writeFile(logPath, JSON.stringify(checkpoint) + '\n', { flag: 'a' })

  return checkpoint
}

export async function listCheckpoints (): Promise<Checkpoint[]> {
  const projectHash = getProjectHash()
  const checkpointDir = join(getCheckpointsDir(), projectHash)
  const logPath = join(checkpointDir, 'checkpoints.jsonl')

  if (!existsSync(logPath)) return []

  const content = await readFile(logPath, 'utf-8')
  return content.split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Checkpoint)
    .reverse()
}

export async function restoreCheckpoint (id: string): Promise<boolean> {
  const projectHash = getProjectHash()
  const checkpointDir = join(getCheckpointsDir(), projectHash)
  const patchPath = join(checkpointDir, `${id}.patch`)

  if (!existsSync(patchPath)) return false

  try {
    execSync(`git apply "${patchPath}"`, { encoding: 'utf-8', stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
