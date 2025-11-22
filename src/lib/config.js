import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Read .versui configuration file from project root
 * @param {string} project_dir - Project directory path
 * @returns {Object|null} Configuration object or null if not found
 */
export function read_versui_config(project_dir) {
  const config_path = join(project_dir, '.versui')

  if (!existsSync(config_path)) {
    return null
  }

  try {
    const content = readFileSync(config_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`Failed to parse .versui config: ${error.message}`)
  }
}

/**
 * Get aggregators list with fallback to defaults
 * @param {Object|null} config - Versui configuration
 * @param {string} network - Network (testnet/mainnet)
 * @returns {string[]} Array of aggregator URLs
 */
export function get_aggregators(config, network) {
  const defaults =
    network === 'mainnet'
      ? ['https://aggregator.walrus.space', 'https://wal-aggregator.stakin.io']
      : [
          'https://aggregator.walrus-testnet.walrus.space',
          'https://aggregator.testnet.blob.store',
        ]

  if (!config || !config.aggregators || config.aggregators.length === 0) {
    return defaults
  }

  // Merge custom aggregators with defaults (custom first for priority)
  return [...config.aggregators, ...defaults]
}

/**
 * Get site name with priority cascade
 * Priority: CLI name → .versui name → package.json name → fallback
 * @param {Object} options - Name resolution options
 * @param {string|null} options.cli_name - Name from CLI flag
 * @param {Object|null} options.versui_config - Versui configuration object
 * @param {Object|null} options.package_json - package.json object
 * @returns {string} Site name
 */
export function get_site_name({ cli_name, versui_config, package_json }) {
  // Priority 1: CLI flag
  if (cli_name && cli_name.trim().length > 0) {
    return cli_name.trim()
  }

  // Priority 2: .versui config
  if (versui_config?.name && versui_config.name.trim().length > 0) {
    return versui_config.name.trim()
  }

  // Priority 3: package.json
  if (package_json?.name && package_json.name.trim().length > 0) {
    return package_json.name.trim()
  }

  // Fallback
  return 'Versui Site'
}
