import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  read_versui_config,
  get_aggregators,
  get_site_name,
} from '../../src/lib/config.js'

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

describe('get_site_name', () => {
  test('should return CLI name when provided', () => {
    const name = get_site_name({
      cli_name: 'CLI Override',
      versui_config: { name: 'Config Name' },
      package_json: { name: 'package-name' },
    })
    assert.strictEqual(name, 'CLI Override')
  })

  test('should return versui config name when no CLI name', () => {
    const name = get_site_name({
      cli_name: null,
      versui_config: { name: 'Config Name' },
      package_json: { name: 'package-name' },
    })
    assert.strictEqual(name, 'Config Name')
  })

  test('should return package.json name when no CLI or config name', () => {
    const name = get_site_name({
      cli_name: null,
      versui_config: null,
      package_json: { name: 'package-name' },
    })
    assert.strictEqual(name, 'package-name')
  })

  test('should return fallback when no name sources available', () => {
    const name = get_site_name({
      cli_name: null,
      versui_config: null,
      package_json: null,
    })
    assert.strictEqual(name, 'Versui Site')
  })

  test('should handle versui config without name field', () => {
    const name = get_site_name({
      cli_name: null,
      versui_config: { aggregators: ['https://custom.com'] },
      package_json: { name: 'package-name' },
    })
    assert.strictEqual(name, 'package-name')
  })

  test('should handle package.json without name field', () => {
    const name = get_site_name({
      cli_name: null,
      versui_config: null,
      package_json: { version: '1.0.0' },
    })
    assert.strictEqual(name, 'Versui Site')
  })

  test('should handle empty CLI name string', () => {
    const name = get_site_name({
      cli_name: '',
      versui_config: { name: 'Config Name' },
      package_json: { name: 'package-name' },
    })
    assert.strictEqual(name, 'Config Name')
  })
})
