import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

export function ProgressSpinner({
  message,
  current = null,
  total = null,
  type = 'dots',
  color = 'cyan',
}) {
  const progress_text =
    current !== null && total !== null ? ` (${current}/${total})` : ''

  return React.createElement(
    Box,
    { paddingLeft: 2 },
    React.createElement(
      Text,
      { color },
      React.createElement(Spinner, { type }),
      ' ',
      message,
      progress_text,
    ),
  )
}
