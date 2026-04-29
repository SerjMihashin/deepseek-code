import React, { useState, useEffect, useMemo } from 'react'
import { Box, Text, useStdout } from 'ink'
import { themeManager } from '../core/themes.js'

// ── Symbol pool ──────────────────────────────────────────────────────────────
const POOL = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝABCDEF0123456789#%&@$><{}[]|'

function randomChar (): string {
  return POOL[Math.floor(Math.random() * POOL.length)]
}

// ── Per-column state ────────────────────────────────────────────────────────
interface Column {
  chars: string[];
  head: number;
  length: number;
  interval: number;
  offset: number;
  active: boolean;
}

// ── Layout constants ─────────────────────────────────────────────────────────
const MIN_COLUMNS = 36
const MAX_COLUMNS = 52
const MAX_HEIGHT = 24

// ── Color palettes ───────────────────────────────────────────────────────────
const MATRIX_COLORS = [
  '#f0fff0', // head — almost white glow
  '#ccffcc', // 1 — pale green
  '#aaff88', // 2 — bright lime
  '#55ff55', // 3 — full green
  '#00ff41', // 4 — classic matrix green
  '#00cc33', // 5
  '#009922', // 6
  '#006611', // 7
  '#004400', // 8
  '#002200', // 9
  '#000800', // 10 — near black
]

const GREY_COLORS = [
  '#ffffff',
  '#eeeeee',
  '#cccccc',
  '#aaaaaa',
  '#888888',
  '#666666',
  '#444444',
  '#333333',
  '#222222',
  '#111111',
  '#080808',
]

function buildColors (): string[] {
  return themeManager.theme.name === 'matrix' ? MATRIX_COLORS : GREY_COLORS
}

function colorForIndex (distanceFromHead: number, colors: string[]): string {
  if (distanceFromHead < 0) return colors[colors.length - 1]
  const idx = Math.min(distanceFromHead, colors.length - 1)
  return colors[idx]
}

// ── Column init ──────────────────────────────────────────────────────────────
function createColumn (termHeight: number): Column {
  const length = 4 + Math.floor(Math.random() * 11)
  const offset = Math.floor(Math.random() * Math.max(1, termHeight - length - 2))
  const chars = Array.from({ length }, () => randomChar())
  return {
    chars,
    head: 0,
    length,
    interval: 80 + Math.floor(Math.random() * 170),
    offset,
    active: Math.random() > 0.15,
  }
}

function initColumns (n: number, termHeight: number): Column[] {
  return Array.from({ length: n }, () => createColumn(termHeight))
}

// ── Component ───────────────────────────────────────────────────────────────
export function MatrixRain () {
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80
  const termHeight = Math.min(stdout?.rows ?? 24, MAX_HEIGHT)
  const numColumns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.floor(termWidth * 0.55)))

  const initialColumns = useMemo(
    () => initColumns(numColumns, termHeight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const [columns, setColumns] = useState<Column[]>(initialColumns)

  // Reset columns when terminal dimensions change
  useEffect(() => {
    setColumns(initColumns(numColumns, termHeight))
  }, [numColumns, termHeight])

  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = []
    const colCount = columns.length

    for (let idx = 0; idx < colCount; idx++) {
      const col = columns[idx]
      if (!col.active) continue

      const id = setInterval(() => {
        setColumns(prev => {
          const next = [...prev]
          const c = { ...next[idx] }

          const newHead = (c.head + 1) % (c.length + termHeight)
          const newChars = [...c.chars]
          if (newHead < c.length) {
            newChars[newHead] = randomChar()
          }
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
  }, [columns.length, termHeight])

  // ── Render ──────────────────────────────────────────────────────────────
  const palette = buildColors()

  const rows: { ch: string; color: string }[][] = Array.from(
    { length: termHeight },
    () => Array.from({ length: numColumns }, () => ({ ch: ' ', color: palette[palette.length - 1] }))
  )

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci]
    if (!col.active) continue

    for (let ri = 0; ri < col.length; ri++) {
      const screenRow = col.offset + ri
      if (screenRow < 0 || screenRow >= termHeight) continue

      let dist: number
      if (col.head < col.length) {
        dist = col.head - ri
      } else {
        const gapPos = col.head - col.length
        dist = gapPos < col.length ? gapPos - ri : col.length - ri
      }

      const ch = col.chars[ri] || ' '
      rows[screenRow][ci] = { ch, color: colorForIndex(dist, palette) }
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
