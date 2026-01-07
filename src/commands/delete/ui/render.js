import { spawn } from 'node:child_process'

import React from 'react'
import { render } from 'ink'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'

import {
  get_versui_package_id,
  get_version_object_id,
  get_original_package_id,
} from '../../../lib/env.js'
import {
  build_complete_delete_transaction,
  build_batch_delete_sites_transaction,
  dry_run_transaction,
} from '../../../lib/sui.js'

import App from './App.js'

/**
 * Execute sui client command asynchronously
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, success: boolean}>}
 */
function execute_sui_command(args) {
  return new Promise(resolve => {
    const proc = spawn('sui', args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', data => {
      stdout += data.toString()
    })

    proc.stderr.on('data', data => {
      stderr += data.toString()
    })

    proc.on('close', code => {
      resolve({
        stdout,
        stderr,
        success: code === 0 && stdout.includes('Status: Success'),
      })
    })

    proc.on('error', error => {
      resolve({
        stdout,
        stderr: stderr + error.message,
        success: false,
      })
    })
  })
}

/**
 * Validate resource path
 * @param {string} path - Resource path to validate
 * @returns {boolean} True if valid
 */
function is_valid_resource_path(path) {
  if (path.length > 10000) return false

  let decoded = path
  let prev_decoded = ''
  while (decoded !== prev_decoded) {
    prev_decoded = decoded
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      return false
    }
  }

  const normalized_input = decoded.normalize('NFC')
  if (normalized_input.includes('\x00')) return false
  if (/[\uFF0E\u2024\u3002\uFE52\uFF61]/.test(normalized_input)) return false
  if (/^[a-zA-Z]:/.test(normalized_input)) return false
  if (/^\\/.test(normalized_input)) return false
  if (normalized_input.includes('\\')) return false
  if (/\.{3,}/.test(normalized_input)) return false
  if (/[;|`$]|<\(|\$\(/.test(normalized_input)) return false
  if (/(?:^|\/|\\)\.\.(?:\/|\\|$)/.test(normalized_input)) return false

  return true
}

/**
 * Renders the Ink-based delete UI
 * @param {Object} options - Delete options
 * @param {string[]} options.site_ids - Site IDs to delete
 * @param {Object[]} options.validated_sites - Pre-validated sites with admin caps
 * @param {string} options.network - Network (testnet|mainnet)
 * @param {boolean} options.autoYes - Skip confirmations
 * @returns {Promise} - Resolves with deletion result
 */
export async function render_delete_ui(options) {
  const { network } = options
  const sui_client = new SuiClient({ url: getFullnodeUrl(network) })

  // Clear console on startup
  process.stdout.write('\x1Bc')

  return new Promise((resolve, reject) => {
    const { waitUntilExit } = render(
      React.createElement(App, {
        site_ids: options.site_ids,
        site_details: options.site_details,
        network,
        autoYes: options.autoYes,
        onStepChange: async (step, data) => {
          try {
            switch (step) {
              case 'validating': {
                // Use pre-validated sites from options
                const validated_sites = options.validated_sites.map(site => ({
                  site_id: site.site_id,
                  admin_cap_id: site.admin_cap_id,
                  resources: site.resources || [],
                }))

                const total_resources = validated_sites.reduce(
                  (sum, site) => sum + (site.resources?.length || 0),
                  0,
                )

                return {
                  validated_sites,
                  total_resources,
                }
              }

              case 'estimating_cost': {
                // Dry-run deletion to estimate gas cost
                const { validated_sites } = data

                // Estimate cost for first site (representative)
                const first_site = validated_sites[0]
                if (!first_site) {
                  return { estimated_gas: null }
                }

                // Get site object to extract version
                const site_obj = await sui_client.getObject({
                  id: first_site.site_id,
                  options: { showOwner: true },
                })

                const site_version =
                  site_obj.data?.owner?.Shared?.initial_shared_version
                if (!site_version) {
                  throw new Error(
                    'Could not get site version for cost estimation',
                  )
                }

                // Get active address for sender
                const { execSync } = await import('node:child_process')
                const sender = execSync('sui client active-address', {
                  encoding: 'utf-8',
                  stdio: ['pipe', 'pipe', 'ignore'],
                }).trim()

                // Build complete deletion PTB
                const tx = await build_complete_delete_transaction(
                  first_site.admin_cap_id,
                  first_site.site_id,
                  site_version,
                  first_site.resources,
                  sender,
                  sui_client,
                  network,
                )

                // Dry-run to get gas cost
                const gas_cost = await dry_run_transaction(tx, sui_client)

                // Calculate cost per site (estimate for all sites)
                const total_sites = validated_sites.length
                const estimated_total_gas = gas_cost.totalCost * total_sites

                return {
                  estimated_gas: {
                    per_site: gas_cost.totalCost,
                    total: estimated_total_gas,
                    computation: gas_cost.computationCost,
                    storage: gas_cost.storageCost,
                    rebate: gas_cost.storageRebate,
                    site_count: total_sites,
                  },
                }
              }

              case 'deleting_resources': {
                const { site_id, admin_cap_id, resources } = data
                const package_id = get_versui_package_id(network)
                const version_id = get_version_object_id(network)

                if (!package_id) {
                  throw new Error(`Versui package not deployed on ${network}`)
                }
                if (!version_id) {
                  throw new Error(`Version object not deployed on ${network}`)
                }

                // If no resources, skip
                if (!resources || resources.length === 0) {
                  return { deleted_count: 0 }
                }

                // Filter valid paths
                const paths_to_delete = resources.filter(r =>
                  is_valid_resource_path(r.path),
                )

                if (paths_to_delete.length === 0) {
                  return { deleted_count: 0 }
                }

                // Delete in batches of 50
                const batch_size = 50
                const total_batches = Math.ceil(
                  paths_to_delete.length / batch_size,
                )
                let total_deleted = 0

                for (let i = 0; i < total_batches; i++) {
                  const batch_start = i * batch_size
                  const batch_end = Math.min(
                    batch_start + batch_size,
                    paths_to_delete.length,
                  )
                  const batch = paths_to_delete
                    .slice(batch_start, batch_end)
                    .map(r => r.path)

                  const gas_budget = Math.max(
                    50_000_000,
                    1_000_000 + batch.length * 1_000_000,
                  )

                  const result = await execute_sui_command([
                    'client',
                    'call',
                    '--package',
                    package_id,
                    '--module',
                    'site',
                    '--function',
                    'delete_resources_batch',
                    '--args',
                    version_id,
                    admin_cap_id,
                    site_id,
                    JSON.stringify(batch),
                    '--gas-budget',
                    gas_budget.toString(),
                  ])

                  if (!result.success) {
                    throw new Error(
                      `Failed to delete batch ${i + 1}/${total_batches}`,
                    )
                  }

                  total_deleted += batch.length
                }

                return { deleted_count: total_deleted }
              }

              case 'deleting_site': {
                const { site_id, admin_cap_id } = data
                const package_id = get_versui_package_id(network)
                const version_id = get_version_object_id(network)

                if (!package_id) {
                  throw new Error(`Versui package not deployed on ${network}`)
                }
                if (!version_id) {
                  throw new Error(`Version object not deployed on ${network}`)
                }

                const result = await execute_sui_command([
                  'client',
                  'call',
                  '--package',
                  package_id,
                  '--module',
                  'site',
                  '--function',
                  'delete_site',
                  '--args',
                  version_id,
                  admin_cap_id,
                  site_id,
                  '--gas-budget',
                  '10000000',
                ])

                if (!result.success) {
                  const error_detail =
                    result.stderr.trim() || result.stdout.trim()
                  throw new Error(`Site deletion failed: ${error_detail}`)
                }

                return { site_id, success: true }
              }

              case 'deleting_sites_batch': {
                const { validated_sites } = data
                const package_id = get_versui_package_id(network)
                const version_id = get_version_object_id(network)

                if (!package_id) {
                  throw new Error(`Versui package not deployed on ${network}`)
                }
                if (!version_id) {
                  throw new Error(`Version object not deployed on ${network}`)
                }

                // Get active address for sender
                const { execSync } = await import('node:child_process')
                const sender = execSync('sui client active-address', {
                  encoding: 'utf-8',
                  stdio: ['pipe', 'pipe', 'ignore'],
                }).trim()

                // Get site versions for all sites
                const sites_with_versions = await Promise.all(
                  validated_sites.map(async site => {
                    const site_obj = await sui_client.getObject({
                      id: site.site_id,
                      options: { showOwner: true },
                    })

                    const site_version =
                      site_obj.data?.owner?.Shared?.initial_shared_version
                    if (!site_version) {
                      throw new Error(
                        `Could not get site version for ${site.site_id}`,
                      )
                    }

                    return {
                      admin_cap_id: site.admin_cap_id,
                      site_id: site.site_id,
                      site_version,
                    }
                  }),
                )

                // Build batched transaction
                const tx_result = await build_batch_delete_sites_transaction(
                  sites_with_versions,
                  sender,
                  sui_client,
                  network,
                )

                // Sign and execute via CLI (preserves existing auth flow)
                const { writeFileSync, unlinkSync } = await import('node:fs')
                const { tmpdir } = await import('node:os')
                const { join } = await import('node:path')

                const tmp_file = join(
                  tmpdir(),
                  `versui-batch-delete-${Date.now()}.txt`,
                )
                writeFileSync(tmp_file, tx_result.tx_bytes_base64)

                try {
                  // Sign transaction
                  const sign_result = await execute_sui_command([
                    'keytool',
                    'sign',
                    '--data',
                    tx_result.tx_bytes_base64,
                  ])

                  if (!sign_result.success) {
                    throw new Error(
                      `Failed to sign transaction: ${sign_result.stderr}`,
                    )
                  }

                  // Extract signature
                  const sig_match = sign_result.stdout.match(
                    /Serialized signature[^:]*:\s*([A-Za-z0-9+/=]+)/,
                  )
                  if (!sig_match) {
                    throw new Error(
                      'Could not extract signature from keytool output',
                    )
                  }

                  // Execute signed transaction
                  const exec_result = await execute_sui_command([
                    'client',
                    'execute-signed-tx',
                    '--tx-bytes',
                    tx_result.tx_bytes_base64,
                    '--signatures',
                    sig_match[1],
                  ])

                  if (!exec_result.success) {
                    const error_detail =
                      exec_result.stderr.trim() || exec_result.stdout.trim()
                    throw new Error(
                      `Batch site deletion failed: ${error_detail}`,
                    )
                  }

                  return {
                    deleted_count: validated_sites.length,
                    success: true,
                  }
                } finally {
                  // Clean up temp file
                  try {
                    unlinkSync(tmp_file)
                  } catch (e) {
                    // Ignore cleanup errors
                  }
                }
              }

              default:
                return {}
            }
          } catch (error) {
            reject(error)
            throw error
          }
        },
        onComplete: resolve,
        onError: reject,
      }),
    )

    waitUntilExit().catch(reject)
  })
}

export default render_delete_ui
