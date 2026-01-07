import React from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'

export function ConfirmDialog({
  title,
  details = [],
  costLabel = null,
  costValue = null,
  isFree = false,
  onConfirm,
  onCancel,
}) {
  useInput((input, key) => {
    const lower_input = input.toLowerCase()

    if (lower_input === 'y') {
      onConfirm?.(true)
    } else if (lower_input === 'n' || key.escape) {
      onCancel?.(false)
    }
    // Ignore Enter and other keys to prevent unwanted side effects
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
    isFree &&
      React.createElement(
        Box,
        { paddingLeft: 3, marginTop: 1 },
        React.createElement(
          Text,
          { color: 'green', bold: true },
          '✓ FREE - No transaction cost',
        ),
      ),
    !isFree &&
      React.createElement(
        Box,
        { paddingLeft: 3, marginTop: 1 },
        React.createElement(
          Text,
          { color: 'cyan' },
          costValue ? `⛓ ${costValue}` : '⛓ This will execute a transaction',
        ),
      ),
    React.createElement(
      Box,
      { marginTop: 1, paddingLeft: 3 },
      React.createElement(
        Text,
        { dimColor: true },
        isFree ? '[Y] Continue  [N] Cancel' : '[Y] Confirm & Pay  [N] Cancel',
      ),
    ),
  )
}
