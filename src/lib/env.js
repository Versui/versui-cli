/**
 * Centralized Versui package ID configuration
 * V10 package with delete_resources_batch feature
 */

const V10_PACKAGE_ID =
  '0x33ae55f9781df0d89a9b16b091daa8c8ee826638caca2e68604b1647fd0e84e2'

/**
 * Validates Sui package ID format
 * @param {string} id - Package ID to validate
 * @returns {boolean} True if valid package ID
 */
function is_valid_package_id(id) {
  if (!id || typeof id !== 'string') return false
  // Sui package IDs are 0x followed by 64 hexadecimal characters
  return /^0x[a-fA-F0-9]{64}$/.test(id)
}

/**
 * Get validated package ID from env var or default
 * @param {string|undefined} env_var - Environment variable value
 * @param {string|null} default_value - Default value to use
 * @returns {string|null} Validated package ID or null
 */
function get_validated_package_id(env_var, default_value) {
  if (env_var && is_valid_package_id(env_var)) {
    return env_var
  }
  return default_value
}

/**
 * Versui package IDs by network
 * Supports env var override: VERSUI_PACKAGE_ID_TESTNET, VERSUI_PACKAGE_ID_MAINNET
 * Only uses env var if it matches valid package ID format
 */
export const VERSUI_PACKAGE_IDS = {
  testnet: get_validated_package_id(
    process.env.VERSUI_PACKAGE_ID_TESTNET,
    V10_PACKAGE_ID,
  ),
  mainnet: get_validated_package_id(
    process.env.VERSUI_PACKAGE_ID_MAINNET,
    null,
  ),
}

/**
 * Get package ID for network
 * @param {string} network - Network name (testnet|mainnet)
 * @returns {string|null} Package ID or null if not deployed
 */
export function get_versui_package_id(network) {
  return VERSUI_PACKAGE_IDS[network]
}
