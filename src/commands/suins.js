import { execSync, spawnSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { toBase64 } from '@mysten/sui/utils'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import Table from 'cli-table3'

import {
  get_owned_suins_names,
  validate_domain_ownership,
  link_suins_to_site,
  normalize_suins_name,
  get_suins_client,
} from '../lib/suins.js'
import { get_versui_package_id, get_original_package_id } from '../lib/env.js'
import { resolve_site_id } from '../lib/sui.js'

import { render_suins_ui } from './suins/ui/render.js'

/**
 * Get active Sui network from CLI
 * @returns {'mainnet' | 'testnet'} Network name (testnet|mainnet)
 */
function get_active_network() {
  try {
    const output = execSync('sui client active-env', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return /** @type {'mainnet' | 'testnet'} */ (output.trim())
  } catch {
    throw new Error(
      'Could not determine active Sui network. Run: sui client active-env',
    )
  }
}

/**
 * Get active wallet address from Sui CLI
 * @returns {string} Wallet address
 */
function get_active_address() {
  try {
    const output = execSync('sui client active-address', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return output.trim()
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
 * Add (link) a SuiNS name to a site
 * @param {string} name - SuiNS name (e.g., "mysite.sui" or "@mysite")
 * @param {Object} options - Command options
 * @param {string} [options.site] - Site ID (0x...) or site name
 * @param {'mainnet' | 'testnet'} [options.network] - Network (testnet|mainnet)
 * @param {boolean} [options.yes] - Skip confirmations
 */
export async function suins_add(name, options = {}) {
  try {
    const network = options.network || get_active_network()
    const address = get_active_address()

    // Resolve site if provided
    let site_id = options.site
    if (site_id) {
      const client = new SuiClient({
        url: getFullnodeUrl(/** @type {any} */ (network)),
      })
      site_id = await resolve_site_id(site_id, client, address, network)
    }

    await render_suins_ui({
      name,
      site: site_id,
      network,
      autoYes: options.yes,
    })
  } catch (error) {
    console.error('')
    console.error(chalk.red('  ✗ Error: ') + error.message)
    console.error('')
    process.exit(1)
  }
}

/**
 * List all owned SuiNS names with linked/unlinked status
 * @param {Object} options - Command options
 * @param {'mainnet' | 'testnet'} [options.network] - Network (testnet|mainnet)
 */
export async function suins_list(options = {}) {
  const spinner = ora()

  try {
    const network = options.network || get_active_network()
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

    // Get owned SuiNS names
    spinner.start('Finding your SuiNS names...')
    const names = await get_owned_suins_names(address, {
      sui_client,
      network,
    })

    if (names.length === 0) {
      spinner.succeed('No SuiNS names found')
      console.log('')
      console.log(chalk.gray('  Purchase a SuiNS name at: https://suins.io'))
      console.log('')
      return
    }
    spinner.succeed(`Found ${names.length} SuiNS name(s)`)

    // Get user's sites for matching
    spinner.start('Checking linked sites...')
    const sites = await get_user_sites(address, sui_client, original_package_id)
    const site_map = new Map(sites.map(s => [s.id, s.name]))
    spinner.stop()

    // Check walrusSiteId for each name
    const name_info = []
    for (const name of names) {
      try {
        const record = await suins_client.getNameRecord(name)
        const walrus_site_id = record?.contentHash ?? null
        const linked_site_name = walrus_site_id
          ? site_map.get(walrus_site_id)
          : null

        name_info.push({
          name,
          site_id: walrus_site_id,
          site_name: linked_site_name,
          is_versui_site: linked_site_name !== undefined && walrus_site_id,
        })
      } catch {
        name_info.push({
          name,
          site_id: null,
          site_name: null,
          is_versui_site: false,
        })
      }
    }

    // Display results
    console.log('')

    const table = new Table({
      head: ['SuiNS Name', 'Status', 'Linked Site'],
      colWidths: [25, 15, 40],
    })

    for (const info of name_info) {
      const status = info.site_id
        ? chalk.green('● Linked')
        : chalk.gray('○ Unlinked')

      const site_display = info.site_name
        ? `${info.site_name} (${info.site_id.slice(0, 8)}...)`
        : info.site_id
          ? `${info.site_id.slice(0, 16)}...`
          : chalk.dim('—')

      table.push([info.name, status, site_display])
    }

    console.log(table.toString())

    const linked_count = name_info.filter(n => n.site_id).length
    console.log('')
    console.log(
      chalk.dim(`  ${linked_count}/${names.length} name(s) linked to sites`),
    )
    console.log('')

    if (linked_count < names.length) {
      console.log(
        chalk.dim('  Link a name with: versui suins add <name> --site <id>'),
      )
      console.log('')
    }
  } catch (error) {
    if (spinner.isSpinning) spinner.stop()
    console.error('')
    console.error(chalk.red('  ✗ Error: ') + error.message)
    console.error('')
    process.exit(1)
  }
}
