/**
 * @typedef {Object} FileInfo
 * @property {string} hash - SHA-256 hash
 * @property {number} size - File size in bytes
 * @property {string} content_type - MIME type
 */

/**
 * @typedef {Object} DeltaResult
 * @property {string[]} added - New files
 * @property {string[]} modified - Changed files
 * @property {string[]} removed - Deleted files
 * @property {string[]} unchanged - Unchanged files
 */

/**
 * @typedef {Object} Resource
 * @property {string} path
 * @property {string} blob_id
 * @property {string} blob_hash
 * @property {string} content_type
 * @property {number} size
 * @property {Object<string, string>} [headers]
 */

/**
 * @typedef {Object} DeploymentManifest
 * @property {number} version
 * @property {string} site_id
 * @property {string} deployed_at
 * @property {Object<string, Resource>} resources
 */

/**
 * Compare current files with previous manifest to detect changes
 * Returns lists of added, modified, removed, and unchanged files
 * @param {Object<string, FileInfo>} current_files - Current files with hashes
 * @param {DeploymentManifest | null} previous_manifest - Previous deployment manifest
 * @returns {DeltaResult} Delta comparison result
 */
export function compute_delta(current_files, previous_manifest) {
  const result = {
    added: [],
    modified: [],
    removed: [],
    unchanged: [],
  }

  // First deploy - all files are added
  if (!previous_manifest) {
    result.added = Object.keys(current_files)
    return result
  }

  const previous_resources = previous_manifest.resources
  const current_paths = new Set(Object.keys(current_files))
  const previous_paths = new Set(Object.keys(previous_resources))

  // Check current files against previous manifest
  for (const path of current_paths) {
    const current_file = current_files[path]

    if (!previous_paths.has(path)) {
      // File doesn't exist in previous manifest - added
      result.added.push(path)
    } else {
      const previous_resource = previous_resources[path]
      if (current_file.hash !== previous_resource.blob_hash) {
        // File exists but hash changed - modified
        result.modified.push(path)
      } else {
        // File exists and hash unchanged - unchanged
        result.unchanged.push(path)
      }
    }
  }

  // Check for removed files (in previous but not in current)
  for (const path of previous_paths) {
    if (!current_paths.has(path)) {
      result.removed.push(path)
    }
  }

  return result
}
