import { execSync } from 'node:child_process'

/**
 * Queries Walrus system info for epoch configuration
 * @returns {{ epoch_duration_days: number, max_epochs: number } | null} Epoch info or null on failure
 */
export function get_walrus_epoch_info() {
  try {
    const result = execSync(`echo '{"command": {"info": {}}}' | walrus json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    })

    // Parse JSON output (walrus json outputs to stdout)
    const lines = result.split('\n')
    const json_line = lines.find(line => line.trim().startsWith('{'))

    if (!json_line) {
      return null
    }

    const data = JSON.parse(json_line)
    const duration_secs = data?.epochInfo?.epochDuration?.secs
    const max_epochs = data?.epochInfo?.maxEpochsAhead

    if (!duration_secs || !max_epochs) {
      return null
    }

    return {
      epoch_duration_days: duration_secs / 86400,
      max_epochs,
    }
  } catch {
    return null
  }
}

/**
 * Gets epoch info with fallback to hardcoded defaults
 * @param {string} network - Network name ('mainnet' or 'testnet')
 * @returns {{ epoch_duration_days: number, max_epochs: number }}
 */
export function get_epoch_info_with_fallback(network) {
  // Try to get live data from walrus
  const live_info = get_walrus_epoch_info()
  if (live_info) {
    return live_info
  }

  // Fallback to hardcoded defaults (as of Nov 2024)
  // WARNING: These may become outdated if Walrus changes epoch configuration
  return {
    epoch_duration_days: network === 'mainnet' ? 14 : 1,
    max_epochs: 53, // Both networks use 53 as of mainnet launch
  }
}
