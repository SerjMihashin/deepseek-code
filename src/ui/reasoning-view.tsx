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

  const displayText = reasoning || 'Thinking...'

  return (
    <Box flexDirection='column' marginLeft={2} marginBottom={1}>
      <Box>
        <Text>
          {isActive
            ? <Text color='yellow'>{SPINNER_FRAMES[spinnerFrame]}</Text>
            : <Text color='green'>✓</Text>}
          {' '}
          <Text bold color='yellow'>Reasoning</Text>
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
