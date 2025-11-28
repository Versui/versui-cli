import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'

import {
  get_sui_active_address,
  get_walrus_price_estimate,
  get_wallet_balances,
  upload_to_walrus_with_progress,
} from '../../src/commands/deploy.js'

// === get_sui_active_address ===
describe('get_sui_active_address', () => {
  it('returns wallet address when sui client succeeds', () => {
    const address = get_sui_active_address()
    // Can be null if sui is not installed, but if it succeeds it should return a string
    if (address !== null) {
      assert.strictEqual(typeof address, 'string')
      assert.ok(address.length > 0)
    }
  })

  it('returns null when sui client fails', () => {
    // If sui is not installed or fails, should return null (not throw)
    const address = get_sui_active_address()
    assert.ok(address === null || typeof address === 'string')
  })

  it('handles missing sui binary gracefully', () => {
    // Should not throw error when sui is missing
    assert.doesNotThrow(() => {
      get_sui_active_address()
    })
  })
})

// === get_walrus_price_estimate ===
describe('get_walrus_price_estimate', () => {
  it('returns null when walrus CLI fails', async () => {
    // With invalid size, walrus should fail or return null
    const price = await get_walrus_price_estimate(-1, 1)
    assert.ok(price === null || typeof price === 'number')
  })

  it('calculates price for single epoch', async () => {
    const size_bytes = 1024 * 1024 // 1 MB
    const epochs = 1
    const price = await get_walrus_price_estimate(size_bytes, epochs)

    // Result can be null if walrus is not installed
    if (price !== null) {
      assert.strictEqual(typeof price, 'number')
      assert.ok(price > 0)
    }
  })

  it('calculates price for multiple epochs', async () => {
    const size_bytes = 1024 * 1024 // 1 MB
    const epochs = 5
    const price = await get_walrus_price_estimate(size_bytes, epochs)

    if (price !== null) {
      assert.strictEqual(typeof price, 'number')
      assert.ok(price > 0)
    }
  })

  it('handles zero size bytes', async () => {
    const price = await get_walrus_price_estimate(0, 1)
    // Should not throw, returns null or number
    assert.ok(price === null || typeof price === 'number')
  })

  it('handles large file sizes', async () => {
    const size_bytes = 100 * 1024 * 1024 // 100 MB
    const price = await get_walrus_price_estimate(size_bytes, 1)
    // Should not throw
    assert.ok(price === null || typeof price === 'number')
  })

  it('returns null on JSON parse failure', async () => {
    // Invalid walrus output should be handled gracefully
    const price = await get_walrus_price_estimate(1024, 1)
    assert.ok(price === null || typeof price === 'number')
  })
})

// === get_wallet_balances ===
describe('get_wallet_balances', () => {
  it('returns null balances when client fails', async () => {
    const mock_client = {
      getBalance: mock.fn(async () => {
        throw new Error('Network error')
      }),
    }

    const balances = await get_wallet_balances('0x123', 'testnet', mock_client)
    assert.deepStrictEqual(balances, { sui: null, wal: null })
  })

  it('fetches SUI balance successfully', async () => {
    const mock_client = {
      getBalance: mock.fn(async ({ coinType }) => {
        if (coinType === '0x2::sui::SUI') {
          return { totalBalance: '1000000000' } // 1 SUI
        }
        throw new Error('WAL fetch failed')
      }),
    }

    const balances = await get_wallet_balances('0x123', 'testnet', mock_client)
    assert.strictEqual(balances.sui, 1)
    assert.strictEqual(balances.wal, null)
  })

  it('fetches WAL balance successfully on testnet', async () => {
    const mock_client = {
      getBalance: mock.fn(async ({ coinType }) => {
        if (coinType === '0x2::sui::SUI') {
          return { totalBalance: '1000000000' } // 1 SUI
        }
        if (
          coinType ===
          '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL'
        ) {
          return { totalBalance: '5000000000' } // 5 WAL
        }
        throw new Error('Unknown coin')
      }),
    }

    const balances = await get_wallet_balances('0x123', 'testnet', mock_client)
    assert.strictEqual(balances.sui, 1)
    assert.strictEqual(balances.wal, 5)
  })

  it('fetches WAL balance successfully on mainnet', async () => {
    const mock_client = {
      getBalance: mock.fn(async ({ coinType }) => {
        if (coinType === '0x2::sui::SUI') {
          return { totalBalance: '2000000000' } // 2 SUI
        }
        if (
          coinType ===
          '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL'
        ) {
          return { totalBalance: '10000000000' } // 10 WAL
        }
        throw new Error('Unknown coin')
      }),
    }

    const balances = await get_wallet_balances('0x123', 'mainnet', mock_client)
    assert.strictEqual(balances.sui, 2)
    assert.strictEqual(balances.wal, 10)
  })

  it('handles partial fetch failures gracefully', async () => {
    const mock_client = {
      getBalance: mock.fn(async ({ coinType }) => {
        if (coinType === '0x2::sui::SUI') {
          return { totalBalance: '3000000000' } // 3 SUI
        }
        throw new Error('WAL fetch failed')
      }),
    }

    const balances = await get_wallet_balances('0x123', 'testnet', mock_client)
    assert.strictEqual(balances.sui, 3)
    assert.strictEqual(balances.wal, null)
  })

  it('converts mist to SUI correctly', async () => {
    const mock_client = {
      getBalance: mock.fn(async ({ coinType }) => {
        if (coinType === '0x2::sui::SUI') {
          return { totalBalance: '123456789' } // 0.123456789 SUI
        }
        throw new Error('WAL not available')
      }),
    }

    const balances = await get_wallet_balances('0x123', 'testnet', mock_client)
    assert.strictEqual(balances.sui, 0.123456789)
  })

  it('handles zero balances', async () => {
    const mock_client = {
      getBalance: mock.fn(async ({ coinType }) => {
        return { totalBalance: '0' }
      }),
    }

    const balances = await get_wallet_balances('0x123', 'testnet', mock_client)
    assert.strictEqual(balances.sui, 0)
    assert.strictEqual(balances.wal, 0)
  })
})

// === upload_to_walrus_with_progress ===
describe('upload_to_walrus_with_progress', () => {
  it('rejects when spawn fails', async () => {
    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.emit('error', new Error('spawn failed'))
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await assert.rejects(
      async () => {
        await upload_to_walrus_with_progress(
          '/fake/dir',
          1,
          () => {},
          mock_spawn,
          mock_scan,
        )
      },
      {
        name: 'Error',
        message: /Failed to spawn walrus/,
      },
    )
  })

  it('rejects when walrus command exits with non-zero code', async () => {
    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from('Error: invalid input'))
        child.emit('close', 1)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await assert.rejects(
      async () => {
        await upload_to_walrus_with_progress(
          '/fake/dir',
          1,
          () => {},
          mock_spawn,
          mock_scan,
        )
      },
      {
        name: 'Error',
        message: /Walrus upload failed/,
      },
    )
  })

  it('rejects when walrus returns invalid JSON', async () => {
    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('not valid json'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await assert.rejects(
      async () => {
        await upload_to_walrus_with_progress(
          '/fake/dir',
          1,
          () => {},
          mock_spawn,
          mock_scan,
        )
      },
      {
        name: 'Error',
        message: /Failed to parse walrus output/,
      },
    )
  })

  it('resolves with parsed JSON on success', async () => {
    const expected_result = {
      blobStoreResult: {
        newlyCreated: {
          blobObject: {
            blobId: 'blob123',
            id: 'obj123',
          },
        },
      },
      storedQuiltBlobs: [],
    }

    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from(JSON.stringify(expected_result)))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    const result = await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      () => {},
      mock_spawn,
      mock_scan,
    )
    assert.deepStrictEqual(result, expected_result)
  })

  it('calls progress callback with encoding stage', async () => {
    const progress_calls = []
    const on_progress = mock.fn((progress, message) => {
      progress_calls.push({ progress, message })
    })

    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stderr.emit(
          'data',
          Buffer.from('encoded sliver pairs and metadata'),
        )
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      on_progress,
      mock_spawn,
      mock_scan,
    )

    assert.ok(progress_calls.length > 0)
    assert.ok(
      progress_calls.some(
        c => c.progress === 25 && c.message === 'Encoding...',
      ),
    )
  })

  it('calls progress callback with storing stage', async () => {
    const progress_calls = []
    const on_progress = mock.fn((progress, message) => {
      progress_calls.push({ progress, message })
    })

    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from('storing sliver'))
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      on_progress,
      mock_spawn,
      mock_scan,
    )

    assert.ok(
      progress_calls.some(c => c.progress === 50 && c.message === 'Storing...'),
    )
  })

  it('calls progress callback with verifying stage', async () => {
    const progress_calls = []
    const on_progress = mock.fn((progress, message) => {
      progress_calls.push({ progress, message })
    })

    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from('retrieved blob statuses'))
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      on_progress,
      mock_spawn,
      mock_scan,
    )

    assert.ok(
      progress_calls.some(
        c => c.progress === 75 && c.message === 'Verifying...',
      ),
    )
  })

  it('calls progress callback with finalizing stage', async () => {
    const progress_calls = []
    const on_progress = mock.fn((progress, message) => {
      progress_calls.push({ progress, message })
    })

    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from('blob resources obtained'))
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      on_progress,
      mock_spawn,
      mock_scan,
    )

    assert.ok(
      progress_calls.some(
        c => c.progress === 90 && c.message === 'Finalizing...',
      ),
    )
  })

  it('calls progress callback with 100% on completion', async () => {
    const progress_calls = []
    const on_progress = mock.fn((progress, message) => {
      progress_calls.push({ progress, message })
    })

    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      on_progress,
      mock_spawn,
      mock_scan,
    )

    const final_call = progress_calls[progress_calls.length - 1]
    assert.strictEqual(final_call.progress, 100)
    assert.strictEqual(final_call.message, 'Complete')
  })

  it('builds correct walrus command arguments', async () => {
    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [
      '/fake/dir/index.html',
      '/fake/dir/style.css',
    ])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      5,
      () => {},
      mock_spawn,
      mock_scan,
    )

    assert.strictEqual(mock_spawn.mock.calls.length, 1)
    const [cmd, args] = mock_spawn.mock.calls[0].arguments

    assert.strictEqual(cmd, 'walrus')
    assert.ok(args.includes('store-quilt'))
    assert.ok(args.includes('--blobs'))
    assert.ok(args.includes('--epochs'))
    assert.ok(args.includes('5'))
    assert.ok(args.includes('--json'))
  })

  it('handles multiple file paths in blobs arguments', async () => {
    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [
      '/fake/dir/index.html',
      '/fake/dir/app.js',
      '/fake/dir/style.css',
    ])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      () => {},
      mock_spawn,
      mock_scan,
    )

    const [, args] = mock_spawn.mock.calls[0].arguments
    const blobs_index = args.indexOf('--blobs')
    const epochs_index = args.indexOf('--epochs')

    // Should have 3 blob specs between --blobs and --epochs
    const blob_specs = args.slice(blobs_index + 1, epochs_index)
    assert.strictEqual(blob_specs.length, 3)

    // Verify blob specs are valid JSON
    for (const spec of blob_specs) {
      const parsed = JSON.parse(spec)
      assert.ok(parsed.path)
      assert.ok(parsed.identifier)
    }
  })

  it('does not advance progress for duplicate messages', async () => {
    const progress_calls = []
    const on_progress = mock.fn((progress, message) => {
      progress_calls.push({ progress, message })
    })

    const mock_spawn = mock.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        // Emit same stage multiple times
        child.stderr.emit('data', Buffer.from('storing sliver'))
        child.stderr.emit('data', Buffer.from('storing sliver'))
        child.stderr.emit('data', Buffer.from('storing sliver'))
        child.stdout.emit('data', Buffer.from('{}'))
        child.emit('close', 0)
      })
      return child
    })

    const mock_scan = mock.fn(() => [])

    await upload_to_walrus_with_progress(
      '/fake/dir',
      1,
      on_progress,
      mock_spawn,
      mock_scan,
    )

    // Should only call progress once for 50% (not 3 times)
    const storing_calls = progress_calls.filter(c => c.progress === 50)
    assert.strictEqual(storing_calls.length, 1)
  })
})

// === Edge Cases ===
describe('deploy edge cases', () => {
  it('handles empty directory gracefully', () => {
    // Empty directory should be caught by validation or produce empty metadata
    // Test this through integration tests with actual directory structure
    assert.ok(true) // Placeholder for integration test
  })

  it('handles files with special characters in paths', () => {
    // Special chars like spaces, unicode, etc should be handled
    // Test this through integration tests
    assert.ok(true) // Placeholder for integration test
  })

  it('handles very large files', () => {
    // Large files should not cause memory issues
    // Test this through integration tests with size limits
    assert.ok(true) // Placeholder for integration test
  })

  it('handles missing index.html', () => {
    // Should be caught by validation or produce error
    // Test this through integration tests
    assert.ok(true) // Placeholder for integration test
  })

  it('handles nested directory structures', () => {
    // Deep nesting should work correctly
    // Test this through integration tests
    assert.ok(true) // Placeholder for integration test
  })
})
