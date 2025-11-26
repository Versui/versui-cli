import { Transaction } from '@mysten/sui/transactions'

/**
 * SuiNS package ID on testnet and mainnet
 * @see https://docs.suins.io/developer-guide/integration-guide
 */
const SUINS_PACKAGE_IDS = {
  testnet: '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0',
  mainnet: '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0',
}

/**
 * Parse and validate domain name format
 * @param {string} domain - Full domain (e.g., "mysite.sui")
 * @returns {{ name: string, tld: string, full: string }} Parsed domain components
 * @throws {Error} If domain format is invalid
 */
export function parse_domain_name(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Domain cannot be empty')
  }

  const trimmed = domain.trim()
  if (!trimmed.endsWith('.sui')) {
    throw new Error('Domain must end with .sui')
  }

  const name = trimmed.slice(0, -4) // Remove .sui
  if (!name) {
    throw new Error('Domain name cannot be empty')
  }

  // Validate domain name format (alphanumeric and hyphens only)
  if (!/^[a-z0-9-]+$/i.test(name)) {
    throw new Error(
      'Domain name can only contain letters, numbers, and hyphens',
    )
  }

  return {
    name,
    tld: 'sui',
    full: trimmed,
  }
}

/**
 * Validate SuiNS domain ownership and expiration
 * @param {string} domain - Full domain name (e.g., "mysite.sui")
 * @param {string} wallet - Wallet address to check ownership
 * @param {import('@mysten/suins').SuinsClient} [client] - SuiNS client (injectable for testing)
 * @returns {Promise<{ valid: boolean, owned: boolean, expired: boolean, error?: string }>}
 */
export async function validate_suins_domain(domain, wallet, client) {
  try {
    const parsed = parse_domain_name(domain)

    // Get owned name records for wallet
    const records = await client.getOwnedNameRecords({
      address: wallet,
    })

    // Find matching domain
    const record = records.data?.find(r => r.name === parsed.name)

    if (!record) {
      return {
        valid: false,
        owned: false,
        expired: false,
        error: `Domain ${domain} is not owned by wallet ${wallet}`,
      }
    }

    // Check expiration
    const now = Date.now()
    const expired = record.expiration_timestamp_ms < now

    if (expired) {
      return {
        valid: false,
        owned: true,
        expired: true,
        error: `Domain ${domain} has expired`,
      }
    }

    return {
      valid: true,
      owned: true,
      expired: false,
    }
  } catch (error) {
    return {
      valid: false,
      owned: false,
      expired: false,
      error: `Failed to validate domain: ${error.message}`,
    }
  }
}

/**
 * Create transaction to link SuiNS domain to Versui site
 * Uses SuiNS setUserData to store site_id in domain's user data
 * @param {object} params - Link parameters
 * @param {string} params.domain - Full domain name (e.g., "mysite.sui")
 * @param {string} params.site_id - Versui Site object ID
 * @param {string} params.wallet - Wallet address
 * @param {string} params.suins_package_id - SuiNS package ID
 * @param {string} params.network - Network (testnet or mainnet)
 * @returns {Transaction} Configured transaction
 */
export function link_domain_to_site({
  domain,
  site_id,
  wallet,
  network = 'testnet',
}) {
  // Validate inputs
  if (!site_id?.match(/^0x[a-f0-9]{64}$/)) {
    throw new Error('Invalid site_id format (must be 0x followed by 64 hex)')
  }
  if (!wallet?.match(/^0x[a-f0-9]{64}$/)) {
    throw new Error('Invalid wallet format (must be 0x followed by 64 hex)')
  }

  const parsed = parse_domain_name(domain)
  const suins_package_id = SUINS_PACKAGE_IDS[network]

  const tx = new Transaction()
  tx.setSender(wallet)

  // Call SuiNS setUserData to link domain to site
  // This stores versui_site_id in the domain's user data
  tx.moveCall({
    target: `${suins_package_id}::suins::set_user_data`,
    arguments: [
      tx.pure.string(parsed.name), // Domain name (without .sui)
      tx.pure.string('versui_site_id'), // Key
      tx.pure.string(site_id), // Value
    ],
  })

  return tx
}

/**
 * Get SuiNS package ID for network
 * @param {'testnet' | 'mainnet'} network - Network name
 * @returns {string} Package ID
 */
export function get_suins_package_id(network) {
  return SUINS_PACKAGE_IDS[network] || SUINS_PACKAGE_IDS.testnet
}
