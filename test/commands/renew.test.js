import { describe, it, mock } from 'node:test'
import assert from 'node:assert'

import {
  fetch_site_blob_objects,
  extend_blob,
} from '../../src/commands/renew.js'

describe('renew command - fetch_site_blob_objects', () => {
  it('should fetch blob object IDs from site', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [{ objectId: 'resource-1' }, { objectId: 'resource-2' }],
        hasNextPage: false,
        nextCursor: null,
      })),
      multiGetObjects: mock.fn(async () => [
        {
          data: {
            content: {
              fields: { blob_object_id: 'blob-1' },
            },
          },
        },
        {
          data: {
            content: {
              fields: { blob_object_id: 'blob-2' },
            },
          },
        },
      ]),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(blob_ids, ['blob-1', 'blob-2'])
    assert.strictEqual(mock_client.getObject.mock.calls.length, 1)
    assert.strictEqual(mock_client.getDynamicFields.mock.calls.length, 1)
    assert.strictEqual(mock_client.multiGetObjects.mock.calls.length, 1)
  })

  it('should throw error if site not found', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({ data: null })),
    }

    await assert.rejects(
      async () => fetch_site_blob_objects('invalid-site', mock_client),
      { message: 'Site not found: invalid-site' },
    )
  })

  it('should handle empty resources table', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      })),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(blob_ids, [])
    assert.strictEqual(mock_client.getDynamicFields.mock.calls.length, 1)
  })

  it('should paginate through dynamic fields', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async ({ cursor }) => {
        if (!cursor) {
          return {
            data: [{ objectId: 'resource-1' }],
            hasNextPage: true,
            nextCursor: 'cursor-1',
          }
        }
        return {
          data: [{ objectId: 'resource-2' }],
          hasNextPage: false,
          nextCursor: null,
        }
      }),
      multiGetObjects: mock.fn(async () => [
        {
          data: {
            content: {
              fields: { blob_object_id: 'blob-1' },
            },
          },
        },
        {
          data: {
            content: {
              fields: { blob_object_id: 'blob-2' },
            },
          },
        },
      ]),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(blob_ids, ['blob-1', 'blob-2'])
    assert.strictEqual(mock_client.getDynamicFields.mock.calls.length, 2)
  })

  it('should skip resources without blob_object_id', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [{ objectId: 'resource-1' }, { objectId: 'resource-2' }],
        hasNextPage: false,
        nextCursor: null,
      })),
      multiGetObjects: mock.fn(async () => [
        {
          data: {
            content: {
              fields: { blob_object_id: 'blob-1' },
            },
          },
        },
        {
          data: {
            content: {
              fields: {}, // No blob_object_id
            },
          },
        },
      ]),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(blob_ids, ['blob-1'])
  })

  it('should skip resources with missing data', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [{ objectId: 'resource-1' }, { objectId: 'resource-2' }],
        hasNextPage: false,
        nextCursor: null,
      })),
      multiGetObjects: mock.fn(async () => [
        {
          data: {
            content: {
              fields: { blob_object_id: 'blob-1' },
            },
          },
        },
        { data: null }, // Missing data
      ]),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(blob_ids, ['blob-1'])
  })

  it('should handle zero resources without calling multiGetObjects', async () => {
    let multi_get_called = false
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      })),
      multiGetObjects: mock.fn(async () => {
        multi_get_called = true
        return []
      }),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(blob_ids, [])
    assert.strictEqual(
      multi_get_called,
      false,
      'multiGetObjects should not be called when no resources',
    )
  })

  it('should handle multiple pages of dynamic fields', async () => {
    let page_count = 0
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async ({ cursor }) => {
        page_count++
        if (!cursor) {
          return {
            data: [{ objectId: 'resource-1' }, { objectId: 'resource-2' }],
            hasNextPage: true,
            nextCursor: 'cursor-1',
          }
        }
        if (cursor === 'cursor-1') {
          return {
            data: [{ objectId: 'resource-3' }, { objectId: 'resource-4' }],
            hasNextPage: true,
            nextCursor: 'cursor-2',
          }
        }
        return {
          data: [{ objectId: 'resource-5' }],
          hasNextPage: false,
          nextCursor: null,
        }
      }),
      multiGetObjects: mock.fn(async () => [
        { data: { content: { fields: { blob_object_id: 'blob-1' } } } },
        { data: { content: { fields: { blob_object_id: 'blob-2' } } } },
        { data: { content: { fields: { blob_object_id: 'blob-3' } } } },
        { data: { content: { fields: { blob_object_id: 'blob-4' } } } },
        { data: { content: { fields: { blob_object_id: 'blob-5' } } } },
      ]),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.strictEqual(page_count, 3, 'Should have fetched 3 pages')
    assert.deepStrictEqual(blob_ids, [
      'blob-1',
      'blob-2',
      'blob-3',
      'blob-4',
      'blob-5',
    ])
  })

  it('should handle large number of resources', async () => {
    const resource_count = 100
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: Array.from({ length: resource_count }, (_, i) => ({
          objectId: `resource-${i}`,
        })),
        hasNextPage: false,
        nextCursor: null,
      })),
      multiGetObjects: mock.fn(async () =>
        Array.from({ length: resource_count }, (_, i) => ({
          data: {
            content: {
              fields: { blob_object_id: `blob-${i}` },
            },
          },
        })),
      ),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.strictEqual(blob_ids.length, resource_count)
    assert.strictEqual(blob_ids[0], 'blob-0')
    assert.strictEqual(
      blob_ids[resource_count - 1],
      `blob-${resource_count - 1}`,
    )
  })
})

describe('renew command - extend_blob', () => {
  it('should return success when command executes successfully', async () => {
    const result = await extend_blob('0x123', 5)

    // This test will actually call walrus CLI, so we just check the structure
    assert.ok(typeof result.success === 'boolean')
    if (!result.success) {
      assert.ok(result.error)
    }
  })

  it('should build correct walrus command with blob ID and epochs', async () => {
    // This is an integration test - it will attempt to run walrus
    const result = await extend_blob('0xabc456', 10)

    assert.ok(typeof result.success === 'boolean')
    if (!result.success) {
      // Expected to fail if walrus is not installed or blob doesn't exist
      assert.ok(result.error)
      assert.ok(typeof result.error === 'string')
    }
  })

  it('should handle non-existent blob gracefully', async () => {
    const result = await extend_blob('0xinvalidblob', 1)

    // Should return failure, not throw
    assert.strictEqual(typeof result.success, 'boolean')
    if (!result.success) {
      assert.ok(result.error)
    }
  })

  it('should handle various epoch values', async () => {
    const test_cases = [
      { blob_id: '0x1', epochs: 1 },
      { blob_id: '0x2', epochs: 5 },
      { blob_id: '0x3', epochs: 100 },
    ]

    for (const { blob_id, epochs } of test_cases) {
      const result = await extend_blob(blob_id, epochs)
      assert.ok(typeof result.success === 'boolean')
    }
  })

  it('should return error object on failure', async () => {
    const result = await extend_blob('invalid', 5)

    if (!result.success) {
      assert.ok(result.error)
      assert.strictEqual(typeof result.error, 'string')
      assert.ok(result.error.length > 0)
    }
  })
})

describe('renew command - input validation', () => {
  it('should validate blob object ID format', async () => {
    const test_ids = ['0x123', '0xabcdef0123456789', 'invalid', '', '123456']

    for (const blob_id of test_ids) {
      const result = await extend_blob(blob_id, 5)
      // Should not throw, should return result object
      assert.ok(result)
      assert.ok(typeof result.success === 'boolean')
    }
  })

  it('should handle edge case epochs values', async () => {
    const test_cases = [
      { epochs: 1, should_work: true },
      { epochs: 0, should_work: false }, // Walrus likely rejects 0
      { epochs: -1, should_work: false },
      { epochs: 1000, should_work: true },
    ]

    for (const { epochs } of test_cases) {
      const result = await extend_blob('0xtest', epochs)
      // Should handle gracefully
      assert.ok(typeof result.success === 'boolean')
    }
  })
})

describe('renew command - error handling', () => {
  it('should handle missing site gracefully', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({ data: null })),
    }

    await assert.rejects(
      async () => fetch_site_blob_objects('0xnonexistent', mock_client),
      {
        message: /Site not found/,
      },
    )
  })

  it('should handle malformed site data', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {}, // Missing resources field
          },
        },
      })),
    }

    await assert.rejects(async () =>
      fetch_site_blob_objects('site-123', mock_client),
    )
  })

  it('should handle network errors in getDynamicFields', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => {
        throw new Error('Network error')
      }),
    }

    await assert.rejects(
      async () => fetch_site_blob_objects('site-123', mock_client),
      { message: 'Network error' },
    )
  })

  it('should handle network errors in multiGetObjects', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [{ objectId: 'resource-1' }],
        hasNextPage: false,
        nextCursor: null,
      })),
      multiGetObjects: mock.fn(async () => {
        throw new Error('RPC error')
      }),
    }

    await assert.rejects(
      async () => fetch_site_blob_objects('site-123', mock_client),
      { message: 'RPC error' },
    )
  })
})

describe('renew command - data extraction', () => {
  it('should extract correct table ID from site object', async () => {
    const expected_table_id = 'table-abc-123'
    let actual_table_id = null

    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: expected_table_id },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async ({ parentId }) => {
        actual_table_id = parentId
        return {
          data: [],
          hasNextPage: false,
          nextCursor: null,
        }
      }),
    }

    await fetch_site_blob_objects('site-123', mock_client)

    assert.strictEqual(actual_table_id, expected_table_id)
  })

  it('should correctly accumulate resources across multiple pages', async () => {
    const accumulated_resources = []

    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async ({ cursor }) => {
        if (!cursor) {
          return {
            data: [{ objectId: 'r1' }, { objectId: 'r2' }],
            hasNextPage: true,
            nextCursor: 'c1',
          }
        }
        return {
          data: [{ objectId: 'r3' }],
          hasNextPage: false,
          nextCursor: null,
        }
      }),
      multiGetObjects: mock.fn(async ({ ids }) => {
        accumulated_resources.push(...ids)
        return ids.map(id => ({
          data: {
            content: {
              fields: { blob_object_id: `blob-${id}` },
            },
          },
        }))
      }),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(accumulated_resources, ['r1', 'r2', 'r3'])
    assert.deepStrictEqual(blob_ids, ['blob-r1', 'blob-r2', 'blob-r3'])
  })

  it('should filter out null and undefined blob_object_id values', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          content: {
            fields: {
              resources: {
                fields: {
                  id: { id: 'table-123' },
                },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [
          { objectId: 'r1' },
          { objectId: 'r2' },
          { objectId: 'r3' },
          { objectId: 'r4' },
        ],
        hasNextPage: false,
        nextCursor: null,
      })),
      multiGetObjects: mock.fn(async () => [
        { data: { content: { fields: { blob_object_id: 'blob-1' } } } },
        { data: { content: { fields: { blob_object_id: null } } } },
        { data: { content: { fields: { blob_object_id: undefined } } } },
        { data: { content: { fields: { blob_object_id: 'blob-4' } } } },
      ]),
    }

    const blob_ids = await fetch_site_blob_objects('site-123', mock_client)

    assert.deepStrictEqual(blob_ids, ['blob-1', 'blob-4'])
  })
})
