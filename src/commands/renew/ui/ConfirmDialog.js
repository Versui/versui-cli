import React from 'react'
import { Box, Text, useInput } from 'ink'

export function ConfirmDialog({ title, details = [], on_confirm, on_cancel }) {
  useInput((input, key) => {
    const lower_input = input.toLowerCase()

    if (lower_input === 'y') {
      on_confirm?.(true)
    } else if (lower_input === 'n' || key.escape) {
      on_cancel?.(false)
    }
  })

  return React.createElement(
    Box,
    { flexDirection: 'column', paddingLeft: 2 },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'yellow' }, '⚠  ', title),
    ),
    details.map((line, index) =>
      React.createElement(
        Box,
        { key: index, paddingLeft: 3 },
        React.createElement(Text, { dimColor: true }, line),
      ),
    ),
    React.createElement(
      Box,
      { paddingLeft: 3, marginTop: 1 },
      React.createElement(
        Text,
        { color: 'cyan' },
        '⛓ This will execute transactions',
      ),
    ),
    React.createElement(
      Box,
      { marginTop: 1, paddingLeft: 3 },
      React.createElement(
        Text,
        { dimColor: true },
        '[Y] Confirm & Pay  [N] Cancel',
      ),
    ),
  )
}
