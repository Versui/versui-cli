import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { build_delete_transaction } from '../../src/lib/sui.js'

describe('build_delete_transaction', () => {
  it('should export build_delete_transaction function', () => {
    assert.equal(typeof build_delete_transaction, 'function')
  })

  it('should accept site_id, sender, and client parameters', () => {
    // Verify function signature (3 parameters)
    assert.equal(build_delete_transaction.length, 3)
  })
})
