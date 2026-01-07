#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'

import App from '../src/commands/deploy/ui/App.js'

console.log('Testing Ink UI components...\n')

const { unmount } = render(
  React.createElement(App, {
    directory: '/tmp/test',
    autoYes: false,
    onStepChange: (step, data) => {
      console.log('Step change:', step)
    },
    onComplete: result => {
      console.log('Complete:', result)
      unmount()
      process.exit(0)
    },
    onError: err => {
      console.error('Error:', err)
      unmount()
      process.exit(1)
    },
  }),
)

setTimeout(() => {
  console.log('\nTest timeout - exiting')
  unmount()
  process.exit(0)
}, 5000)
