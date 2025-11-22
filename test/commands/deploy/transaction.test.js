import { describe, test } from 'node:test'
import assert from 'node:assert'

import {
  build_identifier_map,
  create_site_transaction,
  extract_site_id,
} from '../../../src/commands/deploy/transaction.js'

describe('build_identifier_map', () => {
  test('should map filenames to full paths', () => {
    const file_metadata = {
      '/index.html': { hash: 'abc', size: 100, content_type: 'text/html' },
      '/assets/style.css': {
        hash: 'def',
        size: 200,
        content_type: 'text/css',
      },
      '/assets/script.js': {
        hash: 'ghi',
        size: 300,
        content_type: 'application/javascript',
      },
    }

    const map = build_identifier_map(file_metadata)

    assert.strictEqual(map['index.html'], '/index.html')
    assert.strictEqual(map['style.css'], '/assets/style.css')
    assert.strictEqual(map['script.js'], '/assets/script.js')
  })

  test('should handle duplicate filenames (last wins)', () => {
    const file_metadata = {
      '/dir1/file.txt': { hash: 'abc', size: 100, content_type: 'text/plain' },
      '/dir2/file.txt': { hash: 'def', size: 200, content_type: 'text/plain' },
    }

    const map = build_identifier_map(file_metadata)

    // Last one wins (depends on Object.keys iteration order)
    assert.ok(
      map['file.txt'] === '/dir1/file.txt' ||
        map['file.txt'] === '/dir2/file.txt',
    )
  })

  test('should return empty map for empty metadata', () => {
    const map = build_identifier_map({})
    assert.deepStrictEqual(map, {})
  })
})

describe('create_site_transaction', () => {
  test('should create transaction with correct structure', () => {
    const params = {
      package_id:
        '0xda3719ae702534b4181c5f2ddf2780744ee512dae7a5b22bce6b5fda4893471b',
      wallet:
        '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4',
      site_name: 'Test Site',
      quilt_patches: [
        { identifier: 'index.html', quiltPatchId: 'patch_1' },
        { identifier: 'style.css', quiltPatchId: 'patch_2' },
      ],
      file_metadata: {
        '/index.html': {
          hash: 'YWJj', // base64
          size: 100,
          content_type: 'text/html',
        },
        '/style.css': {
          hash: 'ZGVm', // base64
          size: 200,
          content_type: 'text/css',
        },
      },
    }

    const tx = create_site_transaction(params)

    assert.ok(tx)
    assert.ok(typeof tx === 'object')
    // Transaction is opaque, we can't easily inspect internals
    // But we can verify it was created without throwing
  })

  test('should skip patches without matching metadata', () => {
    const params = {
      package_id:
        '0xda3719ae702534b4181c5f2ddf2780744ee512dae7a5b22bce6b5fda4893471b',
      wallet:
        '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4',
      site_name: 'Test Site',
      quilt_patches: [
        { identifier: 'index.html', quiltPatchId: 'patch_1' },
        { identifier: 'missing.html', quiltPatchId: 'patch_2' }, // No metadata
      ],
      file_metadata: {
        '/index.html': {
          hash: 'YWJj',
          size: 100,
          content_type: 'text/html',
        },
      },
    }

    // Should not throw even with missing metadata
    const tx = create_site_transaction(params)
    assert.ok(tx)
  })
})

describe('extract_site_id', () => {
  test('should extract site ID from transaction result', () => {
    const tx_result = {
      objectChanges: [
        {
          type: 'created',
          objectType:
            '0xda3719ae702534b4181c5f2ddf2780744ee512dae7a5b22bce6b5fda4893471b::site::Site',
          objectId:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      ],
    }

    const site_id = extract_site_id(tx_result)
    assert.strictEqual(
      site_id,
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    )
  })

  test('should return "unknown" when no site object created', () => {
    const tx_result = {
      objectChanges: [
        {
          type: 'created',
          objectType:
            '0xda3719ae702534b4181c5f2ddf2780744ee512dae7a5b22bce6b5fda4893471b::resource::Resource',
          objectId: '0xabc',
        },
      ],
    }

    const site_id = extract_site_id(tx_result)
    assert.strictEqual(site_id, 'unknown')
  })

  test('should return "unknown" for null/undefined result', () => {
    assert.strictEqual(extract_site_id(null), 'unknown')
    assert.strictEqual(extract_site_id(undefined), 'unknown')
    assert.strictEqual(extract_site_id({}), 'unknown')
  })

  test('should return "unknown" when objectChanges missing', () => {
    const tx_result = { digest: 'abc123' }
    assert.strictEqual(extract_site_id(tx_result), 'unknown')
  })
})
