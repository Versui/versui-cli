import React from 'react'
import { Box, Text } from 'ink'
import chalk from 'chalk'
import gradient from 'gradient-string'
import figlet from 'figlet'

const versui_gradient = gradient(['#4DA2FF', '#00D4FF', '#2DD4BF'])
const border_gradient = gradient(['#4DA2FF', '#2DD4BF'])

export function Header() {
  const logo = figlet.textSync('VERSUI', {
    font: 'Small',
    horizontalLayout: 'fitted',
  })

  const box_width = 60
  const top_border = '╭' + '─'.repeat(box_width - 2) + '╮'
  const bottom_border = '╰' + '─'.repeat(box_width - 2) + '╯'

  // Split logo into lines and pad each
  const logo_lines = logo.split('\n')
  const padded_logo_lines = logo_lines.map(line => {
    const padding = box_width - 4 - line.length
    const left_pad = 2
    const right_pad = padding > 0 ? padding : 0
    return '│ ' + line + ' '.repeat(right_pad) + ' │'
  })

  const tagline = 'Decentralized Site Hosting on Walrus + Sui'
  const tagline_padding = box_width - 4 - tagline.length
  const tagline_left_pad = 2
  const tagline_right_pad = tagline_padding > 0 ? tagline_padding : 0
  const padded_tagline = '│ ' + tagline + ' '.repeat(tagline_right_pad) + ' │'

  const empty_line = '│' + ' '.repeat(box_width - 2) + '│'

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, null, border_gradient(top_border)),
    padded_logo_lines.map((line, idx) =>
      React.createElement(
        Text,
        { key: `logo-${idx}` },
        border_gradient('│ '),
        versui_gradient(logo_lines[idx]),
        border_gradient(
          ' '.repeat(box_width - 4 - logo_lines[idx].length) + ' │',
        ),
      ),
    ),
    React.createElement(Text, null, border_gradient(empty_line)),
    React.createElement(
      Text,
      null,
      border_gradient('│ '),
      chalk.dim(tagline),
      border_gradient(' '.repeat(tagline_right_pad) + ' │'),
    ),
    React.createElement(Text, null, border_gradient(bottom_border)),
  )
}
