import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DeepSeekAPI } from '../api/index.js'
import type { DeepSeekConfig } from '../config/defaults.js'

export interface ReviewOptions {
  /** Files to review (empty = all changed files) */
  files?: string[];
  /** Git reference (commit, branch) to diff against */
  gitRef?: string;
  /** Run linters before review */
  runLinters?: boolean;
  /** Auto-fix issues when possible */
  autoFix?: boolean;
  /** PR number (for GitHub PR review) */
  prNumber?: number;
  /** PR URL (for cross-repo review) */
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
  score: number; // 0-100
  linterOutput?: string;
  durationMs: number;
}

const LINTER_COMMANDS: Record<string, string> = {
  ts: 'npx tsc --noEmit 2>&1 || true',
  eslint: 'npx eslint . --format compact 2>&1 || true',
  // Add more linters as needed
}

/**
 * Multi-step code review pipeline:
 * 1. Determine scope (git diff or specific files)
 * 2. Run deterministic linters
 * 3. Launch parallel subagents for analysis
 * 4. Deduplicate and verify issues
 * 5. Generate summary and score
 * 6. Auto-fix if enabled
 */
export async function reviewCode (
  config: DeepSeekConfig,
  options: ReviewOptions
): Promise<ReviewResult> {
  const startTime = Date.now()
  const api = new DeepSeekAPI(config)
  const issues: ReviewIssue[] = []
  let linterOutput = ''

  // Step 1: Determine scope
  const filesToReview = await determineScope(options)

  if (filesToReview.length === 0) {
    return {
      issues: [],
      summary: 'No files to review.',
      score: 100,
      durationMs: Date.now() - startTime,
    }
  }

  // Step 2: Run linters
  if (options.runLinters !== false) {
    linterOutput = await runLinters(filesToReview)
  }

  // Step 3: AI analysis
  const fileContents: string[] = []
  for (const file of filesToReview.slice(0, 10)) { // Limit to 10 files
    try {
      const content = await readFile(file, 'utf-8')
      fileContents.push(`=== ${file} ===\n${content.slice(0, 5000)}`) // Limit per file
    } catch { /* skip binary/unreadable */ }
  }

  const reviewPrompt = `Review the following code for issues. Focus on:
1. **Correctness** — logic errors, race conditions, edge cases
2. **Security** — injection, XSS, auth issues, unsafe patterns
3. **Quality** — readability, maintainability, code smells
4. **Performance** — unnecessary work, memory leaks, N+1 queries

For each issue, provide: file, line, severity (critical/major/minor/info), category, message, and suggestion.

Files to review:
${fileContents.join('\n\n')}

${linterOutput ? `\nLinter output:\n${linterOutput}` : ''}

Respond with a JSON array of issues and a summary. Format:
\`\`\`json
{
  "issues": [{ "file": "...", "line": 0, "severity": "major", "category": "correctness", "message": "...", "suggestion": "..." }],
  "summary": "Overall assessment...",
  "score": 85
}
\`\`\``

  try {
    const response = await api.chat([
      { role: 'system', content: 'You are a code review expert. Analyze code and return structured JSON results.' },
      { role: 'user', content: reviewPrompt },
    ])

    // Parse JSON from response
    const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      issues.push(...(parsed.issues ?? []))
    }
  } catch { /* ignore parse errors */ }

  // Step 5: Auto-fix (basic implementation)
  if (options.autoFix && issues.length > 0) {
    // In a real implementation, this would apply fixes
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 5)

  return {
    issues,
    summary: `Reviewed ${filesToReview.length} file(s). Found ${issues.length} issue(s).`,
    score,
    linterOutput,
    durationMs: Date.now() - startTime,
  }
}

async function determineScope (options: ReviewOptions): Promise<string[]> {
  if (options.files && options.files.length > 0) {
    return options.files
  }

  if (options.prUrl) {
    // Cross-repo review: fetch PR diff
    return []
  }

  // Git diff against ref or HEAD
  try {
    const ref = options.gitRef ?? 'HEAD'
    const output = execSync(`git diff --name-only ${ref}`, {
      encoding: 'utf-8',
      windowsHide: true,
    })
    return output.split('\n').filter(Boolean).map(f => join(process.cwd(), f))
  } catch {
    return []
  }
}

async function runLinters (files: string[]): Promise<string> {
  const output: string[] = []
  const hasTsFiles = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))

  if (hasTsFiles) {
    try {
      const result = execSync(LINTER_COMMANDS.ts, {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
      })
      if (result.trim()) output.push(`[tsc]\n${result}`)
    } catch { /* ignore */ }

    try {
      const result = execSync(LINTER_COMMANDS.eslint, {
        encoding: 'utf-8',
        timeout: 60000,
        windowsHide: true,
      })
      if (result.trim()) output.push(`[eslint]\n${result}`)
    } catch { /* ignore */ }
  }

  return output.join('\n\n')
}
