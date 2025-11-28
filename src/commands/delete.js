import { execSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'

import { get_versui_package_id, get_versui_registry_id } from '../lib/env.js'
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
 * Validate resource path (optional leading /, no shell injection or path traversal)
 * @param {string} path - Resource path to validate
 * @returns {boolean} True if valid
 */
export function is_valid_resource_path(path) {
  // Limit path length to prevent DoS
  if (path.length > 10000) return false

  // Decode URL encoding (including double encoding) to prevent bypasses
  let decoded = path
  let prev_decoded = ''
  while (decoded !== prev_decoded) {
    prev_decoded = decoded
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      return false // Invalid encoding
    }
  }

  // Normalize unicode to prevent homoglyph attacks
  const normalized_input = decoded.normalize('NFC')

  // Block null bytes
  if (normalized_input.includes('\x00')) return false

  // Block unicode lookalikes for dots (fullwidth period, etc)
  // Allow normal unicode characters (e.g., Chinese/Japanese/emoji)
  if (/[\uFF0E\u2024\u3002\uFE52\uFF61]/.test(normalized_input)) return false

  // Block Windows-style paths (absolute or UNC)
  if (/^[a-zA-Z]:/.test(normalized_input)) return false // C:\
  if (/^\\/.test(normalized_input)) return false // \\ or \server\share

  // Block backslashes (Windows path separators)
  if (normalized_input.includes('\\')) return false

  // Block patterns with triple or more dots
  if (/\.{3,}/.test(normalized_input)) return false

  // Block shell injection characters: ; | ` $ (command substitution)
  // Allow web-standard characters: ? & # (query strings, fragments), [] {} (URLs), etc.
  if (/[;|`$]|<\(|\$\(/.test(normalized_input)) return false

  // Block path traversal - check for .. BEFORE normalizing (normalize resolves them)
  // Match .. as a path segment (not just substring, to allow "file..txt")
  if (/(?:^|\/|\\)\.\.(?:\/|\\|$)/.test(normalized_input)) return false

  // Additional check: resolve against a fake root to ensure no escapes
  // Strip leading / for resolve (since absolute paths override the base)
  const path_to_resolve = normalized_input.startsWith('/')
    ? normalized_input.slice(1)
    : normalized_input
  const resolved = resolve('/virtual_root', path_to_resolve)
  if (!resolved.startsWith('/virtual_root')) {
    return false
  }

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
  const lookup_spinner = ora('Resolving site identifiers...').start()

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
        continue
      }

      // Validate admin_cap_id format
      if (!is_valid_sui_object_id(admin_cap_id)) {
        console.log(
          chalk.yellow(
            `  ⚠ Skipping ${site_id.slice(0, 10)}... - Invalid AdminCap ID format`,
          ),
        )
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
        continue
      }

      // Extract initial_shared_version from owner field
      const initial_shared_version = /** @type {any} */ (site_obj.data.owner)
        ?.Shared?.initial_shared_version
      if (!initial_shared_version) {
        site_spinner.fail('Site is not a shared object')
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
        continue
      }

      // Query ALL resources with pagination (dynamic fields of the Table)
      const res_spinner = ora('Checking site resources...').start()
      const all_resources = []
      let has_next_page = true
      let cursor = null

      while (has_next_page) {
        res_spinner.text = `Checking site resources (${all_resources.length} found)...`
        const resources_response = await client.getDynamicFields({
          parentId: resources_table_id,
          cursor,
        })
        all_resources.push(...resources_response.data)
        has_next_page = resources_response.hasNextPage
        cursor = resources_response.nextCursor
      }

      const resource_count = all_resources.length
      res_spinner.succeed(`Found ${resource_count} resource(s)`)

      // If site has resources, delete them first (batch operation)
      let resources_deleted_successfully = false
      if (resource_count > 0) {
        // Collect all valid resource paths
        const paths_to_delete = []
        const invalid_paths = []

        for (const resource of all_resources) {
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
        }

        // Delete resources in batches (PTB limit is 1024 commands, use 50 for safety)
        if (paths_to_delete.length > 0) {
          const batch_size = 50
          const total_batches = Math.ceil(paths_to_delete.length / batch_size)
          let total_deleted = 0
          const del_spinner = ora().start()

          for (let i = 0; i < total_batches; i++) {
            const batch_start = i * batch_size
            const batch_end = Math.min(
              batch_start + batch_size,
              paths_to_delete.length,
            )
            const batch = paths_to_delete.slice(batch_start, batch_end)

            del_spinner.text = `Deleting batch ${i + 1}/${total_batches}...`

            try {
              // Dynamic gas budget: 1M base + 1M per resource (min 50M)
              const gas_budget = Math.max(
                50_000_000,
                1_000_000 + batch.length * 1_000_000,
              )

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
                  JSON.stringify(batch),
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
                del_spinner.fail(
                  `Failed to delete batch ${i + 1}/${total_batches}`,
                )
                console.log(chalk.yellow(`  Error details:`))
                console.log(chalk.dim(`  ${error_detail}`))
                // Don't set resources_deleted_successfully = true, break early
                break
              } else {
                total_deleted += batch.length

                // Only mark as successful if ALL batches completed
                if (i === total_batches - 1) {
                  resources_deleted_successfully = true
                  del_spinner.succeed(
                    `Deleted ${total_deleted} resource(s) in ${total_batches} batch${total_batches > 1 ? 'es' : ''}`,
                  )
                }
              }
            } catch (error) {
              del_spinner.fail(
                `Failed to delete batch ${i + 1}/${total_batches}: ${error.message}`,
              )
              // Don't set resources_deleted_successfully = true, break early
              break
            }
          }

          // Report final status if partial failure
          if (!resources_deleted_successfully && total_deleted > 0) {
            console.log(
              chalk.yellow(
                `  ⚠ Partially deleted ${total_deleted}/${paths_to_delete.length} resource(s)`,
              ),
            )
          }
        } else {
          // No resources to delete, mark as successful
          resources_deleted_successfully = true
        }
      } else {
        // No resources found, mark as successful
        resources_deleted_successfully = true
      }

      // Only delete site if resources were successfully deleted (or there were none)
      if (!resources_deleted_successfully) {
        console.log(
          chalk.yellow(
            `  ⚠ Skipping site deletion - resources were not fully deleted`,
          ),
        )
        continue
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

        // Check for success BEFORE showing success message
        if (stdout.includes('Status: Success')) {
          delete_spinner.succeed(
            chalk.green(`✓ Deleted: ${site_id.slice(0, 10)}...`),
          )
        } else {
          // Extract Move error from stderr
          const error_detail = stderr.trim() || stdout.trim()
          delete_spinner.fail(chalk.red(`✗ Failed: ${site_id.slice(0, 10)}...`))
          console.log(chalk.yellow(`  Error details:`))
          console.log(chalk.dim(`  ${error_detail}`))
        }
      } catch (error) {
        delete_spinner.fail(chalk.red(`✗ Failed: ${site_id.slice(0, 10)}...`))
        console.log(chalk.yellow(`  Error: ${error.message}`))
      }
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
