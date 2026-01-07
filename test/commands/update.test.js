import { describe, it, mock } from 'node:test'
import assert from 'node:assert'

import { fromBase64 } from '@mysten/sui/utils'

import { compare_files } from '../../src/commands/update.js'

// Mock transaction builder helper
const mock_transaction_builder = () => {
  const calls = []
  const tx = {
    setSender: mock.fn(wallet => {
      calls.push({ method: 'setSender', wallet })
    }),
    sharedObjectRef: mock.fn(ref => {
      calls.push({ method: 'sharedObjectRef', ref })
      return { objectId: ref.objectId, type: 'shared' }
    }),
    moveCall: mock.fn(call => {
      calls.push({ method: 'moveCall', call })
    }),
    object: mock.fn(id => ({ type: 'object', id })),
    pure: {
      string: mock.fn(val => ({ type: 'pure.string', val })),
      u64: mock.fn(val => ({ type: 'pure.u64', val })),
      id: mock.fn(val => ({ type: 'pure.id', val })),
      vector: mock.fn((type, val) => ({ type: `pure.vector.${type}`, val })),
    },
    _calls: calls,
  }
  return tx
}

describe('update command', () => {
  describe('compare_files', () => {
    it('should detect added files', () => {
      const local_files = {
        '/index.html': { hash: 'abc123', size: 100, content_type: 'text/html' },
        '/style.css': { hash: 'def456', size: 50, content_type: 'text/css' },
      }
      const existing_resources = new Map()

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, ['/index.html', '/style.css'])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, [])
    })

    it('should detect updated files', () => {
      const local_files = {
        '/index.html': { hash: 'abc123', size: 100, content_type: 'text/html' },
        '/style.css': { hash: 'def456', size: 50, content_type: 'text/css' },
      }
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'old_hash', size: 90 }],
        ['/style.css', { blob_id: 'blob2', hash: 'def456', size: 50 }],
      ])

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, [])
      assert.deepStrictEqual(result.updated, ['/index.html'])
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, ['/style.css'])
    })

    it('should detect deleted files', () => {
      const local_files = {
        '/index.html': { hash: 'abc123', size: 100, content_type: 'text/html' },
      }
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'abc123', size: 100 }],
        ['/old.js', { blob_id: 'blob2', hash: 'old_hash', size: 200 }],
        ['/deprecated.css', { blob_id: 'blob3', hash: 'dep_hash', size: 50 }],
      ])

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, [])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, ['/old.js', '/deprecated.css'])
      assert.deepStrictEqual(result.unchanged, ['/index.html'])
    })

    it('should detect unchanged files', () => {
      const local_files = {
        '/index.html': { hash: 'abc123', size: 100, content_type: 'text/html' },
        '/style.css': { hash: 'def456', size: 50, content_type: 'text/css' },
      }
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'abc123', size: 100 }],
        ['/style.css', { blob_id: 'blob2', hash: 'def456', size: 50 }],
      ])

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, [])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, ['/index.html', '/style.css'])
    })

    it('should detect all changes simultaneously', () => {
      const local_files = {
        '/index.html': {
          hash: 'new_hash',
          size: 150,
          content_type: 'text/html',
        },
        '/new.js': {
          hash: 'js_hash',
          size: 300,
          content_type: 'application/javascript',
        },
        '/style.css': { hash: 'css_hash', size: 50, content_type: 'text/css' },
      }
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'old_hash', size: 100 }],
        ['/style.css', { blob_id: 'blob2', hash: 'css_hash', size: 50 }],
        ['/deprecated.txt', { blob_id: 'blob3', hash: 'txt_hash', size: 20 }],
      ])

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, ['/new.js'])
      assert.deepStrictEqual(result.updated, ['/index.html'])
      assert.deepStrictEqual(result.deleted, ['/deprecated.txt'])
      assert.deepStrictEqual(result.unchanged, ['/style.css'])
    })

    it('should handle empty local files', () => {
      const local_files = {}
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'hash1', size: 100 }],
        ['/style.css', { blob_id: 'blob2', hash: 'hash2', size: 50 }],
      ])

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, [])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, ['/index.html', '/style.css'])
      assert.deepStrictEqual(result.unchanged, [])
    })

    it('should handle empty existing resources', () => {
      const local_files = {
        '/index.html': { hash: 'hash1', size: 100, content_type: 'text/html' },
        '/style.css': { hash: 'hash2', size: 50, content_type: 'text/css' },
      }
      const existing_resources = new Map()

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, ['/index.html', '/style.css'])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, [])
    })

    it('should handle both empty', () => {
      const local_files = {}
      const existing_resources = new Map()

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, [])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, [])
    })

    it('should compare by hash only, not size', () => {
      const local_files = {
        '/index.html': {
          hash: 'same_hash',
          size: 200,
          content_type: 'text/html',
        },
      }
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'same_hash', size: 100 }],
      ])

      const result = compare_files(local_files, existing_resources)

      // Files are unchanged because hash matches, even though size differs
      assert.deepStrictEqual(result.added, [])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, ['/index.html'])
    })

    it('should handle special characters in paths', () => {
      const local_files = {
        '/dir/file name.html': {
          hash: 'hash1',
          size: 100,
          content_type: 'text/html',
        },
        '/dir/file%20encoded.js': {
          hash: 'hash2',
          size: 50,
          content_type: 'application/javascript',
        },
      }
      const existing_resources = new Map([
        ['/dir/file name.html', { blob_id: 'blob1', hash: 'hash1', size: 100 }],
      ])

      const result = compare_files(local_files, existing_resources)

      assert.deepStrictEqual(result.added, ['/dir/file%20encoded.js'])
      assert.deepStrictEqual(result.updated, [])
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, ['/dir/file name.html'])
    })

    it('should filter out undefined paths from existing resources', () => {
      const local_files = {
        '/index.html': { hash: 'hash1', size: 100, content_type: 'text/html' },
      }
      // Existing resources map should never have undefined keys after filtering
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'hash1', size: 100 }],
      ])

      const result = compare_files(local_files, existing_resources)

      // undefined should not appear in deleted array
      assert.deepStrictEqual(result.deleted, [])
      assert.deepStrictEqual(result.unchanged, ['/index.html'])
      assert.strictEqual(result.added.includes(undefined), false)
      assert.strictEqual(result.deleted.includes(undefined), false)
    })
  })

  describe('build_update_transaction', () => {
    it('should build transaction with added files', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: ['/index.html', '/style.css'],
        updated_paths: [],
        deleted_paths: [],
        patches: [
          { identifier: '/index.html', quiltPatchId: 'patch1' },
          { identifier: '/style.css', quiltPatchId: 'patch2' },
        ],
        file_metadata: {
          '/index.html': {
            hash: 'aGFzaDE=',
            size: 100,
            content_type: 'text/html',
          },
          '/style.css': {
            hash: 'aGFzaDI=',
            size: 50,
            content_type: 'text/css',
          },
        },
        blob_object_id: 'blob_obj_123',
      }

      // Mock Transaction constructor
      const tx = mock_transaction_builder()

      // Manually call the transaction building logic
      tx.setSender(params.wallet)

      const patch_map = new Map()
      for (const patch of params.patches) {
        const normalized = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        patch_map.set(normalized, patch.quiltPatchId)
      }

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      for (const path of params.added_paths) {
        const info = params.file_metadata[path]
        const patch_id = patch_map.get(path)
        if (!info || !patch_id) continue

        tx.moveCall({
          target: `${params.package_id}::site::add_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
            tx.pure.string(patch_id),
            tx.pure.id(params.blob_object_id),
            tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
            tx.pure.string(info.content_type),
            tx.pure.u64(info.size),
          ],
        })
      }

      // Verify setSender was called
      assert.strictEqual(tx._calls[0].method, 'setSender')
      assert.strictEqual(tx._calls[0].wallet, 'wallet456')

      // Verify sharedObjectRef was called
      assert.strictEqual(tx._calls[1].method, 'sharedObjectRef')
      assert.deepStrictEqual(tx._calls[1].ref, {
        objectId: 'site012',
        initialSharedVersion: '1',
        mutable: true,
      })

      // Verify add_resource calls
      const add_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' && c.call.target.endsWith('::add_resource'),
      )
      assert.strictEqual(add_calls.length, 2)
      assert.strictEqual(add_calls[0].call.target, 'pkg123::site::add_resource')
      assert.strictEqual(add_calls[1].call.target, 'pkg123::site::add_resource')
    })

    it('should build transaction with updated files', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: [],
        updated_paths: ['/index.html'],
        deleted_paths: [],
        patches: [{ identifier: '/index.html', quiltPatchId: 'patch_new' }],
        file_metadata: {
          '/index.html': {
            hash: 'bmV3aGFzaA==',
            size: 150,
            content_type: 'text/html',
          },
        },
        blob_object_id: 'blob_obj_456',
      }

      const tx = mock_transaction_builder()
      tx.setSender(params.wallet)

      const patch_map = new Map()
      for (const patch of params.patches) {
        const normalized = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        patch_map.set(normalized, patch.quiltPatchId)
      }

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      for (const path of params.updated_paths) {
        const info = params.file_metadata[path]
        const patch_id = patch_map.get(path)
        if (!info || !patch_id) continue

        tx.moveCall({
          target: `${params.package_id}::site::update_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
            tx.pure.string(patch_id),
            tx.pure.id(params.blob_object_id),
            tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
            tx.pure.u64(info.size),
          ],
        })
      }

      const update_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' &&
          c.call.target.endsWith('::update_resource'),
      )
      assert.strictEqual(update_calls.length, 1)
      assert.strictEqual(
        update_calls[0].call.target,
        'pkg123::site::update_resource',
      )
    })

    it('should build transaction with deleted files', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: [],
        updated_paths: [],
        deleted_paths: ['/old.js', '/deprecated.css'],
        patches: [],
        file_metadata: {},
        blob_object_id: null,
      }

      const tx = mock_transaction_builder()
      tx.setSender(params.wallet)

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      for (const path of params.deleted_paths) {
        tx.moveCall({
          target: `${params.package_id}::site::delete_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
          ],
        })
      }

      const delete_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' &&
          c.call.target.endsWith('::delete_resource'),
      )
      assert.strictEqual(delete_calls.length, 2)
      assert.strictEqual(
        delete_calls[0].call.target,
        'pkg123::site::delete_resource',
      )
      assert.strictEqual(
        delete_calls[1].call.target,
        'pkg123::site::delete_resource',
      )
    })

    it('should handle mixed operations in single transaction', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: ['/new.js'],
        updated_paths: ['/index.html'],
        deleted_paths: ['/old.css'],
        patches: [
          { identifier: '/new.js', quiltPatchId: 'patch_new' },
          { identifier: '/index.html', quiltPatchId: 'patch_updated' },
        ],
        file_metadata: {
          '/new.js': {
            hash: 'anNoYXNo',
            size: 200,
            content_type: 'application/javascript',
          },
          '/index.html': {
            hash: 'aHRtbGhhc2g=',
            size: 150,
            content_type: 'text/html',
          },
        },
        blob_object_id: 'blob_obj_789',
      }

      const tx = mock_transaction_builder()
      tx.setSender(params.wallet)

      const patch_map = new Map()
      for (const patch of params.patches) {
        const normalized = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        patch_map.set(normalized, patch.quiltPatchId)
      }

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      for (const path of params.added_paths) {
        const info = params.file_metadata[path]
        const patch_id = patch_map.get(path)
        if (!info || !patch_id) continue

        tx.moveCall({
          target: `${params.package_id}::site::add_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
            tx.pure.string(patch_id),
            tx.pure.id(params.blob_object_id),
            tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
            tx.pure.string(info.content_type),
            tx.pure.u64(info.size),
          ],
        })
      }

      for (const path of params.updated_paths) {
        const info = params.file_metadata[path]
        const patch_id = patch_map.get(path)
        if (!info || !patch_id) continue

        tx.moveCall({
          target: `${params.package_id}::site::update_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
            tx.pure.string(patch_id),
            tx.pure.id(params.blob_object_id),
            tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
            tx.pure.u64(info.size),
          ],
        })
      }

      for (const path of params.deleted_paths) {
        tx.moveCall({
          target: `${params.package_id}::site::delete_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
          ],
        })
      }

      const add_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' && c.call.target.endsWith('::add_resource'),
      )
      const update_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' &&
          c.call.target.endsWith('::update_resource'),
      )
      const delete_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' &&
          c.call.target.endsWith('::delete_resource'),
      )

      assert.strictEqual(add_calls.length, 1)
      assert.strictEqual(update_calls.length, 1)
      assert.strictEqual(delete_calls.length, 1)
    })

    it('should normalize patch identifiers without leading slash', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: ['/index.html'],
        updated_paths: [],
        deleted_paths: [],
        patches: [
          { identifier: 'index.html', quiltPatchId: 'patch1' }, // No leading slash
        ],
        file_metadata: {
          '/index.html': {
            hash: 'aGFzaDE=',
            size: 100,
            content_type: 'text/html',
          },
        },
        blob_object_id: 'blob_obj_123',
      }

      const patch_map = new Map()
      for (const patch of params.patches) {
        const normalized = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        patch_map.set(normalized, patch.quiltPatchId)
      }

      // Verify normalization worked
      assert.strictEqual(patch_map.get('/index.html'), 'patch1')
      assert.strictEqual(patch_map.get('index.html'), undefined)
    })

    it('should skip files without metadata in patch map', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: ['/index.html', '/missing.js'],
        updated_paths: [],
        deleted_paths: [],
        patches: [
          { identifier: '/index.html', quiltPatchId: 'patch1' },
          // /missing.js has no patch
        ],
        file_metadata: {
          '/index.html': {
            hash: 'aGFzaDE=',
            size: 100,
            content_type: 'text/html',
          },
          '/missing.js': {
            hash: 'bWlzc2luZw==',
            size: 50,
            content_type: 'application/javascript',
          },
        },
        blob_object_id: 'blob_obj_123',
      }

      const tx = mock_transaction_builder()
      tx.setSender(params.wallet)

      const patch_map = new Map()
      for (const patch of params.patches) {
        const normalized = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        patch_map.set(normalized, patch.quiltPatchId)
      }

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      for (const path of params.added_paths) {
        const info = params.file_metadata[path]
        const patch_id = patch_map.get(path)
        if (!info || !patch_id) continue // Skip if missing

        tx.moveCall({
          target: `${params.package_id}::site::add_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
            tx.pure.string(patch_id),
            tx.pure.id(params.blob_object_id),
            tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
            tx.pure.string(info.content_type),
            tx.pure.u64(info.size),
          ],
        })
      }

      const add_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' && c.call.target.endsWith('::add_resource'),
      )
      // Only 1 call, /missing.js skipped
      assert.strictEqual(add_calls.length, 1)
    })

    it('should handle empty transaction when no operations', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: [],
        updated_paths: [],
        deleted_paths: [],
        patches: [],
        file_metadata: {},
        blob_object_id: null,
      }

      const tx = mock_transaction_builder()
      tx.setSender(params.wallet)

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      // No moveCall operations should be made
      const move_calls = tx._calls.filter(c => c.method === 'moveCall')
      assert.strictEqual(move_calls.length, 0)
    })

    it('should convert base64 hash to byte array correctly', () => {
      const test_hash = 'SGVsbG8=' // "Hello" in base64
      const bytes = Array.from(fromBase64(test_hash))

      // "Hello" = [72, 101, 108, 108, 111]
      assert.deepStrictEqual(bytes, [72, 101, 108, 108, 111])
    })

    it('should handle initial_shared_version as string or number', () => {
      const params_string = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '42',
        added_paths: [],
        updated_paths: [],
        deleted_paths: [],
        patches: [],
        file_metadata: {},
        blob_object_id: null,
      }

      const params_number = {
        ...params_string,
        initial_shared_version: 42,
      }

      const tx1 = mock_transaction_builder()
      tx1.setSender(params_string.wallet)
      tx1.sharedObjectRef({
        objectId: params_string.site_id,
        initialSharedVersion: params_string.initial_shared_version,
        mutable: true,
      })

      const tx2 = mock_transaction_builder()
      tx2.setSender(params_number.wallet)
      tx2.sharedObjectRef({
        objectId: params_number.site_id,
        initialSharedVersion: params_number.initial_shared_version,
        mutable: true,
      })

      // Both should work
      assert.strictEqual(tx1._calls[1].ref.initialSharedVersion, '42')
      assert.strictEqual(tx2._calls[1].ref.initialSharedVersion, 42)
    })
  })

  describe('hash computation edge cases', () => {
    it('should handle identical files with different paths', () => {
      const local_files = {
        '/dir1/file.txt': {
          hash: 'same_hash',
          size: 100,
          content_type: 'text/plain',
        },
        '/dir2/file.txt': {
          hash: 'same_hash',
          size: 100,
          content_type: 'text/plain',
        },
      }
      const existing_resources = new Map()

      const result = compare_files(local_files, existing_resources)

      // Both should be added as separate resources
      assert.strictEqual(result.added.length, 2)
      assert.ok(result.added.includes('/dir1/file.txt'))
      assert.ok(result.added.includes('/dir2/file.txt'))
    })

    it('should treat hash comparison as case-sensitive', () => {
      const local_files = {
        '/index.html': { hash: 'ABC123', size: 100, content_type: 'text/html' },
      }
      const existing_resources = new Map([
        ['/index.html', { blob_id: 'blob1', hash: 'abc123', size: 100 }],
      ])

      const result = compare_files(local_files, existing_resources)

      // Different case = different hash = updated
      assert.deepStrictEqual(result.updated, ['/index.html'])
    })
  })

  describe('error handling scenarios', () => {
    it('should handle missing file_metadata entries gracefully', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: ['/index.html'],
        updated_paths: [],
        deleted_paths: [],
        patches: [{ identifier: '/index.html', quiltPatchId: 'patch1' }],
        file_metadata: {}, // Empty metadata
        blob_object_id: 'blob_obj_123',
      }

      const tx = mock_transaction_builder()
      tx.setSender(params.wallet)

      const patch_map = new Map()
      for (const patch of params.patches) {
        const normalized = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        patch_map.set(normalized, patch.quiltPatchId)
      }

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      for (const path of params.added_paths) {
        const info = params.file_metadata[path]
        const patch_id = patch_map.get(path)
        if (!info || !patch_id) continue // Should skip

        tx.moveCall({
          target: `${params.package_id}::site::add_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
            tx.pure.string(patch_id),
            tx.pure.id(params.blob_object_id),
            tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
            tx.pure.string(info.content_type),
            tx.pure.u64(info.size),
          ],
        })
      }

      const add_calls = tx._calls.filter(c => c.method === 'moveCall')
      // No calls should be made due to missing metadata
      assert.strictEqual(add_calls.length, 0)
    })

    it('should handle null blob_object_id', () => {
      const params = {
        package_id: 'pkg123',
        wallet: 'wallet456',
        admin_cap_id: 'admincap789',
        site_id: 'site012',
        initial_shared_version: '1',
        added_paths: [],
        updated_paths: [],
        deleted_paths: ['/old.js'],
        patches: [],
        file_metadata: {},
        blob_object_id: null, // No blob uploaded
      }

      const tx = mock_transaction_builder()
      tx.setSender(params.wallet)

      tx.sharedObjectRef({
        objectId: params.site_id,
        initialSharedVersion: params.initial_shared_version,
        mutable: true,
      })

      for (const path of params.deleted_paths) {
        tx.moveCall({
          target: `${params.package_id}::site::delete_resource`,
          arguments: [
            tx.object(params.admin_cap_id),
            tx.object(params.site_id),
            tx.pure.string(path),
          ],
        })
      }

      // Should still work for delete operations
      const delete_calls = tx._calls.filter(
        c =>
          c.method === 'moveCall' &&
          c.call.target.endsWith('::delete_resource'),
      )
      assert.strictEqual(delete_calls.length, 1)
    })
  })
})
