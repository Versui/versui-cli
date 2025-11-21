/**
 * @typedef {Object} UploadResult
 * @property {string} blob_id - Walrus blob ID
 * @property {string} [object_id] - Sui object ID
 * @property {number} size - Blob size
 * @property {boolean} [already_exists] - True if blob already existed
 */

/**
 * Upload blob to Walrus storage
 * @param {Buffer} content - File content as Buffer
 * @param {string} publisher_url - Walrus publisher URL
 * @param {number} epochs - Storage duration in epochs (1 epoch = ~24 hours)
 * @param {Function} [fetch_fn=fetch] - Fetch function (injectable for testing)
 * @returns {Promise<UploadResult>} Upload result with blob ID and metadata
 */
export async function upload_blob(
  content,
  publisher_url,
  epochs,
  fetch_fn = fetch,
) {
  const url = `${publisher_url}/v1/blobs?epochs=${epochs}`

  const response = await fetch_fn(url, {
    method: 'PUT',
    body: content,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to upload blob: ${response.status} ${response.statusText}`,
    )
  }

  const data = await response.json()

  // Check if blob was newly created
  if (data.newlyCreated) {
    return {
      blob_id: data.newlyCreated.blobObject.blobId,
      object_id: data.newlyCreated.blobObject.id,
      size: data.newlyCreated.blobObject.size,
    }
  }

  // Check if blob already exists
  if (data.alreadyCertified) {
    return {
      blob_id: data.alreadyCertified.blobId,
      size: 0, // Size not provided for already certified blobs
      already_exists: true,
    }
  }

  throw new Error('Unexpected response format from Walrus publisher')
}

/**
 * Download blob from Walrus aggregator
 * @param {string} blob_id - Blob ID to download
 * @param {string} aggregator_url - Walrus aggregator URL
 * @param {Function} [fetch_fn=fetch] - Fetch function (injectable for testing)
 * @returns {Promise<Buffer>} Blob content as Buffer
 */
export async function download_blob(blob_id, aggregator_url, fetch_fn = fetch) {
  const url = `${aggregator_url}/v1/blobs/${blob_id}`

  const response = await fetch_fn(url)

  if (!response.ok) {
    throw new Error(
      `Failed to download blob: ${response.status} ${response.statusText}`,
    )
  }

  const array_buffer = await response.arrayBuffer()
  return Buffer.from(array_buffer)
}
