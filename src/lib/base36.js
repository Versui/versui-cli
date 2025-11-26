/**
 * Base36 encoding utilities for Sui object IDs
 *
 * Sui object IDs are 256-bit (64 hex chars) which exceeds DNS subdomain limit (63 chars).
 * Base36 encoding reduces this to ~50 chars while remaining DNS-safe (alphanumeric).
 */

/**
 * Encode a 0x-prefixed hex string to base36
 * @param {string} object_id - Sui object ID (with or without 0x prefix)
 * @returns {string} Lowercase base36 encoded string (≤63 chars)
 */
export function encode_base36(object_id) {
  const hex = object_id.startsWith('0x') ? object_id.slice(2) : object_id
  const bigint_value = BigInt('0x' + hex)
  return bigint_value.toString(36).toLowerCase()
}

/**
 * Decode a base36 subdomain back to 0x-prefixed hex
 * @param {string} subdomain - Base36 encoded string
 * @returns {string} 0x-prefixed 64-char hex string (lowercase)
 */
export function decode_base36(subdomain) {
  const bigint_value = BigInt(parse_base36(subdomain))
  const hex = bigint_value.toString(16).padStart(64, '0')
  return '0x' + hex
}

/**
 * Parse base36 string to BigInt
 * @param {string} str - Base36 string
 * @returns {bigint}
 */
function parse_base36(str) {
  let result = 0n
  for (const char of str.toLowerCase()) {
    const digit =
      char >= '0' && char <= '9'
        ? char.charCodeAt(0) - 48
        : char.charCodeAt(0) - 87
    result = result * 36n + BigInt(digit)
  }
  return result
}
