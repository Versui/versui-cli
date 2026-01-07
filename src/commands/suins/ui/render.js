import { spawnSync } from 'node:child_process'

import React from 'react'
import { render } from 'ink'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { toBase64 } from '@mysten/sui/utils'

import {
  validate_domain_ownership,
  link_suins_to_site,
  normalize_suins_name,
  get_suins_client,
} from '../../../lib/suins.js'
import {
  get_versui_package_id,
  get_original_package_id,
} from '../../../lib/env.js'
import { dry_run_transaction } from '../../../lib/sui.js'

import App from './App.js'

/**
 * Get active wallet address from Sui CLI
 * @returns {string} Wallet address
 */
function get_active_address() {
  try {
    const output = spawnSync('sui', ['client', 'active-address'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return output.stdout.trim()
  } catch {
    throw new Error(
      'Could not get active wallet address. Run: sui client active-address',
    )
  }
}

/**
 * Get Site object info including name
 * @param {string} site_id - Site object ID
 * @param {import('@mysten/sui/client').SuiClient} client - Sui client
 * @returns {Promise<{ name: string } | null>}
 */
async function get_site_info(site_id, client) {
  const site_obj = await client.getObject({
    id: site_id,
    options: { showContent: true },
  })

  if (!site_obj?.data) return null

  const name =
    /** @type {any} */ (site_obj.data.content)?.fields?.name || 'Unnamed'

  return { name }
}

/**
 * Get user's sites (returns site IDs with names)
 * @param {string} address - Wallet address
 * @param {import('@mysten/sui/client').SuiClient} client - Sui client
 * @param {string} original_package_id - Original package ID (for type filtering)
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
async function get_user_sites(address, client, original_package_id) {
  const admin_cap_type = `${original_package_id}::site::SiteAdminCap`
  const admin_caps = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: admin_cap_type },
    options: { showContent: true },
  })

  const sites = []
  for (const cap of admin_caps.data) {
    const site_id = /** @type {any} */ (cap.data?.content)?.fields?.site_id
    if (!site_id) continue

    const site_info = await get_site_info(site_id, client)
    sites.push({
      id: site_id,
      name: site_info?.name || 'Unnamed',
    })
  }

  return sites
}

/**
 * Renders the Ink-based suins UI with wired business logic
 * @param {Object} options - SuiNS link options
 * @param {string} options.name - SuiNS name to link
 * @param {string} [options.site] - Pre-selected site ID
 * @param {'mainnet' | 'testnet'} [options.network] - Network
 * @param {boolean} [options.autoYes] - Skip confirmations
 * @returns {Promise} - Resolves with link result
 */
export async function render_suins_ui(options) {
  const { name, site, network = 'testnet', autoYes = false } = options

  const address = get_active_address()
  const package_id = get_versui_package_id(network)
  const original_package_id = get_original_package_id(network)

  if (!package_id) {
    throw new Error(`Versui not deployed on ${network}`)
  }

  if (!original_package_id) {
    throw new Error(
      `Original Versui package not found on ${network}. Cannot query existing objects.`,
    )
  }

  const sui_client = new SuiClient({
    url: getFullnodeUrl(/** @type {any} */ (network)),
  })
  const suins_client = get_suins_client({
    client: sui_client,
    network,
  })

  const normalized = normalize_suins_name(name)

  // Validate ownership upfront
  const ownership = await validate_domain_ownership(normalized, address, {
    suins_client,
    sui_client,
  })

  if (!ownership.valid) {
    throw new Error(ownership.error || 'Ownership validation failed')
  }

  // Clear console on startup
  process.stdout.write('\x1Bc')

  return new Promise((resolve, reject) => {
    const { waitUntilExit } = render(
      React.createElement(App, {
        suins_name: normalized,
        site_id: site,
        auto_yes: autoYes,
        onStepChange: async (step, data) => {
          try {
            switch (step) {
              case 'load_sites': {
                const sites = await get_user_sites(
                  address,
                  sui_client,
                  original_package_id,
                )
                if (sites.length === 0) {
                  throw new Error(
                    'No sites found. Deploy a site first with: versui deploy',
                  )
                }
                return sites
              }

              case 'link': {
                const result = await link_suins_to_site(
                  data.suins_name,
                  data.site_id,
                  { suins_client },
                )

                if (!result.success) {
                  throw new Error(result.error || 'Failed to build transaction')
                }

                // Set sender for dry-run and execution
                result.transaction.setSender(address)

                // Dry-run to get cost estimate
                const gas_cost = await dry_run_transaction(
                  result.transaction,
                  sui_client,
                )
                console.log(
                  `⛓ Cost: ${(gas_cost.totalCost / 1e9).toFixed(4)} SUI (dry-run)`,
                )

                // Execute transaction
                const tx_bytes = await result.transaction.build({
                  client: sui_client,
                })
                const tx_base64 = toBase64(tx_bytes)

                const spawn_result = spawnSync(
                  'sui',
                  ['client', 'serialized-tx', tx_base64, '--json'],
                  {
                    encoding: 'utf8',
                    stdio: ['inherit', 'pipe', 'pipe'],
                  },
                )

                if (spawn_result.error) {
                  throw spawn_result.error
                }

                if (spawn_result.status !== 0) {
                  throw new Error(
                    `sui command failed with status ${spawn_result.status}`,
                  )
                }

                const tx_result = JSON.parse(spawn_result.stdout)
                const status = tx_result?.effects?.status?.status

                if (status !== 'success') {
                  const error_msg =
                    tx_result?.effects?.status?.error || 'Transaction failed'
                  throw new Error(error_msg)
                }

                return {
                  tx_digest: tx_result.digest,
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

export default render_suins_ui
