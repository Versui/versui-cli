import assert from 'assert'
import { describe, it } from 'node:test'
import path from 'path'
import { fileURLToPath } from 'url'

import pty from 'node-pty'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ASCII_HEADER = [
  ' __   __ ___  ___  ___  _   _  ___',
  ' \\ \\ / /| __|| _ \\/ __|| | | ||_ _|',
  '  \\ V / | _| |   /\\__ \\| |_| | | |',
  '   \\_/  |___||_|_\\|___/ \\___/ |___|',
]

function stripAnsi(str) {
  // Remove ANSI escape codes including cursor movements, colors, etc.
  return str
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B\[[\?\=][0-9;]*[A-Za-z]/g, '')
    .replace(/\r/g, '')
}

function countHeaderOccurrences(output) {
  const clean = stripAnsi(output)
  const firstLine = ' __   __ ___  ___  ___  _   _  ___'
  return (
    clean.match(
      new RegExp(firstLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    ) || []
  ).length
}

function headerIsPresent(output) {
  const clean = stripAnsi(output)
  return ASCII_HEADER.every(line => clean.includes(line.trim()))
}

function getScreenState(output) {
  const clean = stripAnsi(output)
  const lines = clean
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  return {
    raw: clean,
    lines,
    hasHeader: headerIsPresent(output),
    headerCount: countHeaderOccurrences(output),
    lineCount: lines.length,
  }
}

describe('Display Spec Compliance', () => {
  const CLI_PATH = path.resolve(__dirname, '../src/index.js')
  const TEST_DIR = path.resolve(__dirname, '..')
  const screenHistory = []

  it('header appears immediately on launch', async () => {
    return new Promise((resolve, reject) => {
      const ptyProcess = pty.spawn('node', [CLI_PATH, 'deploy', TEST_DIR], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '1' },
      })

      let output = ''
      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          try {
            ptyProcess.kill('SIGKILL')
          } catch (e) {
            // Already dead
          }
        }
      }

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Test timeout - CLI did not start'))
      }, 3000)

      ptyProcess.onData(data => {
        output += data

        if (output.toLowerCase().includes('site name') && !resolved) {
          resolved = true
          clearTimeout(timeout)

          const state = getScreenState(output)
          screenHistory.push({ stage: 'launch', ...state })

          try {
            assert.strictEqual(
              state.hasHeader,
              true,
              'Header should be present at launch',
            )
            assert.strictEqual(
              state.headerCount,
              1,
              'Header should appear exactly once at launch',
            )
            cleanup()
            resolve()
          } catch (err) {
            cleanup()
            reject(err)
          }
        }
      })

      ptyProcess.onExit(() => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          reject(new Error('CLI exited unexpectedly'))
        }
      })
    })
  })

  it('header remains after site name prompt', async () => {
    return new Promise((resolve, reject) => {
      const ptyProcess = pty.spawn('node', [CLI_PATH, 'deploy', TEST_DIR], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '1' },
      })

      let output = ''
      let promptReceived = false
      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          try {
            ptyProcess.kill('SIGKILL')
          } catch (e) {
            // Already dead
          }
        }
      }

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Test timeout'))
      }, 5000)

      ptyProcess.onData(data => {
        output += data

        if (output.toLowerCase().includes('site name') && !promptReceived) {
          promptReceived = true
          setTimeout(() => {
            ptyProcess.write('test-site\r')
          }, 100)
        }

        if (
          (output.toLowerCase().includes('select network') ||
            output.toLowerCase().includes('testnet') ||
            output.toLowerCase().includes('mainnet')) &&
          !resolved
        ) {
          resolved = true
          clearTimeout(timeout)

          const state = getScreenState(output)
          screenHistory.push({ stage: 'after_site_name', ...state })

          try {
            assert.strictEqual(
              state.hasHeader,
              true,
              'Header should remain after site name input',
            )
            assert.strictEqual(
              state.headerCount,
              1,
              'Header should still appear exactly once',
            )
            cleanup()
            resolve()
          } catch (err) {
            cleanup()
            reject(err)
          }
        }
      })

      ptyProcess.onExit(() => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          reject(new Error('CLI exited unexpectedly'))
        }
      })
    })
  })

  it('header remains after network selection', async () => {
    return new Promise((resolve, reject) => {
      const ptyProcess = pty.spawn('node', [CLI_PATH, 'deploy', TEST_DIR], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '1' },
      })

      let output = ''
      let siteNameSent = false
      let networkSent = false
      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          try {
            ptyProcess.kill('SIGKILL')
          } catch (e) {
            // Already dead
          }
        }
      }

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Test timeout'))
      }, 5000)

      ptyProcess.onData(data => {
        output += data

        if (output.toLowerCase().includes('site name') && !siteNameSent) {
          siteNameSent = true
          setTimeout(() => {
            ptyProcess.write('test-site\r')
          }, 100)
        }

        if (
          (output.toLowerCase().includes('select network') ||
            output.toLowerCase().includes('testnet')) &&
          !networkSent &&
          siteNameSent
        ) {
          networkSent = true
          setTimeout(() => {
            ptyProcess.write('\r')
          }, 100)
        }

        if (
          (output.toLowerCase().includes('storage duration') ||
            output.toLowerCase().includes('epochs')) &&
          !resolved
        ) {
          resolved = true
          clearTimeout(timeout)

          const state = getScreenState(output)
          screenHistory.push({ stage: 'after_network', ...state })

          try {
            assert.strictEqual(
              state.hasHeader,
              true,
              'Header should remain after network selection',
            )
            assert.strictEqual(
              state.headerCount,
              1,
              'Header should still appear exactly once',
            )
            cleanup()
            resolve()
          } catch (err) {
            cleanup()
            reject(err)
          }
        }
      })

      ptyProcess.onExit(() => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          reject(new Error('CLI exited unexpectedly'))
        }
      })
    })
  })

  it('header remains after duration input', async () => {
    return new Promise((resolve, reject) => {
      const ptyProcess = pty.spawn('node', [CLI_PATH, 'deploy', TEST_DIR], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '1' },
      })

      let output = ''
      let siteNameSent = false
      let networkSent = false
      let durationSent = false
      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          try {
            ptyProcess.kill('SIGKILL')
          } catch (e) {
            // Already dead
          }
        }
      }

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Test timeout'))
      }, 5000)

      ptyProcess.onData(data => {
        output += data

        if (output.toLowerCase().includes('site name') && !siteNameSent) {
          siteNameSent = true
          setTimeout(() => ptyProcess.write('test-site\r'), 100)
        }

        if (
          (output.toLowerCase().includes('select network') ||
            output.toLowerCase().includes('testnet')) &&
          !networkSent &&
          siteNameSent
        ) {
          networkSent = true
          setTimeout(() => ptyProcess.write('\r'), 100)
        }

        if (
          (output.toLowerCase().includes('storage duration') ||
            output.toLowerCase().includes('epochs')) &&
          !durationSent &&
          networkSent
        ) {
          durationSent = true
          setTimeout(() => ptyProcess.write('5\r'), 100)
        }

        if (
          (output.toLowerCase().includes('building') ||
            output.toLowerCase().includes('complete') ||
            output.toLowerCase().includes('site id')) &&
          durationSent &&
          !resolved
        ) {
          resolved = true
          clearTimeout(timeout)

          const state = getScreenState(output)
          screenHistory.push({ stage: 'after_duration', ...state })

          try {
            assert.strictEqual(
              state.hasHeader,
              true,
              'Header should remain after duration input',
            )
            assert.strictEqual(
              state.headerCount,
              1,
              'Header should still appear exactly once',
            )
            cleanup()
            resolve()
          } catch (err) {
            cleanup()
            reject(err)
          }
        }
      })

      ptyProcess.onExit(() => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          reject(new Error('CLI exited unexpectedly'))
        }
      })
    })
  })

  it('header never duplicates throughout execution', async () => {
    for (const state of screenHistory) {
      assert.strictEqual(
        state.headerCount,
        1,
        `Header should appear exactly once at stage: ${state.stage}, but appeared ${state.headerCount} times`,
      )
    }
  })

  it('header appears at top of final output', async () => {
    return new Promise((resolve, reject) => {
      const ptyProcess = pty.spawn('node', [CLI_PATH, 'deploy', TEST_DIR], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '1' },
      })

      let output = ''
      let siteNameSent = false
      let networkSent = false
      let durationSent = false
      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          resolved = true
          try {
            ptyProcess.kill('SIGKILL')
          } catch (e) {
            // Already dead
          }
        }
      }

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Test timeout'))
      }, 10000)

      ptyProcess.onData(data => {
        output += data

        if (output.toLowerCase().includes('site name') && !siteNameSent) {
          siteNameSent = true
          setTimeout(() => ptyProcess.write('test-site\r'), 100)
        }

        if (
          (output.toLowerCase().includes('select network') ||
            output.toLowerCase().includes('testnet')) &&
          !networkSent &&
          siteNameSent
        ) {
          networkSent = true
          setTimeout(() => ptyProcess.write('\r'), 100)
        }

        if (
          (output.toLowerCase().includes('storage duration') ||
            output.toLowerCase().includes('epochs')) &&
          !durationSent &&
          networkSent
        ) {
          durationSent = true
          setTimeout(() => ptyProcess.write('5\r'), 100)
        }
      })

      ptyProcess.onExit(() => {
        clearTimeout(timeout)

        if (resolved) return
        resolved = true

        const state = getScreenState(output)
        const clean = stripAnsi(output)
        const lines = clean.split('\n').filter(line => line.trim().length > 0)

        try {
          const headerStartIndex = lines.findIndex(line =>
            line.includes(ASCII_HEADER[0].trim()),
          )
          assert.notStrictEqual(
            headerStartIndex,
            -1,
            'Header should be present in final output',
          )
          assert.ok(
            headerStartIndex < 5,
            `Header should be at top, but found at line ${headerStartIndex}`,
          )
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    })
  })
})
