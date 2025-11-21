import { WalrusClient } from '@mysten/walrus'

/**
 * Create Walrus client for network
 * @param {string} network - 'testnet' or 'mainnet'
 * @param {import('@mysten/sui/client').SuiClient} sui_client - Sui client
 * @returns {WalrusClient}
 */
export function create_walrus_client(network, sui_client) {
  return new WalrusClient({
    network: network === 'mainnet' ? 'mainnet' : 'testnet',
    suiClient: sui_client,
  })
}

/**
 * Encode files and return metadata for registration
 * @param {WalrusClient} walrus_client
 * @param {Array<{path: string, content: Buffer}>} files
 * @returns {Promise<Array<{path: string, blob_id: string, root_hash: number[], size: number, metadata: Object}>>}
 */
export async function encode_files(walrus_client, files) {
  const encoded_blobs = []

  for (const file of files) {
    const encoded = await walrus_client.encodeBlob(file.content)
    encoded_blobs.push({
      path: file.path,
      blob_id: encoded.blobId,
      root_hash: Array.from(encoded.rootHash),
      size: file.content.length,
      metadata: encoded.metadata,
    })
  }

  return encoded_blobs
}

/**
 * Upload files to storage nodes and get confirmations
 * This re-encodes the files (deterministic) and uploads
 * @param {WalrusClient} walrus_client
 * @param {Array<{content: Buffer}>} files - File contents
 * @param {Array<string>} blob_object_ids - Blob object IDs from register TX
 * @param {Object} options
 * @returns {Promise<Array>} confirmations by blob
 */
export async function upload_files_to_nodes(
  walrus_client,
  files,
  blob_object_ids,
  options = {},
) {
  const { deletable = true } = options
  const confirmations_by_blob = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    // Re-encode (deterministic - same content = same slivers)
    const encoded = await walrus_client.encodeBlob(file.content)

    // Upload to nodes
    const confirmations = await walrus_client.writeEncodedBlobToNodes({
      blobId: encoded.blobId,
      metadata: encoded.metadata,
      sliversByNode: encoded.sliversByNode,
      deletable,
      objectId: blob_object_ids[i],
    })

    confirmations_by_blob.push(confirmations.filter(c => c !== null))
  }

  return confirmations_by_blob
}

/**
 * Download blob from Walrus
 * @param {WalrusClient} walrus_client
 * @param {string} blob_id
 * @returns {Promise<Uint8Array>}
 */
export async function download_blob(walrus_client, blob_id) {
  return walrus_client.readBlob({ blobId: blob_id })
}
