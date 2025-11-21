import { Transaction } from '@mysten/sui/transactions'

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
 * @property {Object<string, string>} [headers] - Custom HTTP headers
 */

// Versui package ID on testnet (env var can override for different networks)
const PACKAGE_ID =
  process.env.VERSUI_PACKAGE_ID ||
  '0x467c6f31d1aa8ff0ad6460f60b5733605683bbef47bf148d9b7b37967f4b4b46'

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
