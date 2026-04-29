import React, { useState, useRef, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { themeManager } from '../core/themes.js'
import { COMMAND_NAMES } from '../commands/index.js'
import { visualWidth } from '../utils/string-width.js'

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

/** Max visible rows for the input area before internal scroll kicks in */
const MAX_VISIBLE_ROWS = 5

/** Max visible suggestions in the dropdown before scrolling */
const SUGGESTIONS_MAX_VISIBLE = 8

export function InputBar ({ onSubmit, disabled, onClear, onExit, isMasked, isSetupMode, emptyHint, onImagePaste, blockInput }: InputBarProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const [suggestionsScrollOffset, setSuggestionsScrollOffset] = useState(0)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [pendingImageLabel, setPendingImageLabel] = useState<string | null>(null)
  const [inputScrollOffset, setInputScrollOffset] = useState(0)
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    setCursorVisible(!disabled)
  }, [disabled])

  // Reset suggestions scroll when input changes (suggestions list rebuilt)
  useEffect(() => {
    setSuggestionsScrollOffset(0)
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

  // Calculate number of visual lines the input text occupies
  const terminalWidth = process.stdout.columns || 80
  const inputLines = input.split('\n').reduce((sum, line) => {
    if (line.length === 0) return sum + 1
    return sum + Math.ceil(visualWidth(line) / Math.max(1, terminalWidth - 6))
  }, 0)
  const needsScroll = inputLines > MAX_VISIBLE_ROWS

  useInput((_input, key) => {
    if (disabled) return

    // When blockInput is active (approval dialog, turbo confirmation, etc.),
    // do NOT consume any keys — let parent useInput handle them.
    if (blockInput) return

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
      // Arrows cycle through suggestions — only change index, NOT input
      if (key.downArrow) {
        const newIdx = (suggestionIndex + 1) % currentSuggestions.length
        setSuggestionIndex(newIdx)
        // Scroll down if active item goes below visible area
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
        // Scroll up if active item goes above visible area
        setSuggestionsScrollOffset(prev => {
          if (newIdx < prev) {
            return Math.max(0, newIdx)
          }
          // Wrap-around from top to bottom
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
        return
      }
      // Enter submits the selected command (or current input if no selection)
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
      // Backspace/delete while suggestions are open — let normal input handling proceed
      // (falls through to the backspace handler below)
    }

    // Backspace / delete
    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1))
      setSuggestionIndex(-1)
      return
    }

    // Regular character input
    if (_input && !key.ctrl && !key.meta && !key.return && !key.tab && !key.escape && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && !key.backspace && !key.delete) {
      setInput(prev => prev + _input)
      setSuggestionIndex(-1)
      if (needsScroll) setInputScrollOffset(Math.max(0, inputLines - MAX_VISIBLE_ROWS))
      return
    }

    // Shift+Enter = newline
    if (key.return && key.shift) {
      setInput(prev => prev + '\n')
      setSuggestionIndex(-1)
      if (needsScroll) setInputScrollOffset(Math.max(0, inputLines - MAX_VISIBLE_ROWS))
      return
    }
    // Enter = send (when no suggestions OR when suggestions exist but we fall back here)
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

    // History navigation (only when no suggestions active)
    if (!hasSuggestions) {
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
    }

    // Alt+V — paste image from clipboard
    if (key.meta && _input === 'v') {
      handleImagePaste().catch(() => {})
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

  // Split display text into visible lines for internal scroll (visual-width aware)
  const maxLineWidth = Math.max(1, terminalWidth - 6)
  const allLines = displayText.split('\n')
  const wrappedLines: string[] = []
  for (const line of allLines) {
    if (line.length === 0) {
      wrappedLines.push('')
    } else {
      let current = ''
      let currentWidth = 0
      for (const ch of line) {
        const cw = visualWidth(ch)
        if (currentWidth + cw > maxLineWidth) {
          wrappedLines.push(current)
          current = ch
          currentWidth = cw
        } else {
          current += ch
          currentWidth += cw
        }
      }
      if (current) wrappedLines.push(current)
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
          {suggestions.slice(suggestionsScrollOffset, suggestionsScrollOffset + SUGGESTIONS_MAX_VISIBLE).map((cmd, i) => {
            const actualIndex = suggestionsScrollOffset + i
            const isActive = actualIndex === suggestionIndex || (suggestionIndex < 0 && actualIndex === 0)
            return (
              <Text key={cmd}>
                {isActive
                  ? <Text bold color={colors.primary}>▸ </Text>
                  : <Text>  </Text>}
                <Text color={isActive ? colors.primary : colors.textMuted}>
                  {cmd}
                </Text>
              </Text>
            )
          })}
          {suggestions.length > suggestionsScrollOffset + SUGGESTIONS_MAX_VISIBLE && (
            <Text color={colors.textMuted}>  ...and {suggestions.length - suggestionsScrollOffset - SUGGESTIONS_MAX_VISIBLE} more</Text>
          )}
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
          <Text color={colors.textMuted}>  (Enter — отправить)</Text>
        )}
        {needsScroll && (
          <Text color={colors.textMuted}>  ↑↓ scroll</Text>
        )}
      </Box>
    </Box>
  )
}
