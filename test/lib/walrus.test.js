import { describe, test, mock } from 'node:test'
import assert from 'node:assert'
import {
  encode_files,
  upload_files_to_nodes,
  download_blob,
} from '../../src/lib/walrus.js'

// NOTE: create_walrus_client is not tested here because it requires full WalrusClient instantiation
// which depends on external deps. It's tested indirectly via integration tests.

describe('encode_files', () => {
  test('should encode single file and return metadata', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async content => ({
        blobId: 'mock_blob_id',
        rootHash: new Uint8Array([1, 2, 3, 4]),
        metadata: { encoded_size: content.length },
      })),
    }

    const files = [
      { path: '/index.html', content: Buffer.from('<!DOCTYPE html>') },
    ]

    const result = await encode_files(mock_walrus_client, files)

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].path, '/index.html')
    assert.strictEqual(result[0].blob_id, 'mock_blob_id')
    assert.deepStrictEqual(result[0].root_hash, [1, 2, 3, 4])
    assert.strictEqual(result[0].size, 15) // Buffer length
    assert.ok(result[0].metadata)
    assert.strictEqual(mock_walrus_client.encodeBlob.mock.calls.length, 1)
  })

  test('should encode multiple files', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async content => ({
        blobId: `blob_${content.length}`,
        rootHash: new Uint8Array([1, 2]),
        metadata: {},
      })),
    }

    const files = [
      { path: '/file1.txt', content: Buffer.from('content1') },
      { path: '/file2.txt', content: Buffer.from('content2') },
      { path: '/file3.txt', content: Buffer.from('content3') },
    ]

    const result = await encode_files(mock_walrus_client, files)

    assert.strictEqual(result.length, 3)
    assert.strictEqual(result[0].path, '/file1.txt')
    assert.strictEqual(result[1].path, '/file2.txt')
    assert.strictEqual(result[2].path, '/file3.txt')
    assert.strictEqual(mock_walrus_client.encodeBlob.mock.calls.length, 3)
  })

  test('should handle empty files array', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({})),
    }

    const result = await encode_files(mock_walrus_client, [])

    assert.strictEqual(result.length, 0)
    assert.strictEqual(mock_walrus_client.encodeBlob.mock.calls.length, 0)
  })

  test('should convert Uint8Array root_hash to Array', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({
        blobId: 'test',
        rootHash: new Uint8Array([255, 0, 128]),
        metadata: {},
      })),
    }

    const files = [{ path: '/test.txt', content: Buffer.from('test') }]
    const result = await encode_files(mock_walrus_client, files)

    assert.ok(Array.isArray(result[0].root_hash))
    assert.deepStrictEqual(result[0].root_hash, [255, 0, 128])
  })
})

describe('upload_files_to_nodes', () => {
  test('should upload files and return confirmations', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({
        blobId: 'test_blob_id',
        metadata: { size: 100 },
        sliversByNode: [],
      })),
      writeEncodedBlobToNodes: mock.fn(async () => [
        { node: 'node1', status: 'ok' },
        { node: 'node2', status: 'ok' },
        null, // Some nodes might return null
      ]),
    }

    const files = [{ content: Buffer.from('test content') }]
    const blob_object_ids = ['blob_obj_123']

    const result = await upload_files_to_nodes(mock_walrus_client, files, blob_object_ids)

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].length, 2) // null filtered out
    assert.strictEqual(mock_walrus_client.encodeBlob.mock.calls.length, 1)
    assert.strictEqual(mock_walrus_client.writeEncodedBlobToNodes.mock.calls.length, 1)
  })

  test('should upload multiple files', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({
        blobId: 'blob_id',
        metadata: {},
        sliversByNode: [],
      })),
      writeEncodedBlobToNodes: mock.fn(async () => [
        { node: 'node1', status: 'ok' },
      ]),
    }

    const files = [
      { content: Buffer.from('file1') },
      { content: Buffer.from('file2') },
    ]
    const blob_object_ids = ['obj1', 'obj2']

    const result = await upload_files_to_nodes(mock_walrus_client, files, blob_object_ids)

    assert.strictEqual(result.length, 2)
    assert.strictEqual(mock_walrus_client.encodeBlob.mock.calls.length, 2)
    assert.strictEqual(mock_walrus_client.writeEncodedBlobToNodes.mock.calls.length, 2)
  })

  test('should pass deletable option (default true)', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({
        blobId: 'blob_id',
        metadata: {},
        sliversByNode: [],
      })),
      writeEncodedBlobToNodes: mock.fn(async params => {
        assert.strictEqual(params.deletable, true) // Default
        return []
      }),
    }

    const files = [{ content: Buffer.from('test') }]
    const blob_object_ids = ['obj1']

    await upload_files_to_nodes(mock_walrus_client, files, blob_object_ids)
  })

  test('should pass deletable option when specified', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({
        blobId: 'blob_id',
        metadata: {},
        sliversByNode: [],
      })),
      writeEncodedBlobToNodes: mock.fn(async params => {
        assert.strictEqual(params.deletable, false)
        return []
      }),
    }

    const files = [{ content: Buffer.from('test') }]
    const blob_object_ids = ['obj1']

    await upload_files_to_nodes(mock_walrus_client, files, blob_object_ids, {
      deletable: false,
    })
  })

  test('should filter out null confirmations', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({
        blobId: 'blob_id',
        metadata: {},
        sliversByNode: [],
      })),
      writeEncodedBlobToNodes: mock.fn(async () => [
        { node: 'node1', status: 'ok' },
        null,
        { node: 'node2', status: 'ok' },
        null,
      ]),
    }

    const files = [{ content: Buffer.from('test') }]
    const blob_object_ids = ['obj1']

    const result = await upload_files_to_nodes(mock_walrus_client, files, blob_object_ids)

    assert.strictEqual(result[0].length, 2) // Only non-null confirmations
  })

  test('should pass object_id to writeEncodedBlobToNodes', async () => {
    const mock_walrus_client = {
      encodeBlob: mock.fn(async () => ({
        blobId: 'blob_id',
        metadata: {},
        sliversByNode: [],
      })),
      writeEncodedBlobToNodes: mock.fn(async params => {
        assert.strictEqual(params.objectId, 'expected_object_id')
        return []
      }),
    }

    const files = [{ content: Buffer.from('test') }]
    const blob_object_ids = ['expected_object_id']

    await upload_files_to_nodes(mock_walrus_client, files, blob_object_ids)
  })
})

describe('download_blob', () => {
  test('should download blob and return content', async () => {
    const expected_content = new Uint8Array([1, 2, 3, 4, 5])
    const mock_walrus_client = {
      readBlob: mock.fn(async ({ blobId }) => {
        assert.strictEqual(blobId, 'test_blob_id')
        return expected_content
      }),
    }

    const result = await download_blob(mock_walrus_client, 'test_blob_id')

    assert.deepStrictEqual(result, expected_content)
    assert.strictEqual(mock_walrus_client.readBlob.mock.calls.length, 1)
  })

  test('should pass blob_id to readBlob', async () => {
    const mock_walrus_client = {
      readBlob: mock.fn(async ({ blobId }) => {
        assert.strictEqual(blobId, 'my_specific_blob_id')
        return new Uint8Array()
      }),
    }

    await download_blob(mock_walrus_client, 'my_specific_blob_id')
  })
})
