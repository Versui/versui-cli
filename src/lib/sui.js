/**
 * @typedef {Object} SiteResult
 * @property {string} site_id - Created site object ID
 * @property {string} digest - Transaction digest
 */

/**
 * @typedef {Object} ResourceResult
 * @property {string} resource_id - Created/updated resource object ID
 * @property {string} digest - Transaction digest
 */

/**
 * @typedef {Object} ResourceData
 * @property {string} path - Resource path (e.g., '/index.html')
 * @property {string} blob_id - Walrus blob ID
 * @property {string} blob_hash - SHA-256 hash of content
 * @property {string} content_type - MIME type
 * @property {number} size - File size in bytes
 * @property {Object<string, string>} [headers] - Custom HTTP headers
 */

/**
 * Create a new Site object on Sui blockchain
 * @param {string} name - Site name
 * @param {Object} sui_client - Sui client (injectable for testing)
 * @returns {Promise<SiteResult>} Site creation result
 */
export async function create_site(name, sui_client) {
  try {
    // TODO: Build actual transaction block when Move contract is deployed
    // For now, this is a placeholder that will need:
    // - Package ID of deployed Move contract
    // - Module name
    // - Function name (e.g., "create_site")

    const tx_result = await sui_client.signAndExecuteTransaction({
      // Transaction block would be built here with:
      // tx.moveCall({
      //   target: `${PACKAGE_ID}::versui::create_site`,
      //   arguments: [tx.pure(name)],
      // })
    })

    // Extract created object ID from transaction effects
    const created_objects = tx_result.effects?.created || []
    if (created_objects.length === 0) {
      throw new Error('No objects created in transaction')
    }

    const site_id = created_objects[0].reference.objectId

    return {
      site_id,
      digest: tx_result.digest,
    }
  } catch (error) {
    throw new Error(`Failed to create site: ${error.message}`)
  }
}

/**
 * Create a new Resource object (derived from Site)
 * @param {string} site_id - Parent site object ID
 * @param {ResourceData} resource_data - Resource metadata
 * @param {Object} sui_client - Sui client (injectable for testing)
 * @returns {Promise<ResourceResult>} Resource creation result
 */
export async function create_resource(site_id, resource_data, sui_client) {
  try {
    // TODO: Build actual transaction block when Move contract is deployed
    // tx.moveCall({
    //   target: `${PACKAGE_ID}::versui::create_resource`,
    //   arguments: [
    //     tx.object(site_id),
    //     tx.pure(resource_data.path),
    //     tx.pure(resource_data.blob_id),
    //     tx.pure(Array.from(Buffer.from(resource_data.blob_hash, 'hex'))),
    //     tx.pure(resource_data.content_type),
    //     tx.pure(resource_data.size),
    //   ],
    // })

    const tx_result = await sui_client.signAndExecuteTransaction({})

    const created_objects = tx_result.effects?.created || []
    if (created_objects.length === 0) {
      throw new Error('No objects created in transaction')
    }

    const resource_id = created_objects[0].reference.objectId

    return {
      resource_id,
      digest: tx_result.digest,
    }
  } catch (error) {
    throw new Error(`Failed to create resource: ${error.message}`)
  }
}

/**
 * Update an existing Resource object
 * @param {string} resource_id - Resource object ID to update
 * @param {Partial<ResourceData>} resource_data - Updated resource metadata
 * @param {Object} sui_client - Sui client (injectable for testing)
 * @returns {Promise<ResourceResult>} Resource update result
 */
export async function update_resource(resource_id, resource_data, sui_client) {
  try {
    // TODO: Build actual transaction block when Move contract is deployed
    // tx.moveCall({
    //   target: `${PACKAGE_ID}::versui::update_resource`,
    //   arguments: [
    //     tx.object(resource_id),
    //     tx.pure(resource_data.blob_id),
    //     tx.pure(Array.from(Buffer.from(resource_data.blob_hash, 'hex'))),
    //     tx.pure(resource_data.size),
    //   ],
    // })

    const tx_result = await sui_client.signAndExecuteTransaction({})

    // Extract mutated object ID from transaction effects
    const mutated_objects = tx_result.effects?.mutated || []
    const updated_resource_id =
      mutated_objects.length > 0
        ? mutated_objects[0].reference.objectId
        : resource_id

    return {
      resource_id: updated_resource_id,
      digest: tx_result.digest,
    }
  } catch (error) {
    throw new Error(`Failed to update resource: ${error.message}`)
  }
}
