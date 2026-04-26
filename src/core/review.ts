import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DeepSeekAPI } from '../api/index.js'
import type { DeepSeekConfig } from '../config/defaults.js'

export interface ReviewOptions {
  files?: string[];
  gitRef?: string;
  runLinters?: boolean;
  autoFix?: boolean;
  prNumber?: number;
  prUrl?: string;
}

export interface ReviewIssue {
  file: string;
  line: number;
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: 'correctness' | 'security' | 'quality' | 'performance';
  message: string;
  suggestion?: string;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
  score: number;
  linterOutput?: string;
  durationMs: number;
}

const LINTER_COMMANDS: Record<string, string> = {
  ts: 'npx tsc --noEmit 2>&1 || true',
  eslint: 'npx eslint . --format compact 2>&1 || true',
}

const severityWeight: Record<ReviewIssue['severity'], number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
}

export async function reviewCode (
  config: DeepSeekConfig,
  options: ReviewOptions
): Promise<ReviewResult> {
  const startTime = Date.now()
  const api = new DeepSeekAPI(config)
  let linterOutput = ''

  const filesToReview = await determineScope(options)
  if (filesToReview.length === 0) {
    return {
      issues: [],
      summary: 'No files to review.',
      score: 100,
      durationMs: Date.now() - startTime,
    }
  }

  if (options.runLinters !== false) {
    linterOutput = await runLinters(filesToReview)
  }

  const fileContents: string[] = []
  for (const file of filesToReview.slice(0, 10)) {
    try {
      const content = await readFile(file, 'utf-8')
      fileContents.push(`=== ${file} ===\n${content.slice(0, 5000)}`)
    } catch {
      // Skip unreadable files.
    }
  }

  const reviewPrompt = `Review the following code for issues. Focus on:
1. Correctness
2. Security
3. Quality
4. Performance

Return strict JSON only:
{
  "issues": [
    {
      "file": "path",
      "line": 1,
      "severity": "critical|major|minor|info",
      "category": "correctness|security|quality|performance",
      "message": "short finding",
      "suggestion": "optional fix"
    }
  ],
  "summary": "overall assessment",
  "score": 0
}

Files:
${fileContents.join('\n\n')}

${linterOutput ? `\nLinter output:\n${linterOutput}` : ''}`

  let issues: ReviewIssue[] = []
  let summary = `Reviewed ${filesToReview.length} file(s).`
  let score = 100

  try {
    const response = await api.chat([
      { role: 'system', content: 'You are a code review expert. Return strict JSON only.' },
      { role: 'user', content: reviewPrompt },
    ])

    const parsed = parseReviewResponse(response.content)
    if (parsed) {
      issues = normalizeIssues(parsed.issues ?? [])
      summary = parsed.summary ?? summary
      if (typeof parsed.score === 'number') {
        score = clampScore(parsed.score)
      }
    }
  } catch {
    // Keep deterministic fallback summary below.
  }

  if (issues.length === 0) {
    score = Math.max(score, linterOutput.trim() ? 90 : 100)
  } else if (score === 100) {
    score = Math.max(0, 100 - issues.length * 5)
  }

  return {
    issues,
    summary,
    score,
    linterOutput,
    durationMs: Date.now() - startTime,
  }
}

export function formatReviewReport (result: ReviewResult): string {
  if (result.issues.length === 0) {
    return `**Findings**\n\nNo issues found.\n\n**Summary**\n\nScore: **${result.score}/100**\nDuration: ${(result.durationMs / 1000).toFixed(1)}s\n\n${result.summary}`
  }

  const findings = result.issues.slice(0, 20).map(issue => {
    const suggestion = issue.suggestion ? `\n  Suggestion: ${issue.suggestion}` : ''
    return `- [${issue.severity.toUpperCase()}] ${issue.file}:${issue.line} (${issue.category}) — ${issue.message}${suggestion}`
  }).join('\n')

  return `**Findings**\n\n${findings}\n\n**Summary**\n\nScore: **${result.score}/100**\nIssues: ${result.issues.length}\nDuration: ${(result.durationMs / 1000).toFixed(1)}s\n\n${result.summary}`
}

async function determineScope (options: ReviewOptions): Promise<string[]> {
  if (options.files && options.files.length > 0) {
    return options.files.map(file => file.startsWith(process.cwd()) ? file : join(process.cwd(), file))
  }

  if (options.prUrl) {
    return []
  }

  try {
    const ref = options.gitRef ?? 'HEAD'
    const output = execSync(`git diff --name-only ${ref}`, {
      encoding: 'utf-8',
      windowsHide: true,
    })
    return output.split('\n').filter(Boolean).map(file => join(process.cwd(), file))
  } catch {
    return []
  }
}

async function runLinters (files: string[]): Promise<string> {
  const output: string[] = []
  const hasTsFiles = files.some(file => file.endsWith('.ts') || file.endsWith('.tsx'))

  if (hasTsFiles) {
    try {
      const result = execSync(LINTER_COMMANDS.ts, {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
      })
      if (result.trim()) output.push(`[tsc]\n${result}`)
    } catch {
      // Ignore linter process failures, capture only output.
    }

    try {
      const result = execSync(LINTER_COMMANDS.eslint, {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
      })
      if (result.trim()) output.push(`[eslint]\n${result}`)
    } catch {
      // Ignore linter process failures, capture only output.
    }
  }

  return output.join('\n\n')
}

function parseReviewResponse (content: string): { issues?: unknown[]; summary?: string; score?: number } | null {
  const fencedMatch = content.match(/```json\n([\s\S]*?)\n```/)
  const raw = fencedMatch?.[1] ?? content.trim()

  try {
    return JSON.parse(raw) as { issues?: unknown[]; summary?: string; score?: number }
  } catch {
    return null
  }
}

function normalizeIssues (issues: unknown[]): ReviewIssue[] {
  const normalized: ReviewIssue[] = []

  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') continue
    const candidate = issue as Partial<ReviewIssue>
    if (!candidate.file || !candidate.message) continue

    normalized.push({
      file: candidate.file,
      line: typeof candidate.line === 'number' ? candidate.line : 1,
      severity: isSeverity(candidate.severity) ? candidate.severity : 'minor',
      category: isCategory(candidate.category) ? candidate.category : 'quality',
      message: candidate.message,
      suggestion: candidate.suggestion,
    })
  }

  return normalized.sort((a, b) =>
    severityWeight[a.severity] - severityWeight[b.severity] ||
    a.file.localeCompare(b.file) ||
    a.line - b.line
  )
}

function isSeverity (value: unknown): value is ReviewIssue['severity'] {
  return value === 'critical' || value === 'major' || value === 'minor' || value === 'info'
}

function isCategory (value: unknown): value is ReviewIssue['category'] {
  return value === 'correctness' || value === 'security' || value === 'quality' || value === 'performance'
}

function clampScore (score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}
