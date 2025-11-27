import { execSync } from 'node:child_process'

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
import { VERSUI_PACKAGE_IDS } from '../lib/env.js'

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
 * @param {string} package_id - Versui package ID
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
async function get_user_sites(address, client, package_id) {
  const admin_cap_type = `${package_id}::site::SiteAdminCap`
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
 * @param {string} [options.site] - Site object ID
 * @param {'mainnet' | 'testnet'} [options.network] - Network (testnet|mainnet)
 */
export async function suins_add(name, options = {}) {
  const spinner = ora()

  try {
    const network = options.network || get_active_network()
    const address = get_active_address()
    const package_id = VERSUI_PACKAGE_IDS[network]

    if (!package_id) {
      throw new Error(`Versui not deployed on ${network}`)
    }

    const sui_client = new SuiClient({
      url: getFullnodeUrl(/** @type {any} */ (network)),
    })
    const suins_client = get_suins_client({
      client: sui_client,
      network,
    })

    const normalized = normalize_suins_name(name)

    // Validate ownership
    spinner.start(`Validating ownership of ${normalized}...`)
    const ownership = await validate_domain_ownership(normalized, address, {
      suins_client,
      sui_client,
    })

    if (!ownership.valid) {
      spinner.fail('Ownership validation failed')
      throw new Error(ownership.error)
    }
    spinner.succeed(`You own ${normalized}`)

    // Get or prompt for site ID
    let site_id = options.site
    if (!site_id) {
      spinner.start('Finding your sites...')
      const sites = await get_user_sites(address, sui_client, package_id)
      spinner.stop()

      if (sites.length === 0) {
        throw new Error(
          'No sites found. Deploy a site first with: versui deploy',
        )
      }

      const site_choices = sites.map(({ id, name: site_name }) => ({
        title: `${site_name} (${id.slice(0, 10)}...)`,
        value: id,
      }))

      const { site_id: selected_site_id } = await prompts({
        type: 'select',
        name: 'site_id',
        message: 'Select site to link:',
        choices: site_choices,
      })

      if (!selected_site_id) {
        console.log(chalk.gray('  Cancelled.'))
        return
      }

      site_id = selected_site_id
    }

    // Get site info for display
    spinner.start('Querying site...')
    const site_info = await get_site_info(site_id, sui_client)
    if (!site_info) {
      spinner.fail('Site not found')
      throw new Error(`Site ${site_id} not found`)
    }
    spinner.succeed(`Site: ${site_info.name}`)

    // Build the link transaction
    spinner.start('Building transaction...')
    const result = await link_suins_to_site(normalized, site_id, {
      suins_client,
    })

    if (!result.success) {
      spinner.fail('Failed to build transaction')
      throw new Error(result.error)
    }
    spinner.succeed('Transaction built')

    // Execute transaction
    spinner.start('Executing transaction...')
    result.transaction.setSender(address)
    const tx_bytes = await result.transaction.build({ client: sui_client })
    const tx_base64 = toBase64(tx_bytes)

    const output = execSync(`sui client serialized-tx ${tx_base64} --json`, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    const tx_result = JSON.parse(output)
    const status = tx_result?.effects?.status?.status

    if (status === 'success') {
      spinner.succeed(chalk.green(`Linked ${normalized} to site!`))
      console.log('')
      console.log(
        chalk.dim('  Access your site at: ') +
          chalk.cyan(`https://${normalized.replace('.sui', '')}.suins.site`),
      )
      console.log('')
    } else {
      const error_msg =
        tx_result?.effects?.status?.error || 'Transaction failed'
      spinner.fail(chalk.red('Transaction failed'))
      throw new Error(error_msg)
    }
  } catch (error) {
    if (spinner.isSpinning) spinner.stop()
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
    const package_id = VERSUI_PACKAGE_IDS[network]

    if (!package_id) {
      throw new Error(`Versui not deployed on ${network}`)
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
    const sites = await get_user_sites(address, sui_client, package_id)
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
