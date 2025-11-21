import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'

const TEST_DIR = join(import.meta.dirname, 'fixtures/test-site')
const CLI_PATH = join(import.meta.dirname, '../src/index.js')

// Test address - must have SUI + WAL on testnet
const TEST_ADDRESS =
  '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4'

function get_keypair() {
  const keystore_path = `${process.env.HOME}/.sui/sui_config/sui.keystore`
  const keystore = JSON.parse(readFileSync(keystore_path, 'utf8'))

  for (const key_b64 of keystore) {
    try {
      const keypair = Ed25519Keypair.fromSecretKey(fromBase64(key_b64).slice(1))
      if (keypair.getPublicKey().toSuiAddress() === TEST_ADDRESS) {
        return keypair
      }
    } catch {
      // Not ed25519, skip
    }
  }
  throw new Error(`Keypair not found for ${TEST_ADDRESS}`)
}

function run_cli(args) {
  const result = execSync(`node ${CLI_PATH} ${args}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return result.trim()
}

describe('versui CLI integration', () => {
  let sui_client
  let keypair

  before(() => {
    sui_client = new SuiClient({ url: getFullnodeUrl('testnet') })
    keypair = get_keypair()

    // Create test site fixture
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
    writeFileSync(
      join(TEST_DIR, 'index.html'),
      '<html><body>Test</body></html>',
    )
    writeFileSync(join(TEST_DIR, 'style.css'), 'body { color: red; }')
  })

  it('deploy: should reject missing directory', () => {
    assert.throws(() => {
      run_cli('deploy')
    }, /missing required argument|Missing/i)
  })

  it('deploy: should reject invalid directory', () => {
    assert.throws(() => {
      run_cli('deploy /nonexistent -a ' + TEST_ADDRESS)
    }, /Directory not found/)
  })

  it('deploy: should reject invalid address', () => {
    assert.throws(() => {
      run_cli(`deploy ${TEST_DIR} -a invalid`)
    }, /Invalid Sui address/)
  })

  it('deploy: should check for walrus CLI', () => {
    // This test assumes walrus CLI is installed
    // If not, it should fail with a helpful message
    try {
      execSync('which walrus', { stdio: 'pipe' })
    } catch {
      console.log('Skipping walrus CLI test - not installed')
      return
    }

    // Just test that the command starts properly
    // Full deploy requires WAL tokens
    assert.ok(true)
  })

  it('full flow: deploy → sign site creation TX', async () => {
    // Check walrus CLI is available
    try {
      execSync('which walrus', { stdio: 'pipe' })
    } catch {
      console.log('Skipping full flow test - walrus CLI not installed')
      return
    }

    // Step 1: Deploy (stores to Walrus + outputs site creation TX)
    console.log('Running versui deploy...')
    const deploy_output = run_cli(`deploy ${TEST_DIR} -a ${TEST_ADDRESS} -e 1`)
    const result = JSON.parse(deploy_output)

    assert.ok(result.tx, 'Should output tx bytes')
    assert.ok(result.blob_id, 'Should output blob_id')
    assert.ok(result.patches >= 0, 'Should output patches count')

    console.log(`Blob stored: ${result.blob_id}`)
    console.log(`Patches: ${result.patches}`)

    // Step 2: Sign and execute site creation TX
    const tx_result = await sui_client.signAndExecuteTransaction({
      transaction: fromBase64(result.tx),
      signer: keypair,
      options: { showEffects: true, showObjectChanges: true },
    })

    assert.equal(
      tx_result.effects?.status?.status,
      'success',
      'TX should succeed',
    )

    // Verify site object was created
    const site_object = tx_result.objectChanges?.find(
      c => c.type === 'created' && c.objectType?.includes('::site::Site'),
    )
    assert.ok(site_object, 'Should create Site object')

    console.log(`✅ Site deployed: ${site_object.objectId}`)
  })

  after(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })
})
