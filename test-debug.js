import path from 'path'
import { fileURLToPath } from 'url'

import pty from 'node-pty'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.join(__dirname, 'src/index.js')
const TEST_DIR = __dirname

const ptyProcess = pty.spawn('node', [CLI_PATH, 'deploy', TEST_DIR], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: TEST_DIR,
  env: { ...process.env, FORCE_COLOR: '1' },
})

let output = ''

ptyProcess.onData(data => {
  output += data
  process.stdout.write(data)
})

setTimeout(() => {
  console.log('\n\n=== RAW OUTPUT (first 500 chars) ===')
  console.log(output.slice(0, 500))
  console.log('\n=== CHECKING FOR HEADER ===')
  console.log('Contains "VERSUI":', output.includes('VERSUI'))
  console.log('Contains "Site name":', output.includes('Site name'))
  console.log('Contains "__   __":', output.includes('__   __'))
  console.log('\n=== STRIPPED OUTPUT ===')
  const clean = output.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '')
  console.log(clean.slice(0, 500))

  ptyProcess.kill()
  process.exit(0)
}, 2000)
