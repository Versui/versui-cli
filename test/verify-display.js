#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

import { spawn } from 'node-pty'

const current_dir = dirname(fileURLToPath(import.meta.url))
const cli_path = join(current_dir, '../src/index.js')
const test_dir = '/tmp/versui-test-display'

// ASCII header pattern to detect (from figlet/gradient-string)
const HEADER_PATTERNS = [
  'V E R S U I',
  'VERSUI',
  '██╗   ██╗',
  'Deploy to Walrus',
]

let output_buffer = ''
const header_count = 0
let max_simultaneous_headers = 0
let test_passed = true
const test_error = null

function count_headers_in_text(text) {
  let count = 0
  for (const pattern of HEADER_PATTERNS) {
    const matches = text.match(new RegExp(pattern, 'gi'))
    if (matches) {
      count = Math.max(count, matches.length)
    }
  }
  return count
}

function analyze_output(chunk) {
  output_buffer += chunk

  // Count current simultaneous headers in accumulated output
  const current_header_count = count_headers_in_text(output_buffer)

  if (current_header_count > max_simultaneous_headers) {
    max_simultaneous_headers = current_header_count
    console.log(`[DETECT] Headers visible: ${current_header_count}`)
  }

  // Log snapshot if duplication detected
  if (current_header_count > 1 && test_passed) {
    console.error('\n❌ DUPLICATION DETECTED!')
    console.error(`Headers appearing simultaneously: ${current_header_count}`)
    console.error('\n--- FULL TERMINAL SNAPSHOT ---')
    console.error('Visible lines in terminal buffer:')
    console.error('='.repeat(120))
    // Split by lines and number them for analysis
    const lines = output_buffer.split('\n')
    lines.forEach((line, idx) => {
      console.error(`${String(idx).padStart(3, '0')}: ${line}`)
    })
    console.error('='.repeat(120))
    console.error('\n--- RAW BUFFER (with escape codes) ---')
    console.error(JSON.stringify(output_buffer, null, 2))
    console.error('--- END SNAPSHOT ---\n')
    test_passed = false
  }
}

async function run_test() {
  console.log('🧪 Starting CLI display verification...\n')

  // Setup test directory
  try {
    mkdirSync(test_dir, { recursive: true })
    writeFileSync(
      join(test_dir, 'index.html'),
      '<html><body>Test</body></html>',
    )
    console.log(`✓ Test directory prepared: ${test_dir}`)
  } catch (error) {
    console.error(`✗ Failed to create test directory: ${error.message}`)
    process.exit(1)
  }

  console.log('✓ Spawning CLI with node-pty...\n')

  const pty_process = spawn(
    'node',
    [
      cli_path,
      'deploy',
      test_dir,
      '--name',
      'test',
      '--network',
      'testnet',
      '--epochs',
      '1',
    ],
    {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: current_dir,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        TERM: 'xterm-color',
      },
    },
  )

  let interaction_stage = 0
  let timeout_id = null

  // Reset timeout on each data event
  function reset_timeout() {
    if (timeout_id) clearTimeout(timeout_id)
    timeout_id = setTimeout(() => {
      console.log('\n⏱️  Timeout - process seems stuck, ending test')
      pty_process.kill()
    }, 10000) // 10s timeout for entire test
  }

  pty_process.onData(data => {
    reset_timeout()
    analyze_output(data)

    // Navigate prompts based on output
    if (data.includes('Continue?') && interaction_stage === 0) {
      console.log('[INTERACT] Sending Y for continue prompt...')
      setTimeout(() => pty_process.write('y\r'), 100)
      interaction_stage++
    } else if (data.includes('Select wallet') && interaction_stage === 1) {
      console.log('[INTERACT] Sending ENTER for wallet selection...')
      setTimeout(() => pty_process.write('\r'), 100)
      interaction_stage++
    } else if (data.includes('Enter passphrase') && interaction_stage === 2) {
      console.log('[INTERACT] Sending ENTER for passphrase...')
      setTimeout(() => pty_process.write('\r'), 100)
      interaction_stage++
    }
  })

  pty_process.onExit(({ exitCode, signal }) => {
    if (timeout_id) clearTimeout(timeout_id)

    console.log('\n' + '='.repeat(60))
    console.log('TEST RESULTS')
    console.log('='.repeat(60))
    console.log(`Process exit: code=${exitCode}, signal=${signal}`)
    console.log(
      `Max simultaneous headers detected: ${max_simultaneous_headers}`,
    )

    if (test_error) {
      console.log(`\n❌ FAIL - ${test_error}`)
      process.exit(1)
    } else if (max_simultaneous_headers > 1) {
      console.log('\n❌ FAIL - Header duplication detected')
      process.exit(1)
    } else if (max_simultaneous_headers === 0) {
      console.log(
        '\n⚠️  WARNING - No headers detected (pattern may need update)',
      )
      process.exit(1)
    } else {
      console.log('\n✅ PASS - Single header display verified')
      process.exit(0)
    }
  })

  reset_timeout()
}

run_test().catch(error => {
  console.error(`\n❌ Test failed with error: ${error.message}`)
  console.error(error.stack)
  process.exit(1)
})
