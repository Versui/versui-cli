import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  create_site,
  create_resource,
  update_resource,
} from '../../src/lib/sui.js'

describe('create_site', () => {
  it('should create site object', async () => {
    const mock_client = {
      signAndExecuteTransaction: async tx => ({
        digest: '0xabc123',
        effects: {
          created: [
            {
              reference: { objectId: '0xsite123' },
            },
          ],
        },
      }),
    }

    const result = await create_site('my-site', mock_client)

    assert.equal(result.site_id, '0xsite123')
    assert.equal(result.digest, '0xabc123')
  })

  it('should throw on transaction failure', async () => {
    const mock_client = {
      signAndExecuteTransaction: async tx => {
        throw new Error('Transaction failed')
      },
    }

    await assert.rejects(
      async () => await create_site('my-site', mock_client),
      { message: /Failed to create site/ },
    )
  })
})

describe('create_resource', () => {
  it('should create resource object', async () => {
    const mock_client = {
      signAndExecuteTransaction: async tx => ({
        digest: '0xdef456',
        effects: {
          created: [
            {
              reference: { objectId: '0xresource123' },
            },
          ],
        },
      }),
    }

    const resource_data = {
      path: '/index.html',
      blob_id: 'blob_xyz',
      blob_hash: 'abc123',
      content_type: 'text/html',
      size: 1024,
    }

    const result = await create_resource(
      '0xsite123',
      resource_data,
      mock_client,
    )

    assert.equal(result.resource_id, '0xresource123')
    assert.equal(result.digest, '0xdef456')
  })

  it('should throw on transaction failure', async () => {
    const mock_client = {
      signAndExecuteTransaction: async tx => {
        throw new Error('Transaction failed')
      },
    }

    const resource_data = {
      path: '/index.html',
      blob_id: 'blob_xyz',
      blob_hash: 'abc123',
      content_type: 'text/html',
      size: 1024,
    }

    await assert.rejects(
      async () =>
        await create_resource('0xsite123', resource_data, mock_client),
      { message: /Failed to create resource/ },
    )
  })
})

describe('update_resource', () => {
  it('should update resource object', async () => {
    const mock_client = {
      signAndExecuteTransaction: async tx => ({
        digest: '0xghi789',
        effects: {
          mutated: [
            {
              reference: { objectId: '0xresource123' },
            },
          ],
        },
      }),
    }

    const resource_data = {
      blob_id: 'blob_new',
      blob_hash: 'def456',
      size: 2048,
    }

    const result = await update_resource(
      '0xresource123',
      resource_data,
      mock_client,
    )

    assert.equal(result.resource_id, '0xresource123')
    assert.equal(result.digest, '0xghi789')
  })

  it('should throw on transaction failure', async () => {
    const mock_client = {
      signAndExecuteTransaction: async tx => {
        throw new Error('Transaction failed')
      },
    }

    const resource_data = {
      blob_id: 'blob_new',
      blob_hash: 'def456',
      size: 2048,
    }

    await assert.rejects(
      async () =>
        await update_resource('0xresource123', resource_data, mock_client),
      { message: /Failed to update resource/ },
    )
  })
})
