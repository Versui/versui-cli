import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import prompts from 'prompts'

import { generate_bootstrap } from '../lib/generate.js'
import { generate_sw_snippet } from '../lib/sw.js'
import { read_versui_config, get_aggregators } from '../lib/config.js'

/**
 * Regenerate bootstrap or SW snippet for an existing site
 * @param {string} site_id - Site object ID
 * @param {Object} options - Command options
 * @param {string} [options.network] - Network (testnet|mainnet)
 * @param {Object} [options.client] - Sui client (for testing)
 * @param {Function} [options.prompts_fn] - Prompts function (for testing)
 * @returns {Promise<Object>} Regeneration result
 */
export async function regenerate(site_id, options = {}) {
  const { network = 'testnet', client, prompts_fn = prompts } = options

  // Create Sui client
  const sui_client =
    client ||
    new SuiClient({
      url: getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet'),
    })

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

  // Fetch resource details
  const resource_ids = resources.map(r => r.objectId)
  const resource_objects =
    resource_ids.length > 0
      ? await sui_client.multiGetObjects({
          ids: resource_ids,
          options: { showContent: true },
        })
      : []

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
