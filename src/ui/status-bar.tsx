import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import type { ApprovalMode } from '../config/defaults.js'
import { i18n } from '../core/i18n.js'
import { themeManager } from '../core/themes.js'
import { chromeManager } from '../tools/chrome-manager.js'

interface StatusBarProps {
  mode: ApprovalMode;
  status: string;
  messageCount: number;
  isProcessing?: boolean;
}

const modeColors: Record<ApprovalMode, string> = {
  plan: 'yellow',
  default: 'blue',
  'auto-edit': 'green',
  yolo: 'red',
}

const modeLabels: Record<ApprovalMode, string> = {
  plan: 'PLAN',
  default: 'DEFAULT',
  'auto-edit': 'AUTO-EDIT',
  yolo: 'YOLO',
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/**
 * Пульсирующие цвета для статуса "Thinking..."
 */
const PULSE_COLORS: Array<'yellow' | 'cyan' | 'green' | 'white'> = ['yellow', 'cyan', 'green', 'white']

export function StatusBar ({ mode, status, messageCount, isProcessing }: StatusBarProps) {
  const colors = themeManager.getColors()
  const [chromeConnected, setChromeConnected] = useState(false)
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const [pulseIdx, setPulseIdx] = useState(0)

  // Spinner animation when processing
  useEffect(() => {
    if (!isProcessing) return
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [isProcessing])

  // Pulse animation when processing
  useEffect(() => {
    if (!isProcessing) return
    const interval = setInterval(() => {
      setPulseIdx(prev => (prev + 1) % PULSE_COLORS.length)
    }, 400)
    return () => clearInterval(interval)
  }, [isProcessing])

  // Check Chrome status once on mount
  useEffect(() => {
    setChromeConnected(chromeManager.isConnected())
  }, [])

  return (
    <Box borderStyle='single' borderColor={colors.border} paddingX={1}>
      <Box flexGrow={1}>
        <Text bold color={modeColors[mode] as 'yellow' | 'blue' | 'green' | 'red'}>
          [{modeLabels[mode]}]
        </Text>
        <Text> </Text>
        {isProcessing
          ? (
            <Text>
              <Text color={PULSE_COLORS[pulseIdx]}>{SPINNER_FRAMES[spinnerFrame]}</Text>
              {' '}
              <Text color={PULSE_COLORS[pulseIdx]} bold>Thinking...</Text>
            </Text>
            )
          : <Text color={colors.textMuted}>{status}</Text>}
      </Box>
      <Box>
        {chromeConnected && (
          <Text color='green'> 🌐Chrome </Text>
        )}
        <Text color={colors.textMuted}>{i18n.t('system')}: {messageCount}</Text>
      </Box>
    </Box>
  )
}
