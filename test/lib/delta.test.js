import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { compute_delta } from '../../src/lib/delta.js'

describe('compute_delta', () => {
  it('should detect all files as added on first deploy', () => {
    const current_files = {
      '/index.html': { hash: 'abc123', size: 1024, content_type: 'text/html' },
      '/style.css': { hash: 'def456', size: 512, content_type: 'text/css' },
    }
    const previous_manifest = null

    const result = compute_delta(current_files, previous_manifest)

    assert.equal(result.added.length, 2)
    assert.equal(result.modified.length, 0)
    assert.equal(result.removed.length, 0)
    assert.equal(result.unchanged.length, 0)
    assert.deepEqual(result.added, ['/index.html', '/style.css'])
  })

  it('should detect unchanged files', () => {
    const current_files = {
      '/index.html': { hash: 'abc123', size: 1024, content_type: 'text/html' },
      '/style.css': { hash: 'def456', size: 512, content_type: 'text/css' },
    }
    const previous_manifest = {
      version: 1,
      site_id: '0x123',
      deployed_at: '2025-01-01T00:00:00Z',
      resources: {
        '/index.html': {
          path: '/index.html',
          blob_id: 'blob1',
          blob_hash: 'abc123',
          size: 1024,
          content_type: 'text/html',
        },
        '/style.css': {
          path: '/style.css',
          blob_id: 'blob2',
          blob_hash: 'def456',
          size: 512,
          content_type: 'text/css',
        },
      },
    }

    const result = compute_delta(current_files, previous_manifest)

    assert.equal(result.added.length, 0)
    assert.equal(result.modified.length, 0)
    assert.equal(result.removed.length, 0)
    assert.equal(result.unchanged.length, 2)
    assert.deepEqual(result.unchanged, ['/index.html', '/style.css'])
  })

  it('should detect modified files', () => {
    const current_files = {
      '/index.html': {
        hash: 'NEW_HASH',
        size: 2048,
        content_type: 'text/html',
      },
      '/style.css': { hash: 'def456', size: 512, content_type: 'text/css' },
    }
    const previous_manifest = {
      version: 1,
      site_id: '0x123',
      deployed_at: '2025-01-01T00:00:00Z',
      resources: {
        '/index.html': {
          path: '/index.html',
          blob_id: 'blob1',
          blob_hash: 'abc123',
          size: 1024,
          content_type: 'text/html',
        },
        '/style.css': {
          path: '/style.css',
          blob_id: 'blob2',
          blob_hash: 'def456',
          size: 512,
          content_type: 'text/css',
        },
      },
    }

    const result = compute_delta(current_files, previous_manifest)

    assert.equal(result.added.length, 0)
    assert.equal(result.modified.length, 1)
    assert.equal(result.removed.length, 0)
    assert.equal(result.unchanged.length, 1)
    assert.deepEqual(result.modified, ['/index.html'])
    assert.deepEqual(result.unchanged, ['/style.css'])
  })

  it('should detect added files', () => {
    const current_files = {
      '/index.html': { hash: 'abc123', size: 1024, content_type: 'text/html' },
      '/style.css': { hash: 'def456', size: 512, content_type: 'text/css' },
      '/script.js': {
        hash: 'ghi789',
        size: 256,
        content_type: 'application/javascript',
      },
    }
    const previous_manifest = {
      version: 1,
      site_id: '0x123',
      deployed_at: '2025-01-01T00:00:00Z',
      resources: {
        '/index.html': {
          path: '/index.html',
          blob_id: 'blob1',
          blob_hash: 'abc123',
          size: 1024,
          content_type: 'text/html',
        },
        '/style.css': {
          path: '/style.css',
          blob_id: 'blob2',
          blob_hash: 'def456',
          size: 512,
          content_type: 'text/css',
        },
      },
    }

    const result = compute_delta(current_files, previous_manifest)

    assert.equal(result.added.length, 1)
    assert.equal(result.modified.length, 0)
    assert.equal(result.removed.length, 0)
    assert.equal(result.unchanged.length, 2)
    assert.deepEqual(result.added, ['/script.js'])
  })

  it('should detect removed files', () => {
    const current_files = {
      '/index.html': { hash: 'abc123', size: 1024, content_type: 'text/html' },
    }
    const previous_manifest = {
      version: 1,
      site_id: '0x123',
      deployed_at: '2025-01-01T00:00:00Z',
      resources: {
        '/index.html': {
          path: '/index.html',
          blob_id: 'blob1',
          blob_hash: 'abc123',
          size: 1024,
          content_type: 'text/html',
        },
        '/style.css': {
          path: '/style.css',
          blob_id: 'blob2',
          blob_hash: 'def456',
          size: 512,
          content_type: 'text/css',
        },
      },
    }

    const result = compute_delta(current_files, previous_manifest)

    assert.equal(result.added.length, 0)
    assert.equal(result.modified.length, 0)
    assert.equal(result.removed.length, 1)
    assert.equal(result.unchanged.length, 1)
    assert.deepEqual(result.removed, ['/style.css'])
  })

  it('should handle complex changes', () => {
    const current_files = {
      '/index.html': { hash: 'abc123', size: 1024, content_type: 'text/html' }, // unchanged
      '/style.css': {
        hash: 'NEW_CSS_HASH',
        size: 1024,
        content_type: 'text/css',
      }, // modified
      '/script.js': {
        hash: 'ghi789',
        size: 256,
        content_type: 'application/javascript',
      }, // added
      // /old.html removed
    }
    const previous_manifest = {
      version: 1,
      site_id: '0x123',
      deployed_at: '2025-01-01T00:00:00Z',
      resources: {
        '/index.html': {
          path: '/index.html',
          blob_id: 'blob1',
          blob_hash: 'abc123',
          size: 1024,
          content_type: 'text/html',
        },
        '/style.css': {
          path: '/style.css',
          blob_id: 'blob2',
          blob_hash: 'def456',
          size: 512,
          content_type: 'text/css',
        },
        '/old.html': {
          path: '/old.html',
          blob_id: 'blob3',
          blob_hash: 'old123',
          size: 2048,
          content_type: 'text/html',
        },
      },
    }

    const result = compute_delta(current_files, previous_manifest)

    assert.equal(result.added.length, 1)
    assert.equal(result.modified.length, 1)
    assert.equal(result.removed.length, 1)
    assert.equal(result.unchanged.length, 1)
    assert.deepEqual(result.added, ['/script.js'])
    assert.deepEqual(result.modified, ['/style.css'])
    assert.deepEqual(result.removed, ['/old.html'])
    assert.deepEqual(result.unchanged, ['/index.html'])
  })
})
