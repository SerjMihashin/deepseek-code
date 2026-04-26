import React from 'react'
import { Box, Text } from 'ink'
import { themeManager } from '../core/themes.js'

type Colors = ReturnType<typeof themeManager.getColors>

// ─── Inline formatter ────────────────────────────────────────────────────────

function renderInline (text: string, colors: Colors): React.ReactNode {
  if (!text) return null
  if (!/[`*_\[]/.test(text)) return text

  // Split by inline code spans first (highest priority)
  const codeParts = text.split(/(`[^`\n]+`)/g)
  const result: React.ReactNode[] = []

  codeParts.forEach((part, ci) => {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      result.push(
        <Text key={`c${ci}`} color={colors.info}> {part.slice(1, -1)} </Text>
      )
      return
    }

    // Now handle **bold** inside non-code segments
    const boldParts = part.split(/(\*\*[^*\n]+\*\*)/g)
    boldParts.forEach((bp, bi) => {
      if (bp.length > 4 && bp.startsWith('**') && bp.endsWith('**')) {
        result.push(<Text key={`b${ci}-${bi}`} bold>{bp.slice(2, -2)}</Text>)
        return
      }

      // Handle *italic*
      const italicParts = bp.split(/(\*[^*\n]+\*)/g)
      italicParts.forEach((ip, ii) => {
        if (ip.length > 2 && ip.startsWith('*') && ip.endsWith('*')) {
          result.push(<Text key={`i${ci}-${bi}-${ii}`} dimColor>{ip.slice(1, -1)}</Text>)
        } else if (ip) {
          result.push(ip)
        }
      })
    })
  })

  return result
}

// ─── Table rendering ─────────────────────────────────────────────────────────

function renderTableRow (line: string, isHeader: boolean, colors: Colors): React.ReactNode {
  const cells = line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1)
  return (
    <Box flexDirection='row'>
      <Text color={colors.border}>│</Text>
      {cells.map((cell, i) => (
        <React.Fragment key={i}>
          <Text bold={isHeader} color={isHeader ? colors.primary : undefined}>
            {` ${cell.trim().padEnd(Math.max(cell.trim().length, 8))} `}
          </Text>
          <Text color={colors.border}>│</Text>
        </React.Fragment>
      ))}
    </Box>
  )
}

// ─── Text segment renderer ───────────────────────────────────────────────────

function TextSegment ({ content, colors }: { content: string; colors: Colors }) {
  const lines = content.split('\n')
  let prevWasTableHeader = false

  return (
    <Box flexDirection='column'>
      {lines.map((line, i) => {
        // Heading 1
        if (line.startsWith('# ')) {
          prevWasTableHeader = false
          return (
            <Box key={i} marginTop={i > 0 ? 1 : 0} marginBottom={0}>
              <Text bold color={colors.primary} underline>{line.slice(2)}</Text>
            </Box>
          )
        }
        // Heading 2
        if (line.startsWith('## ')) {
          prevWasTableHeader = false
          return (
            <Box key={i} marginTop={i > 0 ? 1 : 0}>
              <Text bold color={colors.primary}>{line.slice(3)}</Text>
            </Box>
          )
        }
        // Heading 3
        if (line.startsWith('### ')) {
          prevWasTableHeader = false
          return (
            <Box key={i}>
              <Text bold color={colors.secondary}>{line.slice(4)}</Text>
            </Box>
          )
        }

        // Horizontal rule
        if (/^[-*=]{3,}\s*$/.test(line.trim())) {
          prevWasTableHeader = false
          return <Text key={i} color={colors.border}>{'─'.repeat(Math.min(process.stdout.columns - 4 || 60, 60))}</Text>
        }

        // Table separator row  |---|---|
        if (/^\|[\s\-:|]+\|/.test(line)) {
          prevWasTableHeader = false
          return (
            <Box key={i}>
              <Text color={colors.border}>{'─'.repeat(Math.min(process.stdout.columns - 4 || 60, 60))}</Text>
            </Box>
          )
        }

        // Table data row
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          const isHeader = prevWasTableHeader === false && lines[i + 1]?.trim().match(/^\|[\s\-:|]+\|/)
          if (isHeader) prevWasTableHeader = true
          return <Box key={i}>{renderTableRow(line, !!isHeader, colors)}</Box>
        }
        prevWasTableHeader = false

        // Unordered list  - item  * item
        const ulMatch = line.match(/^(\s*)[- *] (.+)/)
        if (ulMatch) {
          const indent = Math.floor(ulMatch[1].length / 2)
          return (
            <Box key={i} marginLeft={indent * 2}>
              <Text color={colors.primary}>• </Text>
              <Text wrap='wrap'>{renderInline(ulMatch[2], colors)}</Text>
            </Box>
          )
        }

        // Ordered list  1. item
        const olMatch = line.match(/^(\s*)(\d+)\. (.+)/)
        if (olMatch) {
          const indent = Math.floor(olMatch[1].length / 2)
          return (
            <Box key={i} marginLeft={indent * 2}>
              <Text color={colors.primary}>{olMatch[2]}. </Text>
              <Text wrap='wrap'>{renderInline(olMatch[3], colors)}</Text>
            </Box>
          )
        }

        // Blockquote  > text
        if (line.startsWith('> ')) {
          return (
            <Box key={i}>
              <Text color={colors.border}>▌ </Text>
              <Text dimColor wrap='wrap'>{renderInline(line.slice(2), colors)}</Text>
            </Box>
          )
        }

        // Empty line
        if (!line.trim()) {
          return <Box key={i} height={1} />
        }

        // Regular text with inline formatting
        return (
          <Text key={i} wrap='wrap'>{renderInline(line, colors)}</Text>
        )
      })}
    </Box>
  )
}

// ─── Code block renderer ─────────────────────────────────────────────────────

function CodeBlock ({ content, lang, colors }: { content: string; lang: string; colors: Colors }) {
  const langLabel = lang || 'code'
  const lines = content.split('\n')
  const maxLen = Math.max(...lines.map(l => l.length), langLabel.length + 4)
  const width = Math.min(maxLen + 2, (process.stdout.columns || 80) - 4)

  return (
    <Box flexDirection='column' marginTop={0} marginBottom={1}>
      <Box>
        <Text color={colors.border}>┌─ </Text>
        <Text color={colors.info} bold>{langLabel}</Text>
        <Text color={colors.border}>{' ' + '─'.repeat(Math.max(0, width - langLabel.length - 3)) + '┐'}</Text>
      </Box>
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={colors.border}>│ </Text>
          <Text color={colors.info}>{line}</Text>
        </Box>
      ))}
      <Text color={colors.border}>└{'─'.repeat(width + 1)}┘</Text>
    </Box>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

type Segment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; lang: string }

function parseSegments (text: string): Segment[] {
  const parts = text.split(/(```(\w*)\n?)([\s\S]*?)```/g)
  const segments: Segment[] = []

  // split with 3 capture groups gives chunks of 4 per match:
  // [before, fence+lang, lang, code, before, fence+lang, lang, code, ...]
  for (let i = 0; i < parts.length; i++) {
    if (i % 4 === 0) {
      if (parts[i]) segments.push({ type: 'text', content: parts[i] })
    } else if (i % 4 === 1) {
      // full fence match (```lang\n) — skip
    } else if (i % 4 === 2) {
      const lang = parts[i] ?? ''
      const code = (parts[i + 1] ?? '').trimEnd()
      segments.push({ type: 'code', content: code, lang })
      i++ // skip code part
    }
  }

  return segments
}

export function MarkdownView ({ text }: { text: string }) {
  const colors = themeManager.getColors()
  const segments = parseSegments(text)

  if (segments.length === 0) return null

  return (
    <Box flexDirection='column'>
      {segments.map((seg, i) =>
        seg.type === 'code'
          ? <CodeBlock key={i} content={seg.content} lang={seg.lang} colors={colors} />
          : <TextSegment key={i} content={seg.content} colors={colors} />
      )}
    </Box>
  )
}
