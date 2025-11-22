import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

import { query_owned_sites, format_sites_table } from '../../src/lib/sui.js'

describe('query_owned_sites', () => {
  it('should query Sui for owned Site objects', async () => {
    const mock_client = {
      getOwnedObjects: mock.fn(async () => ({
        data: [
          {
            data: {
              objectId: '0xabc123',
              content: {
                dataType: 'moveObject',
                type: '0x467::site::Site',
                fields: {
                  id: { id: '0xabc123' },
                  name: 'my-blog',
                },
              },
            },
          },
          {
            data: {
              objectId: '0xdef456',
              content: {
                dataType: 'moveObject',
                type: '0x467::site::Site',
                fields: {
                  id: { id: '0xdef456' },
                  name: 'landing-v2',
                },
              },
            },
          },
        ],
        hasNextPage: false,
      })),
      getDynamicFields: mock.fn(async (opts) => {
        if (opts.parentId === '0xabc123') {
          return { data: Array(42).fill({}), hasNextPage: false } // 42 resources
        }
        if (opts.parentId === '0xdef456') {
          return { data: Array(18).fill({}), hasNextPage: false } // 18 resources
        }
        return { data: [], hasNextPage: false }
      }),
    }

    const sites = await query_owned_sites(
      '0xuser123',
      '0x467::site::Site',
      mock_client,
    )

    assert.equal(sites.length, 2)
    assert.equal(sites[0].object_id, '0xabc123')
    assert.equal(sites[0].name, 'my-blog')
    assert.equal(sites[0].files_count, 42)
    assert.equal(sites[1].object_id, '0xdef456')
    assert.equal(sites[1].name, 'landing-v2')
    assert.equal(sites[1].files_count, 18)

    // Verify getOwnedObjects was called with correct params
    assert.equal(mock_client.getOwnedObjects.mock.calls.length, 1)
    const call_args = mock_client.getOwnedObjects.mock.calls[0].arguments[0]
    assert.equal(call_args.owner, '0xuser123')
    assert.equal(
      call_args.filter.StructType,
      '0x467::site::Site',
    )
  })

  it('should return empty array when no sites found', async () => {
    const mock_client = {
      getOwnedObjects: mock.fn(async () => ({
        data: [],
        hasNextPage: false,
      })),
    }

    const sites = await query_owned_sites(
      '0xuser123',
      '0x467::site::Site',
      mock_client,
    )

    assert.equal(sites.length, 0)
  })

  it('should handle pagination', async () => {
    let call_count = 0
    const mock_client = {
      getOwnedObjects: mock.fn(async (opts) => {
        call_count++
        if (call_count === 1) {
          return {
            data: [
              {
                data: {
                  objectId: '0xsite1',
                  content: {
                    dataType: 'moveObject',
                    type: '0x467::site::Site',
                    fields: { id: { id: '0xsite1' }, name: 'site1' },
                  },
                },
              },
            ],
            hasNextPage: true,
            nextCursor: 'cursor123',
          }
        } else {
          return {
            data: [
              {
                data: {
                  objectId: '0xsite2',
                  content: {
                    dataType: 'moveObject',
                    type: '0x467::site::Site',
                    fields: { id: { id: '0xsite2' }, name: 'site2' },
                  },
                },
              },
            ],
            hasNextPage: false,
          }
        }
      }),
      getDynamicFields: mock.fn(async () => ({
        data: [],
        hasNextPage: false,
      })),
    }

    const sites = await query_owned_sites(
      '0xuser123',
      '0x467::site::Site',
      mock_client,
    )

    assert.equal(sites.length, 2)
    assert.equal(sites[0].name, 'site1')
    assert.equal(sites[1].name, 'site2')
    assert.equal(mock_client.getOwnedObjects.mock.calls.length, 2)
  })
})

describe('format_sites_table', () => {
  it('should format sites into table string', () => {
    const sites = [
      {
        object_id: '0xabc123',
        name: 'my-blog',
        files_count: 42,
        total_size: 2400000, // 2.4 MB
        network: 'testnet',
      },
      {
        object_id: '0xdef456',
        name: 'landing-v2',
        files_count: 18,
        total_size: 856000, // 856 KB
        network: 'testnet',
      },
    ]

    const table_str = format_sites_table(sites, 'testnet')

    // Should contain site IDs (shortened)
    assert.match(table_str, /0xabc1\.\.\.123/)
    assert.match(table_str, /0xdef4\.\.\.456/)

    // Should contain names
    assert.match(table_str, /my-blog/)
    assert.match(table_str, /landing-v2/)

    // Should contain file counts
    assert.match(table_str, /42/)
    assert.match(table_str, /18/)

    // Should contain sizes
    assert.match(table_str, /2\.29 MB/)
    assert.match(table_str, /836 KB/)

    // Should contain network
    assert.match(table_str, /testnet/)

    // Should contain summary
    assert.match(table_str, /2 sites found on testnet/)
  })

  it('should return empty state message when no sites', () => {
    const table_str = format_sites_table([], 'testnet')

    assert.match(table_str, /No deployments found on testnet/)
    assert.match(table_str, /Run `versui deploy .\/dist` to get started/)
  })
})
