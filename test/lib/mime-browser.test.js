import { describe, test } from 'node:test'
import assert from 'node:assert'

import { MIME_TYPES_BROWSER } from '../../src/lib/mime-browser.js'

describe('MIME_TYPES_BROWSER', () => {
  test('should export MIME_TYPES_BROWSER object', () => {
    assert.ok(typeof MIME_TYPES_BROWSER === 'object')
    assert.ok(MIME_TYPES_BROWSER !== null)
  })

  test('should contain common web extensions', () => {
    const expected_extensions = [
      '.js',
      '.css',
      '.html',
      '.json',
      '.svg',
      '.png',
      '.jpg',
    ]

    for (const ext of expected_extensions) {
      assert.ok(ext in MIME_TYPES_BROWSER, `Should contain ${ext} extension`)
    }
  })

  test('should map .js to text/javascript', () => {
    assert.strictEqual(MIME_TYPES_BROWSER['.js'], 'text/javascript')
  })

  test('should map .css to text/css', () => {
    assert.strictEqual(MIME_TYPES_BROWSER['.css'], 'text/css')
  })

  test('should map .html to text/html', () => {
    assert.strictEqual(MIME_TYPES_BROWSER['.html'], 'text/html')
  })

  test('should map .json to application/json', () => {
    assert.strictEqual(MIME_TYPES_BROWSER['.json'], 'application/json')
  })

  test('should map image extensions correctly', () => {
    assert.strictEqual(MIME_TYPES_BROWSER['.png'], 'image/png')
    assert.strictEqual(MIME_TYPES_BROWSER['.jpg'], 'image/jpeg')
    assert.strictEqual(MIME_TYPES_BROWSER['.svg'], 'image/svg+xml')
  })

  test('should map font extensions correctly', () => {
    assert.strictEqual(MIME_TYPES_BROWSER['.woff2'], 'font/woff2')
    assert.strictEqual(MIME_TYPES_BROWSER['.ttf'], 'font/ttf')
  })
})
