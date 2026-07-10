import React, { useState, useRef, useEffect } from 'react'
import { Box, Text, useInput, useStdin } from 'ink'
import { themeManager } from '../core/themes.js'
import { COMMAND_NAMES, COMMAND_MAP } from '../commands/index.js'
import { visualWidth } from '../utils/string-width.js'
import { listProjectFiles, filterFilesForMention } from '../utils/file-index.js'

interface InputBarProps {
  onSubmit: (input: string) => void;
  disabled: boolean;
  onClear: () => void;
  onExit: () => void;
  isMasked?: boolean;
  isSetupMode?: boolean;
  emptyHint?: boolean;
  onImagePaste?: (base64: string, mimeType: string) => void;
  /** Block all keyboard input (e.g. when approval dialog or turbo confirmation is active) */
  blockInput?: boolean;
}

export function resolveCommandSubmission (currentInput: string, currentSuggestions: string[], suggestionIndex: number): string {
  if (currentSuggestions.length === 0) return currentInput.trim()
  return suggestionIndex >= 0 ? currentSuggestions[suggestionIndex] ?? currentSuggestions[0] : currentSuggestions[0]
}

// ── @-file mentions ──────────────────────────────────────────────────────────

export interface AtToken {
  /** Index of the `@` character in the text. */
  start: number
  /** Query typed after the `@` (up to the cursor). */
  query: string
}

/**
 * Find an active @-file token at the cursor: an `@` at the start of the text or
 * preceded by whitespace, with no whitespace between it and the cursor.
 */
export function findAtToken (text: string, cursorIndex: number): AtToken | null {
  for (let i = cursorIndex - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === '@') {
      if (i > 0 && !/\s/.test(text[i - 1])) return null
      return { start: i, query: text.slice(i + 1, cursorIndex) }
    }
    if (/\s/.test(ch)) return null
  }
  return null
}

/** Replace the active @-token with the chosen file path (plus a trailing space). */
export function applyFileCompletion (text: string, cursorIndex: number, token: AtToken, filePath: string): { text: string; cursorIndex: number } {
  const inserted = `@${filePath} `
  const newText = text.slice(0, token.start) + inserted + text.slice(cursorIndex)
  return { text: newText, cursorIndex: token.start + inserted.length }
}

/** Max visible rows for the input area before internal scroll kicks in */
const MAX_VISIBLE_ROWS = 5

/** Max visible suggestions in the dropdown before scrolling */
const SUGGESTIONS_MAX_VISIBLE = 8

/** Large paste threshold */
const BIG_PASTE_THRESHOLD = 500

// ── Visual line helpers ──────────────────────────────────────────────────────

interface VisualLine {
  /** Character index in original text where this visual segment starts */
  start: number
  /** Character index (exclusive) where this visual segment ends */
  end: number
  /** The text content of this visual line */
  text: string
  /** Visual width of this line (in terminal columns) */
  width: number
}

/**
 * Splits `text` into visual lines considering:
 * - logical newlines (\n)
 * - visual-width wrapping at `maxWidth` columns
 *
 * Each VisualLine stores its original character range [start, end) so we
 * can map cursor positions to visual lines and vice versa.
 */
function computeVisualLines (text: string, maxWidth: number): VisualLine[] {
  const lines: VisualLine[] = []

  if (text.length === 0) {
    lines.push({ start: 0, end: 0, text: '', width: 0 })
    return lines
  }

  const logicalLines = text.split('\n')
  let pos = 0

  for (let li = 0; li < logicalLines.length; li++) {
    const logicalLine = logicalLines[li]

    if (logicalLine.length === 0) {
      // Empty logical line — still renders as one visual line
      lines.push({ start: pos, end: pos, text: '', width: 0 })
    } else {
      let current = ''
      let currentWidth = 0
      let segStart = pos

      for (let ci = 0; ci < logicalLine.length; ci++) {
        const ch = logicalLine[ci]
        const cw = visualWidth(ch)

        if (currentWidth + cw > maxWidth) {
          lines.push({ start: segStart, end: pos + ci, text: current, width: currentWidth })
          current = ch
          currentWidth = cw
          segStart = pos + ci
        } else {
          current += ch
          currentWidth += cw
        }
      }

      // Last (or only) segment of this logical line
      lines.push({ start: segStart, end: pos + logicalLine.length, text: current, width: currentWidth })
    }

    pos += logicalLine.length + 1
  }

  return lines
}

/**
 * Returns the index of the visual line that contains `cursorIndex`.
 * cursorIndex must be in range [0, text.length].
 */
function findVisualLine (lines: VisualLine[], cursorIndex: number): number {
  for (let i = 0; i < lines.length; i++) {
    if (cursorIndex >= lines[i].start && cursorIndex <= lines[i].end) {
      return i
    }
  }
  // Fallback: last line
  return Math.max(0, lines.length - 1)
}

// ── Component ────────────────────────────────────────────────────────────────

export function InputBar ({ onSubmit, disabled, onClear, onExit, isMasked, isSetupMode, emptyHint, onImagePaste, blockInput }: InputBarProps) {
  const [input, setInput] = useState('')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const [suggestionsScrollOffset, setSuggestionsScrollOffset] = useState(0)
  const [suggestionsHidden, setSuggestionsHidden] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [pendingImageLabel, setPendingImageLabel] = useState<string | null>(null)
  const [pendingPaste, setPendingPaste] = useState<string | null>(null)
  const [inputScrollOffset, setInputScrollOffset] = useState(0)
  const [projectFiles, setProjectFiles] = useState<string[] | null>(null)
  const [fileSuggestionIndex, setFileSuggestionIndex] = useState(0)
  const [fileSuggestionsHidden, setFileSuggestionsHidden] = useState(false)

  // eslint-disable-next-line camelcase
  const { internal_eventEmitter } = useStdin()

  const inputRef = useRef(input)
  inputRef.current = input
  const cursorIndexRef = useRef(cursorIndex)
  cursorIndexRef.current = cursorIndex
  const lastRawInputRef = useRef('')

  // Listen to raw input BEFORE useInput processes it (prependListener),
  // so we can distinguish physical Backspace (\x7f, \b) from Delete (\x1b[3~) on Windows.
  useEffect(() => {
    const handler = (data: string) => {
      lastRawInputRef.current = String(data)
    }
    // eslint-disable-next-line camelcase
    internal_eventEmitter.prependListener('input', handler)
    return () => {
      // eslint-disable-next-line camelcase
      internal_eventEmitter.removeListener('input', handler)
    }
  }, [internal_eventEmitter]) // eslint-disable-line camelcase

  useEffect(() => {
    setCursorVisible(!disabled)
  }, [disabled])

  // Reset suggestions scroll when input changes (suggestions list rebuilt)
  useEffect(() => {
    setSuggestionsScrollOffset(0)
    setSuggestionsHidden(false)
    setFileSuggestionIndex(0)
    setFileSuggestionsHidden(false)
  }, [input])

  const handleImagePaste = async () => {
    try {
      const { readClipboardImage } = await import('../utils/clipboard.js')
      const buf = await readClipboardImage()
      if (!buf) {
        setPendingImageLabel('(изображение не найдено)')
        setTimeout(() => setPendingImageLabel(null), 2000)
        return
      }
      const base64 = buf.toString('base64')
      const label = `[image: ${Math.round(buf.length / 1024)}KB]`
      setPendingImageLabel(label)
      onImagePaste?.(base64, 'image/png')
    } catch {
      setPendingImageLabel('(ошибка буфера обмена)')
      setTimeout(() => setPendingImageLabel(null), 2000)
    }
  }

  // Compute command suggestions from current input
  const suggestions = input.startsWith('/')
    ? COMMAND_NAMES.filter(cmd => cmd.startsWith(input.toLowerCase()))
    : []

  const getSuggestions = (text: string) =>
    text.startsWith('/') ? COMMAND_NAMES.filter(cmd => cmd.startsWith(text.toLowerCase())) : []

  // ── @-file mention suggestions ─────────────────────────────────────────────

  const atToken = !isMasked && !isSetupMode ? findAtToken(input, cursorIndex) : null
  const hasAtToken = atToken !== null

  // Load (and periodically refresh via the util's cache) the project file list
  // the first moment an @-token appears.
  useEffect(() => {
    if (!hasAtToken) return
    let alive = true
    listProjectFiles()
      .then(files => { if (alive) setProjectFiles(files) })
      .catch(() => { if (alive) setProjectFiles([]) })
    return () => { alive = false }
  }, [hasAtToken])

  const fileSuggestions = atToken && projectFiles
    ? filterFilesForMention(projectFiles, atToken.query, SUGGESTIONS_MAX_VISIBLE)
    : []

  // ── Visual line computation (for both rendering and cursor navigation) ────

  const terminalWidth = process.stdout.columns || 80
  const maxLineWidth = Math.max(1, terminalWidth - 6)
  const displayText = isMasked && input.length > 0
    ? '•'.repeat(input.length)
    : input

  const visualLines = computeVisualLines(displayText, maxLineWidth)
  const totalVisualLines = visualLines.length
  const needsScroll = totalVisualLines > MAX_VISIBLE_ROWS
  const cursorVisualLineIdx = findVisualLine(visualLines, cursorIndex)

  // ── Adjust scroll whenever cursor moves off-screen ────────────────────────

  useEffect(() => {
    if (cursorVisualLineIdx < inputScrollOffset) {
      setInputScrollOffset(cursorVisualLineIdx)
    } else if (cursorVisualLineIdx >= inputScrollOffset + MAX_VISIBLE_ROWS) {
      setInputScrollOffset(Math.max(0, cursorVisualLineIdx - MAX_VISIBLE_ROWS + 1))
    }
  }, [cursorVisualLineIdx, inputScrollOffset])

  // Get the current visual column of the cursor within its visual line
  function getCursorVisualColumn (cursorIdx: number, lines: VisualLine[]): number {
    const lineIdx = findVisualLine(lines, cursorIdx)
    const line = lines[lineIdx]
    const localOffset = cursorIdx - line.start
    return visualWidth(line.text.slice(0, localOffset))
  }

  // Move cursor to a target visual column on a specific visual line
  function cursorIndexAtColumn (targetLine: VisualLine, targetCol: number): number {
    let accumulatedWidth = 0
    let bestLocalOffset = 0

    for (let ci = 0; ci < targetLine.text.length; ci++) {
      const cw = visualWidth(targetLine.text[ci])
      if (accumulatedWidth + cw > targetCol) {
        // Place cursor before this character — closer to targetCol wins
        break
      }
      accumulatedWidth += cw
      bestLocalOffset = ci + 1
    }

    return targetLine.start + bestLocalOffset
  }

  useInput((_input, key) => {
    if (disabled) return

    // When blockInput is active (approval dialog, turbo confirmation, etc.),
    // do NOT consume any keys — let parent useInput handle them.
    if (blockInput) return

    // ── Setup mode ────────────────────────────────────────────────────────

    // Big paste preview dialog
    if (pendingPaste) {
      if (key.return) {
        const cur = inputRef.current
        const ci = cursorIndexRef.current
        const ni = cur.slice(0, ci) + pendingPaste + cur.slice(ci)
        setInput(ni)
        setCursorIndex(ci + pendingPaste.length)
        setPendingPaste(null)
        setSuggestionIndex(-1)
      } else if (key.escape) {
        setPendingPaste(null)
      }
      return
    }
    if (isSetupMode) {
      if (key.return && input.trim()) {
        onSubmit(input)
        setInput('')
        setCursorIndex(0)
      } else if (key.backspace) {
        const curIdx = cursorIndexRef.current
        if (curIdx > 0) {
          setInput(prev => prev.slice(0, curIdx - 1) + prev.slice(curIdx))
          setCursorIndex(prev => prev - 1)
        }
        setSuggestionIndex(-1)
      } else if (key.delete) {
        const curIdx = cursorIndexRef.current
        if (curIdx < (inputRef.current.length)) {
          setInput(prev => prev.slice(0, curIdx) + prev.slice(curIdx + 1))
          // cursorIndex unchanged for Delete
        }
        setSuggestionIndex(-1)
      } else if (_input && !key.ctrl && !key.meta && !key.return && !key.escape && !key.backspace && !key.delete) {
        const normalized = _input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const curIdx = cursorIndexRef.current
        setInput(prev => prev.slice(0, curIdx) + normalized + prev.slice(curIdx))
        setCursorIndex(prev => prev + normalized.length)
        setSuggestionIndex(-1)
      }
      return
    }

    // ── Normal mode ───────────────────────────────────────────────────────
    const currentInput = inputRef.current
    const currentCursor = cursorIndexRef.current
    const currentSuggestions = getSuggestions(currentInput)
    const hasSuggestions = currentSuggestions.length > 0
    const showSuggestions = hasSuggestions && !suggestionsHidden

    // ── @-file mention completion ─────────────────────────────────────────
    const atTokenNow = !isMasked ? findAtToken(currentInput, currentCursor) : null
    if (atTokenNow && fileSuggestions.length > 0 && !fileSuggestionsHidden) {
      if (key.downArrow) {
        setFileSuggestionIndex(prev => (prev + 1) % fileSuggestions.length)
        return
      }
      if (key.upArrow) {
        setFileSuggestionIndex(prev => (prev <= 0 ? fileSuggestions.length - 1 : prev - 1))
        return
      }
      if (key.tab || key.return) {
        const chosen = fileSuggestions[Math.max(0, Math.min(fileSuggestionIndex, fileSuggestions.length - 1))]
        const completed = applyFileCompletion(currentInput, currentCursor, atTokenNow, chosen)
        setInput(completed.text)
        setCursorIndex(completed.cursorIndex)
        setFileSuggestionIndex(0)
        return
      }
      if (key.escape) {
        setFileSuggestionsHidden(true)
        return
      }
    }

    // ── Suggestion navigation ─────────────────────────────────────────────
    if (showSuggestions) {
      // Arrows cycle through suggestions — only change index, NOT input
      if (key.downArrow) {
        const newIdx = (suggestionIndex + 1) % currentSuggestions.length
        setSuggestionIndex(newIdx)
        setSuggestionsScrollOffset(prev => {
          if (newIdx >= prev + SUGGESTIONS_MAX_VISIBLE) {
            return newIdx - SUGGESTIONS_MAX_VISIBLE + 1
          }
          return prev
        })
        return
      }
      if (key.upArrow) {
        const newIdx = suggestionIndex <= 0 ? currentSuggestions.length - 1 : suggestionIndex - 1
        setSuggestionIndex(newIdx)
        setSuggestionsScrollOffset(prev => {
          if (newIdx < prev) {
            return Math.max(0, newIdx)
          }
          if (suggestionIndex <= 0 && newIdx >= SUGGESTIONS_MAX_VISIBLE) {
            return Math.max(0, newIdx - SUGGESTIONS_MAX_VISIBLE + 1)
          }
          return prev
        })
        return
      }
      if (key.tab) {
        const newIdx = (suggestionIndex + 1) % currentSuggestions.length
        setSuggestionIndex(newIdx)
        return
      }
      // Escape closes suggestions
      if (key.escape) {
        setSuggestionIndex(-1)
        setSuggestionsHidden(true)
        return
      }
      // Enter submits the selected command (or current input if no selection)
      if (key.return && currentInput.trim()) {
        const cmd = resolveCommandSubmission(currentInput, currentSuggestions, suggestionIndex)
        onSubmit(cmd)
        setHistory(prev => [cmd, ...prev].slice(0, 100))
        setInput('')
        setCursorIndex(0)
        setHistoryIndex(-1)
        setSuggestionIndex(-1)
        setPendingImageLabel(null)
        setInputScrollOffset(0)
        return
      }
      // Backspace/delete while suggestions are open — let normal input handling proceed
      // (falls through to the backspace handler below)
    }

    // ── Cursor movement: Left / Right ─────────────────────────────────────
    if (key.leftArrow) {
      setCursorIndex(prev => Math.max(0, prev - 1))
      return
    }
    if (key.rightArrow) {
      setCursorIndex(prev => Math.min(currentInput.length, prev + 1))
      return
    }

    // ── Home / End ────────────────────────────────────────────────────────
    // Ink's Key type doesn't expose home/end, so we detect them via raw input.
    if (!_input && lastRawInputRef.current) {
      const raw = lastRawInputRef.current
      if (raw === '\x1b[H' || raw === '\x1bOH' || raw === '\x1b[1~') {
        setCursorIndex(0)
        setSuggestionIndex(-1)
        return
      }
      if (raw === '\x1b[F' || raw === '\x1bOF' || raw === '\x1b[4~') {
        setCursorIndex(currentInput.length)
        setSuggestionIndex(-1)
        return
      }
    }

    // ── Backspace / Delete (cursor-aware) ─────────────────────────────────
    if (key.backspace) {
      if (currentCursor > 0) {
        const newInput = currentInput.slice(0, currentCursor - 1) + currentInput.slice(currentCursor)
        setInput(newInput)
        setCursorIndex(currentCursor - 1)
        // refetch new input value after state update — but we already have it
      }
      setSuggestionIndex(-1)
      return
    }
    // Windows workaround: Backspace (\x7f, \b) arrives as key.delete in Ink,
    // but physical Delete (\x1b[3~) also arrives as key.delete.
    // Distinguish via raw input captured via internal_eventEmitter.
    if (key.delete && lastRawInputRef.current && (lastRawInputRef.current === '\x7f' || lastRawInputRef.current === '\b')) {
      if (currentCursor > 0) {
        const newInput = currentInput.slice(0, currentCursor - 1) + currentInput.slice(currentCursor)
        setInput(newInput)
        setCursorIndex(currentCursor - 1)
      }
      setSuggestionIndex(-1)
      return
    }
    if (key.delete) {
      if (currentCursor < currentInput.length) {
        const newInput = currentInput.slice(0, currentCursor) + currentInput.slice(currentCursor + 1)
        setInput(newInput)
        // cursorIndex unchanged
      }
      setSuggestionIndex(-1)
      return
    }

    // ── Character input (cursor-aware) ────────────────────────────────────
    if (_input && !key.ctrl && !key.meta && !key.return && !key.tab && !key.escape && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && !key.backspace && !key.delete) {
      // Normalize Windows line endings (\r\n -> \n, \r -> \n) before storing
      const normalizedInput = _input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

      // Big paste preview: intercept large text pastes
      if (!isSetupMode && normalizedInput.length > BIG_PASTE_THRESHOLD) {
        setPendingPaste(normalizedInput)
        return
      }
      const newInput = currentInput.slice(0, currentCursor) + normalizedInput + currentInput.slice(currentCursor)
      setInput(newInput)
      setCursorIndex(currentCursor + normalizedInput.length)
      setSuggestionIndex(-1)
      return
    }

    // ── Shift+Enter / Alt+Enter = newline at cursor ──────────────────────
    if (key.return && (key.shift || lastRawInputRef.current === '\x1b\r')) {
      const newInput = currentInput.slice(0, currentCursor) + '\n' + currentInput.slice(currentCursor)
      setInput(newInput)
      setCursorIndex(currentCursor + 1)
      setSuggestionIndex(-1)
      return
    }

    // ── Enter = send ──────────────────────────────────────────────────────
    if (key.return && currentInput.trim()) {
      onSubmit(currentInput)
      setHistory(prev => [currentInput, ...prev].slice(0, 100))
      setInput('')
      setCursorIndex(0)
      setHistoryIndex(-1)
      setInputScrollOffset(0)
      setPendingImageLabel(null)
      setSuggestionIndex(-1)
      return
    }

    // ── Up / Down arrows: multiline cursor navigation or history ──────────

    if (key.upArrow) {
      if (totalVisualLines > 1) {
        // Move cursor up one visual line
        const lines = computeVisualLines(currentInput, maxLineWidth)
        const currentLineIdx = findVisualLine(lines, currentCursor)
        if (currentLineIdx > 0) {
          const targetCol = getCursorVisualColumn(currentCursor, lines)
          const targetLine = lines[currentLineIdx - 1]
          const newCursor = cursorIndexAtColumn(targetLine, targetCol)
          setCursorIndex(newCursor)
        }
      } else if (currentInput === '') {
        // History navigation — only when input is empty and not multiline
        if (history.length > 0) {
          const newIndex = Math.min(historyIndex + 1, history.length - 1)
          setHistoryIndex(newIndex)
          setInput(history[newIndex])
          setCursorIndex(history[newIndex].length)
          setInputScrollOffset(0)
        }
      }
      return
    }

    if (key.downArrow) {
      if (totalVisualLines > 1) {
        // Move cursor down one visual line
        const lines = computeVisualLines(currentInput, maxLineWidth)
        const currentLineIdx = findVisualLine(lines, currentCursor)
        if (currentLineIdx < lines.length - 1) {
          const targetCol = getCursorVisualColumn(currentCursor, lines)
          const targetLine = lines[currentLineIdx + 1]
          const newCursor = cursorIndexAtColumn(targetLine, targetCol)
          setCursorIndex(newCursor)
        }
      } else if (currentInput === '') {
        // History navigation — only when input is empty
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1
          setHistoryIndex(newIndex)
          setInput(history[newIndex])
          setCursorIndex(history[newIndex].length)
          setInputScrollOffset(0)
        } else {
          setHistoryIndex(-1)
          setInput('')
          setCursorIndex(0)
          setInputScrollOffset(0)
        }
      }
      return
    }

    // ── Alt+V — paste image from clipboard ────────────────────────────────
    if (key.meta && _input === 'v') {
      handleImagePaste().catch(() => {})
      return
    }

    // ── Ctrl+L clear, Ctrl+U delete line, Ctrl+C exit ────────────────────
    if (key.ctrl && _input === 'l') {
      onClear()
    } else if (key.ctrl && _input === 'u') {
      setInput('')
      setCursorIndex(0)
      setSuggestionIndex(-1)
      setSuggestionsHidden(false)
    } else if (key.ctrl && _input === 'c') {
      onExit()
    }
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  const colors = themeManager.getColors()

  // Compute visible slice of visual lines
  const visibleLines = needsScroll
    ? visualLines.slice(inputScrollOffset, inputScrollOffset + MAX_VISIBLE_ROWS)
    : visualLines

  const visibleStartOffset = needsScroll ? inputScrollOffset : 0

  return (
    <Box flexDirection='column'>
      {/* Command suggestions */}
      {suggestions.length > 0 && !suggestionsHidden && (
        <Box flexDirection='column' marginLeft={1} marginBottom={0}>
          {suggestions.slice(suggestionsScrollOffset, suggestionsScrollOffset + SUGGESTIONS_MAX_VISIBLE).map((cmd, i) => {
            const actualIndex = suggestionsScrollOffset + i
            const isActive = actualIndex === suggestionIndex || (suggestionIndex < 0 && actualIndex === 0)
            const desc = COMMAND_MAP.get(cmd) ?? ''
            const maxDescWidth = Math.max(0, (process.stdout.columns || 80) - cmd.length - 6)
            const truncDesc = desc.length > maxDescWidth ? desc.slice(0, Math.max(0, maxDescWidth - 1)) + '…' : desc
            return (
              <Text key={cmd}>
                {isActive
                  ? <Text bold color={colors.primary}>▸ </Text>
                  : <Text>  </Text>}
                <Text color={isActive ? colors.primary : colors.textMuted}>{cmd}</Text>
                {truncDesc ? <Text dimColor>  {truncDesc}</Text> : null}
              </Text>
            )
          })}
          {suggestions.length > suggestionsScrollOffset + SUGGESTIONS_MAX_VISIBLE && (
            <Text color={colors.textMuted}>  ...and {suggestions.length - suggestionsScrollOffset - SUGGESTIONS_MAX_VISIBLE} more</Text>
          )}
        </Box>
      )}
      {/* @-file mention suggestions */}
      {atToken && fileSuggestions.length > 0 && !fileSuggestionsHidden && (
        <Box flexDirection='column' marginLeft={1} marginBottom={0}>
          {fileSuggestions.map((file, i) => {
            const isActive = i === fileSuggestionIndex
            const maxWidth = Math.max(10, (process.stdout.columns || 80) - 6)
            const shown = file.length > maxWidth ? '…' + file.slice(file.length - maxWidth + 1) : file
            return (
              <Text key={file}>
                {isActive
                  ? <Text bold color={colors.primary}>▸ </Text>
                  : <Text>  </Text>}
                <Text color={isActive ? colors.primary : colors.textMuted}>@{shown}</Text>
              </Text>
            )
          })}
          <Text dimColor>  Tab/Enter — вставить путь, Esc — закрыть</Text>
        </Box>
      )}
      {/* Big paste preview */}
      {pendingPaste && (
        <Box flexDirection='column' marginLeft={2} marginBottom={1} borderStyle='round' borderColor={colors.warning}>
          <Box>
            <Text bold color={colors.warning}>Крупная вставка · {pendingPaste.length} символов · {pendingPaste.split(/\r?\n/).length} строк</Text>
          </Box>
          <Box marginLeft={1}>
            <Text color={colors.textMuted}>{pendingPaste.slice(0, 300)}{pendingPaste.length > 300 ? '…' : ''}</Text>
          </Box>
          <Box marginLeft={1} marginTop={1}>
            <Text color={colors.textMuted}>Enter — вставить  Esc — отмена</Text>
          </Box>
        </Box>
      )}
      {/* Empty input hint */}
      {emptyHint && !input && (
        <Box marginLeft={1} marginBottom={0}>
          <Text dimColor>Введите сообщение или /help для списка команд</Text>
        </Box>
      )}
      <Box borderStyle='round' borderColor={colors.border} paddingX={1} paddingY={0}>
        <Box flexDirection='column' width='100%'>
          {input.length === 0 && !disabled
            ? (
              <Box>
                <Text bold color={colors.primary}>{'>'}</Text>
                <Text color={colors.textMuted}> Введите запрос...</Text>
                <Text color={colors.primary}>{cursorVisible ? '▋' : ' '}</Text>
              </Box>
              )
            : (
                visibleLines.map((line, i) => {
                  const actualVisualIdx = visibleStartOffset + i
                  const isCursorLine = actualVisualIdx === cursorVisualLineIdx

                  // Determine prefix: first visual line of the input gets '>', others get ' '
                  const prefix = actualVisualIdx === 0
                    ? <Text bold color={colors.primary}>{'>'}</Text>
                    : <Text> </Text>

                  if (isCursorLine) {
                    const localOffset = cursorIndex - line.start
                    const beforeCursor = line.text.slice(0, localOffset)
                    const afterCursor = line.text.slice(localOffset)

                    return (
                      <Box key={actualVisualIdx}>
                        {prefix}
                        <Text color={colors.text}>
                          {beforeCursor}
                          {!disabled ? <Text color={colors.primary}>{cursorVisible ? '▋' : ' '}</Text> : null}
                          {afterCursor || ' '}
                        </Text>
                      </Box>
                    )
                  }

                  return (
                    <Box key={actualVisualIdx}>
                      {prefix}
                      <Text color={colors.text}>{line.text || ' '}</Text>
                    </Box>
                  )
                })
              )}
          {pendingImageLabel && (
            <Box>
              <Text color={colors.info}>{pendingImageLabel}</Text>
            </Box>
          )}
          {(input.length > 0 && !disabled) || needsScroll
            ? (
              <Box justifyContent='flex-end'>
                {needsScroll && <Text color={colors.textMuted}>↑↓  </Text>}
                {input.length > 0 && !disabled && (
                  <Text color={colors.textMuted}>Enter — отправить</Text>
                )}
              </Box>
              )
            : null}
        </Box>
      </Box>
    </Box>
  )
}
