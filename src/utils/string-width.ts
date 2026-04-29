/** Approximate visual width of a string in terminal columns.
 *  CJK chars = 2 columns, emoji = 2 columns, ASCII = 1 column.
 */
export function visualWidth (s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp >= 0x1100 && (
      cp <= 0x115f ||
      cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1b000 && cp <= 0x1b0ff) ||
      (cp >= 0x1b100 && cp <= 0x1b12f) ||
      (cp >= 0x1f000 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x2ffff) ||
      (cp >= 0x30000 && cp <= 0x3ffff)
    )) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

export function formatDuration (ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
