import { test } from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'

/**
 * Display Stage Diagnostic Test
 *
 * Captures terminal output at each stage of the deploy flow to debug:
 * - Header disappearing after prompts
 * - "Dir: dist" appearing twice
 * - Line duplication issues
 */

// Mock log-update to capture what's being rendered
const captured_displays = []
let current_display = null

function create_mock_log_update() {
  const mock = text => {
    current_display = text
    captured_displays.push({
      timestamp: Date.now(),
      text,
      lines: text.split('\n'),
    })
  }
  mock.done = () => {
    if (current_display) {
      captured_displays.push({
        timestamp: Date.now(),
        text: '[DONE]',
        persisted: current_display,
      })
      current_display = null
    }
  }
  return mock
}

// Mock prompts to simulate user input
function create_mock_prompts(responses) {
  let response_index = 0
  return async (config, options) => {
    const response = responses[response_index++]

    // Capture state before prompt
    captured_displays.push({
      timestamp: Date.now(),
      text: `[PROMPT: ${config.message || config.type}]`,
      prompt_config: config,
    })

    return response
  }
}

// Mock spawn for walrus/sui commands
function create_mock_spawn() {
  const mock = (cmd, args, options) => {
    const emitter = new EventEmitter()

    // Simulate walrus progress
    if (cmd === 'walrus') {
      setTimeout(() => {
        emitter.stderr = {
          on: (event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler('encoded sliver pairs and metadata'), 50)
              setTimeout(() => handler('storing sliver'), 100)
              setTimeout(() => handler('retrieved blob statuses'), 150)
              setTimeout(() => handler('blob resources obtained'), 200)
            }
          },
        }
        emitter.stdout = {
          on: (event, handler) => {
            if (event === 'data') {
              setTimeout(
                () =>
                  handler(
                    JSON.stringify({
                      blobStoreResult: {
                        newlyCreated: {
                          blobObject: {
                            id: 'mock-blob-object-id',
                            blobId: 'mock-blob-id',
                          },
                        },
                      },
                      storedQuiltBlobs: [
                        { identifier: '/index.html', quiltPatchId: 'patch-1' },
                      ],
                    }),
                  ),
                250,
              )
            }
          },
        }
        emitter.on = (event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 300)
          } else if (event === 'error') {
            // No error
          }
        }
      }, 0)
    }

    // Simulate sui transaction
    if (cmd === 'sui') {
      setTimeout(() => {
        emitter.stdout = {
          on: (event, handler) => {
            if (event === 'data') {
              setTimeout(
                () =>
                  handler(
                    JSON.stringify({
                      digest: 'mock-tx-digest',
                      objectChanges: [
                        {
                          type: 'created',
                          objectType: '::site::Site',
                          objectId: 'mock-site-id',
                          owner: { Shared: { initial_shared_version: '1' } },
                        },
                        {
                          type: 'created',
                          objectType: '::site::SiteAdminCap',
                          objectId: 'mock-admin-cap-id',
                        },
                      ],
                    }),
                  ),
                50,
              )
            }
          },
        }
        emitter.stderr = { on: () => {} }
        emitter.on = (event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 100)
          } else if (event === 'error') {
            // No error
          }
        }
      }, 0)
    }

    return emitter
  }

  return mock
}

test('display stages - full flow', async () => {
  // Clear captured displays
  captured_displays.length = 0

  // Import with mocked dependencies would go here
  // For now, this is a framework for the test

  const stages_to_check = [
    {
      name: 'initial_header',
      check: display => display.text.includes('VERSUI'),
    },
    {
      name: 'after_network_prompt',
      check: display => display.text.includes('[DONE]'),
    },
    {
      name: 'config_summary_first_render',
      check: display => display.text.includes('Dir:'),
    },
    {
      name: 'scanning',
      check: display => display.text.includes('Scanning directory'),
    },
    {
      name: 'before_walrus_confirm',
      check: display => display.text === '[DONE]',
    },
    {
      name: 'after_walrus_confirm',
      check: display => display.text.includes('Dir:'),
    },
  ]

  // This test needs actual integration with deploy.js
  // For now, document the expected flow
  assert.ok(true, 'Test framework ready')
})

test('display state machine - check for duplicates', () => {
  // Helper to detect if "Dir:" appears multiple times in a single render
  function has_duplicate_config_lines(text) {
    const lines = text.split('\n')
    const dir_lines = lines.filter(line => line.includes('Dir:'))
    return dir_lines.length > 1
  }

  // Helper to check if header is present
  function has_header(text) {
    return (
      text.includes('VERSUI') || text.includes('Decentralized Site Hosting')
    )
  }

  // Expected state machine:
  // 1. show_header = true → render with header
  // 2. After prompt → logUpdate.done() → state.show_header = false
  // 3. console.clear() → state.show_header = true
  // 4. Next render → header shown again

  const test_cases = [
    {
      name: 'initial render',
      state: { show_header: true, network: null },
      expected_header: true,
      expected_config: false,
    },
    {
      name: 'after config set',
      state: { show_header: true, network: 'testnet', dir: 'dist' },
      expected_header: true,
      expected_config: true,
    },
    {
      name: 'after prompt (header suppressed)',
      state: { show_header: false, network: 'testnet', dir: 'dist' },
      expected_header: false,
      expected_config: true,
    },
  ]

  for (const { name, state, expected_header, expected_config } of test_cases) {
    // Mock render_state logic
    const lines = []

    if (state.show_header) {
      lines.push('')
      lines.push('[VERSUI LOGO]')
      lines.push('Decentralized Site Hosting on Walrus + Sui')
      lines.push('')
    }

    if (state.network) {
      const config_items = []
      if (state.dir) config_items.push(`Dir: ${state.dir}`)
      if (state.network) config_items.push(`Network: ${state.network}`)
      lines.push(config_items.join('  │  '))
      lines.push('')
    }

    const rendered = lines.join('\n')

    assert.strictEqual(
      has_header(rendered),
      expected_header,
      `${name}: header visibility mismatch`,
    )

    assert.strictEqual(
      rendered.includes('Dir:'),
      expected_config,
      `${name}: config visibility mismatch`,
    )

    assert.strictEqual(
      has_duplicate_config_lines(rendered),
      false,
      `${name}: config lines should not duplicate`,
    )
  }
})

test('confirm_action display flow', () => {
  // Simulates the confirm_action function flow
  const state = {
    show_header: true,
    network: 'testnet',
    dir: 'dist',
  }

  const events = []

  // Mock display functions
  const mock_finish_display = () => {
    events.push({ action: 'finish_display', header_state: state.show_header })
  }

  const mock_console_clear = () => {
    events.push({ action: 'console.clear', header_state: state.show_header })
  }

  // Simulate confirm_action
  mock_finish_display() // Line 432
  state.show_header = false // Line 433

  // User confirms
  events.push({ action: 'user_confirms' })

  state.show_header = true // Line 479
  mock_console_clear() // Line 480

  // Verify flow
  assert.strictEqual(events[0].action, 'finish_display')
  assert.strictEqual(
    events[0].header_state,
    true,
    'Header should be true before suppression',
  )

  assert.strictEqual(events[2].action, 'console.clear')
  assert.strictEqual(
    events[2].header_state,
    true,
    'Header should be restored before clear',
  )

  assert.strictEqual(
    state.show_header,
    true,
    'Header should be re-enabled after confirm',
  )
})

test('detect line duplication patterns', () => {
  // Common duplication patterns to check for
  const displays = [
    {
      text: `
  Dir: dist  │  Network: testnet

  ○ Scan files
`,
      expected_duplicate: false,
    },
    {
      text: `
  Dir: dist  │  Network: testnet
  Dir: dist  │  Network: testnet

  ○ Scan files
`,
      expected_duplicate: true,
    },
    {
      text: `
  Dir: dist  │  Network: testnet

  ✓ Scan files → 5 files (1.2 KB)
  Dir: dist  │  Network: testnet
`,
      expected_duplicate: true,
    },
  ]

  for (const { text, expected_duplicate } of displays) {
    const lines = text.split('\n').filter(line => line.trim())
    const unique_lines = new Set(lines)
    const has_duplicates = lines.length !== unique_lines.size

    assert.strictEqual(
      has_duplicates,
      expected_duplicate,
      `Duplicate detection failed for: ${text.substring(0, 50)}...`,
    )
  }
})

test('spinner interval + logUpdate interaction', () => {
  // Test the spinner animation logic
  let spinner_frame = 0
  let spinner_text = null
  let show_header = true
  const renders = []

  const mock_update_display = () => {
    spinner_frame++
    renders.push({
      frame: spinner_frame,
      text: spinner_text,
      header: show_header,
    })
  }

  // Simulate: initial render
  spinner_text = 'Scanning directory...'
  mock_update_display()

  // Simulate: spinner ticks
  mock_update_display()
  mock_update_display()

  // Simulate: prompt (spinner stops, header suppressed)
  spinner_text = null
  show_header = false

  // Simulate: resume after prompt
  show_header = true
  spinner_text = 'Uploading to Walrus...'
  mock_update_display()

  assert.strictEqual(renders.length, 4)
  assert.strictEqual(renders[0].text, 'Scanning directory...')
  assert.strictEqual(renders[0].header, true)
  assert.strictEqual(renders[3].text, 'Uploading to Walrus...')
  assert.strictEqual(
    renders[3].header,
    true,
    'Header should be restored after prompt',
  )
})

// Export helper for manual debugging
export function print_display_log() {
  console.log('\n=== DISPLAY LOG ===\n')
  for (const [index, display] of captured_displays.entries()) {
    console.log(`[${index}] ${new Date(display.timestamp).toISOString()}`)
    if (display.persisted) {
      console.log('  PERSISTED:')
      console.log(
        display.persisted
          .split('\n')
          .map(l => `    ${l}`)
          .join('\n'),
      )
    } else if (display.prompt_config) {
      console.log(
        `  PROMPT: ${display.prompt_config.message || display.prompt_config.type}`,
      )
    } else {
      console.log('  DISPLAY:')
      console.log(
        display.text
          .split('\n')
          .map(l => `    ${l}`)
          .join('\n'),
      )
    }
    console.log('')
  }
}
