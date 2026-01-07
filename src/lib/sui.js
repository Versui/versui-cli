import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { deriveObjectID, normalizeSuiAddress } from '@mysten/sui/utils'
import chalk from 'chalk'

import { encode_base36 } from './base36.js'
import {
  get_versui_package_id,
  get_versui_registry_id,
  get_version_object_id,
} from './env.js'

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

/**
 * Build a transaction that creates a Site (step 1 of deployment)
 * Returns AdminCap to sender, creates shared Site object
 * @param {string} name - Site name
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_create_site_transaction(
  name,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const versui_object_id = get_versui_registry_id(network)
  if (!versui_object_id) {
    throw new Error(`Versui registry not deployed on ${network}`)
  }

  const tx = new Transaction()

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // Call create_site (returns AdminCap to sender, shares Site)
  tx.moveCall({
    target: `${package_id}::site::create_site`,
    arguments: [
      tx.object(version_id),
      tx.object(versui_object_id),
      tx.pure.string(name),
      tx.pure.string(''), // favicon_url (empty string default)
    ],
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

/**
 * Build a transaction that adds resources to a Site (step 2 of deployment)
 * Requires AdminCap and shared Site ID from step 1
 * @param {string} admin_cap_id - AdminCap object ID
 * @param {string} site_id - Shared Site object ID
 * @param {string} site_version - Site object version from step 1
 * @param {ResourceData[]} resources - Array of resources to add
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_add_resources_transaction(
  admin_cap_id,
  site_id,
  site_version,
  resources,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const tx = new Transaction()

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // Add all resources
  for (const resource of resources) {
    tx.moveCall({
      target: `${package_id}::site::add_resource`,
      arguments: [
        tx.object(version_id),
        tx.object(admin_cap_id), // AdminCap reference (owned object)
        tx.sharedObjectRef({
          objectId: site_id,
          initialSharedVersion: site_version,
          mutable: true,
        }), // Shared Site reference (mutable shared object)
        tx.pure.string(resource.path),
        tx.pure.string(resource.blob_id),
        tx.pure.vector(
          'u8',
          Array.from(Buffer.from(resource.blob_hash, 'hex')),
        ),
        tx.pure.string(resource.content_type),
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
 * Build a transaction that updates existing Resources
 * @param {string} admin_cap_id - AdminCap object ID
 * @param {string} site_id - Shared Site object ID
 * @param {string} site_version - Current Site object version
 * @param {ResourceData[]} resources - Resources to update (must include path)
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_update_transaction(
  admin_cap_id,
  site_id,
  site_version,
  resources,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const tx = new Transaction()

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // Update all resources
  for (const resource of resources) {
    tx.moveCall({
      target: `${package_id}::site::update_resource`,
      arguments: [
        tx.object(version_id),
        tx.object(admin_cap_id), // AdminCap reference (owned object)
        tx.sharedObjectRef({
          objectId: site_id,
          initialSharedVersion: site_version,
          mutable: true,
        }), // Shared Site reference (mutable shared object)
        tx.pure.string(resource.path), // Resource path
        tx.pure.string(resource.blob_id), // New blob ID
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
 * Format timestamp as human-readable relative time
 * @param {number|null} timestamp_ms - Timestamp in milliseconds
 * @returns {string} Formatted time string
 */
function format_relative_time(timestamp_ms) {
  if (!timestamp_ms) return 'Unknown'

  const now = Date.now()
  const diff_ms = now - timestamp_ms
  const diff_seconds = Math.floor(diff_ms / 1000)
  const diff_minutes = Math.floor(diff_seconds / 60)
  const diff_hours = Math.floor(diff_minutes / 60)
  const diff_days = Math.floor(diff_hours / 24)

  if (diff_days > 30) {
    // Show date for older deployments
    const date = new Date(timestamp_ms)
    return date.toISOString().split('T')[0]
  } else if (diff_days > 0) {
    return `${diff_days} day${diff_days === 1 ? '' : 's'} ago`
  } else if (diff_hours > 0) {
    return `${diff_hours} hour${diff_hours === 1 ? '' : 's'} ago`
  } else if (diff_minutes > 0) {
    return `${diff_minutes} minute${diff_minutes === 1 ? '' : 's'} ago`
  } else {
    return 'Just now'
  }
}

/**
 * Format sites as bullet points
 * @param {SiteObject[]} sites - Array of sites
 * @param {string} network - Network name
 * @returns {string} Formatted bullet point string
 */
export function format_sites_table(sites, network) {
  if (sites.length === 0) {
    return `No deployments found on ${network}.\n\nRun \`versui deploy ./dist\` to get started.`
  }

  const lines = []

  for (const site of sites) {
    if (site.is_remnant) {
      // Remnant site - show with warning indicator
      lines.push(`  ${chalk.yellow('⚠')} ${chalk.yellow(site.name)}`)
      lines.push(`    ${chalk.dim('Site ID:')} ${site.object_id}`)
      lines.push(
        `    ${chalk.dim('AdminCap ID:')} ${site.admin_cap_id || 'Unknown'}`,
      )
      lines.push(
        `    ${chalk.yellow('Status:')} ${chalk.yellow('Incomplete deployment - can be deleted to recover AdminCap')}`,
      )
      lines.push('') // blank line between sites
    } else {
      // Normal site
      const subdomain = encode_base36(site.object_id)
      const url = `https://${subdomain}.versui.app`
      const deployed_time = format_relative_time(site.created_at)

      lines.push(
        `  ${chalk.cyan('•')} ${chalk.bold(site.name)} ${chalk.dim(`(deployed ${deployed_time})`)}`,
      )
      lines.push(`    ${chalk.dim('Site ID:')} ${site.object_id}`)
      lines.push(`    ${chalk.dim('URL:')} ${chalk.blue(url)}`)
      lines.push('') // blank line between sites
    }
  }

  const normal_count = sites.filter((s) => !s.is_remnant).length
  const remnant_count = sites.filter((s) => s.is_remnant).length

  if (remnant_count > 0) {
    lines.push(
      `  ${chalk.dim(`${normal_count} site${normal_count === 1 ? '' : 's'} found`)}`,
    )
    lines.push(
      `  ${chalk.yellow(`${remnant_count} remnant${remnant_count === 1 ? '' : 's'} found (use versui delete to clean up)`)}`,
    )
  } else {
    lines.push(
      `  ${chalk.dim(`${sites.length} site${sites.length === 1 ? '' : 's'} found`)}`,
    )
  }

  return lines.join('\n')
}

/**
 * Build delete resources transaction
 * @param {string} admin_cap_id - AdminCap object ID
 * @param {string} site_id - Site object ID
 * @param {string} site_version - Initial shared version
 * @param {Array<{type: string, value: any}>} resource_names - Array of resource path names from dynamic fields
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_delete_resources_transaction(
  admin_cap_id,
  site_id,
  site_version,
  resource_names,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const tx = new Transaction()

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // Delete each resource
  for (const name_obj of resource_names) {
    // Extract the path string from the dynamic field name object
    // name_obj structure: { type: "0x1::string::String", value: "/index.html" }
    const path = name_obj.value || String(name_obj)

    tx.moveCall({
      target: `${package_id}::site::delete_resource`,
      arguments: [
        tx.object(version_id),
        tx.object(admin_cap_id), // AdminCap reference
        tx.sharedObjectRef({
          objectId: site_id,
          initialSharedVersion: site_version,
          mutable: true,
        }), // Shared Site reference (mutable)
        tx.pure.string(path), // Resource path
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
 * Build a transaction that deletes a Site object
 * Note: Site's Table must be empty (all resources deleted first)
 * @param {string} admin_cap_id - AdminCap object ID (will be consumed)
 * @param {string} site_id - Shared Site object ID to delete
 * @param {string} site_version - Current Site object version
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_delete_transaction(
  admin_cap_id,
  site_id,
  site_version,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const versui_object_id = get_versui_registry_id(network)
  if (!versui_object_id) {
    throw new Error(`Versui registry not deployed on ${network}`)
  }

  const tx = new Transaction()

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // Call delete_site (consumes AdminCap and Site)
  tx.moveCall({
    target: `${package_id}::site::delete_site`,
    arguments: [
      tx.object(version_id),
      tx.object(versui_object_id), // Versui registry (shared mutable)
      tx.object(admin_cap_id), // AdminCap reference (consumed)
      tx.sharedObjectRef({
        objectId: site_id,
        initialSharedVersion: site_version,
        mutable: true,
      }), // Shared Site reference (consumed)
    ],
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

/**
 * Derive the Site object ID locally using Sui's derived_object formula
 * The Site is created as a derived object from the Versui registry with SiteKey { owner, name }
 * @param {string} versui_object_id - Shared Versui registry object ID (parent)
 * @param {string} owner_address - Owner wallet address
 * @param {string} site_name - Site name
 * @param {string} network - Network (testnet|mainnet)
 * @returns {string} Derived Site ID
 */
export function derive_site_address(
  versui_object_id,
  owner_address,
  site_name,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  // Normalize addresses to 32-byte format (critical for correct derivation)
  const normalized_owner = normalizeSuiAddress(owner_address)
  const normalized_versui_id = normalizeSuiAddress(versui_object_id)

  // Define SiteKey struct in BCS
  // SiteKey { owner: address, name: String }
  const site_key_bcs = bcs.struct('SiteKey', {
    owner: bcs.Address,
    name: bcs.String,
  })

  // Encode the key
  const encoded_key = site_key_bcs
    .serialize({
      owner: normalized_owner,
      name: site_name,
    })
    .toBytes()

  // Type tag for SiteKey
  const type_tag = `${package_id}::site::SiteKey`

  // Derive the Site object ID using Sui's derived_object formula
  const site_id = deriveObjectID(normalized_versui_id, type_tag, encoded_key)

  return site_id
}

/**
 * Look up Site ID by site name (convenience wrapper for derive_site_address)
 * @param {Object} client - Sui client (unused, kept for backwards compatibility)
 * @param {string} versui_object_id - Shared Versui registry object ID
 * @param {string} owner_address - Owner wallet address
 * @param {string} site_name - Site name to look up
 * @param {string} network - Network (testnet|mainnet)
 * @returns {Promise<string>} Site ID
 */
export async function get_site_id_by_name(
  client,
  versui_object_id,
  owner_address,
  site_name,
  network = 'testnet',
) {
  return derive_site_address(
    versui_object_id,
    owner_address,
    site_name,
    network,
  )
}

/**
 * Validate Sui object ID format (0x followed by 64 hex chars)
 * @param {string} id - Object ID to validate
 * @returns {boolean} True if valid
 */
function is_valid_sui_object_id(id) {
  return /^0x[a-fA-F0-9]{64}$/.test(id)
}

/**
 * Resolve site identifier to site ID (accepts both site ID and site name)
 * @param {string} identifier - Site ID (0x...) or site name
 * @param {Object} client - Sui client
 * @param {string} owner_address - Owner wallet address
 * @param {string} network - Network (testnet|mainnet)
 * @returns {Promise<string>} Resolved site ID
 */
export async function resolve_site_id(
  identifier,
  client,
  owner_address,
  network = 'testnet',
) {
  // If it looks like a Sui object ID (0x + 64 hex chars), return as-is
  if (is_valid_sui_object_id(identifier)) {
    return identifier
  }

  // Otherwise, treat as site name and derive the site ID
  const registry_id = get_versui_registry_id(network)
  if (!registry_id) {
    throw new Error(
      `Site name lookup not available on ${network} (registry not deployed)`,
    )
  }

  return get_site_id_by_name(
    client,
    registry_id,
    owner_address,
    identifier,
    network,
  )
}

/**
 * Dry-run a transaction to estimate gas cost
 * @param {Transaction} tx - Transaction to dry-run
 * @param {Object} client - Sui client
 * @returns {Promise<{computationCost: number, storageCost: number, storageRebate: number, totalCost: number}>} Gas cost breakdown
 */
export async function dry_run_transaction(tx, client) {
  const tx_bytes = await tx.build({ client })

  const dry_run_result = await client.dryRunTransactionBlock({
    transactionBlock: tx_bytes,
  })

  if (dry_run_result.effects.status.status !== 'success') {
    throw new Error(
      `Dry-run failed: ${dry_run_result.effects.status.error || 'Unknown error'}`,
    )
  }

  const gas_used = dry_run_result.effects.gasUsed
  const computation_cost = Number(gas_used.computationCost)
  const storage_cost = Number(gas_used.storageCost)
  const storage_rebate = Number(gas_used.storageRebate)
  const total_cost = computation_cost + storage_cost - storage_rebate

  return {
    computationCost: computation_cost,
    storageCost: storage_cost,
    storageRebate: storage_rebate,
    totalCost: total_cost,
  }
}

/**
 * Estimate gas cost for complete deployment (create_site + add_resources)
 * Note: Deployment requires 2 separate TXs due to Move contract design
 * (add_resource needs shared Site ID which doesn't exist until after create_site executes)
 * Note: Site availability should be checked BEFORE calling this function
 * @param {string} name - Site name
 * @param {ResourceData[]} resources - Resources to add (array of {path, blob_id, blob_hash, content_type, size})
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @param {string} network - Network (testnet|mainnet)
 * @returns {Promise<{createSiteCost: object, addResourcesCost: object, totalCost: number}>} Combined gas estimate
 */
export async function estimate_deploy_cost(
  name,
  resources,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const versui_object_id = get_versui_registry_id(network)
  if (!versui_object_id) {
    throw new Error(`Versui registry not deployed on ${network}`)
  }

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // Build and estimate create_site transaction
  const create_site_tx = new Transaction()
  create_site_tx.moveCall({
    target: `${package_id}::site::create_site`,
    arguments: [
      create_site_tx.object(version_id),
      create_site_tx.object(versui_object_id),
      create_site_tx.pure.string(name),
      create_site_tx.pure.string(''),
    ],
  })
  create_site_tx.setSender(sender)

  const create_site_cost = await dry_run_transaction(create_site_tx, client)

  // Note: We can't dry-run add_resources because the Site object doesn't exist yet
  // Only return create_site cost (actual dry-run result)
  return {
    createSiteCost: create_site_cost,
    addResourcesCost: null,
    totalCost: create_site_cost.totalCost,
  }
}

/**
 * Build a complete deletion PTB (resources + site) for cost estimation
 * @param {string} admin_cap_id - AdminCap object ID
 * @param {string} site_id - Site object ID
 * @param {string} site_version - Initial shared version
 * @param {Array<{path: string}>} resources - Resources to delete
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @param {string} network - Network (testnet|mainnet)
 * @returns {Promise<Transaction>} Complete deletion transaction
 */
export async function build_complete_delete_transaction(
  admin_cap_id,
  site_id,
  site_version,
  resources,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const versui_object_id = get_versui_registry_id(network)
  if (!versui_object_id) {
    throw new Error(`Versui registry not deployed on ${network}`)
  }

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  const tx = new Transaction()

  // Delete all resources first (batch of 50 max for realistic estimate)
  const resources_to_estimate = resources.slice(0, 50)
  for (const resource of resources_to_estimate) {
    tx.moveCall({
      target: `${package_id}::site::delete_resource`,
      arguments: [
        tx.object(version_id),
        tx.object(admin_cap_id),
        tx.sharedObjectRef({
          objectId: site_id,
          initialSharedVersion: site_version,
          mutable: true,
        }),
        tx.pure.string(resource.path),
      ],
    })
  }

  // Delete site
  tx.moveCall({
    target: `${package_id}::site::delete_site`,
    arguments: [
      tx.object(version_id),
      tx.object(versui_object_id),
      tx.object(admin_cap_id),
      tx.sharedObjectRef({
        objectId: site_id,
        initialSharedVersion: site_version,
        mutable: true,
      }),
    ],
  })

  tx.setSender(sender)

  return tx
}

/**
 * Build a batched site deletion PTB (deletes multiple sites atomically)
 * @param {Array<{admin_cap_id: string, site_id: string, site_version: string}>} sites - Sites to delete
 * @param {string} sender - Sender address
 * @param {Object} client - Sui client
 * @param {string} network - Network (testnet|mainnet)
 * @returns {Promise<TransactionResult>} Transaction bytes
 */
export async function build_batch_delete_sites_transaction(
  sites,
  sender,
  client,
  network = 'testnet',
) {
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network}`)
  }

  const versui_object_id = get_versui_registry_id(network)
  if (!versui_object_id) {
    throw new Error(`Versui registry not deployed on ${network}`)
  }

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  const tx = new Transaction()

  // Delete all sites in single PTB
  for (const { admin_cap_id, site_id, site_version } of sites) {
    tx.moveCall({
      target: `${package_id}::site::delete_site`,
      arguments: [
        tx.object(version_id),
        tx.object(versui_object_id),
        tx.object(admin_cap_id),
        tx.sharedObjectRef({
          objectId: site_id,
          initialSharedVersion: site_version,
          mutable: true,
        }),
      ],
    })
  }

  tx.setSender(sender)

  const tx_bytes = await tx.build({ client })

  return {
    tx_bytes,
    tx_bytes_base64: Buffer.from(tx_bytes).toString('base64'),
  }
}
