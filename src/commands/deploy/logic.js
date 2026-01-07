import { spawnSync, spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { relative } from 'node:path'

import { SuiClient } from '@mysten/sui/client'

import {
  scan_directory,
  scan_directory_async,
  get_content_type,
  read_file,
} from '../../lib/files.js'
import { hash_content } from '../../lib/hash.js'
import { derive_site_address, estimate_deploy_cost } from '../../lib/sui.js'

import {
  build_files_metadata,
  build_files_metadata_async,
} from './file-metadata.js'

// WAL coin type addresses by network
const WAL_COIN_TYPES = {
  testnet:
    '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL',
  mainnet:
    '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
}

/**
 * Scan directory and return file metadata
 * @param {string} directory - Directory to scan
 * @returns {{ files: string[], total_size: number, metadata: Object }}
 */
export function scan_directory_with_metadata(directory) {
  const file_paths = scan_directory(directory, directory)
  const { metadata, total_size } = build_files_metadata(file_paths, directory)

  return {
    files: file_paths,
    total_size,
    metadata,
  }
}

/**
 * Scan directory and return file metadata (async version)
 * @param {string} directory - Directory to scan
 * @returns {Promise<{ files: string[], total_size: number, metadata: Object }>}
 */
export async function scan_directory_with_metadata_async(directory) {
  const file_paths = await scan_directory_async(directory, directory)
  const { metadata, total_size } = await build_files_metadata_async(
    file_paths,
    directory,
  )

  return {
    files: file_paths,
    total_size,
    metadata,
  }
}

/**
 * Estimate Walrus storage cost (OLD - uses approximation)
 * @param {number} size_bytes - Total size in bytes
 * @param {number} epochs - Storage duration in epochs
 * @returns {Promise<number|null>} Cost in WAL tokens (null if unavailable)
 * @deprecated Use dry_run_walrus_cost for actual encoded size
 */
export async function estimate_walrus_cost(size_bytes, epochs) {
  return new Promise(resolve => {
    const child = spawn('walrus', ['info', 'price', '--json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', () => {
      // Ignore stderr output
    })

    child.on('error', () => {
      resolve(null)
    })

    child.on('close', code => {
      if (code !== 0) {
        resolve(null)
        return
      }

      try {
        const price_info = JSON.parse(stdout)
        const encoding = price_info.encodingDependentPriceInfo?.[0] || {}
        const metadata_price = encoding.metadataPrice || 9300000
        const marginal_price = encoding.marginalPrice || 900000
        const marginal_size = encoding.marginalSize || 1048576
        const size_units = Math.ceil(size_bytes / marginal_size)
        const total_mist = metadata_price + size_units * marginal_price

        resolve((total_mist * epochs) / 1_000_000_000)
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * Calculate actual Walrus storage cost via dry-run
 * @param {string} directory - Directory to upload
 * @param {number} epochs - Storage duration in epochs
 * @param {Function} scan_fn - Scan directory function (injectable)
 * @returns {Promise<number|null>} Cost in WAL tokens (null if unavailable)
 */
export async function dry_run_walrus_cost(
  directory,
  epochs,
  scan_fn = scan_directory,
) {
  return new Promise(resolve => {
    const file_paths = scan_fn(directory, directory)
    const blobs_args = ['--blobs']

    for (const fp of file_paths) {
      const rel = '/' + relative(directory, fp).replace(/\\/g, '/')
      const blob_spec = JSON.stringify({ path: fp, identifier: rel })
      blobs_args.push(blob_spec)
    }

    const child = spawn(
      'walrus',
      [
        'store-quilt',
        ...blobs_args,
        '--dry-run',
        '--epochs',
        String(epochs),
        '--json',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    let stdout = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', () => {
      // Ignore stderr output
    })

    child.on('error', () => {
      resolve(null)
    })

    child.on('close', code => {
      if (code !== 0) {
        resolve(null)
        return
      }

      try {
        const result = JSON.parse(stdout)
        const storage_cost = result.quiltBlobOutput?.storageCost
        if (storage_cost) {
          // storageCost is in FROST, convert to WAL (1 WAL = 1_000_000_000 FROST)
          resolve(storage_cost / 1_000_000_000)
        } else {
          resolve(null)
        }
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * Estimate Sui gas cost for a transaction
 * @param {string} tx_bytes - Base64 encoded transaction bytes
 * @param {SuiClient} sui_client - Sui client instance
 * @returns {Promise<number|null>} Gas cost in SUI (null if unavailable)
 */
export async function estimate_sui_gas(tx_bytes, sui_client) {
  try {
    const dry_run = await sui_client.dryRunTransactionBlock({
      transactionBlock: tx_bytes,
    })
    const gas = dry_run.effects?.gasUsed
    if (gas) {
      const total =
        BigInt(gas.computationCost) +
        BigInt(gas.storageCost) -
        BigInt(gas.storageRebate)
      return Number(total) / 1_000_000_000
    }
  } catch {}
  return null
}

/**
 * Estimate total Sui gas cost for deployment (create_site + add_resources)
 * @param {string} site_name - Site name
 * @param {Array} patches - Walrus patches array
 * @param {Object} metadata - File metadata map
 * @param {string} wallet - Wallet address
 * @param {string} network - Network (testnet|mainnet)
 * @param {SuiClient} sui_client - Sui client instance
 * @returns {Promise<number|null>} Total gas cost in SUI (null if unavailable)
 */
export async function estimate_sui_deploy_cost(
  site_name,
  patches,
  metadata,
  wallet,
  network,
  sui_client,
) {
  try {
    // Build resources array from patches and metadata
    const resources = patches.map(patch => {
      const path = patch.identifier.startsWith('/')
        ? patch.identifier
        : '/' + patch.identifier
      const file_meta = metadata[path]

      if (!file_meta) {
        throw new Error(`Missing metadata for file: ${path}`)
      }

      return {
        path,
        blob_id: patch.quiltPatchId,
        blob_hash: file_meta.hash,
        content_type: file_meta.content_type,
        size: file_meta.size,
      }
    })

    // Get cost estimate (site availability already checked in earlier step)
    const cost_estimate = await estimate_deploy_cost(
      site_name,
      resources,
      wallet,
      sui_client,
      network,
    )

    if (!cost_estimate || typeof cost_estimate.totalCost !== 'number') {
      return null
    }

    // Convert from MIST to SUI
    return cost_estimate.totalCost / 1_000_000_000
  } catch (error) {
    // Log error for debugging but still return null
    console.error('[estimate_sui_deploy_cost] Error:', error.message)
    return null
  }
}

/**
 * Get wallet balances for SUI and WAL tokens
 * @param {string} wallet - Wallet address
 * @param {string} network - Network (testnet|mainnet)
 * @param {SuiClient} sui_client - Sui client instance
 * @returns {Promise<{sui: number|null, wal: number|null}>}
 */
export async function get_wallet_balances(wallet, network, sui_client) {
  const balances = { sui: null, wal: null }

  try {
    const sui_balance = await sui_client.getBalance({
      owner: wallet,
      coinType: '0x2::sui::SUI',
    })
    balances.sui = Number(sui_balance.totalBalance) / 1_000_000_000
  } catch {
    // Balance stays null on error
  }

  try {
    const wal_coin_type = WAL_COIN_TYPES[network]
    if (wal_coin_type) {
      const wal_balance = await sui_client.getBalance({
        owner: wallet,
        coinType: wal_coin_type,
      })
      balances.wal = Number(wal_balance.totalBalance) / 1_000_000_000
    }
  } catch {
    // Balance stays null on error
  }

  return balances
}

/**
 * Upload files to Walrus
 * @param {string} directory - Directory to upload
 * @param {number} epochs - Storage duration
 * @param {Function} spawn_fn - Spawn function (injectable)
 * @param {Function} scan_fn - Scan directory function (injectable)
 * @returns {Promise<{blob_id: string, blob_object_id: string, patches: Array}>}
 */
export async function upload_to_walrus(
  directory,
  epochs,
  spawn_fn,
  scan_fn = scan_directory,
) {
  return new Promise((resolve, reject) => {
    const file_paths = scan_fn(directory, directory)
    const blobs_args = ['--blobs']

    for (const fp of file_paths) {
      const rel = '/' + relative(directory, fp).replace(/\\/g, '/')
      const blob_spec = JSON.stringify({ path: fp, identifier: rel })
      blobs_args.push(blob_spec)
    }

    const child = spawn_fn(
      'walrus',
      ['store-quilt', ...blobs_args, '--epochs', String(epochs), '--json'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    let stdout_data = ''
    let stderr_data = ''

    child.stdout.on('data', chunk => {
      stdout_data += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr_data += chunk.toString()
    })

    child.on('error', err => {
      reject(new Error(`Failed to spawn walrus: ${err.message}`))
    })

    child.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(`Walrus upload failed: ${stderr_data || 'Unknown error'}`),
        )
        return
      }

      try {
        const result = JSON.parse(stdout_data)
        const blob_store = result.blobStoreResult
        const blob_id =
          blob_store?.newlyCreated?.blobObject?.blobId ||
          blob_store?.alreadyCertified?.blobId
        const blob_object_id =
          blob_store?.newlyCreated?.blobObject?.id ||
          blob_store?.alreadyCertified?.object
        const patches = result.storedQuiltBlobs || []

        if (!blob_object_id) {
          reject(
            new Error(
              'Failed to extract blob object ID from Walrus upload result',
            ),
          )
          return
        }

        resolve({ blob_id, blob_object_id, patches })
      } catch (err) {
        reject(new Error(`Failed to parse walrus output: ${err.message}`))
      }
    })
  })
}

/**
 * Create a site on Sui blockchain
 * @param {Object} params - Site creation parameters
 * @param {string} params.site_name - Site name
 * @param {string} params.wallet - Wallet address
 * @param {string} params.network - Network (testnet|mainnet)
 * @param {SuiClient} params.sui_client - Sui client instance
 * @param {string} params.tx_base64 - Base64 encoded transaction
 * @param {Function} params.run_command - Command runner function (injectable)
 * @returns {Promise<{site_id: string, admin_cap_id: string, initial_shared_version: string}>}
 */
export async function create_site(params) {
  const { run_command, tx_base64 } = params

  try {
    const output = await run_command('sui', [
      'client',
      'serialized-tx',
      tx_base64,
      '--json',
    ])
    const result = JSON.parse(output)

    const site_obj = result?.objectChanges?.find(
      c => c.type === 'created' && c.objectType?.endsWith('::site::Site'),
    )
    const admin_cap_obj = result?.objectChanges?.find(
      c =>
        c.type === 'created' && c.objectType?.endsWith('::site::SiteAdminCap'),
    )

    if (!site_obj?.objectId || !admin_cap_obj?.objectId) {
      throw new Error(
        'Failed to extract Site ID or AdminCap ID from transaction',
      )
    }

    const initial_shared_version =
      site_obj.owner?.Shared?.initial_shared_version

    if (!initial_shared_version) {
      throw new Error(
        'Failed to extract initial_shared_version from Site object',
      )
    }

    return {
      site_id: site_obj.objectId,
      admin_cap_id: admin_cap_obj.objectId,
      initial_shared_version,
    }
  } catch (err) {
    throw new Error(`Create site failed: ${err.stderr || err.message}`)
  }
}

/**
 * Add resources to a site
 * @param {string} tx_base64 - Base64 encoded transaction
 * @param {Function} run_command - Command runner function (injectable)
 * @returns {Promise<{tx_digest: string}>}
 */
export async function add_resources(tx_base64, run_command) {
  try {
    const output = await run_command('sui', [
      'client',
      'serialized-tx',
      tx_base64,
      '--json',
    ])
    const result = JSON.parse(output)

    return {
      tx_digest: result.digest,
    }
  } catch (err) {
    throw new Error(`Add resources failed: ${err.stderr || err.message}`)
  }
}

/**
 * Check if service worker exists in directory
 * @param {string} directory - Directory to check
 * @param {Function} detect_fn - Service worker detection function (injectable)
 * @returns {Promise<{type: string, path: string|null}>}
 */
export async function check_service_worker(directory, detect_fn) {
  return detect_fn(directory)
}

/**
 * Check if site name is available
 * @param {Object} params - Parameters
 * @param {string} params.site_name - Site name to check
 * @param {string} params.wallet - Wallet address
 * @param {string} params.network - Network (testnet|mainnet)
 * @param {string} params.versui_object_id - Versui registry object ID
 * @param {SuiClient} params.sui_client - Sui client instance
 * @returns {Promise<{available: boolean, existing_site_id: string|null}>}
 */
export async function check_site_availability(params) {
  const { site_name, wallet, network, versui_object_id, sui_client } = params

  const expected_site_id = derive_site_address(
    versui_object_id,
    wallet,
    site_name,
    network,
  )

  try {
    const existing_site = await sui_client.getObject({
      id: expected_site_id,
      options: { showContent: true },
    })

    if (existing_site?.data) {
      return {
        available: false,
        existing_site_id: expected_site_id,
      }
    }

    return {
      available: true,
      existing_site_id: null,
    }
  } catch (err) {
    // If error is 'object not found', site doesn't exist (available)
    if (err.code === 'OBJECT_NOT_FOUND' || err.message?.includes('not found')) {
      return {
        available: true,
        existing_site_id: null,
      }
    }

    // Any other error should be thrown
    throw new Error(`Failed to check site availability: ${err.message}`)
  }
}

/**
 * Get active Sui wallet address
 * @returns {string|null} Wallet address or null if not found
 */
export function get_active_wallet() {
  try {
    const result = spawnSync('sui', ['client', 'active-address'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (result.status !== 0) return null
    return result.stdout.trim()
  } catch {
    return null
  }
}

/**
 * Build file metadata for JSON deploy
 * @param {string[]} file_paths - Array of file paths
 * @param {string} directory - Base directory
 * @returns {Object} File metadata map
 */
export function build_file_metadata_map(file_paths, directory) {
  const metadata = {}

  for (const fp of file_paths) {
    const rel = '/' + relative(directory, fp).replace(/\\/g, '/')
    const content = read_file(fp)
    metadata[rel] = {
      hash: hash_content(content),
      size: statSync(fp).size,
      content_type: get_content_type(fp),
    }
  }

  return metadata
}
