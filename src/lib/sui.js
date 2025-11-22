import { Transaction } from '@mysten/sui/transactions'
import Table from 'cli-table3'

/**
 * @typedef {Object} TransactionResult
 * @property {Uint8Array} tx_bytes - Transaction bytes
 * @property {string} tx_bytes_base64 - Base64 encoded transaction bytes
 */

/**
 * @typedef {Object} ResourceData
 * @property {string} path - Resource path (e.g., '/index.html')
 * @property {string} blob_id - Walrus blob ID
 * @property {string} blob_hash - SHA-256 hash of content
 * @property {string} content_type - MIME type
 * @property {number} size - File size in bytes
 * @property {string} [resource_id] - Resource object ID (for updates)
 * @property {Object<string, string>} [headers] - Custom HTTP headers
 */

// Versui package ID on testnet (env var can override for different networks)
const PACKAGE_ID =
  process.env.VERSUI_PACKAGE_ID ||
  '0xda3719ae702534b4181c5f2ddf2780744ee512dae7a5b22bce6b5fda4893471b'

/**
 * Build a transaction that creates a Site and all Resources
 * @param {string} name - Site name
 * @param {ResourceData[]} resources - Array of resources to create
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_deploy_transaction(
  name,
  resources,
  sender,
  client,
) {
  const tx = new Transaction()

  // Call create_site to get Site object
  const site = tx.moveCall({
    target: `${PACKAGE_ID}::site::create_site`,
    arguments: [tx.pure.string(name)],
  })

  // Create all resources
  for (const resource of resources) {
    tx.moveCall({
      target: `${PACKAGE_ID}::site::create_resource`,
      arguments: [
        site,
        tx.pure.string(resource.path),
        tx.pure.u256(BigInt(resource.blob_id)),
        tx.pure.vector(
          'u8',
          Array.from(Buffer.from(resource.blob_hash, 'hex')),
        ),
        tx.pure.string(resource.content_type),
        tx.pure.u64(resource.size),
      ],
    })
  }

  // Transfer Site to sender
  tx.transferObjects([site], sender)

  // Set sender
  tx.setSender(sender)

  // Build transaction bytes
  const tx_bytes = await tx.build({ client })

  return {
    tx_bytes,
    tx_bytes_base64: Buffer.from(tx_bytes).toString('base64'),
  }
}

/**
 * Build a transaction that updates existing Resources
 * @param {string} site_id - Site object ID
 * @param {ResourceData[]} resources - Resources to update
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_update_transaction(
  site_id,
  resources,
  sender,
  client,
) {
  const tx = new Transaction()

  // Update all resources
  for (const resource of resources) {
    tx.moveCall({
      target: `${PACKAGE_ID}::site::update_resource`,
      arguments: [
        tx.object(resource.resource_id),
        tx.pure.u256(BigInt(resource.blob_id)),
        tx.pure.vector(
          'u8',
          Array.from(Buffer.from(resource.blob_hash, 'hex')),
        ),
        tx.pure.u64(resource.size),
      ],
    })
  }

  // Set sender
  tx.setSender(sender)

  // Build transaction bytes
  const tx_bytes = await tx.build({ client })

  return {
    tx_bytes,
    tx_bytes_base64: Buffer.from(tx_bytes).toString('base64'),
  }
}

/**
 * Parse signature from sui keytool output
 * @param {string} output - Output from sui keytool sign
 * @returns {string} Signature
 */
export function extract_signature(output) {
  const match = output.match(/Serialized signature[^:]*:\s*([A-Za-z0-9+/=]+)/)
  if (!match) {
    throw new Error('Could not extract signature from sui keytool output')
  }
  return match[1]
}

/**
 * Parse object IDs from transaction execution output
 * @param {string} output - Output from sui client execute-signed-tx
 * @returns {string[]} Created object IDs
 */
export function extract_created_objects(output) {
  const object_ids = []
  // Match "ID: 0x..." pattern (works with both table format and simple format)
  const regex = /ID:\s*(0x[a-f0-9]+)/gi
  let match

  while ((match = regex.exec(output)) !== null) {
    object_ids.push(match[1])
  }

  return object_ids
}

/**
 * @typedef {Object} SiteObject
 * @property {string} object_id - Site object ID
 * @property {string} name - Site name
 * @property {number} files_count - Number of resources
 * @property {number} total_size - Total size in bytes
 * @property {string} network - Network (testnet/mainnet)
 */

/**
 * Query all Site objects owned by address
 * @param {string} owner - Owner address
 * @param {string} site_type - Site type (e.g., '0x467::site::Site')
 * @param {Object} client - Sui client
 * @returns {Promise<SiteObject[]>} Array of site objects
 */
export async function query_owned_sites(owner, site_type, client) {
  const sites = []
  let has_next_page = true
  let cursor = null

  // Pagination loop
  while (has_next_page) {
    const response = await client.getOwnedObjects({
      owner,
      filter: {
        StructType: site_type,
      },
      options: {
        showContent: true,
      },
      cursor,
    })

    // Process sites
    for (const item of response.data) {
      if (!item.data?.content) continue

      const { objectId, content } = item.data
      const { fields } = content

      // Query resource count (dynamic fields)
      const resources_response = await client.getDynamicFields({
        parentId: objectId,
      })

      sites.push({
        object_id: objectId,
        name: fields.name || 'Unnamed',
        files_count: resources_response.data.length,
        total_size: 0, // TODO: Calculate from resources
        network: '', // Will be set by caller
      })
    }

    has_next_page = response.hasNextPage
    cursor = response.nextCursor
  }

  return sites
}

/**
 * Format sites into CLI table
 * @param {SiteObject[]} sites - Array of sites
 * @param {string} network - Network name
 * @returns {string} Formatted table string
 */
export function format_sites_table(sites, network) {
  if (sites.length === 0) {
    return `No deployments found on ${network}.\n\nRun \`versui deploy ./dist\` to get started.`
  }

  const table = new Table({
    head: ['Site ID', 'Name', 'Files', 'Size'],
    colWidths: [18, 20, 8, 12],
  })

  for (const site of sites) {
    const short_id =
      site.object_id.slice(0, 6) + '...' + site.object_id.slice(-3)
    const size_str = format_bytes(site.total_size)

    table.push([short_id, site.name, site.files_count, size_str])
  }

  const summary = `\n  ${sites.length} site${sites.length === 1 ? '' : 's'} found`

  return table.toString() + summary
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes count
 * @returns {string} Formatted string (e.g., "1.2 MB")
 */
function format_bytes(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Build a transaction that deletes a Site object
 * Note: Site must have resource_count == 0 (all resources deleted first)
 * @param {string} site_id - Site object ID to delete
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_delete_transaction(site_id, sender, client) {
  const tx = new Transaction()

  // Call delete_site
  tx.moveCall({
    target: `${PACKAGE_ID}::site::delete_site`,
    arguments: [tx.object(site_id)],
  })

  // Set sender
  tx.setSender(sender)

  // Build transaction bytes
  const tx_bytes = await tx.build({ client })

  return {
    tx_bytes,
    tx_bytes_base64: Buffer.from(tx_bytes).toString('base64'),
  }
}
