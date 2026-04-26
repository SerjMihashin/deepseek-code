import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'

const CHARS = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789'
const COLS = 24
const ROWS = 6

function randomChar (): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)]
}

interface Column {
  chars: string[];
  head: number;
}

function initColumns (): Column[] {
  return Array.from({ length: COLS }, () => ({
    chars: Array.from({ length: ROWS }, () => randomChar()),
    head: Math.floor(Math.random() * ROWS),
  }))
}

export function MatrixRain () {
  const [columns, setColumns] = useState<Column[]>(initColumns)

  useEffect(() => {
    const id = setInterval(() => {
      setColumns(prev => prev.map(col => {
        const newChars = [...col.chars]
        newChars[col.head] = randomChar()
        return {
          chars: newChars,
          head: (col.head + 1) % ROWS,
        }
      }))
    }, 120)
    return () => clearInterval(id)
  }, [])

  return (
    <Box flexDirection='row' justifyContent='center' marginBottom={1}>
      {columns.map((col, ci) => (
        <Box key={ci} flexDirection='column' marginRight={0}>
          {col.chars.map((ch, ri) => {
            const isHead = ri === col.head
            const brightness = (ROWS - Math.abs(ri - col.head)) / ROWS
            const color = isHead ? '#ffffff' : brightness > 0.6 ? '#00ff41' : brightness > 0.3 ? '#008f11' : '#003b00'
            return (
              <Text key={ri} color={color}>{ch}</Text>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
