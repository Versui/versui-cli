import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { generate_bootstrap_html } from '../../src/lib/bootstrap.js'

describe('generate_bootstrap_html', () => {
  it('should generate bootstrap HTML without service worker', () => {
    const config = {
      site_name: 'test-site',
      aggregator_url: 'https://aggregator.walrus-testnet.walrus.space',
      index_blob_id: 'test-blob-123',
      service_worker: {
        type: 'none',
        path: null,
      },
    }

    const html = generate_bootstrap_html(config)

    assert.ok(html.includes('<!DOCTYPE html>'))
    assert.ok(html.includes('test-site'))
    assert.ok(html.includes('test-blob-123'))
    assert.ok(html.includes('aggregator.walrus-testnet.walrus.space'))
    assert.ok(!html.includes('navigator.serviceWorker'))
  })

  it('should generate bootstrap HTML with Workbox service worker', () => {
    const config = {
      site_name: 'test-site',
      aggregator_url: 'https://aggregator.walrus-testnet.walrus.space',
      index_blob_id: 'test-blob-123',
      service_worker: {
        type: 'workbox',
        path: '/sw.js',
        blob_id: 'sw-blob-456',
      },
    }

    const html = generate_bootstrap_html(config)

    assert.ok(html.includes('<!DOCTYPE html>'))
    assert.ok(html.includes('navigator.serviceWorker'))
    assert.ok(html.includes('sw-blob-456'))
    assert.ok(html.includes('workbox'))
  })

  it('should generate bootstrap HTML with custom service worker', () => {
    const config = {
      site_name: 'test-site',
      aggregator_url: 'https://aggregator.walrus-testnet.walrus.space',
      index_blob_id: 'test-blob-123',
      service_worker: {
        type: 'custom',
        path: '/service-worker.js',
        blob_id: 'custom-sw-789',
      },
    }

    const html = generate_bootstrap_html(config)

    assert.ok(html.includes('<!DOCTYPE html>'))
    assert.ok(html.includes('navigator.serviceWorker'))
    assert.ok(html.includes('custom-sw-789'))
    assert.ok(!html.includes('workbox'))
  })

  it('should generate minimal HTML (target: under 3KB)', () => {
    const config = {
      site_name: 'test-site',
      aggregator_url: 'https://aggregator.walrus-testnet.walrus.space',
      index_blob_id: 'test-blob-123',
      service_worker: {
        type: 'none',
        path: null,
      },
    }

    const html = generate_bootstrap_html(config)
    const size_kb = Buffer.from(html).length / 1024

    // Allow 3KB buffer (target is 2KB, but allow some flexibility)
    assert.ok(
      size_kb < 3,
      `Bootstrap HTML size ${size_kb.toFixed(2)}KB exceeds 3KB limit`,
    )
  })

  it('should include error handling', () => {
    const config = {
      site_name: 'test-site',
      aggregator_url: 'https://aggregator.walrus-testnet.walrus.space',
      index_blob_id: 'test-blob-123',
      service_worker: {
        type: 'none',
        path: null,
      },
    }

    const html = generate_bootstrap_html(config)

    assert.ok(html.includes('catch'))
    assert.ok(html.includes('error'))
  })

  it('should escape site name to prevent XSS', () => {
    const config = {
      site_name: 'test<script>alert("xss")</script>',
      aggregator_url: 'https://aggregator.walrus-testnet.walrus.space',
      index_blob_id: 'test-blob-123',
      service_worker: {
        type: 'none',
        path: null,
      },
    }

    const html = generate_bootstrap_html(config)

    assert.ok(!html.includes('<script>alert("xss")</script>'))
    assert.ok(html.includes('&lt;script&gt;'))
  })
})
