import React from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'

export function ConfirmDialog({
  title,
  details = [],
  cost_label = null,
  cost_value = null,
  is_free = false,
  is_dangerous = false,
  danger_text = null,
  on_confirm,
  on_cancel,
}) {
  const [typed_text, set_typed_text] = React.useState('')

  useInput((input, key) => {
    if (is_dangerous && danger_text) {
      // Dangerous mode requires exact text typing
      if (key.return && typed_text === danger_text) {
        on_confirm?.(true)
      } else if (key.escape) {
        on_cancel?.(false)
      } else if (key.backspace || key.delete) {
        set_typed_text(typed_text.slice(0, -1))
      } else if (input && !key.return) {
        set_typed_text(typed_text + input)
      }
    } else {
      // Normal Y/N mode
      const lower_input = input.toLowerCase()
      if (lower_input === 'y') {
        on_confirm?.(true)
      } else if (lower_input === 'n' || key.escape) {
        on_cancel?.(false)
      }
    }
  })

  return React.createElement(
    Box,
    { flexDirection: 'column', paddingLeft: 2 },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        {
          bold: true,
          color: is_dangerous ? 'red' : 'yellow',
        },
        is_dangerous ? '⚠️  DANGER: ' : '⚠  ',
        title,
      ),
    ),
    details.map((line, index) =>
      React.createElement(
        Box,
        { key: index, paddingLeft: 3 },
        React.createElement(Text, { dimColor: true }, line),
      ),
    ),
    is_free &&
      React.createElement(
        Box,
        { paddingLeft: 3, marginTop: 1 },
        React.createElement(
          Text,
          { color: 'green', bold: true },
          '✓ FREE - No transaction cost',
        ),
      ),
    !is_free &&
      !is_dangerous &&
      React.createElement(
        Box,
        { paddingLeft: 3, marginTop: 1 },
        React.createElement(
          Text,
          { color: 'cyan' },
          cost_value
            ? `⛓ ${cost_value}`
            : '⛓ This will execute a transaction',
        ),
      ),
    is_dangerous &&
      danger_text &&
      React.createElement(
        Box,
        { flexDirection: 'column', paddingLeft: 3, marginTop: 1 },
        React.createElement(
          Text,
          { color: 'red', bold: true },
          `Type "${danger_text}" to confirm:`,
        ),
        React.createElement(
          Text,
          { color: typed_text === danger_text ? 'green' : 'white' },
          '> ',
          typed_text,
        ),
      ),
    !is_dangerous &&
      React.createElement(
        Box,
        { marginTop: 1, paddingLeft: 3 },
        React.createElement(
          Text,
          { dimColor: true },
          is_free
            ? '[Y] Continue  [N] Cancel'
            : '[Y] Confirm & Pay  [N] Cancel',
        ),
      ),
    is_dangerous &&
      React.createElement(
        Box,
        { marginTop: 1, paddingLeft: 3 },
        React.createElement(Text, { dimColor: true }, '[ESC] Cancel'),
      ),
  )
}
