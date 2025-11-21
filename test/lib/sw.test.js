import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { detect_service_worker } from '../../src/lib/sw.js'

describe('detect_service_worker', () => {
  it('should detect no service worker', async () => {
    const mock_fs = {
      existsSync: path => false,
      readFileSync: path => {
        throw new Error('File not found')
      },
    }

    const result = await detect_service_worker('/build/dir', mock_fs)

    assert.equal(result.type, 'none')
    assert.equal(result.path, null)
  })

  it('should detect Workbox service worker', async () => {
    const mock_fs = {
      existsSync: path => path === '/build/dir/sw.js',
      readFileSync: path => {
        if (path === '/build/dir/sw.js') {
          return Buffer.from(
            'importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.0.0/workbox-sw.js")',
          )
        }
        throw new Error('File not found')
      },
    }

    const result = await detect_service_worker('/build/dir', mock_fs)

    assert.equal(result.type, 'workbox')
    assert.equal(result.path, '/build/dir/sw.js')
  })

  it('should detect custom service worker', async () => {
    const mock_fs = {
      existsSync: path => path === '/build/dir/service-worker.js',
      readFileSync: path => {
        if (path === '/build/dir/service-worker.js') {
          return Buffer.from('self.addEventListener("fetch", event => {})')
        }
        throw new Error('File not found')
      },
    }

    const result = await detect_service_worker('/build/dir', mock_fs)

    assert.equal(result.type, 'custom')
    assert.equal(result.path, '/build/dir/service-worker.js')
  })

  it('should check multiple common service worker file names', async () => {
    const mock_fs = {
      existsSync: path => path === '/build/dir/service-worker.js',
      readFileSync: path => {
        if (path === '/build/dir/service-worker.js') {
          return Buffer.from('// Custom service worker')
        }
        throw new Error('File not found')
      },
    }

    const result = await detect_service_worker('/build/dir', mock_fs)

    assert.equal(result.type, 'custom')
    assert.equal(result.path, '/build/dir/service-worker.js')
  })

  it('should detect sw.js before service-worker.js', async () => {
    const mock_fs = {
      existsSync: path => {
        return (
          path === '/build/dir/sw.js' || path === '/build/dir/service-worker.js'
        )
      },
      readFileSync: path => {
        if (path === '/build/dir/sw.js') {
          return Buffer.from('// sw.js')
        }
        if (path === '/build/dir/service-worker.js') {
          return Buffer.from('// service-worker.js')
        }
        throw new Error('File not found')
      },
    }

    const result = await detect_service_worker('/build/dir', mock_fs)

    assert.equal(result.type, 'custom')
    assert.equal(result.path, '/build/dir/sw.js')
  })

  it('should return none type with null path when no sw found', async () => {
    const mock_fs = {
      existsSync: path => false,
      readFileSync: path => {
        throw new Error('File not found')
      },
    }

    const result = await detect_service_worker('/build/dir', mock_fs)

    assert.equal(result.type, 'none')
    assert.equal(result.path, null)
  })
})
