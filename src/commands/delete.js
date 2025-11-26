import { execSync, exec } from 'node:child_process'
import { promisify } from 'node:util'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'

// eslint-disable-next-line @typescript-eslint/naming-convention
const execAsync = promisify(exec)

/**
 * Delete one or more site deployments
 * @param {string | string[]} site_ids - Site object ID(s) to delete
 * @param {Object} options - Command options
 * @param {boolean} [options.yes] - Skip confirmation prompt
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @returns {Promise<void>}
 */
export async function delete_site(site_ids, options = {}) {
  // Convert single ID to array for uniform processing
  const ids_to_delete = Array.isArray(site_ids) ? site_ids : [site_ids]

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
      console.log(`  Network: ${chalk.cyan(network)}`)
      console.log(
        `  Site${ids_to_delete.length > 1 ? 's' : ''} to delete: ${chalk.cyan(ids_to_delete.length)}`,
      )
      console.log('')
      for (const id of ids_to_delete) {
        console.log(`    ${chalk.dim(id)}`)
      }
      console.log('')

      const response = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: `Delete ${ids_to_delete.length} site${ids_to_delete.length > 1 ? 's' : ''}?`,
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

    // Query all AdminCaps once (shared across all deletions)
    const spinner = ora('Finding AdminCaps...').start()
    const admin_cap_type = `0x546f5b0a5e2d0ecd53dfb80ac41cda779a041e9f1cae376603ddf2646165fe36::site::SiteAdminCap`
    const admin_caps = await client.getOwnedObjects({
      owner: address,
      filter: {
        StructType: admin_cap_type,
      },
      options: {
        showContent: true,
      },
    })
    spinner.succeed(`Found ${admin_caps.data.length} AdminCap(s)`)

    console.log('')

    // Process each site deletion
    for (let idx = 0; idx < ids_to_delete.length; idx++) {
      const site_id = ids_to_delete[idx]
      const site_num = idx + 1
      const total = ids_to_delete.length

      console.log(
        chalk.dim(
          `[${site_num}/${total}] Deleting site: ${site_id.slice(0, 10)}...`,
        ),
      )

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
        console.log(
          chalk.yellow(
            `  ⚠ Skipping ${site_id.slice(0, 10)}... - AdminCap not found (may not own this site)`,
          ),
        )
        console.log('')
        continue
      }

      // Query Site object to get initial shared version
      const site_spinner = ora('Querying Site object...').start()
      const site_obj = await client.getObject({
        id: site_id,
        options: {
          showContent: true,
          showOwner: true,
        },
      })

      if (!site_obj?.data) {
        site_spinner.fail(`Failed to query Site object`)
        console.log('')
        continue
      }

      // Extract initial_shared_version from owner field
      const initial_shared_version = /** @type {any} */ (site_obj.data.owner)
        ?.Shared?.initial_shared_version
      if (!initial_shared_version) {
        site_spinner.fail('Site is not a shared object')
        console.log('')
        continue
      }

      site_spinner.succeed('Site object queried')

      // Extract resources Table ID from Site object
      const site_fields = /** @type {any} */ (site_obj.data.content).fields
      const resources_table_id = site_fields.resources?.fields?.id?.id

      if (!resources_table_id) {
        console.log(
          chalk.yellow(`  ⚠ Skipping - failed to extract resources Table ID`),
        )
        console.log('')
        continue
      }

      // Query resources (dynamic fields of the Table)
      const res_spinner = ora('Checking site resources...').start()
      const resources_response = await client.getDynamicFields({
        parentId: resources_table_id,
      })
      const resource_count = resources_response.data.length
      res_spinner.succeed(`Found ${resource_count} resource(s)`)

      // If site has resources, delete them first
      if (resource_count > 0) {
        // Delete each resource
        for (let i = 0; i < resources_response.data.length; i++) {
          const resource = resources_response.data[i]
          const path = resource.name.value
          const del_spinner = ora(
            `Deleting resource ${i + 1}/${resource_count}: ${path}...`,
          ).start()

          const delete_cmd = `sui client call --package 0x546f5b0a5e2d0ecd53dfb80ac41cda779a041e9f1cae376603ddf2646165fe36 --module site --function delete_resource --args ${admin_cap_id} ${site_id} '${path}' --gas-budget 10000000`

          try {
            const { stdout: resources_exec_output } = await execAsync(
              delete_cmd,
              {
                encoding: 'utf-8',
              },
            )

            if (!resources_exec_output.includes('Status: Success')) {
              del_spinner.fail(`Failed to delete resource: ${path}`)
              console.log('')
              continue
            }
          } catch (error) {
            del_spinner.fail(`Failed to delete resource: ${path}`)
            console.log('')
            continue
          }

          del_spinner.succeed(`Deleted resource ${i + 1}/${resource_count}`)
        }
      }

      // Delete site using sui client call
      const delete_spinner = ora('Deleting site...').start()
      const delete_site_cmd = `sui client call --package 0x546f5b0a5e2d0ecd53dfb80ac41cda779a041e9f1cae376603ddf2646165fe36 --module site --function delete_site --args ${admin_cap_id} ${site_id} --gas-budget 10000000`

      try {
        const { stdout: exec_output } = await execAsync(delete_site_cmd, {
          encoding: 'utf-8',
        })

        // Check for success
        if (exec_output.includes('Status: Success')) {
          delete_spinner.succeed(
            chalk.green(`✓ Deleted: ${site_id.slice(0, 10)}...`),
          )
        } else {
          delete_spinner.fail(chalk.red(`✗ Failed: ${site_id.slice(0, 10)}...`))
        }
      } catch (error) {
        delete_spinner.fail(chalk.red(`✗ Failed: ${site_id.slice(0, 10)}...`))
      }

      console.log('')
    }

    // Summary
    console.log('')
    console.log(
      chalk.green(
        `  ✓ Deletion complete! Processed ${ids_to_delete.length} site${ids_to_delete.length > 1 ? 's' : ''}`,
      ),
    )
    console.log('')
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
