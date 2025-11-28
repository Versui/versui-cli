import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'


/**
 * Get active wallet address from Sui CLI
 * @returns {string|null} Wallet address or null
 */
function get_sui_active_address() {
  try {
    return execSync('sui client active-address', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Fetch all blob object IDs from a site
 * @param {string} site_id - Site object ID
 * @param {SuiClient} sui_client - Sui client
 * @returns {Promise<string[]>} Array of blob object IDs
 */
async function fetch_site_blob_objects(site_id, sui_client) {
  const site_obj = await sui_client.getObject({
    id: site_id,
    options: { showContent: true },
  })

  if (!site_obj.data) {
    throw new Error(`Site not found: ${site_id}`)
  }

  const { fields: site_fields } = /** @type {any} */ (site_obj.data.content)
  const resources_table_id = site_fields.resources.fields.id.id

  // Fetch all resources from table
  const resource_entries = []
  let cursor = null
  let has_next_page = true

  while (has_next_page) {
    const page = await sui_client.getDynamicFields({
      parentId: resources_table_id,
      cursor,
    })

    resource_entries.push(...page.data)
    has_next_page = page.hasNextPage
    cursor = page.nextCursor
  }

  // Fetch resource details to extract blob_object_id
  const resource_ids = resource_entries.map(r => r.objectId)
  const resource_objects =
    resource_ids.length > 0
      ? await sui_client.multiGetObjects({
          ids: resource_ids,
          options: { showContent: true },
        })
      : []

  // Extract blob_object_id from each resource
  const blob_object_ids = []
  for (const res of resource_objects) {
    if (!res.data) continue
    const { fields } = /** @type {any} */ (res.data.content)
    if (fields.blob_object_id) {
      blob_object_ids.push(fields.blob_object_id)
    }
  }

  return blob_object_ids
}

/**
 * Extend a blob's storage duration using Walrus CLI
 * @param {string} blob_object_id - Blob object ID
 * @param {number} epochs - Number of epochs to extend
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function extend_blob(blob_object_id, epochs) {
  try {
    execSync(
      `walrus extend --blob-obj-id ${blob_object_id} --epochs-extended ${epochs} --json`,
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err.stderr || err.message || 'Unknown error',
    }
  }
}

/**
 * Renew storage for all blobs in a site
 * @param {string} site_id - Site object ID
 * @param {Object} [options] - Command options
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @param {number} [options.epochs] - Number of epochs to extend
 * @param {boolean} [options.yes] - Skip confirmations
 * @param {boolean} [options.json] - JSON output mode
 * @returns {Promise<void>}
 */
export async function renew(site_id, options = {}) {
  const {
    network = 'testnet',
    yes: auto_yes = false,
    json: json_mode = false,
  } = options
  let { epochs } = options

  // Validate site ID
  if (!site_id) {
    throw new Error('Site ID is required. Use: versui renew <site-id>')
  }

  // Check wallet
  const wallet = get_sui_active_address()
  if (!wallet) {
    throw new Error('No active Sui wallet. Run: sui client new-address ed25519')
  }

  const rpc_url = getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet')
  const sui_client = new SuiClient({ url: rpc_url })

  const spinner = ora({
    text: 'Fetching site blob objects...',
    isSilent: json_mode || !process.stdout.isTTY,
  }).start()

  // Fetch blob object IDs
  const blob_object_ids = await fetch_site_blob_objects(site_id, sui_client)

  spinner.stop()

  if (blob_object_ids.length === 0) {
    if (json_mode) {
      console.log(JSON.stringify({ status: 'no_blobs', site_id }))
    } else {
      console.log('')
      console.log(
        chalk.yellow('  No blob objects found. Site has no resources to renew.'),
      )
      console.log('')
    }
    return
  }

  if (!json_mode) {
    console.log('')
    console.log(
      chalk.bold(
        `  Found ${chalk.cyan(blob_object_ids.length)} blob${blob_object_ids.length === 1 ? '' : 's'} for site ${chalk.cyan(site_id.slice(0, 12))}...`,
      ),
    )
    console.log('')
  }

  // Prompt for epochs if not provided
  if (!epochs && !auto_yes && !json_mode) {
    const response = await prompts({
      type: 'number',
      name: 'epochs',
      message: 'Extend storage by how many epochs?',
      initial: 5,
      min: 1,
    })

    if (response.epochs === undefined) {
      console.log(chalk.yellow('\n  Cancelled.\n'))
      process.exit(0)
    }

    epochs = response.epochs
  }

  // Default to 5 epochs if still not set
  if (!epochs) {
    epochs = 5
  }

  // Confirm renewal
  if (!auto_yes && !json_mode) {
    console.log(
      chalk.dim(
        `  This will extend ${blob_object_ids.length} blob${blob_object_ids.length === 1 ? '' : 's'} by ${epochs} epoch${epochs === 1 ? '' : 's'}.`,
      ),
    )
    console.log('')

    const response = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Continue?',
      initial: true,
    })

    if (!response.confirmed) {
      console.log(chalk.yellow('\n  Cancelled.\n'))
      process.exit(0)
    }
    console.log('')
  }

  // Extend each blob
  const results = []
  for (const blob_object_id of blob_object_ids) {
    if (!json_mode) {
      spinner.start(
        `Extending blob ${chalk.dim(blob_object_id.slice(0, 12))}...`,
      )
    }

    const result = await extend_blob(blob_object_id, epochs)

    if (json_mode) {
      results.push({ blob_object_id, ...result })
    } else {
      if (result.success) {
        spinner.succeed(
          `Extended ${chalk.green(blob_object_id.slice(0, 12))}... by ${epochs} epoch${epochs === 1 ? '' : 's'}`,
        )
      } else {
        spinner.fail(
          `Failed to extend ${chalk.red(blob_object_id.slice(0, 12))}...: ${result.error}`,
        )
      }
    }
  }

  const success_count = results.filter(r => r.success).length

  if (json_mode) {
    console.log(
      JSON.stringify({
        status: 'complete',
        site_id,
        total: blob_object_ids.length,
        success: success_count,
        failed: blob_object_ids.length - success_count,
        results,
      }),
    )
  } else {
    console.log('')
    console.log(
      chalk.green.bold(
        `  ✓ Renewed ${success_count}/${blob_object_ids.length} blob${blob_object_ids.length === 1 ? '' : 's'}`,
      ),
    )
    console.log('')
  }
}

// Export for testing
export { fetch_site_blob_objects, extend_blob }
