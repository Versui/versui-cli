import { spawnSync } from 'node:child_process'

import React from 'react'
import { render } from 'ink'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'

import {
  get_versui_package_id,
  get_original_package_id,
  get_version_object_id,
} from '../../../lib/env.js'
import { dry_run_transaction } from '../../../lib/sui.js'

import App from './App.js'

const DOMAIN_REGISTRY_IDS = {
  testnet: '0x3bb74d3bba466dd8fb5e3c639929b0632472c9a0682d5659e2519525cd4ab13a',
  mainnet: null,
}

const CLOCK_OBJECT_ID = '0x6'

/**
 * Validate domain format (matches Move contract validation)
 */
function validate_domain_format(domain) {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, error: 'Domain cannot be empty' }
  }

  const len = domain.length
  if (len < 3 || len > 253) {
    return { valid: false, error: 'Domain must be 3-253 characters' }
  }

  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return {
      valid: false,
      error:
        'Domain can only contain lowercase letters, numbers, hyphens, and dots',
    }
  }

  if (/^[.-]|[.-]$/.test(domain)) {
    return { valid: false, error: 'Domain cannot start or end with . or -' }
  }

  if (/\.\./.test(domain)) {
    return { valid: false, error: 'Domain cannot have consecutive dots' }
  }

  if (!domain.includes('.')) {
    return { valid: false, error: 'Domain must include a TLD (e.g., .com)' }
  }

  if (/(?:^|\.)(xn--)/.test(domain)) {
    return {
      valid: false,
      error: 'Punycode (internationalized) domains are not allowed',
    }
  }

  if (domain.includes('../') || domain.includes('..\\')) {
    return { valid: false, error: 'Domain contains invalid path traversal' }
  }

  return { valid: true }
}

/**
 * Find AdminCap for a given site ID
 */
async function find_admin_cap(site_id, address, client, original_package_id) {
  const admin_cap_type = `${original_package_id}::site::SiteAdminCap`
  const admin_caps = await client.getOwnedObjects({
    owner: address,
    filter: {
      StructType: admin_cap_type,
    },
    options: {
      showContent: true,
    },
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
 * Execute transaction via Sui CLI
 */
async function execute_transaction(tx, client) {
  const tx_bytes = await tx.build({ client })
  const tx_base64 = toBase64(tx_bytes)

  const result = spawnSync(
    'sui',
    ['client', 'serialized-tx', tx_base64, '--json'],
    {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`sui command failed with status ${result.status}`)
  }

  return JSON.parse(result.stdout)
}

/**
 * Get site name from object ID
 */
async function get_site_name(site_id, client) {
  const site_obj = await client.getObject({
    id: site_id,
    options: {
      showContent: true,
    },
  })

  if (!site_obj?.data) return null

  return /** @type {any} */ (site_obj.data.content)?.fields?.name || 'Unnamed'
}

/**
 * Load user's sites
 */
async function load_sites(address, client, original_package_id) {
  const admin_cap_type = `${original_package_id}::site::SiteAdminCap`
  const admin_caps = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: admin_cap_type },
    options: { showContent: true },
  })

  const sites = []
  for (const cap of admin_caps.data) {
    const cap_site_id = /** @type {any} */ (cap.data?.content)?.fields?.site_id
    if (!cap_site_id) continue

    const site_name = await get_site_name(cap_site_id, client)

    // Get resource count
    let resource_count = 0
    const site_obj = await client.getObject({
      id: cap_site_id,
      options: { showContent: true },
    })

    if (site_obj?.data) {
      const { fields: site_fields } = /** @type {any} */ (site_obj.data.content)
      const resources_table_id = site_fields.resources?.fields?.id?.id

      if (resources_table_id) {
        const resources_response = await client.getDynamicFields({
          parentId: resources_table_id,
        })
        resource_count = resources_response.data.length
      }
    }

    sites.push({
      object_id: cap_site_id,
      name: site_name || 'Unnamed',
      resource_count,
    })
  }

  return sites
}

/**
 * Render Ink UI for domain add command
 */
export async function render_domain_add_ui(domain, options = {}) {
  const network = options.network || 'testnet'
  const { address } = options
  const package_id = get_versui_package_id(network)
  const original_package_id = get_original_package_id(network)
  const registry_id = DOMAIN_REGISTRY_IDS[network]

  if (!package_id) {
    throw new Error(`Versui not deployed on ${network}`)
  }

  if (!original_package_id) {
    throw new Error(
      `Original Versui package not found on ${network}. Cannot query existing objects.`,
    )
  }

  if (!registry_id) {
    throw new Error(
      `DomainRegistry not configured for ${network}. Set DOMAIN_REGISTRY_ID env var.`,
    )
  }

  const client = new SuiClient({
    url: getFullnodeUrl(/** @type {any} */ (network)),
  })

  // Clear console on startup
  process.stdout.write('\x1Bc')

  // Load sites
  const sites = await load_sites(address, client, original_package_id)

  if (sites.length === 0) {
    throw new Error('No sites found. Deploy a site first with: versui deploy')
  }

  return new Promise((resolve, reject) => {
    const { waitUntilExit } = render(
      React.createElement(App, {
        domain,
        site_id: options.site,
        sites,
        is_loading_sites: false,

        onSiteSelect: site => {
          // Site selected, validation will trigger automatically
        },

        onValidateDomain: async (domain_name, site) => {
          // Validate domain format
          const validation = validate_domain_format(domain_name)
          if (!validation.valid) {
            return validation
          }

          // Check if AdminCap exists
          const admin_cap_id = await find_admin_cap(
            site.object_id,
            address,
            client,
            original_package_id,
          )

          if (!admin_cap_id) {
            return {
              valid: false,
              error: `You don't have admin access to site ${site.object_id}`,
            }
          }

          return { valid: true, admin_cap_id }
        },

        onEstimateCost: async (domain_name, site) => {
          // Find AdminCap
          const admin_cap_id = await find_admin_cap(
            site.object_id,
            address,
            client,
            original_package_id,
          )

          if (!admin_cap_id) {
            throw new Error(
              `You don't have admin access to site ${site.object_id}`,
            )
          }

          // Build transaction
          const tx = new Transaction()
          tx.setSender(address)

          const version_id = get_version_object_id(network)
          if (!version_id) {
            throw new Error(`Version object not deployed on ${network}`)
          }

          tx.moveCall({
            target: `${package_id}::domain_registry::add_custom_domain`,
            arguments: [
              tx.object(version_id),
              tx.object(registry_id),
              tx.object(admin_cap_id),
              tx.object(site.object_id),
              tx.pure.string(domain_name),
              tx.object(CLOCK_OBJECT_ID),
            ],
          })

          // Dry-run to get cost estimate
          const gas_cost = await dry_run_transaction(tx, client)
          return gas_cost.totalCost
        },

        onExecute: async (domain_name, site) => {
          // Find AdminCap
          const admin_cap_id = await find_admin_cap(
            site.object_id,
            address,
            client,
            original_package_id,
          )

          if (!admin_cap_id) {
            throw new Error(
              `You don't have admin access to site ${site.object_id}`,
            )
          }

          // Build transaction
          const tx = new Transaction()
          tx.setSender(address)

          const version_id = get_version_object_id(network)
          if (!version_id) {
            throw new Error(`Version object not deployed on ${network}`)
          }

          tx.moveCall({
            target: `${package_id}::domain_registry::add_custom_domain`,
            arguments: [
              tx.object(version_id),
              tx.object(registry_id),
              tx.object(admin_cap_id),
              tx.object(site.object_id),
              tx.pure.string(domain_name),
              tx.object(CLOCK_OBJECT_ID),
            ],
          })

          // Execute transaction
          let result
          try {
            result = await execute_transaction(tx, client)
          } catch (error) {
            // Detect "domain already exists" MoveAbort
            const error_msg = error.message || String(error)
            if (
              error_msg.includes('MoveAbort') &&
              error_msg.includes('domain_registry') &&
              error_msg.includes('add_custom_domain')
            ) {
              throw new Error(
                `Domain "${domain_name}" is already registered to this site or another site.`,
              )
            }
            throw error
          }

          const status = result?.effects?.status?.status

          if (status !== 'success') {
            const error_msg =
              result?.effects?.status?.error || 'Transaction failed'
            throw new Error(error_msg)
          }

          return {
            digest: result.digest,
            status: 'success',
          }
        },

        onComplete: result => {
          waitUntilExit()
            .then(() => {
              resolve(result)
              process.exit(0)
            })
            .catch(reject)
        },
        onError: error => {
          waitUntilExit()
            .then(() => {
              reject(error)
              process.exit(1)
            })
            .catch(reject)
        },
      }),
    )
  })
}

export default render_domain_add_ui
