import { SuinsClient } from '@mysten/suins'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

/**
 * @typedef {Object} SuinsClientConfig
 * @property {import('@mysten/sui/client').SuiClient} [client] - Sui client (injectable)
 * @property {'mainnet' | 'testnet'} [network] - Network (defaults to testnet)
 */

/**
 * Initialize SuiNS client
 * @param {SuinsClientConfig} [config] - Configuration options
 * @returns {SuinsClient} SuiNS client instance
 */
export function get_suins_client({
  client = new SuiClient({ url: getFullnodeUrl('testnet') }),
  network = 'testnet',
} = {}) {
  return new SuinsClient({ client, network })
}

/**
 * Resolve SuiNS name to Sui address
 * @param {string} name - SuiNS name (e.g., "mysite.sui" or "@mysite")
 * @param {SuinsClient} [client] - SuiNS client (injectable for testing)
 * @returns {Promise<string | null>} Resolved address or null if not found
 */
export async function resolve_suins_name(name, client = get_suins_client()) {
  const normalized = normalize_suins_name(name)
  const record = await client.getNameRecord(normalized)
  return record?.targetAddress ?? null
}

/**
 * Get the SuiNS NFT object ID for a name
 * @param {string} name - SuiNS name (e.g., "mysite.sui" or "@mysite")
 * @param {SuinsClient} [client] - SuiNS client (injectable for testing)
 * @returns {Promise<string | null>} NFT object ID or null if not found
 */
export async function get_name_object_id(name, client = get_suins_client()) {
  const normalized = normalize_suins_name(name)
  const record = await client.getNameRecord(normalized)
  return record?.nftId ?? null
}

/**
 * @typedef {Object} OwnershipResult
 * @property {boolean} valid - Whether domain ownership is valid
 * @property {boolean} owned - Whether wallet owns the domain
 * @property {boolean} expired - Whether domain has expired
 * @property {string} [nft_id] - SuiNS NFT object ID (if found)
 * @property {string} [error] - Error message (if validation failed)
 */

/**
 * Validate SuiNS domain ownership
 * Checks that the wallet address owns the SuiNS NFT for the given domain
 * @param {string} domain - SuiNS domain (e.g., "mysite.sui" or "@mysite")
 * @param {string} wallet_address - Sui wallet address to verify ownership
 * @param {Object} [deps] - Injectable dependencies
 * @param {SuinsClient} [deps.suins_client] - SuiNS client
 * @param {import('@mysten/sui/client').SuiClient} [deps.sui_client] - Sui client
 * @returns {Promise<OwnershipResult>} Validation result
 */
export async function validate_domain_ownership(
  domain,
  wallet_address,
  { suins_client, sui_client } = {},
) {
  const default_sui_client = new SuiClient({ url: getFullnodeUrl('testnet') })
  const effective_suins_client =
    suins_client ?? get_suins_client({ client: default_sui_client })
  const effective_sui_client = sui_client ?? default_sui_client

  try {
    const normalized = normalize_suins_name(domain)
    const record = await effective_suins_client.getNameRecord(normalized)

    if (!record) {
      return {
        valid: false,
        owned: false,
        expired: false,
        error: `Domain "${domain}" not found in SuiNS registry`,
      }
    }

    // Check expiration
    const now = Date.now()
    const expired = record.expirationTimestampMs < now

    if (expired) {
      return {
        valid: false,
        owned: false,
        expired: true,
        nft_id: record.nftId,
        error: `Domain "${domain}" has expired`,
      }
    }

    // Verify NFT ownership by checking if wallet owns the SuiNS NFT
    const nft_owner = await get_nft_owner(record.nftId, effective_sui_client)
    const owned = nft_owner === wallet_address

    if (!owned) {
      return {
        valid: false,
        owned: false,
        expired: false,
        nft_id: record.nftId,
        error: `Domain "${domain}" is not owned by wallet ${wallet_address}`,
      }
    }

    return {
      valid: true,
      owned: true,
      expired: false,
      nft_id: record.nftId,
    }
  } catch (error) {
    return {
      valid: false,
      owned: false,
      expired: false,
      error: `Failed to validate domain ownership: ${error.message}`,
    }
  }
}

/**
 * Get owner address of an object
 * @param {string} object_id - Sui object ID
 * @param {import('@mysten/sui/client').SuiClient} client - Sui client
 * @returns {Promise<string | null>} Owner address or null
 */
async function get_nft_owner(object_id, client) {
  const response = await client.getObject({
    id: object_id,
    options: { showOwner: true },
  })

  const { owner } = response.data ?? {}

  // Handle AddressOwner type
  if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
    return owner.AddressOwner
  }

  return null
}

/**
 * Normalize SuiNS name to canonical format
 * Handles "@name" and "name.sui" formats
 * @param {string} name - SuiNS name
 * @returns {string} Normalized name (e.g., "mysite.sui")
 */
export function normalize_suins_name(name) {
  const trimmed = name.trim()

  // Handle @name format
  if (trimmed.startsWith('@')) {
    return `${trimmed.slice(1)}.sui`
  }

  // Already has .sui suffix
  if (trimmed.endsWith('.sui')) {
    return trimmed
  }

  // Add .sui suffix
  return `${trimmed}.sui`
}

// SuiNS NFT type for querying owned names
const SUINS_NFT_TYPE =
  '0x22fa05f21b1ad71442571f3a9b954581d59c8d06ee20e828f8a4fdebe79ac716::suins_registration::SuinsRegistration'

/**
 * Get all SuiNS names owned by a wallet address
 * Queries owned objects of SuiNS NFT type and extracts names
 * @param {string} wallet_address - Sui wallet address
 * @param {Object} [deps] - Injectable dependencies
 * @param {import('@mysten/sui/client').SuiClient} [deps.sui_client] - Sui client
 * @param {'mainnet' | 'testnet'} [deps.network] - Network to query (defaults to testnet)
 * @returns {Promise<string[]>} Array of owned SuiNS names (e.g., ["mysite.sui", "other.sui"])
 */
export async function get_owned_suins_names(
  wallet_address,
  { sui_client, network = 'testnet' } = {},
) {
  const effective_client =
    sui_client ?? new SuiClient({ url: getFullnodeUrl(network) })

  try {
    // Query all SuiNS NFT objects owned by the wallet
    const { data: objects } = await effective_client.getOwnedObjects({
      owner: wallet_address,
      filter: { StructType: SUINS_NFT_TYPE },
      options: { showContent: true },
    })

    const now = Date.now()
    const names = []

    for (const obj of objects) {
      const { content } = obj.data ?? {}
      if (content?.dataType !== 'moveObject') continue

      const { domain_name, expiration_timestamp_ms: exp_ms } =
        content.fields ?? {}
      const expiration_timestamp_ms = Number(exp_ms ?? 0)

      // Skip expired names
      if (expiration_timestamp_ms < now) continue

      if (domain_name) {
        names.push(`${domain_name}.sui`)
      }
    }

    return names
  } catch {
    return []
  }
}

/**
 * @typedef {Object} LinkResult
 * @property {boolean} success - Whether linking succeeded
 * @property {import('@mysten/sui/transactions').Transaction} [transaction] - Transaction to sign and execute
 * @property {string} [error] - Error message if failed
 */

/**
 * Build transaction to link a SuiNS name to a Versui site
 * Sets walrusSiteId user data on the SuiNS name
 * @param {string} name - SuiNS name (e.g., "mysite.sui" or "mysite")
 * @param {string} site_id - Versui Site object ID
 * @param {Object} [deps] - Injectable dependencies
 * @param {SuinsClient} [deps.suins_client] - SuiNS client
 * @returns {Promise<LinkResult>} Result with transaction bytes or error
 */
export async function link_suins_to_site(name, site_id, { suins_client } = {}) {
  const { SuinsTransaction, ALLOWED_METADATA } = await import('@mysten/suins')
  const { Transaction } = await import('@mysten/sui/transactions')

  const effective_client = suins_client ?? get_suins_client()
  const normalized = normalize_suins_name(name)

  try {
    // Get the NFT ID for this name
    const record = await effective_client.getNameRecord(normalized)
    if (!record?.nftId) {
      return { success: false, error: `Name "${normalized}" not found` }
    }

    // Build transaction to set walrusSiteId user data
    const transaction = new Transaction()
    const suins_tx = new SuinsTransaction(effective_client, transaction)

    suins_tx.setUserData({
      nft: record.nftId,
      key: ALLOWED_METADATA.walrusSiteId,
      value: site_id,
      isSubname: false,
    })

    return { success: true, transaction }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
