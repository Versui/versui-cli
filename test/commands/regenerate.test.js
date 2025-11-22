import { describe, test, mock } from 'node:test'
import assert from 'node:assert'

import { regenerate } from '../../src/commands/regenerate.js'

describe('regenerate', () => {
  test('should fetch site data from Sui', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          objectId: '0xsite123',
          content: {
            dataType: 'moveObject',
            fields: {
              name: 'My Site',
              resources: {
                type: '0x2::table::Table',
                fields: { id: { id: '0xtable123' } },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [
          {
            name: { value: '/index.html' },
            objectId: '0xres1',
          },
          {
            name: { value: '/style.css' },
            objectId: '0xres2',
          },
        ],
        hasNextPage: false,
      })),
      multiGetObjects: mock.fn(async () => [
        {
          data: {
            content: {
              fields: {
                path: '/index.html',
                blob_hash: 'patch123',
                content_type: 'text/html',
                size: '1234',
              },
            },
          },
        },
        {
          data: {
            content: {
              fields: {
                path: '/style.css',
                blob_hash: 'patch456',
                content_type: 'text/css',
                size: '567',
              },
            },
          },
        },
      ]),
    }

    // Mock prompts to select bootstrap
    const mock_prompts = mock.fn(async () => ({ output_type: 'bootstrap' }))

    const result = await regenerate('0xsite123', {
      network: 'testnet',
      client: mock_client,
      prompts_fn: mock_prompts,
    })

    assert.ok(result.site_name)
    assert.ok(result.resource_map)
    assert.ok(result.output_type)
    assert.strictEqual(mock_client.getObject.mock.calls.length, 1)
  })

  test('should generate bootstrap output when selected', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          objectId: '0xsite123',
          content: {
            dataType: 'moveObject',
            fields: {
              name: 'My Site',
              resources: {
                type: '0x2::table::Table',
                fields: { id: { id: '0xtable123' } },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [],
        hasNextPage: false,
      })),
      multiGetObjects: mock.fn(async () => []),
    }

    const mock_prompts = mock.fn(async () => ({ output_type: 'bootstrap' }))

    const result = await regenerate('0xsite123', {
      network: 'testnet',
      client: mock_client,
      prompts_fn: mock_prompts,
    })

    assert.strictEqual(result.output_type, 'bootstrap')
    assert.ok(result.bootstrap_html)
    assert.ok(result.bootstrap_sw)
  })

  test('should generate SW snippet when selected', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: {
          objectId: '0xsite123',
          content: {
            dataType: 'moveObject',
            fields: {
              name: 'My Site',
              resources: {
                type: '0x2::table::Table',
                fields: { id: { id: '0xtable123' } },
              },
            },
          },
        },
      })),
      getDynamicFields: mock.fn(async () => ({
        data: [],
        hasNextPage: false,
      })),
      multiGetObjects: mock.fn(async () => []),
    }

    const mock_prompts = mock.fn(async () => ({ output_type: 'sw' }))

    const result = await regenerate('0xsite123', {
      network: 'testnet',
      client: mock_client,
      prompts_fn: mock_prompts,
    })

    assert.strictEqual(result.output_type, 'sw')
    assert.ok(result.sw_snippet)
  })

  test('should throw error when site not found', async () => {
    const mock_client = {
      getObject: mock.fn(async () => ({
        data: null,
      })),
    }

    await assert.rejects(
      async () => {
        await regenerate('0xnonexistent', {
          network: 'testnet',
          client: mock_client,
        })
      },
      {
        message: /Site not found/,
      },
    )
  })
})
