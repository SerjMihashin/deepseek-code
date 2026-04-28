import React from 'react'
import { Box, Text } from 'ink'

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null }

  static getDerivedStateFromError (error: Error): State {
    return { error }
  }

  render () {
    if (this.state.error) {
      return (
        <Box flexDirection='column' padding={1}>
          <Text color='red' bold>TUI Error: {this.state.error.message}</Text>
          <Text dimColor>Restart with: node dist/cli/index.js</Text>
        </Box>
      )
    }
    return this.props.children
  }
}
