import { Transaction } from '@mysten/sui/transactions'
import { fromBase64 } from '@mysten/sui/utils'

/**
 * Builds identifier -> full path mapping from file metadata
 * @param {Record<string, any>} file_metadata - File metadata map
 * @returns {Record<string, string>} Map of filename to full path
 */
export function build_identifier_map(file_metadata) {
  /** @type {Record<string, string>} */
  const identifier_to_path = {}
  for (const rel_path of Object.keys(file_metadata)) {
    const filename = rel_path.split('/').pop()
    identifier_to_path[filename] = rel_path
  }
  return identifier_to_path
}

/**
 * Creates Sui transaction for site deployment
 * @param {object} params - Transaction parameters
 * @param {string} params.package_id - Versui package ID
 * @param {string} params.wallet - Wallet address
 * @param {string} params.site_name - Site name
 * @param {Array<{identifier: string, quiltPatchId: string}>} params.quilt_patches - Walrus patches
 * @param {Record<string, {hash: string, size: number, content_type: string}>} params.file_metadata - File metadata
 * @returns {Transaction} Configured transaction object
 */
export function create_site_transaction({
  package_id,
  wallet,
  site_name,
  quilt_patches,
  file_metadata,
}) {
  const tx = new Transaction()
  tx.setSender(wallet)

  // Use non-entry functions (new + add_resource) instead of entry functions
  // This allows us to keep the Site object in the transaction for multiple calls
  const [site] = tx.moveCall({
    target: `${package_id}::site::new`,
    arguments: [tx.pure.string(site_name)],
  })

  // Build identifier -> full path mapping (walrus flattens paths)
  const identifier_to_path = build_identifier_map(file_metadata)

  const resources = []
  for (const patch of quilt_patches) {
    const full_path =
      identifier_to_path[patch.identifier] || '/' + patch.identifier
    const info = file_metadata[full_path]
    if (!info) continue

    const [resource] = tx.moveCall({
      target: `${package_id}::site::add_resource`,
      arguments: [
        site,
        tx.pure.string(full_path),
        tx.pure.string(patch.quiltPatchId),
        tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
        tx.pure.string(info.content_type),
        tx.pure.u64(info.size),
      ],
    })
    resources.push(resource)
  }

  // Transfer Site + all Resources to wallet
  tx.transferObjects([site, ...resources], wallet)

  return tx
}

/**
 * Extracts site ID from transaction result
 * @param {object} tx_result - Transaction result from Sui
 * @returns {string} Site object ID or 'unknown'
 */
export function extract_site_id(tx_result) {
  return (
    tx_result?.objectChanges?.find(
      c => c.type === 'created' && c.objectType?.includes('::site::Site'),
    )?.objectId || 'unknown'
  )
}
