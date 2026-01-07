/**
 * Centralized Versui package ID configuration
 * V10 package with delete_resources_batch feature
 */

const V10_PACKAGE_ID =
  '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'

/**
 * Original package ID
 * V10 is the only deployed contract - fresh deployments, no upgrade chain
 * Set to same as V10_PACKAGE_ID since previous deployments are irrelevant
 */
const ORIGINAL_PACKAGE_ID = V10_PACKAGE_ID

/**
 * Shared Versui registry object IDs by network
 * This is the shared object that maintains the owner->name->site_id mapping
 */
const VERSUI_REGISTRY_IDS = {
  testnet:
    process.env.VERSUI_OBJECT_ID_TESTNET ||
    '0x80ed579d585d60db342a9082b69671cbcd426acc8a96032fe923caba56b32ada',
  mainnet: process.env.VERSUI_OBJECT_ID_MAINNET || null,
}

/**
 * DomainRegistry shared object IDs by network
 */
const DOMAIN_REGISTRY_IDS = {
  testnet:
    process.env.DOMAIN_REGISTRY_ID_TESTNET ||
    '0x3bb74d3bba466dd8fb5e3c639929b0632472c9a0682d5659e2519525cd4ab13a',
  mainnet: process.env.DOMAIN_REGISTRY_ID_MAINNET || null,
}

/**
 * Version shared object IDs by network
 */
const VERSION_OBJECT_IDS = {
  testnet:
    process.env.VERSION_OBJECT_ID_TESTNET ||
    '0x4dc11a416ea960e80034d2f1f554085016be14e0c81c1384eb0d19edd5e46e4a',
  mainnet: process.env.VERSION_OBJECT_ID_MAINNET || null,
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
 * V10 is the only active deployment - returns same as get_versui_package_id()
 * @param {string} network - Network name (testnet|mainnet)
 * @returns {string|null} Original package ID or null if not deployed
 */
export function get_original_package_id(network) {
  // Returns same as V10_PACKAGE_ID (no upgrade chain)
  return get_versui_package_id(network)
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

/**
 * Get Version shared object ID for network
 * @param {string} network - Network name (testnet|mainnet)
 * @returns {string|null} Version object ID or null if not deployed
 */
export function get_version_object_id(network) {
  return VERSION_OBJECT_IDS[network]
}
