import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  extract_signature,
  extract_created_objects,
} from '../../src/lib/sui.js'

// Note: Transaction building tests (build_deploy_transaction, build_update_transaction)
// are tested in integration tests instead, as they require complex SuiClient mocking
// with methods like getReferenceGasPrice(), getCoins(), etc.

describe('extract_signature', () => {
  it('should extract signature from sui keytool output', () => {
    const output = `
Signature: 0xabc123
Serialized signature: AQNyMjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3==
Public key: 0xdef456
    `

    const signature = extract_signature(output)
    assert.equal(
      signature,
      'AQNyMjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3MjQ3==',
    )
  })

  it('should handle different output formats', () => {
    const output = `
Some random text
Serialized signature (Base64): AbCdEfGhIjKlMnOpQrStUvWxYz==
More text
    `

    const signature = extract_signature(output)
    assert.equal(signature, 'AbCdEfGhIjKlMnOpQrStUvWxYz==')
  })

  it('should throw on missing signature', () => {
    const output = 'No signature here'

    assert.throws(() => extract_signature(output), {
      message: /Could not extract signature/,
    })
  })
})

describe('extract_created_objects', () => {
  it('should extract object IDs from execution output (table format)', () => {
    const output = `
╭──────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Created Objects                                                                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌──                                                                                                     │
│  │ ID: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef                               │
│  │ Type: 0x2::versui::Site                                                                              │
│  └──                                                                                                     │
│  ┌──                                                                                                     │
│  │ ID: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890                               │
│  │ Type: 0x2::versui::Resource                                                                          │
│  └──                                                                                                     │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────╯
    `

    const object_ids = extract_created_objects(output)
    assert.equal(object_ids.length, 2)
    assert.equal(
      object_ids[0],
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    )
    assert.equal(
      object_ids[1],
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    )
  })

  it('should extract object IDs from execution output (simple format)', () => {
    const output = `
Created Objects:
  ID: 0x123abc
  Type: 0x2::versui::Site
  ID: 0x456def
  Type: 0x2::versui::Resource
    `

    const object_ids = extract_created_objects(output)
    assert.equal(object_ids.length, 2)
    assert.equal(object_ids[0], '0x123abc')
    assert.equal(object_ids[1], '0x456def')
  })

  it('should return empty array when no objects created', () => {
    const output = 'No created objects section'

    const object_ids = extract_created_objects(output)
    assert.equal(object_ids.length, 0)
  })

  it('should handle single object', () => {
    const output = `
Created Objects:
  ID: 0x123abc
    `

    const object_ids = extract_created_objects(output)
    assert.equal(object_ids.length, 1)
    assert.equal(object_ids[0], '0x123abc')
  })
})
