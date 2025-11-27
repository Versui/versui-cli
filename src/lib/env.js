/**
 * Centralized Versui package ID configuration
 * V10 package with delete_resources_batch feature
 */

const V10_PACKAGE_ID =
  '0x9922ed554edda60ee0757de6bcc4662df3eda9a918e2f108e0c06a6ca2934d44'

/**
 * Original package ID (V9 and earlier)
 * Used for type filtering since existing objects still reference this package
 */
const ORIGINAL_PACKAGE_ID =
  '0x824052b308a7edad4ef16eef0f4f724786577f7fef68b6dddeeba8006ead9eb8'

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
 * Get package ID for network (for function calls)
 * @param {string} network - Network name (testnet|mainnet)
 * @returns {string|null} Package ID or null if not deployed
 */
export function get_versui_package_id(network) {
  return VERSUI_PACKAGE_IDS[network]
}

/**
 * Get original package ID for network (for type filtering)
 * Used to query objects that were created with the original package
 * @param {string} network - Network name (testnet|mainnet)
 * @returns {string|null} Original package ID or null if not deployed
 */
export function get_original_package_id(network) {
  // For now, only testnet has the original package deployed
  if (network === 'testnet') {
    return ORIGINAL_PACKAGE_ID
  }
  return null
}
