import React, { useState, useRef, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { themeManager } from '../core/themes.js'

interface InputBarProps {
  onSubmit: (input: string) => void;
  disabled: boolean;
  onClear: () => void;
  onExit: () => void;
  isMasked?: boolean;
  isSetupMode?: boolean;
  emptyHint?: boolean;
  onImagePaste?: (base64: string, mimeType: string) => void;
}

const COMMANDS = [
  '/setup',
  '/remember',
  '/forget',
  '/memory',
  '/compress',
  '/checkpoint',
  '/restore',
  '/mcp',
  '/skills',
  '/agents',
  '/review',
  '/sandbox',
  '/git',
  '/loop',
  '/stats',
  '/theme',
  '/lang',
  '/language',
  '/extensions',
  '/followup',
  '/help',
]

/** Max visible rows for the input area before internal scroll kicks in */
const MAX_VISIBLE_ROWS = 5

export function InputBar ({ onSubmit, disabled, onClear, onExit, isMasked, isSetupMode, emptyHint, onImagePaste }: InputBarProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [pendingImageLabel, setPendingImageLabel] = useState<string | null>(null)
  const [inputScrollOffset, setInputScrollOffset] = useState(0)
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    setCursorVisible(!disabled)
  }, [disabled])

  const handleImagePaste = async () => {
    try {
      const { readClipboardImage } = await import('../utils/clipboard.js')
      const buf = await readClipboardImage()
      if (!buf) {
        setPendingImageLabel('(no image in clipboard)')
        setTimeout(() => setPendingImageLabel(null), 2000)
        return
      }
      const base64 = buf.toString('base64')
      const label = `[image: ${Math.round(buf.length / 1024)}KB]`
      setPendingImageLabel(label)
      onImagePaste?.(base64, 'image/png')
    } catch {
      setPendingImageLabel('(clipboard error)')
      setTimeout(() => setPendingImageLabel(null), 2000)
    }
  }

  // Compute command suggestions from current input
  const suggestions = input.startsWith('/')
    ? COMMANDS.filter(cmd => cmd.startsWith(input.toLowerCase()))
    : []

  const getSuggestions = (text: string) =>
    text.startsWith('/') ? COMMANDS.filter(cmd => cmd.startsWith(text.toLowerCase())) : []

  // Calculate number of visual lines the input text occupies
  const terminalWidth = process.stdout.columns || 80
  const inputLines = input.split('\n').reduce((sum, line) => {
    if (line.length === 0) return sum + 1
    return sum + Math.ceil(line.length / Math.max(1, terminalWidth - 6))
  }, 0)
  const needsScroll = inputLines > MAX_VISIBLE_ROWS

  useInput((_input, key) => {
    if (disabled) return

    // In setup mode, only handle Enter and character input, not arrows/tab
    if (isSetupMode) {
      if (key.return && input.trim()) {
        onSubmit(input)
        setInput('')
      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1))
        setSuggestionIndex(-1)
      } else if (_input && !key.ctrl && !key.meta && !key.return && !key.escape && !key.backspace && !key.delete) {
        setInput(prev => prev + _input)
        setSuggestionIndex(-1)
      }
      return
    }

    // Normal mode
    const currentInput = inputRef.current
    const currentSuggestions = getSuggestions(currentInput)
    const hasSuggestions = currentSuggestions.length > 0

    if (hasSuggestions) {
      // Arrows cycle through suggestions
      if (key.downArrow) {
        const newIdx = (suggestionIndex + 1) % currentSuggestions.length
        setSuggestionIndex(newIdx)
        setInput(currentSuggestions[newIdx] + ' ')
        return
      }
      if (key.upArrow) {
        const newIdx = suggestionIndex <= 0 ? currentSuggestions.length - 1 : suggestionIndex - 1
        setSuggestionIndex(newIdx)
        setInput(currentSuggestions[newIdx] + ' ')
        return
      }
      if (key.tab) {
        const newIdx = (suggestionIndex + 1) % currentSuggestions.length
        setSuggestionIndex(newIdx)
        setInput(currentSuggestions[newIdx] + ' ')
        return
      }
      if (key.return && currentInput.trim()) {
        const cmd = suggestionIndex >= 0 ? currentSuggestions[suggestionIndex] : currentInput.trim()
        onSubmit(cmd)
        setHistory(prev => [cmd, ...prev].slice(0, 100))
        setInput('')
        setHistoryIndex(-1)
        setSuggestionIndex(-1)
        setPendingImageLabel(null)
        setInputScrollOffset(0)
        return
      }
    }

    // Backspace / delete (also handled when no suggestions)
    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1))
      setSuggestionIndex(-1)
      return
    }

    // Regular character input
    if (_input && !key.ctrl && !key.meta && !key.return && !key.tab && !key.escape && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && !key.backspace && !key.delete) {
      setInput(prev => prev + _input)
      setSuggestionIndex(-1)
      // Auto-scroll to bottom when typing
      if (needsScroll) setInputScrollOffset(Math.max(0, inputLines - MAX_VISIBLE_ROWS))
      return
    }

    // Shift+Enter = newline, Enter = send (when no suggestions)
    if (key.return && key.shift) {
      setInput(prev => prev + '\n')
      setSuggestionIndex(-1)
      // Auto-scroll to bottom
      if (needsScroll) setInputScrollOffset(Math.max(0, inputLines - MAX_VISIBLE_ROWS))
      return
    }
    if (key.return && currentInput.trim()) {
      onSubmit(currentInput)
      setHistory(prev => [currentInput, ...prev].slice(0, 100))
      setInput('')
      setHistoryIndex(-1)
      setInputScrollOffset(0)
      setPendingImageLabel(null)
      setSuggestionIndex(-1)
      return
    }

    // History navigation (only when no suggestions)
    if (key.upArrow) {
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1)
        setHistoryIndex(newIndex)
        setInput(history[newIndex])
        setInputScrollOffset(0)
      }
      return
    }
    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setInput(history[newIndex])
        setInputScrollOffset(0)
      } else {
        setHistoryIndex(-1)
        setInput('')
        setInputScrollOffset(0)
      }
      return
    }

    // Alt+V — paste image from clipboard
    if (key.meta && _input === 'v') {
      void handleImagePaste()
      return
    }

    // Ctrl+L clear, Ctrl+C exit
    if (key.ctrl && _input === 'l') {
      onClear()
    } else if (key.ctrl && _input === 'c') {
      onExit()
    }
  })

  const displayText = isMasked && input.length > 0
    ? '•'.repeat(input.length)
    : input

  const colors = themeManager.getColors()

  // Split display text into visible lines for internal scroll
  const allLines = displayText.split('\n')
  const wrappedLines: string[] = []
  for (const line of allLines) {
    if (line.length === 0) {
      wrappedLines.push('')
    } else {
      for (let i = 0; i < line.length; i += Math.max(1, terminalWidth - 6)) {
        wrappedLines.push(line.slice(i, i + Math.max(1, terminalWidth - 6)))
      }
    }
  }
  const visibleLines = needsScroll
    ? wrappedLines.slice(inputScrollOffset, inputScrollOffset + MAX_VISIBLE_ROWS)
    : wrappedLines

  return (
    <Box flexDirection='column'>
      {/* Command suggestions */}
      {suggestions.length > 0 && (
        <Box flexDirection='column' marginLeft={1} marginBottom={0}>
          {suggestions.slice(0, 6).map((cmd, i) => (
            <Text key={cmd}>
              {i === suggestionIndex || (suggestionIndex < 0 && i === 0)
                ? <Text bold color={colors.primary}>▸ </Text>
                : <Text>  </Text>}
              <Text color={i === suggestionIndex || (suggestionIndex < 0 && i === 0) ? colors.primary : colors.textMuted}>
                {cmd}
              </Text>
            </Text>
          ))}
          {suggestions.length > 6 && (
            <Text color={colors.textMuted}>  ...and {suggestions.length - 6} more</Text>
          )}
        </Box>
      )}
      {/* Empty input hint */}
      {emptyHint && !input && (
        <Box marginLeft={1} marginBottom={0}>
          <Text dimColor>Type a message or /help for commands</Text>
        </Box>
      )}
      <Box borderStyle='round' borderColor={colors.border} paddingX={1} paddingY={0}>
        <Box flexDirection='column' width='100%'>
          {input.length === 0 && !disabled ? (
            <Box>
              <Text bold color={colors.primary}>{'>'}</Text>
              <Text color={colors.textMuted}> Type your request...</Text>
              <Text color={colors.primary}>{cursorVisible ? '▋' : ' '}</Text>
            </Box>
          ) : (
            visibleLines.map((line, i) => (
              <Box key={i}>
                {i === 0 && <Text bold color={colors.primary}>{'>'}</Text>}
                {i > 0 && <Text> </Text>}
                <Text wrap='wrap' color={colors.text}>{line || ' '}</Text>
                {i === visibleLines.length - 1 && !disabled && (
                  <Text color={colors.primary}>{cursorVisible ? '▋' : ' '}</Text>
                )}
              </Box>
            ))
          )}
        </Box>
        {pendingImageLabel && <Text color={colors.info}> {pendingImageLabel}</Text>}
        {input.length > 0 && !disabled && (
          <Text color={colors.textMuted}>  (Enter to send)</Text>
        )}
        {needsScroll && (
          <Text color={colors.textMuted}>  ↑↓ scroll</Text>
        )}
      </Box>
    </Box>
  )
}
