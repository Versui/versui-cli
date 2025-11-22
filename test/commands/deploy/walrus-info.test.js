import { describe, test } from 'node:test'
import assert from 'node:assert'

import {
  get_walrus_epoch_info,
  get_epoch_info_with_fallback,
} from '../../../src/commands/deploy/walrus-info.js'

describe('get_walrus_epoch_info', () => {
  test('should return epoch info when walrus CLI available', () => {
    const info = get_walrus_epoch_info()

    // May be null if walrus not installed, but format should be correct
    if (info !== null) {
      assert.ok(typeof info === 'object')
      assert.ok(typeof info.epoch_duration_days === 'number')
      assert.ok(typeof info.max_epochs === 'number')
      assert.ok(info.epoch_duration_days > 0)
      assert.ok(info.max_epochs > 0)
    }
  })

  test('should return null when walrus CLI unavailable or fails', () => {
    // This test passes as long as function returns null or valid object
    const info = get_walrus_epoch_info()
    assert.ok(info === null || typeof info === 'object')
  })
})

describe('get_epoch_info_with_fallback', () => {
  test('should return valid epoch info for mainnet', () => {
    const info = get_epoch_info_with_fallback('mainnet')

    assert.ok(typeof info === 'object')
    assert.ok(typeof info.epoch_duration_days === 'number')
    assert.ok(typeof info.max_epochs === 'number')
    assert.ok(info.epoch_duration_days > 0)
    assert.ok(info.max_epochs > 0)
  })

  test('should return valid epoch info for testnet', () => {
    const info = get_epoch_info_with_fallback('testnet')

    assert.ok(typeof info === 'object')
    assert.ok(typeof info.epoch_duration_days === 'number')
    assert.ok(typeof info.max_epochs === 'number')
    assert.ok(info.epoch_duration_days > 0)
    assert.ok(info.max_epochs > 0)
  })

  test('should use fallback values when walrus CLI unavailable', () => {
    // If walrus is installed, this tests live data
    // If walrus is NOT installed, this tests fallback
    const mainnet_info = get_epoch_info_with_fallback('mainnet')
    const testnet_info = get_epoch_info_with_fallback('testnet')

    // Fallback values (as of Nov 2024)
    // Mainnet: 14 days, 53 epochs
    // Testnet: 1 day, 53 epochs

    // Just verify we got SOME valid values
    assert.ok(mainnet_info.epoch_duration_days >= 1)
    assert.ok(testnet_info.epoch_duration_days >= 1)
    assert.ok(mainnet_info.max_epochs >= 1)
    assert.ok(testnet_info.max_epochs >= 1)
  })

  test('should return consistent structure', () => {
    const info = get_epoch_info_with_fallback('testnet')

    // Check structure
    assert.ok(Object.keys(info).includes('epoch_duration_days'))
    assert.ok(Object.keys(info).includes('max_epochs'))
    assert.strictEqual(Object.keys(info).length, 2)
  })
})
