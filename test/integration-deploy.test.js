import { describe, test, before, after } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'

const CLI_PATH = join(import.meta.dirname, '../src/index.js')

// Helper to check if CLI tool exists
function has_cli(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Helper to get test keypair
function get_test_keypair() {
  const keystore_path = `${process.env.HOME}/.sui/sui_config/sui.keystore`
  if (!existsSync(keystore_path)) {
    return null
  }

  const keystore = JSON.parse(readFileSync(keystore_path, 'utf8'))
  const test_address =
    '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4'

  for (const key_b64 of keystore) {
    try {
      const keypair = Ed25519Keypair.fromSecretKey(fromBase64(key_b64).slice(1))
      if (keypair.getPublicKey().toSuiAddress() === test_address) {
        return keypair
      }
    } catch {
      // Not ed25519, skip
    }
  }
  return null
}

describe('versui deploy - CLI presence detection', () => {
  test('should error with helpful message when sui CLI missing', () => {
    if (has_cli('sui')) {
      console.log('  ℹ Skipping: sui CLI is installed')
      return
    }

    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-'), {
      recursive: true,
    })
    writeFileSync(join(temp_dir, 'index.html'), '<html></html>')

    try {
      execSync(`node ${CLI_PATH} deploy ${temp_dir} -y`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })
      assert.fail('Should have thrown error')
    } catch (err) {
      assert.ok(
        err.message.includes('sui') || err.message.includes('wallet'),
        'Error should mention sui CLI',
      )
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })

  test('should error with helpful message when walrus CLI missing', () => {
    if (!has_cli('sui')) {
      console.log('  ℹ Skipping: sui CLI not installed')
      return
    }
    if (has_cli('walrus')) {
      console.log('  ℹ Skipping: walrus CLI is installed')
      return
    }

    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-'), {
      recursive: true,
    })
    writeFileSync(join(temp_dir, 'index.html'), '<html></html>')

    try {
      execSync(`node ${CLI_PATH} deploy ${temp_dir} -y`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })
      assert.fail('Should have thrown error')
    } catch (err) {
      // Should fail when trying to spawn walrus
      assert.ok(
        err.message.includes('walrus') || err.message.includes('spawn'),
        'Error should mention walrus',
      )
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })
})

describe('versui deploy - full deployment flow', () => {
  let temp_dir
  let sui_client
  let keypair

  before(() => {
    // Check prerequisites
    if (!has_cli('sui')) {
      console.log('  ℹ Skipping integration test: sui CLI not installed')
      return
    }
    if (!has_cli('walrus')) {
      console.log('  ℹ Skipping integration test: walrus CLI not installed')
      return
    }

    keypair = get_test_keypair()
    if (!keypair) {
      console.log('  ℹ Skipping integration test: test keypair not found')
      return
    }

    sui_client = new SuiClient({ url: getFullnodeUrl('testnet') })
    console.log('  ℹ Sui client ready:', sui_client ? 'yes' : 'no')

    // Create test site
    temp_dir = mkdirSync(join(tmpdir(), 'versui-integration-'), {
      recursive: true,
    })
    writeFileSync(
      join(temp_dir, 'index.html'),
      '<html><body>Test Site</body></html>',
    )
    writeFileSync(join(temp_dir, 'style.css'), 'body { color: red; }')
  })

  test('should deploy site to testnet', async () => {
    if (!has_cli('sui') || !has_cli('walrus') || !keypair) {
      console.log('  ℹ Skipping: prerequisites not met')
      return
    }

    console.log('  → Deploying test site to testnet...')

    // Run deploy command
    const output = execSync(
      `node ${CLI_PATH} deploy ${temp_dir} --network testnet --epochs 1 -y`,
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    console.log('  → Deploy output:', output.slice(0, 200))

    // Verify output contains success indicators
    assert.ok(output.length > 0, 'Should have output')

    // TODO: Parse output for site ID and verify on-chain
    // This requires the deploy command to output JSON or structured data
    console.log('  ✓ Deployment completed (manual verification needed)')
  })

  after(() => {
    if (temp_dir && existsSync(temp_dir)) {
      rmSync(temp_dir, { recursive: true })
    }
  })
})
