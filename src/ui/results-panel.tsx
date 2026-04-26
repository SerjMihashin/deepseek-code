import React from 'react'
import { Box, Text } from 'ink'
import { ToolCallView } from './tool-call-view.js'
import { ReasoningView } from './reasoning-view.js'
import type { ToolCallEvent } from '../core/agent-loop.js'
import { themeManager } from '../core/themes.js'

const VISIBLE_TOOL_CALLS = 3

interface ResultsPanelProps {
  toolCalls: ToolCallEvent[];
  reasoning: string;
  reasoningActive: boolean;
  pendingApproval: boolean;
  scrollOffset?: number;
}

export function ResultsPanel ({ toolCalls, reasoning, reasoningActive, pendingApproval, scrollOffset = 0 }: ResultsPanelProps) {
  const colors = themeManager.getColors()
  const hasContent = toolCalls.length > 0 || reasoning || reasoningActive || pendingApproval

  if (!hasContent) return null

  const startIdx = Math.max(0, toolCalls.length - VISIBLE_TOOL_CALLS - scrollOffset)
  const visibleCalls = toolCalls.slice(startIdx, startIdx + VISIBLE_TOOL_CALLS)
  const hiddenAbove = startIdx
  const canScrollDown = scrollOffset > 0

  return (
    <Box flexDirection='column'>
      {/* Separator */}
      <Box>
        <Text color={colors.border}>
          {'─'.repeat(process.stdout.columns || 60)}
        </Text>
      </Box>

      {/* Results content — capped at 10 rows to avoid dominating the screen */}
      <Box flexDirection='column' paddingX={1} height={10} overflow='hidden'>
        {reasoningActive && (
          <Box marginBottom={1}>
            <Text color={colors.warning} bold>🤔 Thinking...</Text>
          </Box>
        )}

        {reasoning && (
          <Box marginBottom={1}>
            <ReasoningView reasoning={reasoning} isActive={reasoningActive} />
          </Box>
        )}

        {toolCalls.length > 0 && (
          <>
            {hiddenAbove > 0 && (
              <Box marginLeft={2}>
                <Text dimColor>↑ {hiddenAbove} earlier call{hiddenAbove > 1 ? 's' : ''} (PageUp)</Text>
              </Box>
            )}
            <ToolCallView toolCalls={visibleCalls} />
            {canScrollDown && (
              <Box marginLeft={2}>
                <Text dimColor>↓ (PageDown to scroll back)</Text>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
