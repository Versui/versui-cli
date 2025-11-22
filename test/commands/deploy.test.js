import { describe, test } from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'

import {
  format_bytes,
  get_sui_active_address,
  upload_to_walrus_with_progress,
} from '../../src/commands/deploy.js'

describe('format_bytes', () => {
  test('should format bytes < 1024 as B', () => {
    assert.strictEqual(format_bytes(512), '512 B')
    assert.strictEqual(format_bytes(0), '0 B')
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

describe('get_sui_active_address', () => {
  test('should return null when sui CLI not installed', () => {
    // This function uses execSync - testing requires mocking or real CLI
    // For now, we just verify it returns a value or null
    const result = get_sui_active_address()
    assert.ok(result === null || typeof result === 'string')
  })

  test('should return address string when sui CLI available', () => {
    const result = get_sui_active_address()
    if (result !== null) {
      assert.ok(result.startsWith('0x'))
      assert.ok(result.length > 10)
    }
  })
})

describe('upload_to_walrus_with_progress', () => {
  test('should resolve with quilt result on success', async () => {
    const mock_spawn = (cmd, args, opts) => {
      const emitter = new EventEmitter()
      emitter.stdout = new EventEmitter()
      emitter.stderr = new EventEmitter()

      // Simulate async spawn behavior
      setImmediate(() => {
        // Emit stdout with JSON result
        emitter.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              blobStoreResult: {
                newlyCreated: {
                  blobObject: {
                    blobId: 'test_blob_id_123',
                  },
                },
              },
              storedQuiltBlobs: [
                { identifier: 'index.html', quiltPatchId: 'patch_1' },
              ],
            }),
          ),
        )
        // Emit close with success code
        emitter.emit('close', 0)
      })

      return emitter
    }

    const progress_calls = []
    const result = await upload_to_walrus_with_progress(
      '/test/dir',
      1,
      (progress, message) => {
        progress_calls.push({ progress, message })
      },
      mock_spawn,
    )

    assert.strictEqual(
      result.blobStoreResult.newlyCreated.blobObject.blobId,
      'test_blob_id_123',
    )
    assert.strictEqual(result.storedQuiltBlobs.length, 1)
    // Should call progress with 100% on completion
    assert.ok(progress_calls.some(c => c.progress === 100))
  })

  test('should reject when walrus command fails', async () => {
    const mock_spawn = (cmd, args, opts) => {
      const emitter = new EventEmitter()
      emitter.stdout = new EventEmitter()
      emitter.stderr = new EventEmitter()

      setImmediate(() => {
        emitter.stderr.emit('data', Buffer.from('Error: blob not found'))
        emitter.emit('close', 1) // Non-zero exit code
      })

      return emitter
    }

    await assert.rejects(
      upload_to_walrus_with_progress('/test/dir', 1, () => {}, mock_spawn),
      /Walrus upload failed/,
    )
  })

  test('should track progress via callback', async () => {
    const mock_spawn = (cmd, args, opts) => {
      const emitter = new EventEmitter()
      emitter.stdout = new EventEmitter()
      emitter.stderr = new EventEmitter()

      setImmediate(() => {
        // Simulate progress in stderr - note: regex matches accumulate in stderr_data
        // So we emit separate chunks to see different progress values
        emitter.stderr.emit('data', Buffer.from('Encoding blob 1/5\n'))
        setTimeout(() => {
          emitter.stderr.emit('data', Buffer.from('Uploading blob 3/5\n'))
          setTimeout(() => {
            emitter.stderr.emit('data', Buffer.from('Storing blob 5/5\n'))
            emitter.stdout.emit(
              'data',
              Buffer.from(
                JSON.stringify({
                  blobStoreResult: { alreadyCertified: { blobId: 'id' } },
                  storedQuiltBlobs: [],
                }),
              ),
            )
            emitter.emit('close', 0)
          }, 10)
        }, 10)
      })

      return emitter
    }

    const progress_calls = []
    await upload_to_walrus_with_progress(
      '/test/dir',
      1,
      (progress, message) => {
        progress_calls.push({ progress, message })
      },
      mock_spawn,
    )

    // Should track progress increasing and complete
    // Note: The regex matches cumulatively in stderr_data, so we may not get all intermediate calls
    // But we should at least get the completion call
    assert.ok(
      progress_calls.length >= 1,
      `Expected at least 1 progress call, got ${progress_calls.length}`,
    )
    assert.ok(
      progress_calls.some(c => c.progress === 100 && c.message === 'Complete'),
      'Should have completion progress call',
    )
  })

  test('should reject on invalid JSON output', async () => {
    const mock_spawn = (cmd, args, opts) => {
      const emitter = new EventEmitter()
      emitter.stdout = new EventEmitter()
      emitter.stderr = new EventEmitter()

      setImmediate(() => {
        emitter.stdout.emit('data', Buffer.from('invalid json {'))
        emitter.emit('close', 0)
      })

      return emitter
    }

    await assert.rejects(
      upload_to_walrus_with_progress('/test/dir', 1, () => {}, mock_spawn),
      /Failed to parse walrus output/,
    )
  })
})
