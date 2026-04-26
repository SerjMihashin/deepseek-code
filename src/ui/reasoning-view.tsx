import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { themeManager } from '../core/themes.js'

interface ReasoningViewProps {
  reasoning: string;
  isActive: boolean;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/**
 * ReasoningView — отображает рассуждения AI в реальном времени.
 * Показывает спиннер и текст reasoning, который стримится из DeepSeek API.
 */
export function ReasoningView ({ reasoning, isActive }: ReasoningViewProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const colors = themeManager.getColors()

  // Animate spinner while active
  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [isActive])

  if (!reasoning && !isActive) return null

  const MAX_LINES = 7
  const rawText = reasoning || 'Thinking...'
  const lines = rawText.split('\n')
  const truncated = lines.length > MAX_LINES
  const displayLines = truncated ? lines.slice(-MAX_LINES) : lines
  const displayText = displayLines.join('\n')

  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box>
        <Text>
          {isActive
            ? <Text color='yellow'>{SPINNER_FRAMES[spinnerFrame]}</Text>
            : <Text color='green'>✓</Text>}
          {' '}
          <Text bold color='yellow'>Reasoning</Text>
          {truncated && <Text dimColor> (showing last {MAX_LINES} lines)</Text>}
        </Text>
      </Box>
      <Box marginLeft={3}>
        <Text color={colors.textMuted} wrap='wrap'>
          {displayText}
        </Text>
      </Box>
    </Box>
  )
}
