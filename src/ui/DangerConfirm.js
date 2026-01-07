import React from 'react'
import { Box, Text, useInput } from 'ink'

export function DangerConfirm({
  title,
  warning_text,
  details = [],
  confirm_text = 'DELETE',
  on_confirm,
  on_cancel,
}) {
  const [typed_text, set_typed_text] = React.useState('')
  const [show_double_confirm, set_show_double_confirm] = React.useState(false)

  useInput((input, key) => {
    if (key.escape) {
      on_cancel?.(false)
      return
    }

    if (!show_double_confirm) {
      // First confirmation - typing exact text
      if (key.return && typed_text === confirm_text) {
        set_show_double_confirm(true)
        set_typed_text('')
      } else if (key.backspace || key.delete) {
        set_typed_text(typed_text.slice(0, -1))
      } else if (input && !key.return) {
        set_typed_text(typed_text + input)
      }
    } else {
      // Second confirmation - Y/N
      const lower_input = input.toLowerCase()
      if (lower_input === 'y') {
        on_confirm?.(true)
      } else if (lower_input === 'n') {
        set_show_double_confirm(false)
        set_typed_text('')
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
        { bold: true, color: 'red' },
        '⚠️  DANGER: ',
        title,
      ),
    ),
    React.createElement(
      Box,
      { paddingLeft: 3, marginBottom: 1 },
      React.createElement(Text, { color: 'red', bold: true }, warning_text),
    ),
    details.map((line, index) =>
      React.createElement(
        Box,
        { key: index, paddingLeft: 3 },
        React.createElement(Text, { dimColor: true }, line),
      ),
    ),
    !show_double_confirm &&
      React.createElement(
        Box,
        { flexDirection: 'column', paddingLeft: 3, marginTop: 1 },
        React.createElement(
          Text,
          { color: 'yellow', bold: true },
          `Type "${confirm_text}" to proceed:`,
        ),
        React.createElement(
          Text,
          { color: typed_text === confirm_text ? 'green' : 'white' },
          '> ',
          typed_text,
        ),
        React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(Text, { dimColor: true }, '[ESC] Cancel'),
        ),
      ),
    show_double_confirm &&
      React.createElement(
        Box,
        { flexDirection: 'column', paddingLeft: 3, marginTop: 1 },
        React.createElement(
          Text,
          { color: 'red', bold: true },
          'Are you absolutely sure?',
        ),
        React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(
            Text,
            { dimColor: true },
            '[Y] Yes, proceed  [N] No, go back  [ESC] Cancel',
          ),
        ),
      ),
  )
}
