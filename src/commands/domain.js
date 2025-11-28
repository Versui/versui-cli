import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import Table from 'cli-table3'

import { get_versui_package_id, get_original_package_id } from '../lib/env.js'

// DomainRegistry shared object IDs (deployed via domain_registry.move init)
const DOMAIN_REGISTRY_IDS = {
  testnet: '0xf649349301a66cb793ed2b00daff426b458d200bd987e20c73b0b7a9c907cc50',
  mainnet: null,
}

// Clock object (shared by Sui framework)
const CLOCK_OBJECT_ID = '0x6'

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

/**
 * Validate domain format (matches Move contract validation)
 * @param {string} domain - Domain to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validate_domain_format(domain) {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, error: 'Domain cannot be empty' }
  }

  const len = domain.length
  if (len < 3 || len > 253) {
    return { valid: false, error: 'Domain must be 3-253 characters' }
  }

  // Check for valid characters: lowercase a-z, 0-9, hyphens, dots
  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return {
      valid: false,
      error:
        'Domain can only contain lowercase letters, numbers, hyphens, and dots',
    }
  }

  // Cannot start/end with dot or hyphen
  if (/^[.-]|[.-]$/.test(domain)) {
    return { valid: false, error: 'Domain cannot start or end with . or -' }
  }

  // No consecutive dots
  if (/\.\./.test(domain)) {
    return { valid: false, error: 'Domain cannot have consecutive dots' }
  }

  // Must contain at least one dot (TLD required)
  if (!domain.includes('.')) {
    return { valid: false, error: 'Domain must include a TLD (e.g., .com)' }
  }

  // Block punycode domains (security: homograph attack prevention)
  if (/(?:^|\.)(xn--)/.test(domain)) {
    return {
      valid: false,
      error: 'Punycode (internationalized) domains are not allowed',
    }
  }

  // Security: Validate against path traversal
  if (domain.includes('../') || domain.includes('..\\')) {
    return { valid: false, error: 'Domain contains invalid path traversal' }
  }

  return { valid: true }
}

/**
 * Find AdminCap for a given site ID
 * @param {string} site_id - Site object ID
 * @param {string} address - Wallet address
 * @param {import('@mysten/sui/client').SuiClient} client - Sui client
 * @param {string} original_package_id - Original package ID (for type filtering)
 * @returns {Promise<string|null>} AdminCap object ID or null
 */
async function find_admin_cap(site_id, address, client, original_package_id) {
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

  for (const item of admin_caps.data) {
    if (!item.data?.content) continue
    const { fields } = /** @type {any} */ (item.data.content)
    if (fields.site_id === site_id) {
      return item.data.objectId
    }
  }

  return null
}

/**
 * Get Site object name
 * @param {string} site_id - Site object ID
 * @param {import('@mysten/sui/client').SuiClient} client - Sui client
 * @returns {Promise<string | null>} Site name or null
 */
async function get_site_name(site_id, client) {
  const site_obj = await client.getObject({
    id: site_id,
    options: {
      showContent: true,
    },
  })

  if (!site_obj?.data) return null

  return /** @type {any} */ (site_obj.data.content)?.fields?.name || 'Unnamed'
}

/**
 * Execute transaction via Sui CLI
 * @param {Transaction} tx - Transaction to execute
 * @param {import('@mysten/sui/client').SuiClient} client - Sui client
 * @returns {Promise<any>} Transaction result
 */
async function execute_transaction(tx, client) {
  const tx_bytes = await tx.build({ client })
  const tx_base64 = toBase64(tx_bytes)

  const output = execSync(`sui client serialized-tx ${tx_base64} --json`, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  return JSON.parse(output)
}

/**
 * Add custom domain to a site
 * @param {string} domain - Domain to add (e.g., "example.com")
 * @param {Object} options - Command options
 * @param {string} [options.site] - Site object ID
 * @param {string} [options.network] - Network (testnet|mainnet)
 */
export async function domain_add(domain, options = {}) {
  const spinner = ora()

  try {
    // Validate domain format
    const validation = validate_domain_format(domain)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // Get network and wallet
    const network = options.network || get_active_network()
    const address = get_active_address()
    const package_id = get_versui_package_id(network)
    const original_package_id = get_original_package_id(network)
    const registry_id = DOMAIN_REGISTRY_IDS[network]

    if (!package_id) {
      throw new Error(`Versui not deployed on ${network}`)
    }

    if (!original_package_id) {
      throw new Error(
        `Original Versui package not found on ${network}. Cannot query existing objects.`,
      )
    }

    if (!registry_id) {
      throw new Error(
        `DomainRegistry not configured for ${network}. Set DOMAIN_REGISTRY_ID env var.`,
      )
    }

    // Create Sui client
    const client = new SuiClient({
      url: getFullnodeUrl(/** @type {any} */ (network)),
    })

    // Get or prompt for site ID
    let site_id = options.site
    if (!site_id) {
      // List user's sites and let them choose
      spinner.start('Finding your sites...')
      const admin_cap_type = `${original_package_id}::site::SiteAdminCap`
      const admin_caps = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: admin_cap_type },
        options: { showContent: true },
      })
      spinner.stop()

      if (admin_caps.data.length === 0) {
        throw new Error(
          'No sites found. Deploy a site first with: versui deploy',
        )
      }

      // Get site names for display
      const site_choices = []
      for (const cap of admin_caps.data) {
        const cap_site_id = /** @type {any} */ (cap.data?.content)?.fields
          ?.site_id
        if (!cap_site_id) continue

        const site_name = await get_site_name(cap_site_id, client)
        site_choices.push({
          title: `${site_name || 'Unnamed'} (${cap_site_id.slice(0, 10)}...)`,
          value: cap_site_id,
        })
      }

      const { site_id: selected_site_id } = await prompts({
        type: 'select',
        name: 'site_id',
        message: 'Select site to link domain:',
        choices: site_choices,
      })

      if (!selected_site_id) {
        console.log(chalk.gray('  Cancelled.'))
        return
      }

      site_id = selected_site_id
    }

    // Get site name
    spinner.start('Querying site...')
    const site_name = await get_site_name(site_id, client)
    if (!site_name) {
      spinner.fail('Site not found')
      throw new Error(`Site ${site_id} not found`)
    }
    spinner.succeed(`Site: ${site_name}`)

    // Find AdminCap
    spinner.start('Finding AdminCap...')
    const admin_cap_id = await find_admin_cap(
      site_id,
      address,
      client,
      original_package_id,
    )
    if (!admin_cap_id) {
      spinner.fail('AdminCap not found')
      throw new Error(
        `You don't have admin access to site ${site_id}. AdminCap not found.`,
      )
    }
    spinner.succeed('AdminCap found')

    // Build transaction
    spinner.start('Building transaction...')
    const tx = new Transaction()
    tx.setSender(address)

    tx.moveCall({
      target: `${package_id}::domain_registry::add_custom_domain`,
      arguments: [
        tx.object(registry_id),
        tx.object(admin_cap_id),
        tx.object(site_id),
        tx.pure.string(domain),
        tx.object(CLOCK_OBJECT_ID),
      ],
    })
    spinner.succeed('Transaction built')

    // Execute transaction
    spinner.start('Executing transaction...')
    const result = await execute_transaction(tx, client)
    const status = result?.effects?.status?.status

    if (status === 'success') {
      spinner.succeed(chalk.green('Domain registered!'))

      // Show DNS instructions
      console.log('')
      console.log(chalk.cyan('  Configure your DNS:'))
      console.log('')
      console.log(chalk.dim('  Type:   ') + 'CNAME')
      console.log(chalk.dim('  Name:   ') + '@ (or subdomain)')
      console.log(chalk.dim('  Target: ') + 'versui.app')
      console.log('')
      console.log(chalk.yellow('  DNS propagation may take up to 48 hours.'))
      console.log('')
    } else {
      const error_msg = result?.effects?.status?.error || 'Transaction failed'
      spinner.fail(chalk.red('Transaction failed'))
      throw new Error(error_msg)
    }
  } catch (error) {
    if (spinner.isSpinning) spinner.stop()
    console.error('')
    console.error(chalk.red('  ✗ Error: ') + error.message)
    console.error('')
    process.exit(1)
  }
}

/**
 * Remove custom domain from a site
 * @param {string} domain - Domain to remove
 * @param {Object} options - Command options
 * @param {string} [options.site] - Site object ID
 * @param {string} [options.network] - Network (testnet|mainnet)
 */
export async function domain_remove(domain, options = {}) {
  const spinner = ora()

  try {
    // Get network and wallet
    const network = options.network || get_active_network()
    const address = get_active_address()
    const package_id = get_versui_package_id(network)
    const original_package_id = get_original_package_id(network)
    const registry_id = DOMAIN_REGISTRY_IDS[network]

    if (!package_id) {
      throw new Error(`Versui not deployed on ${network}`)
    }

    if (!original_package_id) {
      throw new Error(
        `Original Versui package not found on ${network}. Cannot query existing objects.`,
      )
    }

    if (!registry_id) {
      throw new Error(
        `DomainRegistry not configured for ${network}. Set DOMAIN_REGISTRY_ID env var.`,
      )
    }

    // Create Sui client
    const client = new SuiClient({
      url: getFullnodeUrl(/** @type {any} */ (network)),
    })

    // Get or prompt for site ID
    let site_id = options.site
    if (!site_id) {
      // List user's sites and let them choose
      spinner.start('Finding your sites...')
      const admin_cap_type = `${original_package_id}::site::SiteAdminCap`
      const admin_caps = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: admin_cap_type },
        options: { showContent: true },
      })
      spinner.stop()

      if (admin_caps.data.length === 0) {
        throw new Error('No sites found.')
      }

      // Get site names for display
      const site_choices = []
      for (const cap of admin_caps.data) {
        const cap_site_id = /** @type {any} */ (cap.data?.content)?.fields
          ?.site_id
        if (!cap_site_id) continue

        const site_name = await get_site_name(cap_site_id, client)
        site_choices.push({
          title: `${site_name || 'Unnamed'} (${cap_site_id.slice(0, 10)}...)`,
          value: cap_site_id,
        })
      }

      const { site_id: selected_site_id } = await prompts({
        type: 'select',
        name: 'site_id',
        message: 'Select site to remove domain from:',
        choices: site_choices,
      })

      if (!selected_site_id) {
        console.log(chalk.gray('  Cancelled.'))
        return
      }

      site_id = selected_site_id
    }

    // Get site name
    spinner.start('Querying site...')
    const site_name = await get_site_name(site_id, client)
    if (!site_name) {
      spinner.fail('Site not found')
      throw new Error(`Site ${site_id} not found`)
    }
    spinner.succeed(`Site: ${site_name}`)

    // Find AdminCap
    spinner.start('Finding AdminCap...')
    const admin_cap_id = await find_admin_cap(
      site_id,
      address,
      client,
      original_package_id,
    )
    if (!admin_cap_id) {
      spinner.fail('AdminCap not found')
      throw new Error(
        `You don't have admin access to site ${site_id}. AdminCap not found.`,
      )
    }
    spinner.succeed('AdminCap found')

    // Build transaction
    spinner.start('Building transaction...')
    const tx = new Transaction()
    tx.setSender(address)

    tx.moveCall({
      target: `${package_id}::domain_registry::remove_custom_domain`,
      arguments: [
        tx.object(registry_id),
        tx.object(admin_cap_id),
        tx.object(site_id),
        tx.pure.string(domain),
      ],
    })
    spinner.succeed('Transaction built')

    // Execute transaction
    spinner.start('Executing transaction...')
    const result = await execute_transaction(tx, client)
    const status = result?.effects?.status?.status

    if (status === 'success') {
      spinner.succeed(chalk.green(`Domain ${domain} removed!`))
      console.log('')
    } else {
      const error_msg = result?.effects?.status?.error || 'Transaction failed'
      spinner.fail(chalk.red('Transaction failed'))
      throw new Error(error_msg)
    }
  } catch (error) {
    if (spinner.isSpinning) spinner.stop()
    console.error('')
    console.error(chalk.red('  ✗ Error: ') + error.message)
    console.error('')
    process.exit(1)
  }
}

/**
 * List domains for a site (via DomainLinked events)
 * @param {Object} options - Command options
 * @param {string} [options.site] - Site object ID (optional, lists all if not provided)
 * @param {string} [options.network] - Network (testnet|mainnet)
 */
export async function domain_list(options = {}) {
  const spinner = ora()

  try {
    // Get network and wallet
    const network = options.network || get_active_network()
    const address = get_active_address()
    const package_id = get_versui_package_id(network)
    const original_package_id = get_original_package_id(network)

    if (!package_id) {
      throw new Error(`Versui not deployed on ${network}`)
    }

    if (!original_package_id) {
      throw new Error(
        `Original Versui package not found on ${network}. Cannot query existing objects.`,
      )
    }

    // Create Sui client
    const client = new SuiClient({
      url: getFullnodeUrl(/** @type {any} */ (network)),
    })

    // Get user's sites first
    spinner.start('Finding your sites...')
    const admin_cap_type = `${original_package_id}::site::SiteAdminCap`
    const admin_caps = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: admin_cap_type },
      options: { showContent: true },
    })

    if (admin_caps.data.length === 0) {
      spinner.succeed('No sites found')
      console.log('')
      console.log(chalk.gray('  Deploy a site first with: versui deploy'))
      console.log('')
      return
    }

    // Build site ID set for filtering
    const user_site_ids = new Set()
    const site_names = new Map()

    for (const cap of admin_caps.data) {
      const site_id = /** @type {any} */ (cap.data?.content)?.fields?.site_id
      if (!site_id) continue
      user_site_ids.add(site_id)

      // Get site name
      const site_name = await get_site_name(site_id, client)
      site_names.set(site_id, site_name || 'Unnamed')
    }
    spinner.succeed(`Found ${user_site_ids.size} site(s)`)

    // Query DomainLinked events to find domains
    spinner.start('Querying domain events...')
    const event_type = `${package_id}::domain_registry::DomainLinked`

    const events = await client.queryEvents({
      query: {
        MoveEventType: event_type,
      },
      limit: 1000,
      order: 'descending',
    })

    // Also query DomainUnlinked to filter out removed domains
    const unlinked_type = `${package_id}::domain_registry::DomainUnlinked`
    const unlinked_events = await client.queryEvents({
      query: {
        MoveEventType: unlinked_type,
      },
      limit: 1000,
      order: 'descending',
    })

    // Build set of unlinked domains
    const unlinked_domains = new Set()
    for (const event of unlinked_events.data) {
      const { domain } = /** @type {any} */ (event.parsedJson)
      unlinked_domains.add(domain)
    }

    spinner.succeed('Events queried')

    // Filter events for user's sites and build domain list
    const domains_by_site = new Map()

    for (const event of events.data) {
      const { domain, site_id, owner } = /** @type {any} */ (event.parsedJson)

      // Skip if domain was later unlinked
      if (unlinked_domains.has(domain)) continue

      // Skip if not user's site
      if (!user_site_ids.has(site_id)) continue

      // Skip if filtering by specific site
      if (options.site && site_id !== options.site) continue

      // Skip if not owned by this wallet
      if (owner !== address) continue

      if (!domains_by_site.has(site_id)) {
        domains_by_site.set(site_id, [])
      }
      domains_by_site.get(site_id).push(domain)
    }

    // Display results
    console.log('')

    if (domains_by_site.size === 0) {
      console.log(chalk.gray('  No custom domains found.'))
      console.log('')
      console.log(chalk.dim('  Add a domain with: versui domain add <domain>'))
      console.log('')
      return
    }

    const table = new Table({
      head: ['Site', 'Domain'],
      colWidths: [35, 50],
    })

    for (const [site_id, domains] of domains_by_site) {
      const site_name = site_names.get(site_id) || 'Unnamed'
      for (const domain of domains) {
        table.push([`${site_name} (${site_id.slice(0, 8)}...)`, domain])
      }
    }

    console.log(table.toString())

    const total_domains = [...domains_by_site.values()].reduce(
      (sum, d) => sum + d.length,
      0,
    )
    console.log('')
    console.log(
      chalk.dim(
        `  ${total_domains} domain(s) across ${domains_by_site.size} site(s)`,
      ),
    )
    console.log('')
  } catch (error) {
    if (spinner.isSpinning) spinner.stop()
    console.error('')
    console.error(chalk.red('  ✗ Error: ') + error.message)
    console.error('')
    process.exit(1)
  }
}
