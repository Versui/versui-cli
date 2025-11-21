import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

import { deploy } from '../../src/commands/deploy.js'

describe('deploy', () => {
  it('should deploy site on first deployment (no previous manifest)', async () => {
    // Mock dependencies
    const mock_context = {
      fs: {
        existsSync: path => {
          if (path.includes('.versui/manifest.json')) return false
          if (path.includes('/index.html')) return true
          if (path.includes('/style.css')) return true
          return false
        },
        readdirSync: path => ['index.html', 'style.css'],
        statSync: path => ({ isFile: () => true, isDirectory: () => false }),
        readFileSync: path => Buffer.from('test content'),
        writeFileSync: mock.fn(),
        mkdirSync: mock.fn(),
      },
      walrus: {
        upload_blob: mock.fn(async () => ({
          blob_id: 'test-blob-123',
          size: 100,
        })),
      },
      sui: {
        create_site: mock.fn(async () => ({
          site_id: '0xsite123',
          digest: '0xabc',
        })),
        create_resource: mock.fn(async () => ({
          resource_id: '0xres123',
          digest: '0xdef',
        })),
      },
    }

    const options = {
      network: 'testnet',
      epochs: 365,
    }

    await deploy('/test/build', options, mock_context)

    // Verify Walrus uploads were called (2 files + 1 bootstrap)
    assert.ok(mock_context.walrus.upload_blob.mock.calls.length >= 2)

    // Verify Sui objects were created
    assert.strictEqual(mock_context.sui.create_site.mock.calls.length, 1)
    assert.ok(mock_context.sui.create_resource.mock.calls.length >= 2)

    // Verify manifest was saved
    assert.strictEqual(mock_context.fs.writeFileSync.mock.calls.length, 1)
  })

  it('should use delta optimization on subsequent deployments', async () => {
    const test_content_hash =
      '6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72'

    const mock_context = {
      fs: {
        existsSync: path => {
          if (path.includes('.versui/manifest.json')) return true
          if (path.includes('/index.html')) return true
          if (path.includes('/style.css')) return true
          return false
        },
        readdirSync: path => ['index.html', 'style.css'],
        statSync: path => ({
          isFile: () => true,
          isDirectory: () => false,
          size: 12,
        }),
        readFileSync: path => {
          if (path.includes('manifest.json')) {
            return JSON.stringify({
              version: 1,
              site_id: '0xsite123',
              deployed_at: '2025-01-01T00:00:00Z',
              resources: {
                '/index.html': {
                  blob_id: 'old-blob',
                  blob_hash: test_content_hash,
                  size: 12,
                  content_type: 'text/html',
                  path: '/index.html',
                },
                '/style.css': {
                  blob_id: 'old-blob-2',
                  blob_hash: test_content_hash,
                  size: 12,
                  content_type: 'text/css',
                  path: '/style.css',
                },
              },
            })
          }
          return Buffer.from('test content')
        },
        writeFileSync: mock.fn(),
        mkdirSync: mock.fn(),
      },
      walrus: {
        upload_blob: mock.fn(async () => ({
          blob_id: 'new-blob-123',
          size: 100,
        })),
      },
      sui: {
        update_resource: mock.fn(async () => ({
          resource_id: '0xres123',
          digest: '0xghi',
        })),
      },
    }

    const options = {
      network: 'testnet',
      epochs: 365,
    }

    await deploy('/test/build', options, mock_context)

    // Should detect unchanged files and skip upload
    // Only upload bootstrap HTML (since file hashes match previous manifest)
    assert.ok(mock_context.walrus.upload_blob.mock.calls.length <= 2)

    // Should not call update_resource if files unchanged
    // (or call it sparingly if needed)
    assert.ok(mock_context.sui.update_resource.mock.calls.length <= 2)
  })

  it('should handle errors gracefully', async () => {
    const mock_context = {
      fs: {
        existsSync: () => false,
        readdirSync: () => {
          throw new Error('Directory not found')
        },
        statSync: () => ({ isFile: () => true, isDirectory: () => false }),
      },
    }

    const options = {
      network: 'testnet',
      epochs: 365,
    }

    await assert.rejects(
      async () => await deploy('/nonexistent', options, mock_context),
      { message: /Directory not found/ },
    )
  })
})
