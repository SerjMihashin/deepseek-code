import React from 'react'
import { Box, Text } from 'ink'
import { themeManager } from '../core/themes.js'

type Colors = ReturnType<typeof themeManager.getColors>

/** Approximate visual width of a string in terminal columns.
 *  - CJK chars (Chinese, Japanese, Korean) = 2 columns
 *  - Emoji (most) = 2 columns
 *  - ASCII = 1 column
 */
function visualWidth (s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp >= 0x1100 && (
      cp <= 0x115f || /* Hangul Jamo */
      cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || /* CJK … Yi */
      (cp >= 0xac00 && cp <= 0xd7a3) || /* Hangul Syllables */
      (cp >= 0xf900 && cp <= 0xfaff) || /* CJK Compatibility Ideographs */
      (cp >= 0xfe10 && cp <= 0xfe19) || /* Vertical forms */
      (cp >= 0xfe30 && cp <= 0xfe6f) || /* CJK Compatibility Forms */
      (cp >= 0xff01 && cp <= 0xff60) || /* Fullwidth Forms */
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1b000 && cp <= 0x1b0ff) || /* Kana Supplement */
      (cp >= 0x1b100 && cp <= 0x1b12f) || /* Kana Extended-A */
      (cp >= 0x1f000 && cp <= 0x1f9ff) || /* Emoji / Supplemental Symbols */
      (cp >= 0x20000 && cp <= 0x2ffff) || /* CJK Extension B+ */
      (cp >= 0x30000 && cp <= 0x3ffff)
    )) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

// ─── Inline formatter ────────────────────────────────────────────────────────

function renderInline (text: string, colors: Colors): React.ReactNode {
  if (!text) return null
  if (!/[`*_[]/.test(text)) return text

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

function renderTableAsList (lines: string[], headerIdx: number, colors: Colors): React.ReactNode {
  // Render table as simple list of key: value pairs
  const headers = lines[headerIdx].split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(h => h.trim())
  const dataLines = lines.filter((_, i) => i !== headerIdx && i !== headerIdx + 1 && !/^\|[\s\-:|]+\|/.test(lines[i]))
  const rows: React.ReactNode[] = []

  for (const line of dataLines) {
    const cells = line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim())
    const pairs = cells.map((cell, ci) => {
      const label = headers[ci] || `col${ci + 1}`
      return `${label}: ${cell}`
    })
    rows.push(
      <Box key={rows.length} marginLeft={1}>
        <Text color={colors.primary}>• </Text>
        <Text wrap='wrap'>{pairs.join(' · ')}</Text>
      </Box>
    )
  }
  return <Box flexDirection='column'>{rows}</Box>
}

function renderTableRow (line: string, isHeader: boolean, colors: Colors): React.ReactNode {
  const termWidth = process.stdout.columns || 80
  const maxTableWidth = termWidth - 6 // account for padding + border
  const cells = line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1)

  // Check if any cell is too wide or contains wide chars
  let totalWidth = 0
  let hasWide = false
  for (const cell of cells) {
    const trimmed = cell.trim()
    const vw = visualWidth(trimmed)
    totalWidth += vw + 3 // cell + padding + border
    if (vw > 30 || visualWidth(trimmed) !== trimmed.length) hasWide = true
  }

  // If table is too wide or has wide chars, render as simple list
  if (totalWidth > maxTableWidth || hasWide) {
    // Signal to caller that table needs list rendering
    return null
  }

  // Safe table: use simple ASCII delimiters
  return (
    <Box flexDirection='row'>
      <Text>{'| '}</Text>
      {cells.map((cell, i) => {
        const trimmed = cell.trim()
        const padded = isHeader
          ? ` ${trimmed} `
          : ` ${trimmed.padEnd(Math.max(visualWidth(trimmed), 8))} `
        return (
          <React.Fragment key={i}>
            <Text bold={isHeader} color={isHeader ? colors.primary : undefined}>
              {padded}
            </Text>
            <Text>|</Text>
          </React.Fragment>
        )
      })}
    </Box>
  )
}

// ─── Text segment renderer ───────────────────────────────────────────────────

function TextSegment ({ content, colors }: { content: string; colors: Colors }) {
  const lines = content.split('\n')
  const rendered: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Heading 1
    if (line.startsWith('# ')) {
      rendered.push(
        <Box key={rendered.length} marginTop={i > 0 ? 1 : 0} marginBottom={0}>
          <Text bold color={colors.primary} underline>{line.slice(2)}</Text>
        </Box>
      )
      i++
      continue
    }

    // Heading 2
    if (line.startsWith('## ')) {
      rendered.push(
        <Box key={rendered.length} marginTop={i > 0 ? 1 : 0}>
          <Text bold color={colors.primary}>{line.slice(3)}</Text>
        </Box>
      )
      i++
      continue
    }

    // Heading 3
    if (line.startsWith('### ')) {
      rendered.push(
        <Box key={rendered.length}>
          <Text bold color={colors.secondary}>{line.slice(4)}</Text>
        </Box>
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^[-*=]{3,}\s*$/.test(line.trim())) {
      rendered.push(
        <Text key={rendered.length} color={colors.border}>{'─'.repeat(Math.min(process.stdout.columns - 4 || 60, 60))}</Text>
      )
      i++
      continue
    }

    // Table: collect all consecutive table lines
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i])
        i++
      }

      // Find header row (first non-separator row before a separator row)
      const headerIdx = tableLines.findIndex((l, idx) =>
        idx + 1 < tableLines.length && /^\|[\s\-:|]+\|/.test(tableLines[idx + 1])
      )

      if (headerIdx >= 0) {
        // Check if table fits — renderTableRow returns null if too wide
        const testRow = renderTableRow(tableLines[headerIdx], true, colors)
        if (testRow === null) {
          // Fallback: render as list
          rendered.push(
            <Box key={rendered.length} flexDirection='column' marginLeft={1}>
              {renderTableAsList(tableLines, headerIdx, colors)}
            </Box>
          )
        } else {
          // Render full table
          rendered.push(
            <Box key={rendered.length} flexDirection='column' marginLeft={1}>
              {tableLines.map((tl, ti) => {
                if (/^\|[\s\-:|]+\|/.test(tl)) {
                  return <Text key={ti} color={colors.border}>{'─'.repeat(Math.min(process.stdout.columns - 6 || 60, 60))}</Text>
                }
                const isHeader = ti === headerIdx
                return <React.Fragment key={ti}>{renderTableRow(tl, isHeader, colors)}</React.Fragment>
              })}
            </Box>
          )
        }
      } else {
        // No header found — render as list
        rendered.push(
          <Box key={rendered.length} flexDirection='column' marginLeft={1}>
            {renderTableAsList(tableLines, 0, colors)}
          </Box>
        )
      }
      continue
    }

    // Unordered list  - item  * item
    const ulMatch = line.match(/^(\s*)[- *] (.+)/)
    if (ulMatch) {
      const indent = Math.floor(ulMatch[1].length / 2)
      rendered.push(
        <Box key={rendered.length} marginLeft={indent * 2}>
          <Text color={colors.primary}>• </Text>
          <Text wrap='wrap'>{renderInline(ulMatch[2], colors)}</Text>
        </Box>
      )
      i++
      continue
    }

    // Ordered list  1. item
    const olMatch = line.match(/^(\s*)(\d+)\. (.+)/)
    if (olMatch) {
      const indent = Math.floor(olMatch[1].length / 2)
      rendered.push(
        <Box key={rendered.length} marginLeft={indent * 2}>
          <Text color={colors.primary}>{olMatch[2]}. </Text>
          <Text wrap='wrap'>{renderInline(olMatch[3], colors)}</Text>
        </Box>
      )
      i++
      continue
    }

    // Blockquote  > text
    if (line.startsWith('> ')) {
      rendered.push(
        <Box key={rendered.length}>
          <Text color={colors.border}>▌ </Text>
          <Text dimColor wrap='wrap'>{renderInline(line.slice(2), colors)}</Text>
        </Box>
      )
      i++
      continue
    }

    // Empty line
    if (!line.trim()) {
      rendered.push(<Box key={rendered.length} height={1} />)
      i++
      continue
    }

    // Regular text with inline formatting
    rendered.push(
      <Text key={rendered.length} wrap='wrap'>{renderInline(line, colors)}</Text>
    )
    i++
  }

  return <Box flexDirection='column'>{rendered}</Box>
}

// ─── Code block renderer ─────────────────────────────────────────────────────

function CodeBlock ({ content, lang, colors }: { content: string; lang: string; colors: Colors }) {
  const termWidth = process.stdout.columns || 80
  const maxContentWidth = termWidth - 6
  const lines = content.split('\n')
  const maxLineWidth = Math.max(...lines.map(l => visualWidth(l)), 0)
  const useBorder = maxLineWidth <= maxContentWidth - 4 && termWidth >= 50

  if (!useBorder) {
    // Fallback: simple indented block without borders
    return (
      <Box flexDirection='column' marginTop={0} marginBottom={1} marginLeft={1}>
        {lang && <Text color={colors.info} bold>{lang}</Text>}
        {lines.map((line, i) => (
          <Text key={i} color={colors.info}>{line}</Text>
        ))}
      </Box>
    )
  }

  const langLabel = lang || 'code'
  const width = Math.min(maxLineWidth + 2, maxContentWidth)

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
