/**
 * Compact line-level diff for showing what a write/edit changed in the TUI.
 * Returns a string where each line is prefixed with '+' (added) or '-' (removed).
 * Context (unchanged) lines are omitted to keep the card compact. Large inputs
 * fall back to a one-line summary so we never build a giant LCS table.
 */

const MAX_DIFF_LINES = 24
const LCS_CELL_BUDGET = 4_000_000 // ~2000x2000 worst case

export function lineDiff (oldStr: string, newStr: string, maxLines = MAX_DIFF_LINES): string {
  if (oldStr === newStr) return ''
  const a = oldStr.length ? oldStr.split('\n') : []
  const b = newStr.length ? newStr.split('\n') : []

  if (a.length * b.length > LCS_CELL_BUDGET) {
    return `~ large change: -${a.length} / +${b.length} lines (diff omitted)`
  }

  const n = a.length
  const m = b.length
  // LCS length table (suffix form) so a backward walk yields a stable diff.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const out: string[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++; j++ // unchanged — omit as context
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push('-' + a[i]); i++
    } else {
      out.push('+' + b[j]); j++
    }
  }
  while (i < n) { out.push('-' + a[i]); i++ }
  while (j < m) { out.push('+' + b[j]); j++ }

  if (out.length === 0) return ''

  if (out.length > maxLines) {
    const added = out.filter(l => l[0] === '+').length
    const removed = out.filter(l => l[0] === '-').length
    return out.slice(0, maxLines).join('\n') + `\n… (+${added} / -${removed} changed lines total, truncated)`
  }
  return out.join('\n')
}
