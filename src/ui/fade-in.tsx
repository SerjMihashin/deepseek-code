import React, { useState, useEffect } from 'react'
import { Box } from 'ink'

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
}

export function FadeIn ({ children, delay = 0 }: FadeInProps) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])
  if (!visible) return <Box />
  return <Box>{children}</Box>
}
