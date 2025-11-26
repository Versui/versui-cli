import { describe, test } from 'node:test'
import assert from 'node:assert'

import { encode_base36, decode_base36 } from '../../src/lib/base36.js'

describe('base36', () => {
  describe('encode_base36', () => {
    test('encodes 0x-prefixed hex to base36', () => {
      const object_id =
        '0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d'
      const result = encode_base36(object_id)

      assert.strictEqual(typeof result, 'string')
      assert.ok(result.length <= 63, `result length ${result.length} > 63`)
      assert.match(result, /^[0-9a-z]+$/, 'should be lowercase alphanumeric')
    })

    test('encodes hex without 0x prefix', () => {
      const object_id =
        '03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d'
      const result = encode_base36(object_id)

      assert.strictEqual(typeof result, 'string')
      assert.ok(result.length <= 63)
    })

    test('produces consistent output', () => {
      const object_id =
        '0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d'
      const result1 = encode_base36(object_id)
      const result2 = encode_base36(object_id)

      assert.strictEqual(result1, result2)
    })

    test('handles maximum 256-bit value', () => {
      // Max 256-bit value (64 f's)
      const max_id = '0x' + 'f'.repeat(64)
      const result = encode_base36(max_id)

      assert.ok(result.length <= 63, `max value length ${result.length} > 63`)
    })

    test('handles minimum value', () => {
      const min_id = '0x' + '0'.repeat(63) + '1'
      const result = encode_base36(min_id)

      assert.strictEqual(result, '1')
    })
  })

  describe('decode_base36', () => {
    test('decodes base36 back to 0x-prefixed hex', () => {
      const original =
        '0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d'
      const encoded = encode_base36(original)
      const decoded = decode_base36(encoded)

      assert.strictEqual(decoded, original)
    })

    test('pads hex to 64 characters', () => {
      const encoded = encode_base36('0x' + '0'.repeat(63) + '1')
      const decoded = decode_base36(encoded)

      assert.strictEqual(decoded.length, 66) // 0x + 64 chars
      assert.ok(decoded.startsWith('0x'))
    })

    test('produces lowercase hex output', () => {
      const original =
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890'
      const encoded = encode_base36(original)
      const decoded = decode_base36(encoded)

      assert.match(decoded, /^0x[0-9a-f]+$/)
    })
  })

  describe('roundtrip', () => {
    test('encode/decode is reversible', () => {
      const test_ids = [
        '0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d',
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      ]

      for (const id of test_ids) {
        const encoded = encode_base36(id)
        const decoded = decode_base36(encoded)
        assert.strictEqual(decoded, id.toLowerCase())
      }
    })
  })
})
