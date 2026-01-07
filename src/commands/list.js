import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import ora from 'ora'
import gradient from 'gradient-string'
import figlet from 'figlet'

import { format_sites_table } from '../lib/sui.js'
import { get_original_package_id } from '../lib/env.js'

/**
 * List deployments
 * @param {Object} options - Command options
 * @param {string} [options.network] - Network to query (testnet|mainnet)
 * @param {boolean} [options.includeRemnants] - Include incomplete/orphaned sites
 * @returns {Promise<void>}
 */
export async function list(options = {}) {
  try {
    // Clear console and show header
    process.stdout.write('\x1Bc')

    const versui_gradient = gradient(['#4DA2FF', '#00D4FF', '#2DD4BF'])
    const border_gradient = gradient(['#4DA2FF', '#2DD4BF'])

    const logo = figlet.textSync('VERSUI', {
      font: 'Small',
      horizontalLayout: 'fitted',
    })

    const box_width = 60
    const top_border = '╭' + '─'.repeat(box_width - 2) + '╮'
    const bottom_border = '╰' + '─'.repeat(box_width - 2) + '╯'

    console.log(border_gradient(top_border))

    const logo_lines = logo.split('\n')
    for (const line of logo_lines) {
      const padding = box_width - 4 - line.length
      const right_pad = padding > 0 ? padding : 0
      console.log(
        border_gradient('│ ') +
          versui_gradient(line) +
          border_gradient(' '.repeat(right_pad) + ' │'),
      )
    }

    console.log(border_gradient('│' + ' '.repeat(box_width - 2) + '│'))

    const tagline = 'Decentralized Site Hosting on Walrus + Sui'
    const tagline_padding = box_width - 4 - tagline.length
    const tagline_right_pad = tagline_padding > 0 ? tagline_padding : 0
    console.log(
      border_gradient('│ ') +
        chalk.dim(tagline) +
        border_gradient(' '.repeat(tagline_right_pad) + ' │'),
    )

    console.log(border_gradient(bottom_border))
    console.log('')

    // Get network (from flag or active env)
    const network = options.network || get_active_network()

    // Get wallet address
    const address = get_active_address()

    // Display network and address header
    console.log(chalk.dim('  Network: ') + chalk.cyan(network))
    console.log(chalk.dim('  Address: ') + chalk.cyan(address))
    console.log('')

    // Create Sui client
    const client = new SuiClient({
      url: getFullnodeUrl(/** @type {any} */ (network)),
    })

    // Query sites via AdminCaps (Sites are shared objects, can't use getOwnedObjects)
    const spinner = ora({
      text: 'Fetching deployments...',
      isSilent: !process.stdout.isTTY,
    }).start()

    // Use original package ID for querying AdminCaps (existing objects have old type)
    const original_package_id = get_original_package_id(network)
    if (!original_package_id) {
      throw new Error(
        `Original Versui package not found on ${network}. Cannot query AdminCaps.`,
      )
    }

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

    // Extract site IDs from AdminCaps and fetch Site objects
    const sites = []
    const remnants = []

    for (const item of admin_caps.data) {
      if (!item.data?.content) continue
      const {
        fields: { site_id },
      } = /** @type {any} */ (item.data.content)

      // Fetch the Site object
      let site_obj
      try {
        site_obj = await client.getObject({
          id: site_id,
          options: {
            showContent: true,
            showPreviousTransaction: true,
          },
        })
      } catch (error) {
        // Site object fetch failed - this is a remnant
        if (options.includeRemnants) {
          remnants.push({
            object_id: site_id,
            admin_cap_id: item.data.objectId,
            name: '[Unknown - Site Creation Failed]',
            files_count: 0,
            total_size: 0,
            network,
            is_remnant: true,
          })
        }
        continue
      }

      // Check if site object exists and has valid content
      if (!site_obj?.data?.content) {
        if (options.includeRemnants) {
          remnants.push({
            object_id: site_id,
            admin_cap_id: item.data.objectId,
            name: '[Incomplete - No Site Data]',
            files_count: 0,
            total_size: 0,
            network,
            is_remnant: true,
          })
        }
        continue
      }

      const { fields: site_fields } = /** @type {any} */ (site_obj.data.content)

      // Extract resources Table ID and query resource count
      const resources_table_id = site_fields.resources?.fields?.id?.id
      let files_count = 0

      if (resources_table_id) {
        const resources_response = await client.getDynamicFields({
          parentId: resources_table_id,
        })
        files_count = resources_response.data.length
      }

      // Get creation timestamp from transaction
      let created_at = null
      if (site_obj.data?.previousTransaction) {
        const tx_digest = site_obj.data.previousTransaction
        try {
          const tx_block = await client.getTransactionBlock({
            digest: tx_digest,
            options: { showEffects: false },
          })
          created_at = tx_block.timestampMs
            ? Number(tx_block.timestampMs)
            : null
        } catch (error) {
          // Timestamp fetch failed - skip
        }
      }

      sites.push({
        object_id: site_id,
        name: site_fields.name || 'Unnamed',
        files_count,
        total_size: 0, // TODO: Calculate from resources
        network,
        is_remnant: false,
        created_at,
      })
    }

    // Combine sites and remnants if flag is set
    const all_sites = options.includeRemnants ? [...sites, ...remnants] : sites

    spinner.clear()
    spinner.stop()

    // Format and display
    const table_str = format_sites_table(all_sites, network)
    console.log(table_str)
    console.log('')
  } catch (error) {
    console.error('')
    console.error(chalk.red('  ✗ Error: ') + error.message)
    console.error('')
    process.exit(1)
  }
}

/**
 * Get active Sui network from CLI
 * @returns {string} Network name (testnet|mainnet)
 */
function get_active_network() {
  try {
    const output = execSync('sui client active-env', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return output.trim()
  } catch (error) {
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
  } catch (error) {
    throw new Error(
      'Could not get active wallet address. Run: sui client active-address',
    )
  }
}
