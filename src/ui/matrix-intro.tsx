import React, { useState, useEffect, useRef } from 'react'
import { Box, Text, useStdout, useInput } from 'ink'

// Full-screen "digital rain" intro shown once on startup when the Matrix theme
// is active. Runs for a short duration (skippable with any key), then hands off
// to the normal UI. A SINGLE interval drives all columns (cheaper than one timer
// per column) and the whole thing unmounts when done, so it never interferes
// with the Static-render model used during normal work.

const POOL = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝABCDEF0123456789#%&@$><{}[]|/*+='

// All-green brightness ramp: saturated green head (no near-white) fading down the tail.
const RAMP = ['#4dff6a', '#33ff5b', '#26ee52', '#1fd94a', '#19c243', '#15b53d', '#12aa39', '#0d8f30', '#0a7d2a', '#06541c', '#033111']

function rc (): string {
  return POOL[Math.floor(Math.random() * POOL.length)]
}

interface Column {
  head: number;
  len: number;
  speed: number;
  tick: number;
  active: boolean;
  chars: string[];
}

function makeColumn (height: number): Column {
  return {
    head: -Math.floor(Math.random() * height * 1.5),
    // Longer trails: from ~40% up to ~110% of the screen height.
    len: Math.floor(height * 0.4) + Math.floor(Math.random() * Math.max(6, Math.floor(height * 0.7))),
    speed: 1 + Math.floor(Math.random() * 3),
    tick: 0,
    active: true,
    chars: Array.from({ length: height }, () => rc()),
  }
}

export function MatrixIntro ({ onDone, durationMs = 3800 }: { onDone: () => void; durationMs?: number }) {
  const { stdout } = useStdout()
  const width = Math.max(20, Math.min(stdout?.columns ?? 80, 200))
  const height = Math.max(8, Math.min((stdout?.rows ?? 24) - 1, 40))

  const colsRef = useRef<Column[]>(Array.from({ length: width }, () => makeColumn(height)))
  const drainingRef = useRef(false)
  const [, setFrame] = useState(0)
  const doneRef = useRef(false)

  const finish = (): void => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  // Any key skips the intro.
  useInput(() => finish())

  useEffect(() => {
    const iv = setInterval(() => {
      const cols = colsRef.current
      for (const col of cols) {
        if (!col.active) continue
        col.tick++
        if (col.tick >= col.speed) {
          col.tick = 0
          col.head++
          if (col.head - col.len > height) {
            // In the drain phase, let columns fall off and do NOT respawn, so
            // the rain "pours out" and the screen empties before the handoff.
            if (drainingRef.current) col.active = false
            else Object.assign(col, makeColumn(height))
          }
        }
        if (Math.random() < 0.25) col.chars[Math.floor(Math.random() * height)] = rc()
      }
      setFrame(f => f + 1)
    }, 70)
    // Start draining ~900ms before the end so the rain visibly clears out.
    const drain = setTimeout(() => { drainingRef.current = true }, Math.max(400, durationMs - 900))
    const timer = setTimeout(finish, durationMs)
    return () => { clearInterval(iv); clearTimeout(drain); clearTimeout(timer) }
  }, [])

  // Build the grid from column state.
  const cols = colsRef.current
  const rows: { ch: string; color: string }[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ch: ' ', color: RAMP[RAMP.length - 1] }))
  )
  for (let c = 0; c < width; c++) {
    const col = cols[c]
    if (!col.active) continue
    for (let d = 0; d < col.len; d++) {
      const r = col.head - d
      if (r < 0 || r >= height) continue
      const shade = Math.min(RAMP.length - 1, Math.floor((d / col.len) * RAMP.length))
      rows[r][c] = { ch: col.chars[r] || rc(), color: RAMP[shade] }
    }
  }

  // Coalesce consecutive same-colour cells into one <Text> run per row. This
  // cuts the node count from ~width*height to a handful per row, which keeps the
  // full-screen animation smooth instead of thrashing Ink's reconciler.
  return (
    <Box flexDirection='column'>
      {rows.map((row, ri) => {
        const runs: { text: string; color: string }[] = []
        for (const cell of row) {
          const last = runs[runs.length - 1]
          if (last && last.color === cell.color) last.text += cell.ch
          else runs.push({ text: cell.ch, color: cell.color })
        }
        return (
          <Box key={ri} height={1}>
            {runs.map((run, i) => (
              <Text key={i} color={run.color}>{run.text}</Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
