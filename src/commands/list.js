import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import ora from 'ora'

import { format_sites_table } from '../lib/sui.js'
import { get_versui_package_id, get_original_package_id } from '../lib/env.js'

/**
 * List deployments
 * @param {Object} options - Command options
 * @param {string} [options.network] - Network to query (testnet|mainnet)
 * @returns {Promise<void>}
 */
export async function list(options = {}) {
  try {
    // Get network (from flag or active env)
    const network = options.network || get_active_network()

    // Get wallet address
    const address = get_active_address()

    // Display network and address header first
    console.log('')
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
    for (const item of admin_caps.data) {
      if (!item.data?.content) continue
      const {
        fields: { site_id },
      } = /** @type {any} */ (item.data.content)

      // Fetch the Site object
      const site_obj = await client.getObject({
        id: site_id,
        options: {
          showContent: true,
        },
      })

      if (!site_obj?.data?.content) continue
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

      sites.push({
        object_id: site_id,
        name: site_fields.name || 'Unnamed',
        files_count,
        total_size: 0, // TODO: Calculate from resources
        network,
      })
    }

    spinner.clear()
    spinner.stop()

    // Format and display
    const table_str = format_sites_table(sites, network)
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
