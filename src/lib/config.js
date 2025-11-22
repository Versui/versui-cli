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
