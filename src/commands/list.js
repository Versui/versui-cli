import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import ora from 'ora'

import { query_owned_sites, format_sites_table } from '../lib/sui.js'

const PACKAGE_ID =
  '0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d'

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

    // Create Sui client
    const client = new SuiClient({
      url: getFullnodeUrl(/** @type {any} */ (network)),
    })

    // Query sites via AdminCaps (Sites are shared objects, can't use getOwnedObjects)
    const spinner = ora(`Fetching deployments from ${network}...`).start()

    const admin_cap_type = `${PACKAGE_ID}::site::SiteAdminCap`
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
      const { fields } = /** @type {any} */ (item.data.content)
      const site_id = fields.site_id

      // Fetch the Site object
      const site_obj = await client.getObject({
        id: site_id,
        options: {
          showContent: true,
        },
      })

      if (!site_obj?.data?.content) continue
      const site_fields = /** @type {any} */ (site_obj.data.content).fields

      // Query resource count (dynamic fields)
      const resources_response = await client.getDynamicFields({
        parentId: site_id,
      })

      sites.push({
        object_id: site_id,
        name: site_fields.name || 'Unnamed',
        files_count: resources_response.data.length,
        total_size: 0, // TODO: Calculate from resources
        network,
      })
    }

    spinner.stop()

    // Display network and address header
    console.log('')
    console.log(chalk.dim('  Network: ') + chalk.cyan(network))
    console.log(chalk.dim('  Address: ') + chalk.cyan(address))
    console.log('')

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
