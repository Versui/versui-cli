import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'

import { build_delete_transaction } from '../lib/sui.js'

/**
 * Delete a site deployment
 * @param {string} site_id - Site object ID to delete
 * @param {Object} options - Command options
 * @param {boolean} [options.yes] - Skip confirmation prompt
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @returns {Promise<void>}
 */
export async function delete_site(site_id, options = {}) {
  try {
    // Get network
    const network = options.network || get_active_network()

    // Get wallet address
    const address = get_active_address()

    // Confirmation prompt (unless --yes flag)
    if (!options.yes) {
      console.log('')
      console.log(chalk.yellow('⚠️  Warning: This action cannot be undone!'))
      console.log('')
      console.log(`  Site ID: ${chalk.cyan(site_id)}`)
      console.log(`  Network: ${chalk.cyan(network)}`)
      console.log('')

      const response = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: 'Delete this site?',
        initial: false,
      })

      if (!response.confirmed) {
        console.log('')
        console.log(chalk.gray('  Deletion cancelled.'))
        console.log('')
        return
      }
    }

    // Create Sui client
    const client = new SuiClient({
      url: getFullnodeUrl(/** @type {any} */ (network)),
    })

    // Find AdminCap for this site
    const spinner = ora('Finding site AdminCap...').start()
    const admin_cap_type = `0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d::site::SiteAdminCap`
    const admin_caps = await client.getOwnedObjects({
      owner: address,
      filter: {
        StructType: admin_cap_type,
      },
      options: {
        showContent: true,
      },
    })

    // Find AdminCap matching this site_id
    let admin_cap_id = null
    for (const item of admin_caps.data) {
      if (!item.data?.content) continue
      const { fields } = /** @type {any} */ (item.data.content)
      if (fields.site_id === site_id) {
        admin_cap_id = item.data.objectId
        break
      }
    }

    if (!admin_cap_id) {
      throw new Error(
        `AdminCap not found for site ${site_id}. You may not own this site.`,
      )
    }
    spinner.succeed('AdminCap found')

    // Query Site object to get current version
    spinner.start('Querying Site object...')
    const site_obj = await client.getObject({
      id: site_id,
      options: {
        showContent: true,
      },
    })

    if (!site_obj?.data?.version) {
      throw new Error(`Failed to query Site object version for ${site_id}`)
    }

    const site_version = site_obj.data.version
    spinner.succeed('Site object queried')

    // Build delete transaction
    spinner.start('Building delete transaction...')
    const { tx_bytes_base64 } = await build_delete_transaction(
      admin_cap_id,
      site_id,
      site_version,
      address,
      client,
    )
    spinner.succeed('Transaction built')

    // Sign transaction
    spinner.start('Signing transaction...')
    const tx_file = join(tmpdir(), `versui-delete-${Date.now()}.txt`)
    writeFileSync(tx_file, tx_bytes_base64)

    const sign_output = execSync(
      `sui keytool sign --address ${address} --data ${tx_file}`,
      { encoding: 'utf-8' },
    )

    const signature_match = sign_output.match(
      /Serialized signature[^:]*:\s*([A-Za-z0-9+/=]+)/,
    )
    if (!signature_match) {
      throw new Error('Failed to extract signature from sui keytool output')
    }
    const [, signature] = signature_match
    spinner.succeed('Transaction signed')

    // Execute transaction
    spinner.start('Deleting site on Sui blockchain...')
    const exec_output = execSync(
      `sui client execute-signed-tx --tx-bytes ${tx_bytes_base64} --signature ${signature}`,
      { encoding: 'utf-8' },
    )

    // Check for success
    if (exec_output.includes('Status: Success')) {
      spinner.succeed('Site deleted successfully')
      console.log('')
      console.log(chalk.green('  ✓ Site deleted: ') + chalk.dim(site_id))
      console.log('')
    } else {
      spinner.fail('Transaction failed')
      console.log('')
      console.log(chalk.red('  ✗ Deletion failed'))
      console.log('')
      console.log(exec_output)
      process.exit(1)
    }
  } catch (error) {
    console.error('')
    console.error(chalk.red('  ✗ Error: ') + error.message)
    console.error('')

    // Helpful error for non-empty sites
    if (error.message.includes('resource_count')) {
      console.error(
        chalk.yellow(
          '  Hint: Site must have 0 resources. Delete all resources first.',
        ),
      )
      console.error('')
    }

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
