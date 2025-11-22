import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { read_versui_config, get_aggregators } from '../../src/lib/config.js'

describe('read_versui_config', () => {
  test('should return null when .versui file does not exist', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const result = read_versui_config(temp_dir)
    assert.strictEqual(result, null)
    rmSync(temp_dir, { recursive: true })
  })

  test('should parse valid JSON config', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const config_content = JSON.stringify({
      aggregators: ['https://custom1.com', 'https://custom2.com'],
    })
    writeFileSync(join(temp_dir, '.versui'), config_content)

    const result = read_versui_config(temp_dir)
    assert.deepStrictEqual(result, {
      aggregators: ['https://custom1.com', 'https://custom2.com'],
    })

    rmSync(temp_dir, { recursive: true })
  })

  test('should throw error on invalid JSON', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    writeFileSync(join(temp_dir, '.versui'), 'invalid json {')

    assert.throws(
      () => read_versui_config(temp_dir),
      /Failed to parse .versui config/,
    )

    rmSync(temp_dir, { recursive: true })
  })

  test('should parse empty JSON object', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    writeFileSync(join(temp_dir, '.versui'), '{}')

    const result = read_versui_config(temp_dir)
    assert.deepStrictEqual(result, {})

    rmSync(temp_dir, { recursive: true })
  })
})

describe('get_aggregators', () => {
  test('should return testnet defaults when no config', () => {
    const result = get_aggregators(null, 'testnet')
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
    assert.ok(result[0].includes('testnet'))
  })

  test('should return mainnet defaults when no config', () => {
    const result = get_aggregators(null, 'mainnet')
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
    assert.ok(result[0].includes('walrus.space'))
  })

  test('should return testnet defaults when config has no aggregators', () => {
    const result = get_aggregators({}, 'testnet')
    assert.ok(Array.isArray(result))
    assert.ok(result[0].includes('testnet'))
  })

  test('should return testnet defaults when config.aggregators is empty array', () => {
    const result = get_aggregators({ aggregators: [] }, 'testnet')
    assert.ok(Array.isArray(result))
    assert.ok(result[0].includes('testnet'))
  })

  test('should merge custom aggregators with testnet defaults (custom first)', () => {
    const config = {
      aggregators: ['https://custom1.com', 'https://custom2.com'],
    }
    const result = get_aggregators(config, 'testnet')

    assert.strictEqual(result[0], 'https://custom1.com')
    assert.strictEqual(result[1], 'https://custom2.com')
    assert.ok(result[2].includes('testnet')) // Default comes after
  })

  test('should merge custom aggregators with mainnet defaults', () => {
    const config = { aggregators: ['https://custom.com'] }
    const result = get_aggregators(config, 'mainnet')

    assert.strictEqual(result[0], 'https://custom.com')
    assert.ok(result[1].includes('walrus.space')) // Default comes after
  })
})
