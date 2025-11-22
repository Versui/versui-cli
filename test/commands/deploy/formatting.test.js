import { describe, test } from 'node:test'
import assert from 'node:assert'

import {
  format_bytes,
  format_wallet_address,
  format_epoch_duration,
} from '../../../src/commands/deploy/formatting.js'

describe('format_bytes', () => {
  test('should format bytes < 1024 as B', () => {
    assert.strictEqual(format_bytes(0), '0 B')
    assert.strictEqual(format_bytes(512), '512 B')
    assert.strictEqual(format_bytes(1023), '1023 B')
  })

  test('should format bytes < 1MB as KB', () => {
    assert.strictEqual(format_bytes(1024), '1.0 KB')
    assert.strictEqual(format_bytes(2048), '2.0 KB')
    assert.strictEqual(format_bytes(1536), '1.5 KB')
  })

  test('should format bytes >= 1MB as MB', () => {
    assert.strictEqual(format_bytes(1024 * 1024), '1.00 MB')
    assert.strictEqual(format_bytes(2.5 * 1024 * 1024), '2.50 MB')
    assert.strictEqual(format_bytes(100 * 1024 * 1024), '100.00 MB')
  })
})

describe('format_wallet_address', () => {
  test('should return empty string for null/undefined', () => {
    assert.strictEqual(format_wallet_address(null), '')
    assert.strictEqual(format_wallet_address(undefined), '')
  })

  test('should return short addresses unchanged', () => {
    assert.strictEqual(format_wallet_address('0x123'), '0x123')
    assert.strictEqual(format_wallet_address('short'), 'short')
  })

  test('should truncate long addresses', () => {
    const addr =
      '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4'
    const formatted = format_wallet_address(addr)
    assert.ok(formatted.startsWith('0x306f6ea0'))
    assert.ok(formatted.endsWith('9cf4'))
    assert.ok(formatted.includes('...'))
    assert.strictEqual(formatted.length, 17) // 10 + 3 + 4
  })
})

describe('format_epoch_duration', () => {
  test('should format testnet epochs (1 day per epoch)', () => {
    assert.strictEqual(
      format_epoch_duration(1, 'testnet'),
      '1 epoch(s) ≈ 1 day',
    )
    assert.strictEqual(
      format_epoch_duration(5, 'testnet'),
      '5 epoch(s) ≈ 5 days',
    )
  })

  test('should format mainnet epochs (14 days per epoch)', () => {
    assert.strictEqual(
      format_epoch_duration(1, 'mainnet'),
      '1 epoch(s) ≈ 14 days',
    )
    assert.strictEqual(
      format_epoch_duration(2, 'mainnet'),
      '2 epoch(s) ≈ 28 days',
    )
  })

  test('should use singular "day" for 1 day', () => {
    const result = format_epoch_duration(1, 'testnet')
    assert.ok(result.includes('1 day'))
    assert.ok(!result.includes('1 days'))
  })
})
