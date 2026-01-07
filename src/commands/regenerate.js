import { execSync } from 'node:child_process'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import prompts from 'prompts'

import { generate_bootstrap } from '../lib/generate.js'
import { generate_sw_snippet } from '../lib/sw.js'
import { read_versui_config, get_aggregators } from '../lib/config.js'
import { resolve_site_id } from '../lib/sui.js'

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
  } catch {
    throw new Error(
      'Could not get active wallet address. Run: sui client active-address',
    )
  }
}

/**
 * Regenerate bootstrap or SW snippet for an existing site
 * @param {string} site_identifier - Site ID (0x...) or site name
 * @param {Object} options - Command options
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @param {Object} [options.client] - Sui client (for testing)
 * @param {Function} [options.prompts_fn] - Prompts function (for testing)
 * @returns {Promise<Object>} Regeneration result
 */
export async function regenerate(site_identifier, options = {}) {
  const { network = 'testnet', client, prompts_fn = prompts } = options

  // Create Sui client
  const sui_client =
    client ||
    new SuiClient({
      url: getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet'),
    })

  // Resolve site identifier to site ID
  const address = get_active_address()
  const site_id = await resolve_site_id(
    site_identifier,
    sui_client,
    address,
    network,
  )

  // Fetch site object
  const site_obj = await sui_client.getObject({
    id: site_id,
    options: { showContent: true },
  })

  if (!site_obj.data) {
    throw new Error(`Site not found: ${site_id}`)
  }

  const site_fields = site_obj.data.content.fields
  const site_name = site_fields.name
  const resources_table_id = site_fields.resources.fields.id.id

  // Fetch all resources from table
  const resources = []
  let cursor = null
  let has_next_page = true

  while (has_next_page) {
    const page = await sui_client.getDynamicFields({
      parentId: resources_table_id,
      cursor,
    })

    resources.push(...page.data)
    has_next_page = page.hasNextPage
    cursor = page.nextCursor
  }

  // Fetch resource details (batch in chunks of 50 due to RPC limit)
  const resource_ids = resources.map(r => r.objectId)
  const resource_objects = []

  if (resource_ids.length > 0) {
    const BATCH_SIZE = 50
    for (let i = 0; i < resource_ids.length; i += BATCH_SIZE) {
      const batch = resource_ids.slice(i, i + BATCH_SIZE)
      const batch_results = await sui_client.multiGetObjects({
        ids: batch,
        options: { showContent: true },
      })
      resource_objects.push(...batch_results)
    }
  }

  // Build resource map
  /** @type {Object<string, string>} */
  const resource_map = {}
  for (const res of resource_objects) {
    if (!res.data) continue
    const { fields } = res.data.content
    resource_map[fields.path] = fields.blob_hash
  }

  // Ask user for output type (interactive)
  const { output_type } = await prompts_fn({
    type: 'select',
    name: 'output_type',
    message: 'What do you want to regenerate?',
    choices: [
      { title: 'Bootstrap HTML + SW', value: 'bootstrap' },
      { title: 'Service Worker snippet', value: 'sw' },
    ],
  })

  if (!output_type) {
    throw new Error('Regeneration cancelled')
  }

  const result = {
    site_name,
    resource_map,
    output_type,
  }

  if (output_type === 'bootstrap') {
    // Get aggregators from .versui config
    const versui_config = read_versui_config(process.cwd())
    const aggregators = get_aggregators(versui_config, network)

    const { html, sw } = generate_bootstrap(
      site_name,
      aggregators,
      resource_map,
    )
    result.bootstrap_html = html
    result.bootstrap_sw = sw
  } else {
    // Generate SW snippet
    const snippet = generate_sw_snippet(resource_map, 'sw.js')
    result.sw_snippet = snippet
  }

  return result
}
