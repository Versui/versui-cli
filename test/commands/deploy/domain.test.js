import { describe, test } from 'node:test'
import assert from 'node:assert'

import {
  validate_suins_domain,
  link_domain_to_site,
  parse_domain_name,
} from '../../../src/commands/deploy/domain.js'

describe('parse_domain_name', () => {
  test('should parse valid .sui domain', () => {
    const result = parse_domain_name('mysite.sui')
    assert.strictEqual(result.name, 'mysite')
    assert.strictEqual(result.tld, 'sui')
    assert.strictEqual(result.full, 'mysite.sui')
  })

  test('should reject domain without .sui extension', () => {
    assert.throws(() => parse_domain_name('mysite.com'), /must end with .sui/)
  })

  test('should reject empty domain', () => {
    assert.throws(() => parse_domain_name(''), /Domain cannot be empty/)
  })

  test('should reject domain with only .sui', () => {
    assert.throws(
      () => parse_domain_name('.sui'),
      /Domain name cannot be empty/,
    )
  })

  test('should reject invalid characters', () => {
    assert.throws(() => parse_domain_name('my_site.sui'), /can only contain/)
  })

  test('should accept hyphenated domains', () => {
    const result = parse_domain_name('my-site.sui')
    assert.strictEqual(result.name, 'my-site')
  })

  test('should accept numeric domains', () => {
    const result = parse_domain_name('site123.sui')
    assert.strictEqual(result.name, 'site123')
  })
})

describe('validate_suins_domain', () => {
  test('should validate domain ownership with mock client', async () => {
    const mock_client = {
      getOwnedNameRecords: async () => ({
        data: [
          {
            name: 'mysite',
            expiration_timestamp_ms: Date.now() + 1000000,
          },
        ],
      }),
    }

    const result = await validate_suins_domain(
      'mysite.sui',
      '0x123',
      mock_client,
    )

    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.owned, true)
    assert.strictEqual(result.expired, false)
  })

  test('should detect domain not owned by wallet', async () => {
    const mock_client = {
      getOwnedNameRecords: async () => ({
        data: [
          {
            name: 'othersite',
            expiration_timestamp_ms: Date.now() + 1000000,
          },
        ],
      }),
    }

    const result = await validate_suins_domain(
      'mysite.sui',
      '0x123',
      mock_client,
    )

    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.owned, false)
    assert.match(result.error, /not owned by wallet/)
  })

  test('should detect expired domain', async () => {
    const mock_client = {
      getOwnedNameRecords: async () => ({
        data: [
          {
            name: 'mysite',
            expiration_timestamp_ms: Date.now() - 1000000, // Expired
          },
        ],
      }),
    }

    const result = await validate_suins_domain(
      'mysite.sui',
      '0x123',
      mock_client,
    )

    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.expired, true)
    assert.match(result.error, /has expired/)
  })

  test('should handle client errors gracefully', async () => {
    const mock_client = {
      getOwnedNameRecords: async () => {
        throw new Error('Network error')
      },
    }

    const result = await validate_suins_domain(
      'mysite.sui',
      '0x123',
      mock_client,
    )

    assert.strictEqual(result.valid, false)
    assert.match(result.error, /Failed to validate/)
  })
})

describe('link_domain_to_site', () => {
  test('should create transaction with setUserData call', () => {
    const params = {
      domain: 'mysite.sui',
      site_id:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      wallet:
        '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4',
      suins_package_id:
        '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0',
    }

    const tx = link_domain_to_site(params)

    assert.ok(tx)
    assert.ok(typeof tx === 'object')
    // Transaction is opaque, verify it was created without throwing
  })

  test('should throw on invalid site_id format', () => {
    const params = {
      domain: 'mysite.sui',
      site_id: 'invalid',
      wallet:
        '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4',
      suins_package_id:
        '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0',
    }

    assert.throws(() => link_domain_to_site(params), /Invalid site_id format/)
  })

  test('should throw on invalid wallet format', () => {
    const params = {
      domain: 'mysite.sui',
      site_id:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      wallet: 'invalid',
      suins_package_id:
        '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0',
    }

    assert.throws(() => link_domain_to_site(params), /Invalid wallet format/)
  })
})
