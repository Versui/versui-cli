import { execSync, spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'
import gradient from 'gradient-string'
import figlet from 'figlet'

import {
  get_versui_package_id,
  get_versui_registry_id,
  get_original_package_id,
  get_version_object_id,
} from '../lib/env.js'
import { resolve_site_id } from '../lib/sui.js'

import { render_delete_ui } from './delete/ui/render.js'

/**
 * Execute sui client command asynchronously
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, success: boolean}>}
 */
function execute_sui_command(args) {
  return new Promise(resolve => {
    const proc = spawn('sui', args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', data => {
      stdout += data.toString()
    })

    proc.stderr.on('data', data => {
      stderr += data.toString()
    })

    proc.on('close', code => {
      resolve({
        stdout,
        stderr,
        success: code === 0 && stdout.includes('Status: Success'),
      })
    })

    proc.on('error', error => {
      resolve({
        stdout,
        stderr: stderr + error.message,
        success: false,
      })
    })
  })
}


/**
 * Delete all sites owned by the user
 * @param {import('@mysten/sui/client').SuiClient} client - Sui client
 * @param {string} network - Network name
 * @param {string} address - Wallet address
 * @param {Object} options - Command options
 * @returns {Promise<void>}
 */
async function delete_all_sites(client, network, address, options) {
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

  const spinner = ora('Fetching all owned sites...').start()

  try {
    // Get all AdminCaps (same logic as list command)
    const original_package_id = get_original_package_id(network)
    if (!original_package_id) {
      spinner.fail(`Original Versui package not found on ${network}`)
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

    // Extract site IDs from AdminCaps
    const site_ids = []
    for (const item of admin_caps.data) {
      if (!item.data?.content) continue
      const { fields } = /** @type {any} */ (item.data.content)
      site_ids.push(fields.site_id)
    }

    if (site_ids.length === 0) {
      spinner.succeed('No sites found to delete')
      console.log('')
      console.log(chalk.gray('  You have no sites on this network.'))
      console.log('')
      return
    }

    // Count total resources across all sites
    let total_resources = 0
    for (const site_id of site_ids) {
      const site_obj = await client.getObject({
        id: site_id,
        options: { showContent: true },
      })

      if (!site_obj?.data?.content) continue
      const { fields: site_fields } = /** @type {any} */ (site_obj.data.content)
      const resources_table_id = site_fields.resources?.fields?.id?.id

      if (resources_table_id) {
        let has_next_page = true
        let cursor = null
        while (has_next_page) {
          const resources_response = await client.getDynamicFields({
            parentId: resources_table_id,
            cursor,
          })
          total_resources += resources_response.data.length
          has_next_page = resources_response.hasNextPage
          cursor = resources_response.nextCursor
        }
      }
    }

    spinner.succeed(
      `Found ${site_ids.length} site(s) with ${total_resources} resource(s)`,
    )

    // Show warning and require explicit confirmation
    console.log('')
    console.log(chalk.red.bold('⚠️  DANGER ZONE: DELETE ALL SITES'))
    console.log('')
    console.log(
      chalk.yellow('  This will permanently delete ALL sites and resources:'),
    )
    console.log('')
    console.log(`  ${chalk.red('•')} Network: ${chalk.cyan(network)}`)
    console.log(`  ${chalk.red('•')} Sites: ${chalk.cyan(site_ids.length)}`)
    console.log(`  ${chalk.red('•')} Resources: ${chalk.cyan(total_resources)}`)
    console.log('')
    console.log(chalk.red('  This action CANNOT be undone!'))
    console.log('')

    // Double confirmation: first type exact phrase
    const confirmation_phrase = `DELETE ALL ${site_ids.length} SITES`
    const confirm1 = await prompts({
      type: 'text',
      name: 'value',
      message: `Type "${confirmation_phrase}" to confirm:`,
    })

    if (confirm1.value !== confirmation_phrase) {
      console.log('')
      console.log(chalk.gray('  Deletion cancelled.'))
      console.log('')
      return
    }

    // Second confirmation: final yes/no
    const confirm2 = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Are you absolutely sure?',
      initial: false,
    })

    if (!confirm2.confirmed) {
      console.log('')
      console.log(chalk.gray('  Deletion cancelled.'))
      console.log('')
      return
    }

    // Proceed with deletion by calling delete_site with all IDs
    console.log('')
    console.log(chalk.dim('  Starting bulk deletion...'))
    console.log('')

    // Call the existing delete_site function with all site IDs and skip confirmation
    await delete_site_batch(site_ids, {
      ...options,
      yes: true, // Skip confirmation since we already confirmed
      network,
    })
  } catch (error) {
    spinner.fail('Failed to fetch sites')
    throw error
  }
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
 * @param {boolean} [options.dangerouslyDeleteAll] - Delete ALL owned sites
 * @returns {Promise<void>}
 */
export async function delete_site(site_identifiers, options = {}) {
  // Get network early for lookups
  const network = options.network || get_active_network()
  const address = get_active_address()

  // Create Sui client for lookups
  const client = new SuiClient({
    url: getFullnodeUrl(/** @type {any} */ (network)),
  })

  // Handle --dangerously-delete-all mode
  if (options.dangerouslyDeleteAll) {
    if (!options.network) {
      throw new Error(
        'The --dangerously-delete-all flag requires explicit --network flag for safety',
      )
    }

    await delete_all_sites(client, network, address, options)
    return
  }

  // Validate that site identifiers were provided
  if (
    !site_identifiers ||
    (Array.isArray(site_identifiers) && site_identifiers.length === 0)
  ) {
    throw new Error(
      'No site identifiers provided. Use site IDs/names or --dangerously-delete-all flag.',
    )
  }

  // Call batch deletion
  await delete_site_batch(site_identifiers, options)
}

/**
 * Delete one or more site deployments (internal implementation)
 * @param {string | string[]} site_identifiers - Site object ID(s) or name(s) to delete
 * @param {Object} options - Command options
 * @param {boolean} [options.yes] - Skip confirmation prompt
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @returns {Promise<void>}
 */
async function delete_site_batch(site_identifiers, options = {}) {
  // Get network early for lookups
  const network = options.network || get_active_network()
  const address = get_active_address()

  // Create Sui client for lookups
  const client = new SuiClient({
    url: getFullnodeUrl(/** @type {any} */ (network)),
  })

  // Convert single identifier to array for uniform processing
  const identifiers = Array.isArray(site_identifiers)
    ? site_identifiers
    : [site_identifiers]

  // Resolve all identifiers to site IDs
  const ids_to_delete = []
  const lookup_spinner = ora('Resolving site identifiers...').start()

  for (const identifier of identifiers) {
    try {
      const site_id = await resolve_site_id(identifier, client, address, network)
      ids_to_delete.push(site_id)
    } catch (error) {
      lookup_spinner.fail(`Failed to resolve: "${identifier}"`)
      throw error
    }
  }

  lookup_spinner.text = 'Validating sites...'

  // Validate all sites exist and get AdminCaps BEFORE confirmation
  const package_id = get_versui_package_id(network)
  if (!package_id) {
    lookup_spinner.fail(`Versui package not deployed on ${network}`)
    throw new Error(`Versui package not deployed on ${network} yet`)
  }

  const original_package_id = get_original_package_id(network)
  if (!original_package_id) {
    lookup_spinner.fail(`Original Versui package not found on ${network}`)
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

  // Validate each site exists and user has AdminCap
  const validated_sites = []
  for (const site_id of ids_to_delete) {
    // Check if Site object exists
    try {
      const site_obj = await client.getObject({
        id: site_id,
        options: {
          showContent: true,
          showOwner: true,
        },
      })

      if (!site_obj?.data) {
        lookup_spinner.fail(
          `Site ${site_id.slice(0, 10)}... does not exist on ${network}`,
        )
        throw new Error(
          `Site ${site_id} does not exist on ${network}. Check the site ID or name.`,
        )
      }

      // Check if it's a shared object
      const initial_shared_version = /** @type {any} */ (site_obj.data.owner)
        ?.Shared?.initial_shared_version
      if (!initial_shared_version) {
        lookup_spinner.fail(
          `${site_id.slice(0, 10)}... is not a shared Site object`,
        )
        throw new Error(`${site_id} is not a valid Site object (not shared)`)
      }

      // Find matching AdminCap
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
        lookup_spinner.fail(
          `No AdminCap found for site ${site_id.slice(0, 10)}...`,
        )
        throw new Error(
          `You do not own AdminCap for site ${site_id}. Cannot delete sites you don't own.`,
        )
      }

      validated_sites.push({
        site_id,
        admin_cap_id,
        site_obj,
      })
    } catch (error) {
      // Preserve original error if already thrown above
      if (error.message.includes('does not exist')) throw error
      if (error.message.includes('not a valid Site')) throw error
      if (error.message.includes('do not own AdminCap')) throw error

      // Unknown error during validation
      lookup_spinner.fail(`Failed to validate site ${site_id.slice(0, 10)}...`)
      throw new Error(`Failed to validate site ${site_id}: ${error.message}`)
    }
  }

  lookup_spinner.succeed(
    `Validated ${validated_sites.length} site${validated_sites.length > 1 ? 's' : ''} (all owned by you)`,
  )

  try {
    // Collect resources for each validated site
    const sites_with_resources = []
    for (const { site_id, admin_cap_id, site_obj } of validated_sites) {
      const site_fields = /** @type {any} */ (site_obj.data.content).fields
      const resources_table_id = site_fields.resources?.fields?.id?.id

      const resources = []
      if (resources_table_id) {
        let has_next_page = true
        let cursor = null

        while (has_next_page) {
          const resources_response = await client.getDynamicFields({
            parentId: resources_table_id,
            cursor,
          })
          resources.push(
            ...resources_response.data.map(r => ({
              path: /** @type {string} */ (r.name.value),
            })),
          )
          has_next_page = resources_response.hasNextPage
          cursor = resources_response.nextCursor
        }
      }

      sites_with_resources.push({
        site_id,
        admin_cap_id,
        resources,
      })
    }

    // Use Ink UI for deletion flow
    await render_delete_ui({
      site_ids: ids_to_delete,
      validated_sites: sites_with_resources,
      network,
      autoYes: options.yes,
    })
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
