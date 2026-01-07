import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import chalk from 'chalk'

const GLOW_FRAMES = [
  '┌────────────────────────────────┐',
  '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
  '┌────────────────────────────────┐',
  '├────────────────────────────────┤',
]

const BOTTOM_FRAMES = [
  '└────────────────────────────────┘',
  '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
  '└────────────────────────────────┘',
  '├────────────────────────────────┤',
]

export function GlowingBox({ children, color = 'cyan' }) {
  const [frame_index, set_frame_index] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      set_frame_index(prev => (prev + 1) % GLOW_FRAMES.length)
    }, 200)

    return () => clearInterval(interval)
  }, [])

  const top_border = GLOW_FRAMES[frame_index]
  const bottom_border = BOTTOM_FRAMES[frame_index]

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, { color }, top_border),
    React.createElement(Box, { paddingLeft: 2, paddingRight: 2 }, children),
    React.createElement(Text, { color }, bottom_border),
  )
}
