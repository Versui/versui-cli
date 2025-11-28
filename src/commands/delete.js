import { execSync, spawnSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'

import {
  get_versui_package_id,
  get_versui_registry_id,
} from '../lib/env.js'
import { get_site_id_by_name } from '../lib/sui.js'

/**
 * Validate Sui object ID format (0x followed by 64 hex chars)
 * @param {string} id - Object ID to validate
 * @returns {boolean} True if valid
 */
function is_valid_sui_object_id(id) {
  return /^0x[a-fA-F0-9]{64}$/.test(id)
}

/**
 * Validate resource path (optional leading /, no shell injection characters)
 * @param {string} path - Resource path to validate
 * @returns {boolean} True if valid
 */
function is_valid_resource_path(path) {
  // Block shell injection characters: ; | ` $ (command substitution)
  // Allow web-standard characters: ? & (query strings), [] {} (URLs), etc.
  if (/[;|`$]|<\(|\$\(/.test(path)) return false
  return true
}

/**
 * Delete one or more site deployments
 * @param {string | string[]} site_identifiers - Site object ID(s) or name(s) to delete
 * @param {Object} options - Command options
 * @param {boolean} [options.yes] - Skip confirmation prompt
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @returns {Promise<void>}
 */
export async function delete_site(site_identifiers, options = {}) {
  // Convert single identifier to array for uniform processing
  const identifiers = Array.isArray(site_identifiers)
    ? site_identifiers
    : [site_identifiers]

  // Get network early for lookups
  const network = options.network || get_active_network()
  const address = get_active_address()

  // Create Sui client for lookups
  const client = new SuiClient({
    url: getFullnodeUrl(/** @type {any} */ (network)),
  })

  // Resolve all identifiers to site IDs
  const ids_to_delete = []
  let lookup_spinner = ora('Resolving site identifiers...').start()

  for (const identifier of identifiers) {
    // If it looks like a Sui object ID, use directly
    if (is_valid_sui_object_id(identifier)) {
      ids_to_delete.push(identifier)
      continue
    }

    // Otherwise, treat as site name and look up
    const registry_id = get_versui_registry_id(network)
    if (!registry_id) {
      lookup_spinner.fail(
        `Site name lookup not available on ${network} (registry not deployed)`,
      )
      throw new Error(
        `Cannot resolve site name "${identifier}" - registry not available. Use site ID instead.`,
      )
    }

    try {
      const site_id = await get_site_id_by_name(
        client,
        registry_id,
        address,
        identifier,
        network,
      )

      if (!site_id) {
        lookup_spinner.fail(`Site not found: "${identifier}"`)
        throw new Error(
          `No site found with name "${identifier}" owned by ${address}`,
        )
      }

      ids_to_delete.push(site_id)
    } catch (error) {
      lookup_spinner.fail(`Failed to resolve site name: "${identifier}"`)
      throw error
    }
  }

  lookup_spinner.succeed(
    `Resolved ${ids_to_delete.length} site${ids_to_delete.length > 1 ? 's' : ''}`,
  )

  try {
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

    // Query all AdminCaps once (shared across all deletions)
    const spinner = ora('Finding AdminCaps...').start()

    // Use V10 package ID for both querying and function calls
    const package_id = get_versui_package_id(network)
    if (!package_id) {
      throw new Error(`Versui package not deployed on ${network} yet`)
    }

    const admin_cap_type = `${package_id}::site::SiteAdminCap`
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

      // Validate admin_cap_id format
      if (!is_valid_sui_object_id(admin_cap_id)) {
        console.log(
          chalk.yellow(
            `  ⚠ Skipping ${site_id.slice(0, 10)}... - Invalid AdminCap ID format`,
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

      // If site has resources, delete them first (batch operation)
      if (resource_count > 0) {
        // Collect all valid resource paths
        const paths_to_delete = []
        const invalid_paths = []

        for (const resource of resources_response.data) {
          const path = /** @type {string} */ (resource.name.value)

          if (!is_valid_resource_path(path)) {
            invalid_paths.push(path)
            continue
          }

          paths_to_delete.push(path)
        }

        // Report invalid paths (if any)
        if (invalid_paths.length > 0) {
          console.log(
            chalk.yellow(
              `  ⚠ Skipping ${invalid_paths.length} invalid resource path(s) (contains shell metacharacters or invalid format)`,
            ),
          )
          console.log('')
        }

        // Delete all resources in one transaction
        if (paths_to_delete.length > 0) {
          const del_spinner = ora(
            `Deleting ${paths_to_delete.length} resource(s) in batch...`,
          ).start()

          try {
            // Dynamic gas budget: 1M base + 1M per resource (min 50M)
            const gas_budget = Math.max(50_000_000, 1_000_000 + paths_to_delete.length * 1_000_000)

            const result = spawnSync(
              'sui',
              [
                'client',
                'call',
                '--package',
                package_id,
                '--module',
                'site',
                '--function',
                'delete_resources_batch',
                '--args',
                admin_cap_id,
                site_id,
                JSON.stringify(paths_to_delete),
                '--gas-budget',
                gas_budget.toString(),
              ],
              { encoding: 'utf-8' },
            )

            if (result.error) {
              throw result.error
            }

            const stdout = result.stdout || ''
            const stderr = result.stderr || ''

            if (!stdout.includes('Status: Success')) {
              // Extract Move error from stderr
              const error_detail = stderr.trim() || stdout.trim()
              del_spinner.fail(`Failed to delete resources`)
              console.log('')
              console.log(chalk.yellow(`  Error details:`))
              console.log(chalk.dim(`  ${error_detail}`))
              console.log('')
            } else {
              del_spinner.succeed(
                `Deleted ${paths_to_delete.length} resource(s) in 1 transaction (gas: ${gas_budget.toLocaleString()})`,
              )
            }
          } catch (error) {
            del_spinner.fail(`Failed to delete resources: ${error.message}`)
            console.log('')
          }
        }
      }

      // Delete site using sui client call
      const delete_spinner = ora('Deleting site...').start()

      try {
        const result = spawnSync(
          'sui',
          [
            'client',
            'call',
            '--package',
            package_id,
            '--module',
            'site',
            '--function',
            'delete_site',
            '--args',
            admin_cap_id,
            site_id,
            '--gas-budget',
            '10000000',
          ],
          { encoding: 'utf-8' },
        )

        if (result.error) {
          throw result.error
        }

        const stdout = result.stdout || ''
        const stderr = result.stderr || ''

        // Check for success
        if (stdout.includes('Status: Success')) {
          delete_spinner.succeed(
            chalk.green(`✓ Deleted: ${site_id.slice(0, 10)}...`),
          )
        } else {
          // Extract Move error from stderr
          const error_detail = stderr.trim() || stdout.trim()
          delete_spinner.fail(chalk.red(`✗ Failed: ${site_id.slice(0, 10)}...`))
          console.log('')
          console.log(chalk.yellow(`  Error details:`))
          console.log(chalk.dim(`  ${error_detail}`))
          console.log('')
        }
      } catch (error) {
        delete_spinner.fail(chalk.red(`✗ Failed: ${site_id.slice(0, 10)}...`))
        console.log('')
        console.log(chalk.yellow(`  Error: ${error.message}`))
        console.log('')
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
