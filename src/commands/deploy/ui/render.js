import { spawn } from 'node:child_process'

import React from 'react'
import { render } from 'ink'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'

import * as logic from '../logic.js'
import * as sui_lib from '../../../lib/sui.js'
import { detect_service_worker } from '../../../lib/sw.js'
import { format_bytes } from '../formatting.js'

import App from './App.js'

/**
 * Run a command and return stdout
 * @param {string} cmd - Command to run
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} stdout
 */
async function run_command(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', err => {
      reject(err)
    })

    child.on('close', code => {
      if (code !== 0) {
        const error = new Error(`Command failed: ${cmd} ${args.join(' ')}`)
        error.stderr = stderr
        reject(error)
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * Renders the Ink-based deploy UI with wired business logic
 * @param {Object} options - Deploy options
 * @param {string} options.directory - Directory to deploy
 * @param {string} options.name - Pre-filled site name
 * @param {string} options.network - Pre-selected network
 * @param {number} options.epochs - Pre-set duration
 * @param {boolean} options.autoYes - Skip confirmations
 * @param {string} options.wallet - Wallet address
 * @param {string} options.versui_object_id - Versui registry object ID
 * @returns {Promise} - Resolves with deploy result
 */
export async function render_deploy_ui(options) {
  const network = options.network || 'testnet'
  const sui_client = new SuiClient({ url: getFullnodeUrl(network) })

  // Clear console on startup
  process.stdout.write('\x1Bc')

  return new Promise((resolve, reject) => {
    const { waitUntilExit } = render(
      React.createElement(App, {
        directory: options.directory,
        name: options.name,
        network,
        epochs: options.epochs,
        autoYes: options.autoYes,
        onStepChange: async (step, data) => {
          try {
            switch (step) {
              case 'scanning': {
                const [scan_result, balances] = await Promise.all([
                  logic.scan_directory_with_metadata_async(data.directory),
                  logic.get_wallet_balances(
                    options.wallet,
                    network,
                    sui_client,
                  ),
                ])
                const walrus_cost = await logic.dry_run_walrus_cost(
                  data.directory,
                  data.epochs,
                )

                return {
                  files: scan_result.files,
                  totalSize: format_bytes(scan_result.total_size),
                  metadata: scan_result.metadata,
                  balances,
                  walrusCost: walrus_cost,
                }
              }

              case 'checking_site': {
                const availability = await logic.check_site_availability({
                  site_name: data.name,
                  wallet: options.wallet,
                  network,
                  versui_object_id: options.versui_object_id,
                  sui_client,
                })

                if (!availability.available) {
                  throw new Error(
                    `Site "${data.name}" already exists (ID: ${availability.existing_site_id}). Use 'versui update' to update it.`,
                  )
                }

                return {
                  available: true,
                }
              }

              case 'walrus_upload': {
                const result = await logic.upload_to_walrus(
                  options.directory,
                  data.epochs,
                  spawn,
                )
                return {
                  blobId: result.blob_id,
                  blobObjectId: result.blob_object_id,
                  patches: result.patches,
                }
              }

              case 'estimating_cost': {
                const sui_cost = await logic.estimate_sui_deploy_cost(
                  data.name,
                  data.patches,
                  data.metadata,
                  options.wallet,
                  network,
                  sui_client,
                )

                return {
                  suiCost: sui_cost,
                }
              }

              case 'sui_create': {
                // Build the transaction first
                const { tx_bytes_base64 } =
                  await sui_lib.build_create_site_transaction(
                    data.name,
                    options.wallet,
                    sui_client,
                    network,
                  )

                const result = await logic.create_site({
                  site_name: data.name,
                  wallet: options.wallet,
                  network,
                  versui_object_id: options.versui_object_id,
                  sui_client,
                  tx_base64: tx_bytes_base64,
                  run_command,
                })
                return {
                  siteId: result.site_id,
                  adminCapId: result.admin_cap_id,
                  initialSharedVersion: result.initial_shared_version,
                }
              }

              case 'resources_add': {
                // Build resources array from patches and metadata
                const resources = data.patches.map(patch => {
                  // Normalize identifier to ensure leading slash
                  const path = patch.identifier.startsWith('/')
                    ? patch.identifier
                    : '/' + patch.identifier
                  const file_meta = data.metadata[path]

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

                // Build the transaction
                const { tx_bytes_base64 } =
                  await sui_lib.build_add_resources_transaction(
                    data.adminCapId,
                    data.siteId,
                    data.initialSharedVersion,
                    resources,
                    options.wallet,
                    sui_client,
                    network,
                  )

                const result = await logic.add_resources(
                  tx_bytes_base64,
                  run_command,
                )
                return {
                  txDigest: result.tx_digest,
                }
              }

              case 'sw_check': {
                const result = await logic.check_service_worker(
                  data.directory,
                  detect_service_worker,
                )
                return {
                  hasServiceWorker: result.type !== 'none',
                  type: result.type,
                  path: result.path,
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

export default render_deploy_ui
