import React from 'react'
import { Box, Text } from 'ink'
import { ToolCallView } from './tool-call-view.js'
import { ReasoningView } from './reasoning-view.js'
import type { ToolCallEvent } from '../core/agent-loop.js'
import { themeManager } from '../core/themes.js'

/** Max visible tool call groups (grouped by name) */
const VISIBLE_TOOL_GROUPS = 5

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

  // Count unique tool call types for summary
  const uniqueTools = new Set(toolCalls.map(tc => tc.name)).size

  return (
    <Box flexDirection='column'>
      {/* Separator */}
      <Box>
        <Text color={colors.border}>
          {'─'.repeat(Math.min(process.stdout.columns || 60, 60))}
        </Text>
      </Box>

      {/* Results content — compact */}
      <Box flexDirection='column' paddingX={1} height={8} overflow='hidden'>
        {reasoningActive && (
          <Box marginBottom={0}>
            <Text color={colors.warning} bold>🤔 Thinking...</Text>
          </Box>
        )}

        {reasoning && (
          <Box marginBottom={0} height={3} overflow='hidden'>
            <ReasoningView reasoning={reasoning} isActive={reasoningActive} />
          </Box>
        )}

        {toolCalls.length > 0 && (
          <>
            <ToolCallView toolCalls={toolCalls} maxItems={VISIBLE_TOOL_GROUPS} />
            <Box marginLeft={2}>
              <Text dimColor>
                {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
                {uniqueTools > 1 ? ` (${uniqueTools} types)` : ''}
                {scrollOffset > 0 && ' — PageDown'}
              </Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}
