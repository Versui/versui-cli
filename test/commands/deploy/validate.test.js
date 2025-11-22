import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  validate_directory,
  has_cli,
  check_prerequisites,
  get_prerequisite_error,
} from '../../../src/commands/deploy/validate.js'

describe('validate_directory', () => {
  test('should return false for null/undefined', () => {
    assert.strictEqual(validate_directory(null), false)
    assert.strictEqual(validate_directory(undefined), false)
    assert.strictEqual(validate_directory(''), false)
  })

  test('should return false for non-existent path', () => {
    assert.strictEqual(validate_directory('/nonexistent/path/12345'), false)
  })

  test('should return false for file path (not directory)', () => {
    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-validate-'), {
      recursive: true,
    })
    const file_path = join(temp_dir, 'test.txt')
    writeFileSync(file_path, 'test')

    try {
      assert.strictEqual(validate_directory(file_path), false)
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })

  test('should return true for valid directory', () => {
    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-validate-'), {
      recursive: true,
    })

    try {
      assert.strictEqual(validate_directory(temp_dir), true)
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })
})

describe('has_cli', () => {
  test('should return true for existing command (node)', () => {
    // node should always exist since we're running with it
    assert.strictEqual(has_cli('node'), true)
  })

  test('should return false for non-existent command', () => {
    assert.strictEqual(has_cli('nonexistent_cli_tool_12345'), false)
  })
})

describe('check_prerequisites', () => {
  test('should return success status and missing array', () => {
    const result = check_prerequisites()
    assert.ok(typeof result === 'object')
    assert.ok(typeof result.success === 'boolean')
    assert.ok(Array.isArray(result.missing))
  })

  test('should list walrus or sui in missing if not installed', () => {
    const result = check_prerequisites()
    // We don't know which are installed, but format should be correct
    for (const tool of result.missing) {
      assert.ok(['walrus', 'sui'].includes(tool))
    }
  })
})

describe('get_prerequisite_error', () => {
  test('should return walrus error message with link', () => {
    const msg = get_prerequisite_error('walrus')
    assert.ok(msg.includes('Walrus'))
    assert.ok(msg.includes('https://docs.walrus.site'))
  })

  test('should return sui error message with link', () => {
    const msg = get_prerequisite_error('sui')
    assert.ok(msg.includes('Sui'))
    assert.ok(msg.includes('https://docs.sui.io'))
  })

  test('should return generic message for unknown tool', () => {
    const msg = get_prerequisite_error('unknown')
    assert.ok(msg.includes('unknown'))
  })
})
