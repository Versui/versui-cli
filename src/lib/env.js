/**
 * Centralized Versui package ID configuration
 * V10 package with delete_resources_batch feature
 */

const V10_PACKAGE_ID =
  '0x2489609d5e6b754634d4ca892ab259222482f31596a13530fcc8110b5b2461cb'

/**
 * Original package ID (V9 and earlier)
 * Used for type filtering since existing objects still reference this package
 */
const ORIGINAL_PACKAGE_ID =
  '0x824052b308a7edad4ef16eef0f4f724786577f7fef68b6dddeeba8006ead9eb8'

/**
 * Shared Versui registry object IDs by network
 * This is the shared object that maintains the owner->name->site_id mapping
 */
const VERSUI_REGISTRY_IDS = {
  testnet:
    process.env.VERSUI_OBJECT_ID_TESTNET ||
    '0x0075af6378f6f8fc34c778693ccc92dcd1a2868157a2932e87f32f80f3ca2c45',
  mainnet: process.env.VERSUI_OBJECT_ID_MAINNET || null,
}

/**
 * DomainRegistry shared object IDs by network
 */
const DOMAIN_REGISTRY_IDS = {
  testnet:
    process.env.DOMAIN_REGISTRY_ID_TESTNET ||
    '0x5a49320853b8bbb22c727ece89f0683684333081fcc7c4a7d28b992f640e4629',
  mainnet: process.env.DOMAIN_REGISTRY_ID_MAINNET || null,
}

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

/**
 * Get shared Versui registry object ID for network
 * @param {string} network - Network name (testnet|mainnet)
 * @returns {string|null} Registry object ID or null if not deployed
 */
export function get_versui_registry_id(network) {
  return VERSUI_REGISTRY_IDS[network]
}

/**
 * Get DomainRegistry shared object ID for network
 * @param {string} network - Network name (testnet|mainnet)
 * @returns {string|null} DomainRegistry object ID or null if not deployed
 */
export function get_domain_registry_id(network) {
  return DOMAIN_REGISTRY_IDS[network]
}
