import React from 'react'
import { Box, Text } from 'ink'
import { themeManager } from '../core/themes.js'
import { visualWidth } from '../utils/string-width.js'

type Colors = ReturnType<typeof themeManager.getColors>

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

export function parseTableCells (line: string): string[] {
  const trimmed = line.trim()
  const body = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const withoutTrailing = body.endsWith('|') ? body.slice(0, -1) : body
  return withoutTrailing.split('|').map(c => c.trim())
}

export function isTableSeparator (line: string): boolean {
  return /^\|?[\s\-:|]+\|?$/.test(line.trim())
}

export function padVisual (text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visualWidth(text)))
}

export function tableColumnWidths (lines: string[]): number[] {
  const widths: number[] = []
  for (const line of lines) {
    if (isTableSeparator(line)) continue
    parseTableCells(line).forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, visualWidth(cell))
    })
  }
  return widths
}

export function shouldRenderTableAsList (lines: string[]): boolean {
  const termWidth = process.stdout.columns || 80
  const maxTableWidth = Math.max(24, termWidth - 6)
  const widths = tableColumnWidths(lines)
  const tableWidth = widths.reduce((sum, width) => sum + width + 3, 1)
  const maxCellWidth = Math.max(18, Math.floor(maxTableWidth * 0.35))

  return widths.length === 0 || tableWidth > maxTableWidth || widths.some(width => width > maxCellWidth)
}

function renderTableAsList (lines: string[], headerIdx: number, colors: Colors): React.ReactNode {
  const headers = parseTableCells(lines[headerIdx])
  const dataLines = lines.filter((_, i) => i !== headerIdx && i !== headerIdx + 1 && !isTableSeparator(lines[i]))
  const rows: React.ReactNode[] = []

  for (const line of dataLines) {
    const cells = parseTableCells(line)
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

function renderTableRow (line: string, isHeader: boolean, colors: Colors, widths: number[]): React.ReactNode {
  const cells = parseTableCells(line)

  return (
    <Box flexDirection='row'>
      <Text>{'| '}</Text>
      {cells.map((cell, i) => {
        const trimmed = cell.trim()
        const padded = `${padVisual(trimmed, widths[i] ?? visualWidth(trimmed))} `
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
        idx + 1 < tableLines.length && isTableSeparator(tableLines[idx + 1])
      )

      if (headerIdx >= 0) {
        // Check if table fits — renderTableRow returns null if too wide
        if (shouldRenderTableAsList(tableLines)) {
          // Fallback: render as list
          rendered.push(
            <Box key={rendered.length} flexDirection='column' marginLeft={1}>
              {renderTableAsList(tableLines, headerIdx, colors)}
            </Box>
          )
        } else {
          const widths = tableColumnWidths(tableLines)
          const borderWidth = Math.min(
            process.stdout.columns - 6 || 60,
            widths.reduce((sum, width) => sum + width + 3, 1)
          )

          // Render full table
          rendered.push(
            <Box key={rendered.length} flexDirection='column' marginLeft={1}>
              {tableLines.map((tl, ti) => {
                if (isTableSeparator(tl)) {
                  return <Text key={ti} color={colors.border}>{'─'.repeat(borderWidth)}</Text>
                }
                const isHeader = ti === headerIdx
                return <React.Fragment key={ti}>{renderTableRow(tl, isHeader, colors, widths)}</React.Fragment>
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
