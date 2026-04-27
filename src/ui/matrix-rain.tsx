import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'

// ── Symbol pool ──────────────────────────────────────────────────────────────
// Mix of half-width katakana, latin, digits, and specials for texture
const POOL = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝABCDEF0123456789#%&@$><{}[]|'

function randomChar (): string {
  return POOL[Math.floor(Math.random() * POOL.length)]
}

// ── Per-column state ────────────────────────────────────────────────────────
interface Column {
  /** Characters currently visible in this column (top-to-bottom) */
  chars: string[];
  /** Vertical position of the head (0 = top of column) */
  head: number;
  /** Length of the glowing trail (head + tail) */
  length: number;
  /** Update interval in ms */
  interval: number;
  /** Number of blank rows above the column (vertical offset) */
  offset: number;
  /** Whether this column is currently active (some stay idle for depth) */
  active: boolean;
}

// ── Terminal dimensions ─────────────────────────────────────────────────────
const TERM_WIDTH = 80  // conservative estimate; Ink will clip if wider
const TERM_HEIGHT = 24 // typical terminal height
const MIN_COLUMNS = 36
const MAX_COLUMNS = 52

function columnCount (): number {
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.floor(TERM_WIDTH * 0.55)))
}

function createColumn (index: number): Column {
  const length = 4 + Math.floor(Math.random() * 11) // 4–14
  const offset = Math.floor(Math.random() * (TERM_HEIGHT - length - 2))
  const chars = Array.from({ length }, () => randomChar())
  return {
    chars,
    head: 0,
    length,
    interval: 80 + Math.floor(Math.random() * 170), // 80–250ms
    offset,
    active: Math.random() > 0.15, // ~85% columns active
  }
}

function initColumns (): Column[] {
  return Array.from({ length: columnCount() }, (_, i) => createColumn(i))
}

// ── Color helpers ───────────────────────────────────────────────────────────
// Head: bright white-green glow
// Body: fades from bright green → dark green → almost invisible
const COLORS = [
  '#f0fff0', // head – almost white
  '#aaff88', // 1 below head – bright lime
  '#55ff55', // 2 below – full green
  '#00ff41', // 3 below – classic matrix green
  '#00cc33', // 4 below
  '#009922', // 5 below
  '#006611', // 6 below
  '#004400', // 7 below
  '#002200', // 8 below
  '#001100', // 9 below
  '#000800', // 10 below
]

function colorForIndex (distanceFromHead: number): string {
  if (distanceFromHead < 0) return '#000800'
  const idx = Math.min(distanceFromHead, COLORS.length - 1)
  return COLORS[idx]
}

// ── Component ───────────────────────────────────────────────────────────────
export function MatrixRain () {
  const [columns, setColumns] = useState<Column[]>(initColumns)

  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = []

    // Capture initial column count to avoid stale closure issues
    const colCount = columns.length

    for (let idx = 0; idx < colCount; idx++) {
      const col = columns[idx]
      if (!col.active) continue

      const id = setInterval(() => {
        setColumns(prev => {
          const next = [...prev]
          const c = { ...next[idx] }

          // Advance head downward; wrap around to simulate new drops
          const newHead = (c.head + 1) % (c.length + TERM_HEIGHT)

          // Shift characters: new char at head position
          const newChars = [...c.chars]
          if (newHead < c.length) {
            newChars[newHead] = randomChar()
          }

          // Occasionally mutate a random trailing char for flicker
          if (Math.random() < 0.3) {
            const trailIdx = Math.floor(Math.random() * (c.length - 1))
            newChars[trailIdx] = randomChar()
          }

          next[idx] = { ...c, head: newHead, chars: newChars }
          return next
        })
      }, col.interval)

      intervals.push(id)
    }

    return () => {
      intervals.forEach(clearInterval)
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────
  // Build a 2D grid (rows × columns) of characters and their colors
  const rows: { ch: string; color: string }[][] = Array.from(
    { length: TERM_HEIGHT },
    () => Array.from({ length: columnCount() }, () => ({ ch: ' ', color: '#000800' }))
  )

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci]
    if (!col.active) continue

    for (let ri = 0; ri < col.length; ri++) {
      const screenRow = col.offset + ri
      if (screenRow < 0 || screenRow >= TERM_HEIGHT) continue

      // Distance from head (head wraps through the full cycle)
      let dist: number
      if (col.head < col.length) {
        dist = col.head - ri
      } else {
        // Head is in the "off-screen" gap below the column
        const gapPos = col.head - col.length
        dist = gapPos < col.length ? gapPos - ri : col.length - ri
      }

      const ch = col.chars[ri] || ' '
      rows[screenRow][ci] = { ch, color: colorForIndex(dist) }
    }
  }

  return (
    <Box flexDirection='column' alignItems='center' marginBottom={0}>
      {rows.map((row, ri) => (
        <Box key={ri} height={1}>
          {row.map((cell, ci) => (
            <Text key={ci} color={cell.color}>{cell.ch}</Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
