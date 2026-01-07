import { execSync, spawn } from 'node:child_process'
import { relative } from 'node:path'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64, toBase64 } from '@mysten/sui/utils'
import chalk from 'chalk'
import ora from 'ora'

import { scan_directory } from '../lib/files.js'
import {
  get_versui_package_id,
  get_original_package_id,
  get_version_object_id,
} from '../lib/env.js'
import { dry_run_transaction, resolve_site_id } from '../lib/sui.js'

import { validate_directory, check_prerequisites } from './deploy/validate.js'
import { build_files_metadata } from './deploy/file-metadata.js'

/**
 * Get active wallet address from Sui CLI
 * @returns {string|null} Wallet address or null
 */
function get_sui_active_address() {
  try {
    return execSync('sui client active-address', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
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

/**
 * Fetch site data and existing resources from Sui
 * @param {string} site_id - Site object ID
 * @param {SuiClient} sui_client - Sui client
 * @returns {Promise<{site_fields: any, resources: Map<string, {blob_id: string, hash: string, size: number}>}>}
 */
async function fetch_site_resources(site_id, sui_client) {
  const site_obj = await sui_client.getObject({
    id: site_id,
    options: { showContent: true },
  })

  if (!site_obj.data) {
    throw new Error(`Site not found: ${site_id}`)
  }

  const { fields: site_fields } = /** @type {any} */ (site_obj.data.content)
  const resources_table_id = site_fields.resources.fields.id.id

  // Fetch all resources from table
  const resource_entries = []
  let cursor = null
  let has_next_page = true

  while (has_next_page) {
    const page = await sui_client.getDynamicFields({
      parentId: resources_table_id,
      cursor,
    })

    resource_entries.push(...page.data)
    has_next_page = page.hasNextPage
    cursor = page.nextCursor
  }

  // Fetch resource details
  const resource_ids = resource_entries.map(r => r.objectId)
  const resource_objects =
    resource_ids.length > 0
      ? await sui_client.multiGetObjects({
          ids: resource_ids,
          options: { showContent: true },
        })
      : []

  // Build resource map
  /** @type {Map<string, {blob_id: string, hash: string, size: number}>} */
  const resources = new Map()
  for (const res of resource_objects) {
    if (!res.data) continue
    const { fields } = /** @type {any} */ (res.data.content)
    // blob_hash is stored as vector<u8>, convert to hex for comparison
    const hash_bytes = fields.blob_hash || []
    const hash_hex = Array.from(hash_bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    resources.set(fields.path, {
      blob_id: fields.blob_id,
      hash: hash_hex,
      size: Number(fields.size),
    })
  }

  return { site_fields, resources }
}

/**
 * Find AdminCap for a site owned by the current wallet
 * @param {string} site_id - Site object ID
 * @param {string} wallet - Wallet address
 * @param {SuiClient} sui_client - Sui client
 * @param {string} original_package_id - Original package ID (for type filtering)
 * @returns {Promise<string|null>} AdminCap object ID or null
 */
async function find_admin_cap(
  site_id,
  wallet,
  sui_client,
  original_package_id,
) {
  const admin_cap_type = `${original_package_id}::site::SiteAdminCap`
  const admin_caps = await sui_client.getOwnedObjects({
    owner: wallet,
    filter: { StructType: admin_cap_type },
    options: { showContent: true },
  })

  for (const item of admin_caps.data) {
    if (!item.data?.content) continue
    const { fields } = /** @type {any} */ (item.data.content)
    if (fields.site_id === site_id) {
      return item.data.objectId
    }
  }

  return null
}

/**
 * Compare local files with existing resources
 * @param {Record<string, {hash: string, size: number, content_type: string}>} local_files - Local file metadata
 * @param {Map<string, {blob_id: string, hash: string, size: number}>} existing_resources - Existing resources
 * @returns {{added: string[], updated: string[], deleted: string[], unchanged: string[]}}
 */
export function compare_files(local_files, existing_resources) {
  const local_paths = new Set(Object.keys(local_files))
  const existing_paths = new Set(existing_resources.keys())

  const added = []
  const updated = []
  const deleted = []
  const unchanged = []

  // Check local files
  for (const path of local_paths) {
    const local_info = local_files[path]
    const existing_info = existing_resources.get(path)

    if (!existing_info) {
      added.push(path)
    } else if (local_info.hash !== existing_info.hash) {
      updated.push(path)
    } else {
      unchanged.push(path)
    }
  }

  // Check deleted files
  for (const path of existing_paths) {
    if (!local_paths.has(path)) {
      deleted.push(path)
    }
  }

  return { added, updated, deleted, unchanged }
}

/**
 * Upload changed files to Walrus
 * @param {string} dir - Directory path
 * @param {string[]} file_paths - Absolute file paths to upload
 * @param {number} epochs - Storage epochs
 * @returns {Promise<{blob_id: string, blob_object_id: string, patches: Array<{identifier: string, quiltPatchId: string}>}>}
 */
async function upload_files_to_walrus(dir, file_paths, epochs) {
  if (file_paths.length === 0) {
    return { blob_id: null, blob_object_id: null, patches: [] }
  }

  // Build --blobs args with JSON format
  const blobs_args = ['--blobs']
  for (const fp of file_paths) {
    const rel = '/' + relative(dir, fp).replace(/\\/g, '/')
    const blob_spec = JSON.stringify({ path: fp, identifier: rel })
    blobs_args.push(blob_spec)
  }

  const output = await run_command_async('walrus', [
    'store-quilt',
    ...blobs_args,
    '--epochs',
    String(epochs),
    '--json',
  ])

  const result = JSON.parse(output)
  const blob_store = result.blobStoreResult
  const blob_id =
    blob_store?.newlyCreated?.blobObject?.blobId ||
    blob_store?.alreadyCertified?.blobId
  const blob_object_id =
    blob_store?.newlyCreated?.blobObject?.id ||
    blob_store?.alreadyCertified?.object

  return {
    blob_id,
    blob_object_id,
    patches: result.storedQuiltBlobs || [],
  }
}

/**
 * Build update transaction
 * @param {object} params - Transaction parameters
 * @param {string} params.package_id - Versui package ID
 * @param {string} params.wallet - Wallet address
 * @param {string} params.admin_cap_id - AdminCap object ID
 * @param {string} params.site_id - Site object ID
 * @param {string|number} params.initial_shared_version - Initial shared version
 * @param {string[]} params.added_paths - Paths of new files
 * @param {string[]} params.updated_paths - Paths of updated files
 * @param {string[]} params.deleted_paths - Paths of deleted files
 * @param {Array<{identifier: string, quiltPatchId: string}>} params.patches - Walrus patches
 * @param {Record<string, {hash: string, size: number, content_type: string}>} params.file_metadata - File metadata
 * @param {string|null} params.blob_object_id - Walrus blob object ID for renewal tracking
 * @param {string} params.network - Network name (testnet/mainnet)
 * @returns {Transaction}
 */
export function build_update_transaction({
  package_id,
  wallet,
  admin_cap_id,
  site_id,
  initial_shared_version,
  added_paths,
  updated_paths,
  deleted_paths,
  patches,
  file_metadata,
  blob_object_id,
  network,
}) {
  const tx = new Transaction()
  tx.setSender(wallet)

  const version_id = get_version_object_id(network)
  if (!version_id) {
    throw new Error(`Version object not deployed on ${network}`)
  }

  // Build patch lookup map
  const patch_map = new Map()
  for (const patch of patches) {
    const normalized = patch.identifier.startsWith('/')
      ? patch.identifier
      : '/' + patch.identifier
    patch_map.set(normalized, patch.quiltPatchId)
  }

  const site_ref = tx.sharedObjectRef({
    objectId: site_id,
    initialSharedVersion: initial_shared_version,
    mutable: true,
  })

  // Add new resources
  for (const path of added_paths) {
    const info = file_metadata[path]
    const patch_id = patch_map.get(path)
    if (!info || !patch_id || !blob_object_id) continue

    tx.moveCall({
      target: `${package_id}::site::add_resource`,
      arguments: [
        tx.object(version_id),
        tx.object(admin_cap_id),
        site_ref,
        tx.pure.string(path),
        tx.pure.string(patch_id),
        tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
        tx.pure.string(info.content_type),
        tx.pure.u64(info.size),
      ],
    })
  }

  // Update changed resources
  for (const path of updated_paths) {
    const info = file_metadata[path]
    const patch_id = patch_map.get(path)
    if (!info || !patch_id || !blob_object_id) continue

    tx.moveCall({
      target: `${package_id}::site::update_resource`,
      arguments: [
        tx.object(version_id),
        tx.object(admin_cap_id),
        site_ref,
        tx.pure.string(path),
        tx.pure.string(patch_id),
        tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
        tx.pure.u64(info.size),
      ],
    })
  }

  // Delete removed resources
  for (const path of deleted_paths) {
    tx.moveCall({
      target: `${package_id}::site::delete_resource`,
      arguments: [
        tx.object(version_id),
        tx.object(admin_cap_id),
        site_ref,
        tx.pure.string(path),
      ],
    })
  }

  return tx
}

/**
 * Update an existing site with new files
 * @param {string} dir - Directory to deploy
 * @param {Object} [options] - Command options
 * @param {string} [options.site] - Site ID (0x...) or site name
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @param {number} [options.epochs] - Storage epochs for new uploads
 * @param {boolean} [options.yes] - Skip confirmations
 * @param {boolean} [options.json] - JSON output mode
 * @returns {Promise<void>}
 */
export async function update(dir, options = {}) {
  const {
    site: site_identifier,
    network = 'testnet',
    epochs = 1,
    json: json_mode = false,
  } = options

  // Validate inputs
  if (!site_identifier) {
    throw new Error('Site ID or name is required. Use --site <site-id-or-name>')
  }

  if (!validate_directory(dir)) {
    throw new Error(`Invalid directory: ${dir}`)
  }

  // Check prerequisites
  const prereqs = check_prerequisites()
  if (!prereqs.success) {
    throw new Error(
      `Missing prerequisites: ${prereqs.missing.join(', ')}. Install them first.`,
    )
  }

  const wallet = get_sui_active_address()
  if (!wallet) {
    throw new Error('No active Sui wallet. Run: sui client new-address ed25519')
  }

  const package_id = get_versui_package_id(network)
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network} yet`)
  }

  const original_package_id = get_original_package_id(network)
  if (!original_package_id) {
    throw new Error(
      `Original Versui package not found on ${network}. Cannot query existing objects.`,
    )
  }

  const rpc_url = getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet')
  const sui_client = new SuiClient({ url: rpc_url })

  // Start spinner
  const spinner = ora({
    text: 'Resolving site...',
    isSilent: json_mode || !process.stdout.isTTY,
  }).start()

  // Resolve site identifier to site ID
  const site_id = await resolve_site_id(
    site_identifier,
    sui_client,
    wallet,
    network,
  )

  spinner.text = 'Fetching site data...'

  // Find AdminCap
  const admin_cap_id = await find_admin_cap(
    site_id,
    wallet,
    sui_client,
    original_package_id,
  )
  if (!admin_cap_id) {
    spinner.fail()
    throw new Error(
      `You don't have AdminCap for site ${site_id}. Only the site owner can update.`,
    )
  }

  // Fetch existing site resources
  const { site_fields, resources: existing_resources } =
    await fetch_site_resources(site_id, sui_client)

  // Get initial_shared_version from Site object
  const site_obj = await sui_client.getObject({
    id: site_id,
    options: { showOwner: true },
  })
  const initial_shared_version = /** @type {any} */ (site_obj.data?.owner)
    ?.Shared?.initial_shared_version
  if (!initial_shared_version) {
    throw new Error('Failed to get initial_shared_version from Site object')
  }

  spinner.text = 'Scanning local files...'

  // Scan local directory
  const file_paths = scan_directory(dir, dir)
  const { metadata: file_metadata } = build_files_metadata(file_paths, dir)

  // Compare files
  const diff = compare_files(file_metadata, existing_resources)

  spinner.stop()

  // Check if there are any changes
  const total_changes =
    diff.added.length + diff.updated.length + diff.deleted.length
  if (total_changes === 0) {
    if (json_mode) {
      console.log(JSON.stringify({ status: 'no_changes', site_id }))
    } else {
      console.log('')
      console.log(chalk.yellow('  No changes detected. Site is up to date.'))
      console.log('')
    }
    return
  }

  // Display diff
  if (!json_mode) {
    console.log('')
    console.log(
      chalk.bold(`  Updating site ${chalk.cyan(site_id.slice(0, 12))}...`),
    )
    console.log('')
    console.log(chalk.dim('  Changes detected:'))

    for (const path of diff.added) {
      console.log(chalk.green(`    + ${path}`) + chalk.dim(' (added)'))
    }
    for (const path of diff.updated) {
      console.log(chalk.yellow(`    ~ ${path}`) + chalk.dim(' (updated)'))
    }
    for (const path of diff.deleted) {
      console.log(chalk.red(`    - ${path}`) + chalk.dim(' (deleted)'))
    }
    console.log('')
  }

  // Get absolute paths for files that need uploading
  const files_to_upload = [...diff.added, ...diff.updated].map(rel_path => {
    // Convert relative path back to absolute
    const clean_path = rel_path.startsWith('/') ? rel_path.slice(1) : rel_path
    return `${dir}/${clean_path}`
  })

  // Upload changed files to Walrus
  if (files_to_upload.length > 0) {
    if (!json_mode) {
      spinner.start(`Uploading ${files_to_upload.length} files to Walrus...`)
    }
  }

  const { patches, blob_object_id } = await upload_files_to_walrus(
    dir,
    files_to_upload,
    epochs,
  )

  if (files_to_upload.length > 0 && !json_mode) {
    spinner.succeed(`Uploaded ${files_to_upload.length} files to Walrus`)
  }

  // Build transaction
  if (!json_mode) {
    spinner.start('Building update transaction...')
  }

  const tx = build_update_transaction({
    package_id,
    wallet,
    admin_cap_id,
    site_id,
    initial_shared_version,
    added_paths: diff.added,
    updated_paths: diff.updated,
    deleted_paths: diff.deleted,
    patches,
    file_metadata,
    blob_object_id,
    network,
  })

  if (!json_mode) {
    spinner.succeed('Transaction built')
    spinner.start('Checking cost (dry-run)...')
  }

  // Dry-run to estimate gas cost
  const gas_estimate = await dry_run_transaction(tx, sui_client)

  if (!json_mode) {
    spinner.succeed(
      `Cost: ${chalk.cyan((gas_estimate.totalCost / 1_000_000_000).toFixed(4))} SUI (dry-run)`,
    )
  }

  const tx_bytes = await tx.build({ client: sui_client })
  const tx_base64 = toBase64(tx_bytes)

  if (!json_mode) {
    spinner.start('Executing update transaction...')
  }

  // Execute transaction
  let tx_result
  try {
    const output = await run_command_async('sui', [
      'client',
      'serialized-tx',
      tx_base64,
      '--json',
    ])
    tx_result = JSON.parse(output)
  } catch (err) {
    if (!json_mode) spinner.fail('Transaction failed')
    throw new Error(`Transaction failed: ${err.stderr || err.message}`)
  }

  if (!json_mode) {
    spinner.succeed('Site updated successfully!')
    console.log('')
    console.log(chalk.green.bold('  ✓ Site updated successfully!'))
    console.log('')
    console.log(
      `  ${chalk.dim('Site:')}    ${chalk.cyan(site_fields.name || 'Unnamed')}`,
    )
    console.log(`  ${chalk.dim('ID:')}      ${chalk.magenta(site_id)}`)
    console.log(
      `  ${chalk.dim('Tx:')}      ${chalk.dim(tx_result?.digest || 'unknown')}`,
    )
    console.log('')
    console.log(chalk.dim('  Summary:'))
    console.log(`    ${chalk.green(`+ ${diff.added.length} added`)}`)
    console.log(`    ${chalk.yellow(`~ ${diff.updated.length} updated`)}`)
    console.log(`    ${chalk.red(`- ${diff.deleted.length} deleted`)}`)
    console.log('')
  } else {
    console.log(
      JSON.stringify({
        status: 'success',
        site_id,
        site_name: site_fields.name,
        added: diff.added.length,
        updated: diff.updated.length,
        deleted: diff.deleted.length,
        tx_digest: tx_result?.digest,
      }),
    )
  }
}

// Export for testing
export { fetch_site_resources, find_admin_cap, upload_files_to_walrus }
