import { existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { join, relative } from 'node:path'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'
import chalk from 'chalk'

import { encode_base36 } from '../lib/base36.js'
import {
  read_versui_config,
  get_aggregators,
  get_site_name,
} from '../lib/config.js'
import { scan_directory, get_content_type, read_file } from '../lib/files.js'
import { generate_bootstrap } from '../lib/generate.js'
import { hash_content } from '../lib/hash.js'
import { detect_service_worker, generate_sw_snippet } from '../lib/sw.js'
import { VERSUI_PACKAGE_IDS, get_versui_registry_id } from '../lib/env.js'
import { derive_site_address } from '../lib/sui.js'

import { build_files_metadata } from './deploy/file-metadata.js'
import { format_bytes, format_wallet_address } from './deploy/formatting.js'
import {
  build_identifier_map,
  create_site_transaction,
  add_resources_transaction,
} from './deploy/transaction.js'
import {
  validate_directory,
  check_prerequisites,
  get_prerequisite_error,
} from './deploy/validate.js'
import { get_epoch_info_with_fallback } from './deploy/walrus-info.js'

function get_sui_active_address() {
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
 * Run a command asynchronously (non-blocking for spinner animation)
 * @param {string} cmd - Command to run
 * @param {string[]} args - Command arguments
 * @param {Function} spawn_fn - Spawn function (injectable for testing)
 * @returns {Promise<string>} stdout output
 */
function run_command_async(cmd, args, spawn_fn = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawn_fn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout_data = ''
    let stderr_data = ''

    child.stdout.on('data', chunk => {
      stdout_data += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr_data += chunk.toString()
    })

    child.on('error', err => {
      reject(new Error(`Failed to spawn ${cmd}: ${err.message}`))
    })

    child.on('close', code => {
      if (code !== 0) {
        const error = Object.assign(
          new Error(`Command failed: ${cmd} ${args.join(' ')}`),
          { stderr: stderr_data, stdout: stdout_data },
        )
        reject(error)
        return
      }
      resolve(stdout_data)
    })
  })
}

async function get_walrus_price_estimate(size_bytes, epochs) {
  try {
    const result = spawnSync('walrus', ['info', 'price', '--json'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (result.status !== 0) return null
    const price_info = JSON.parse(result.stdout)
    const encoding = price_info.encodingDependentPriceInfo?.[0] || {}
    const metadata_price = encoding.metadataPrice || 9300000
    const marginal_price = encoding.marginalPrice || 900000
    const marginal_size = encoding.marginalSize || 1048576
    const size_units = Math.ceil(size_bytes / marginal_size)
    const total_mist = metadata_price + size_units * marginal_price
    return (total_mist * epochs) / 1_000_000_000
  } catch {
    return null
  }
}

async function get_sui_gas_estimate(tx_bytes, sui_client) {
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

// WAL coin type addresses by network
const WAL_COIN_TYPES = {
  testnet:
    '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL',
  mainnet:
    '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
}

/**
 * Fetch wallet balances (SUI and WAL)
 * @param {string} wallet - Wallet address
 * @param {string} network - Network (testnet|mainnet)
 * @param {Object} sui_client - Sui client
 * @returns {Promise<{sui: number|null, wal: number|null}>}
 */
async function get_wallet_balances(wallet, network, sui_client) {
  const balances = { sui: null, wal: null }

  try {
    // Get SUI balance
    const sui_balance = await sui_client.getBalance({
      owner: wallet,
      coinType: '0x2::sui::SUI',
    })
    balances.sui = Number(sui_balance.totalBalance) / 1_000_000_000
  } catch {
    // Ignore errors, balance stays null
  }

  try {
    // Get WAL balance using hardcoded coin type
    const wal_coin_type = WAL_COIN_TYPES[network]
    if (wal_coin_type) {
      const wal_balance = await sui_client.getBalance({
        owner: wallet,
        coinType: wal_coin_type,
      })
      balances.wal = Number(wal_balance.totalBalance) / 1_000_000_000
    }
  } catch {
    // Ignore errors, balance stays null
  }

  return balances
}

export async function deploy(dir, options = {}) {
  const {
    json: json_mode = false,
    yes: auto_yes = false,
    customSw: force_custom_sw = false,
    name: cli_site_name = null,
    suins: suins_flag = null,
  } = options
  const { network, epochs } = options

  // JSON mode - minimal output
  if (json_mode) {
    return deploy_json(dir, {
      network: network || 'testnet',
      epochs: epochs || 1,
      name: cli_site_name,
    })
  }

  // For interactive mode, use Ink UI
  try {
    // Initialize wallet and network-specific config
    const wallet = get_sui_active_address()
    if (!wallet) {
      throw new Error('No active Sui wallet. Run: sui client active-address')
    }

    const resolved_network = network || 'testnet'
    const versui_object_id = get_versui_registry_id(resolved_network)
    if (!versui_object_id) {
      throw new Error(`Versui registry not deployed on ${resolved_network} yet`)
    }

    const { render_deploy_ui } = await import('./deploy/ui/index.js')
    const result = await render_deploy_ui({
      directory: dir,
      name: cli_site_name,
      network: resolved_network,
      epochs,
      autoYes: auto_yes,
      customSw: force_custom_sw,
      suins: suins_flag,
      wallet,
      versui_object_id,
    })

    // Return result (UI already displays completion)
    return result
  } catch (error) {
    console.error('Deployment failed:', error.message)
    process.exit(1)
  }
}

async function deploy_json(dir, options) {
  // Minimal JSON-only flow for scripts
  const { network, epochs, name: cli_site_name = null } = options

  spawnSync('which', ['walrus'], { stdio: 'pipe' })
  spawnSync('which', ['sui'], { stdio: 'pipe' })

  const wallet = get_sui_active_address()
  if (!wallet) throw new Error('No wallet')

  // Read configs for site name resolution
  const project_dir = join(dir, '..')
  const versui_config = read_versui_config(project_dir)
  let package_json = null
  const package_json_path = join(project_dir, 'package.json')
  if (existsSync(package_json_path)) {
    try {
      package_json = JSON.parse(read_file(package_json_path).toString())
    } catch {
      // Ignore invalid package.json
    }
  }

  const site_name = get_site_name({
    cli_name: cli_site_name,
    versui_config,
    package_json,
  })

  const file_paths = scan_directory(dir, dir)
  const file_metadata = {}
  const blobs_args = []
  for (const fp of file_paths) {
    const rel = '/' + relative(dir, fp).replace(/\\/g, '/')
    const content = read_file(fp)
    file_metadata[rel] = {
      hash: hash_content(content),
      size: statSync(fp).size,
      content_type: get_content_type(fp),
    }
    // Build blob specs (as separate arguments, NOT quoted strings)
    const blob_spec = JSON.stringify({ path: fp, identifier: rel })
    blobs_args.push(blob_spec)
  }

  const walrus_result = spawnSync(
    'walrus',
    [
      'store-quilt',
      '--blobs',
      ...blobs_args,
      '--epochs',
      String(epochs),
      '--json',
    ],
    {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  if (walrus_result.status !== 0) {
    throw new Error(walrus_result.stderr || 'Walrus command failed')
  }
  const walrus_output = walrus_result.stdout
  const quilt = JSON.parse(walrus_output)
  const blob_store = quilt.blobStoreResult
  const blob_id =
    blob_store?.newlyCreated?.blobObject?.blobId ||
    blob_store?.alreadyCertified?.blobId
  const blob_object_id =
    blob_store?.newlyCreated?.blobObject?.id ||
    blob_store?.alreadyCertified?.object
  const patches = quilt.storedQuiltBlobs || []

  if (!blob_object_id) {
    throw new Error(
      'Failed to extract blob object ID from Walrus upload result',
    )
  }

  const sui_client = new SuiClient({
    url: getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet'),
  })

  const package_id = VERSUI_PACKAGE_IDS[network]
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network} yet`)
  }

  const versui_object_id = get_versui_registry_id(network)
  if (!versui_object_id) {
    throw new Error(`Versui registry not deployed on ${network} yet`)
  }

  // Check if site name already exists (prevents duplicate creation)
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
      throw new Error(
        `Site name "${site_name}" is already taken by you. Site ID: ${expected_site_id}\n\n` +
          `To update this site, use: versui update ${site_name}\n` +
          `To delete this site, use: versui delete ${site_name}`,
      )
    }
  } catch (err) {
    // If error is 'object not found', site doesn't exist (OK to proceed)
    // Any other error should be thrown
    if (!err.message?.includes('already taken')) {
      // Ignore 'object not found' errors (expected case)
      if (
        err.code !== 'OBJECT_NOT_FOUND' &&
        !err.message?.includes('not found')
      ) {
        throw new Error(
          `Failed to check site name availability: ${err.message}`,
        )
      }
    } else {
      // Re-throw our own error message
      throw err
    }
  }

  // === TRANSACTION 1: Create Site ===
  const tx1 = new Transaction()
  tx1.setSender(wallet)

  const { get_version_object_id } = await import('../lib/env.js')
  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // create_site returns AdminCap to sender, creates shared Site
  tx1.moveCall({
    target: `${package_id}::site::create_site`,
    arguments: [
      tx1.object(version_id),
      tx1.object(versui_object_id),
      tx1.pure.string(site_name),
      tx1.pure.string(''),
    ],
  })

  const tx1_bytes = await tx1.build({ client: sui_client })
  const tx1_base64 = toBase64(tx1_bytes)

  // Execute transaction 1 (sui client auto-signs and executes)
  const tx1_sui_result = spawnSync(
    'sui',
    ['client', 'serialized-tx', tx1_base64, '--json'],
    {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )
  if (tx1_sui_result.status !== 0) {
    throw new Error(tx1_sui_result.stderr || 'Transaction 1 failed')
  }
  const tx1_result = JSON.parse(tx1_sui_result.stdout)

  // Extract Site ID and AdminCap ID from transaction effects
  const site_obj = tx1_result?.objectChanges?.find(
    c => c.type === 'created' && c.objectType?.includes('::site::Site'),
  )
  const admin_cap_obj = tx1_result?.objectChanges?.find(
    c => c.type === 'created' && c.objectType?.includes('::SiteAdminCap'),
  )

  if (!site_obj?.objectId || !admin_cap_obj?.objectId) {
    throw new Error('Failed to extract Site ID or AdminCap ID from transaction')
  }

  const site_id = site_obj.objectId
  const admin_cap_id = admin_cap_obj.objectId

  // === TRANSACTION 2: Add Resources ===
  // Build identifier -> full path mapping (with --blobs, identifier = full path)
  const identifier_to_path = {}
  for (const rel_path of Object.keys(file_metadata)) {
    identifier_to_path[rel_path] = rel_path
  }

  const tx2 = new Transaction()
  tx2.setSender(wallet)

  // Add all resources to the shared Site
  for (const patch of patches) {
    // Normalize identifier: ensure leading slash, no double slashes
    const normalized_identifier = patch.identifier.startsWith('/')
      ? patch.identifier
      : '/' + patch.identifier
    const full_path =
      identifier_to_path[normalized_identifier] || normalized_identifier
    const info = file_metadata[full_path]
    if (!info) continue

    tx2.moveCall({
      target: `${package_id}::site::add_resource`,
      arguments: [
        tx2.object(version_id),
        tx2.object(admin_cap_id), // AdminCap reference
        tx2.object(site_id), // Shared Site reference
        tx2.pure.string(full_path),
        tx2.pure.string(patch.quiltPatchId),
        tx2.pure.vector('u8', Array.from(Buffer.from(info.hash, 'hex'))),
        tx2.pure.string(info.content_type),
        tx2.pure.u64(info.size),
      ],
    })
  }

  const tx2_bytes = await tx2.build({ client: sui_client })
  const tx2_base64 = toBase64(tx2_bytes)

  // Execute transaction 2 (sui client auto-signs and executes)
  const tx2_sui_result = spawnSync(
    'sui',
    ['client', 'serialized-tx', tx2_base64, '--json'],
    {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )
  if (tx2_sui_result.status !== 0) {
    throw new Error(tx2_sui_result.stderr || 'Transaction 2 failed')
  }
  const tx2_result = JSON.parse(tx2_sui_result.stdout)

  const subdomain = encode_base36(site_id)

  console.log(
    JSON.stringify({
      site_id,
      admin_cap_id,
      blob_id,
      subdomain,
      url: `https://${subdomain}.versui.app`,
      patches: patches.length,
      tx1_digest: tx1_result?.digest,
      tx2_digest: tx2_result?.digest,
    }),
  )
}

/**
 * Upload to Walrus with progress tracking
 * @param {string} dir - Directory to upload
 * @param {number} epochs - Storage duration
 * @param {Function} on_progress - Progress callback (progress: 0-100, message: string)
 * @param {Function} spawn_fn - Spawn function (injectable for testing)
 * @param {Function} scan_directory_fn - Scan directory function (injectable for testing)
 * @returns {Promise<Object>} Quilt result
 */
async function upload_to_walrus_with_progress(
  dir,
  epochs,
  on_progress,
  spawn_fn = spawn,
  scan_directory_fn = scan_directory,
) {
  return new Promise((resolve, reject) => {
    // Scan files and build --blobs args with JSON format
    const file_paths = scan_directory_fn(dir, dir)
    const blobs_args = ['--blobs']
    for (const fp of file_paths) {
      const rel = '/' + relative(dir, fp).replace(/\\/g, '/')
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
    let last_progress = 0

    child.stdout.on('data', chunk => {
      stdout_data += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr_data += chunk.toString()

      // Parse progress from walrus CLI stderr output
      // Track different stages: encoding -> storing -> retrieving status -> obtaining resources
      let progress = last_progress
      let message = null

      // Stage 1: Encoding (25%)
      if (stderr_data.includes('encoded sliver pairs and metadata')) {
        progress = 25
        message = 'Encoding...'
      }
      // Stage 2: Storing (50%)
      else if (
        stderr_data.includes('storing') &&
        stderr_data.includes('sliver')
      ) {
        progress = 50
        message = 'Storing...'
      }
      // Stage 3: Retrieving status (75%)
      else if (
        stderr_data.includes('retrieved') &&
        stderr_data.includes('blob statuses')
      ) {
        progress = 75
        message = 'Verifying...'
      }
      // Stage 4: Obtaining resources (90%)
      else if (stderr_data.includes('blob resources obtained')) {
        progress = 90
        message = 'Finalizing...'
      }

      if (progress > last_progress) {
        last_progress = progress
        on_progress(progress, message)
      }
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
        on_progress(100, 'Complete')
        resolve(result)
      } catch (err) {
        reject(new Error(`Failed to parse walrus output: ${err.message}`))
      }
    })
  })
}

// Export testable functions (format_bytes moved to ./deploy/formatting.js)
export {
  get_sui_active_address,
  get_walrus_price_estimate,
  get_wallet_balances,
  upload_to_walrus_with_progress,
  generate_bootstrap,
}
