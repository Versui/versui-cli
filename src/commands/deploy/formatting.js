/**
 * Formats bytes into human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g. "1.5 KB", "2.50 MB")
 */
export function format_bytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/**
 * Formats wallet address for display (truncated)
 * @param {string} address - Full wallet address
 * @returns {string} Truncated address (e.g. "0x1234...abcd")
 */
export function format_wallet_address(address) {
  if (!address) return ''
  if (address.length <= 14) return address
  return address.slice(0, 10) + '...' + address.slice(-4)
}

/**
 * Formats epoch duration message
 * @param {number} epochs - Number of epochs
 * @param {string} network - Network name ('testnet' or 'mainnet')
 * @returns {string} Duration message with approximate days
 */
export function format_epoch_duration(epochs, network) {
  const epoch_days = network === 'mainnet' ? 14 : 1
  const total_days = epochs * epoch_days
  return `${epochs} epoch(s) ≈ ${total_days} day${total_days === 1 ? '' : 's'}`
}
