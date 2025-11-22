import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import ora from 'ora'

import { query_owned_sites, format_sites_table } from '../lib/sui.js'

const PACKAGE_ID =
  '0xda3719ae702534b4181c5f2ddf2780744ee512dae7a5b22bce6b5fda4893471b'

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

    // Query sites
    const spinner = ora(`Fetching deployments from ${network}...`).start()

    const site_type = `${PACKAGE_ID}::site::Site`
    const sites = await query_owned_sites(address, site_type, client)

    // Set network for each site
    for (const site of sites) {
      site.network = network
    }

    spinner.stop()

    // Format and display
    const table_str = format_sites_table(sites, network)
    console.log('')
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
