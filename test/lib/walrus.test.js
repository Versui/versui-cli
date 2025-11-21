import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { upload_blob, download_blob } from '../../src/lib/walrus.js'

describe('upload_blob', () => {
  it('should upload blob and return blob ID', async () => {
    // Mock fetch function (dependency injection)
    const mock_fetch = async () => ({
      ok: true,
      json: async () => ({
        newlyCreated: {
          blobObject: {
            id: '0x123',
            blobId: 'test-blob-id-base64',
            size: 1024,
            encodingType: 'RS2',
            registeredEpoch: 100,
          },
        },
      }),
    })

    const result = await upload_blob(
      Buffer.from('test content'),
      'https://publisher.walrus-testnet.walrus.space',
      365,
      mock_fetch,
    )

    assert.equal(result.blob_id, 'test-blob-id-base64')
    assert.equal(result.object_id, '0x123')
    assert.equal(result.size, 1024)
  })

  it('should handle already certified blobs', async () => {
    const mock_fetch = async () => ({
      ok: true,
      json: async () => ({
        alreadyCertified: {
          blobId: 'existing-blob-id',
          event: { txDigest: '0xabc', eventSeq: '0' },
          endEpoch: 500,
        },
      }),
    })

    const result = await upload_blob(
      Buffer.from('test content'),
      'https://publisher.walrus-testnet.walrus.space',
      365,
      mock_fetch,
    )

    assert.equal(result.blob_id, 'existing-blob-id')
    assert.equal(result.already_exists, true)
  })

  it('should throw on upload failure', async () => {
    const mock_fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await assert.rejects(
      async () =>
        await upload_blob(
          Buffer.from('test'),
          'https://publisher.walrus-testnet.walrus.space',
          365,
          mock_fetch,
        ),
      { message: /Failed to upload blob/ },
    )
  })
})

describe('download_blob', () => {
  it('should download blob content', async () => {
    // Create proper Response-like mock
    const test_data = 'downloaded content'
    const test_buffer = Buffer.from(test_data)

    const mock_fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => {
          // Create new ArrayBuffer with correct size
          const array_buffer = new ArrayBuffer(test_buffer.length)
          const view = new Uint8Array(array_buffer)
          for (let i = 0; i < test_buffer.length; i++) {
            view[i] = test_buffer[i]
          }
          return array_buffer
        },
      }
    }

    const result = await download_blob(
      'test-blob-id',
      'https://aggregator.walrus-testnet.walrus.space',
      mock_fetch,
    )

    assert.deepEqual(result, test_buffer)
  })

  it('should throw on download failure', async () => {
    /**
     * @param {string} url
     * @param {object} [options]
     */
    const mock_fetch = async (url, options) => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: {},
      url,
    })

    await assert.rejects(
      async () =>
        await download_blob(
          'nonexistent-blob-id',
          'https://aggregator.walrus-testnet.walrus.space',
          mock_fetch,
        ),
      { message: /Failed to download blob/ },
    )
  })
})
