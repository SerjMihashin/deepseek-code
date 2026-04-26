import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import type { ApprovalMode } from '../config/defaults.js'
import { i18n } from '../core/i18n.js'
import { themeManager } from '../core/themes.js'
import { chromeManager, type ChromeRuntimeState } from '../tools/chrome-manager.js'

interface StatusBarProps {
  mode: ApprovalMode;
  status: string;
  messageCount: number;
  isProcessing?: boolean;
  contextPercent?: number;
}

const modeLabels: Record<ApprovalMode, string> = {
  plan: 'PLAN',
  default: 'DEFAULT',
  'auto-edit': 'AUTO-EDIT',
  yolo: 'YOLO',
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function StatusBar ({ mode, status, messageCount, isProcessing, contextPercent }: StatusBarProps) {
  const colors = themeManager.getColors()
  const modeColors: Record<ApprovalMode, string> = {
    plan: colors.warning,
    default: colors.info,
    'auto-edit': colors.success,
    yolo: colors.error,
  }
  const pulseColors = [colors.warning, colors.info, colors.success, colors.text]
  const [chromeState, setChromeState] = useState<ChromeRuntimeState>(chromeManager.getState())
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const [pulseIdx, setPulseIdx] = useState(0)

  useEffect(() => {
    if (!isProcessing) return
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [isProcessing])

  useEffect(() => {
    if (!isProcessing) return
    const interval = setInterval(() => {
      setPulseIdx(prev => (prev + 1) % 4)
    }, 400)
    return () => clearInterval(interval)
  }, [isProcessing])

  useEffect(() => {
    setChromeState(chromeManager.getState())
    const handleStateChange = (state: ChromeRuntimeState) => {
      setChromeState(state)
    }
    chromeManager.on('stateChange', handleStateChange)
    return () => {
      chromeManager.off('stateChange', handleStateChange)
    }
  }, [])

  return (
    <Box borderStyle='single' borderColor={colors.border} paddingX={1}>
      <Box flexGrow={1}>
        <Text bold color={modeColors[mode]}>
          [{modeLabels[mode]}]
        </Text>
        <Text> </Text>
        {isProcessing
          ? (
            <Text>
              <Text color={pulseColors[pulseIdx % pulseColors.length]}>{SPINNER_FRAMES[spinnerFrame]}</Text>
              {' '}
              <Text color={pulseColors[pulseIdx % pulseColors.length]} bold>Thinking...</Text>
            </Text>
            )
          : <Text color={colors.textMuted}>{status}</Text>}
      </Box>
      <Box>
        {chromeState.connected && (
          <Text color='green'> 🌐Chrome{chromeState.headless ? ':H' : ''} </Text>
        )}
        {contextPercent !== undefined && contextPercent > 0 && (
          <Text color={contextPercent > 80 ? colors.error : contextPercent > 50 ? colors.warning : colors.textMuted}>
            {' '}ctx:{contextPercent}%{' '}
          </Text>
        )}
        <Text color={colors.textMuted}>{i18n.t('system')}: {messageCount}</Text>
      </Box>
    </Box>
  )
}
