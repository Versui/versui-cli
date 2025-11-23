import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'

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

    // Query Site object to get initial shared version
    spinner.start('Querying Site object...')
    const site_obj = await client.getObject({
      id: site_id,
      options: {
        showContent: true,
        showOwner: true,
      },
    })

    if (!site_obj?.data) {
      throw new Error(`Failed to query Site object ${site_id}`)
    }

    // Extract initial_shared_version from owner field
    const initial_shared_version =
      site_obj.data.owner?.Shared?.initial_shared_version
    if (!initial_shared_version) {
      throw new Error(`Site ${site_id} is not a shared object`)
    }

    const site_version = String(initial_shared_version)
    spinner.succeed('Site object queried')

    // Extract resources Table ID from Site object
    const site_fields = /** @type {any} */ (site_obj.data.content).fields
    const resources_table_id = site_fields.resources?.fields?.id?.id

    if (!resources_table_id) {
      throw new Error('Failed to extract resources Table ID from Site object')
    }

    // Query resources (dynamic fields of the Table)
    spinner.start('Checking site resources...')
    const resources_response = await client.getDynamicFields({
      parentId: resources_table_id,
    })
    const resource_count = resources_response.data.length
    spinner.succeed(`Found ${resource_count} resource(s)`)

    // If site has resources, delete them first
    if (resource_count > 0) {
      // Delete each resource
      for (let i = 0; i < resources_response.data.length; i++) {
        const resource = resources_response.data[i]
        const path = resource.name.value
        spinner.start(
          `Deleting resource ${i + 1}/${resource_count}: ${path}...`,
        )

        const delete_cmd = `sui client call --package 0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d --module site --function delete_resource --args ${admin_cap_id} ${site_id} '${path}' --gas-budget 10000000`

        const resources_exec_output = execSync(delete_cmd, {
          encoding: 'utf-8',
        })

        if (!resources_exec_output.includes('Status: Success')) {
          throw new Error(`Failed to delete resource: ${path}`)
        }

        spinner.succeed(
          `Deleted resource ${i + 1}/${resource_count}: ${path}`,
        )
      }
    }

    // Delete site using sui client call
    spinner.start('Deleting site on Sui blockchain...')
    const delete_site_cmd = `sui client call --package 0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d --module site --function delete_site --args ${admin_cap_id} ${site_id} --gas-budget 10000000`

    const exec_output = execSync(delete_site_cmd, { encoding: 'utf-8' })

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
