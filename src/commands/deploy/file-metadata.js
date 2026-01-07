import { statSync, promises as fs } from 'node:fs'
import { relative } from 'node:path'

import { hash_content, hash_file } from '../../lib/hash.js'
import { get_content_type, read_file } from '../../lib/files.js'

/**
 * Builds metadata for a single file
 * @param {string} file_path - Absolute path to file
 * @param {string} base_dir - Base directory for relative path calculation
 * @returns {{ path: string, hash: string, size: number, content_type: string }}
 */
export function build_file_metadata(file_path, base_dir) {
  const rel_path = '/' + relative(base_dir, file_path).replace(/\\/g, '/')
  const content = read_file(file_path)
  const { size } = statSync(file_path)

  return {
    path: rel_path,
    hash: hash_content(content),
    size,
    content_type: get_content_type(file_path),
  }
}

/**
 * Builds metadata for a single file (async version)
 * @param {string} file_path - Absolute path to file
 * @param {string} base_dir - Base directory for relative path calculation
 * @returns {Promise<{ path: string, hash: string, size: number, content_type: string }>}
 */
export async function build_file_metadata_async(file_path, base_dir) {
  const rel_path = '/' + relative(base_dir, file_path).replace(/\\/g, '/')
  const [hash, stats] = await Promise.all([
    hash_file(file_path),
    fs.stat(file_path),
  ])

  return {
    path: rel_path,
    hash,
    size: stats.size,
    content_type: get_content_type(file_path),
  }
}

/**
 * Builds metadata for multiple files
 * @param {string[]} file_paths - Array of absolute file paths
 * @param {string} base_dir - Base directory for relative path calculation
 * @returns {{ metadata: Record<string, { hash: string, size: number, content_type: string }>, total_size: number }}
 */
export function build_files_metadata(file_paths, base_dir) {
  /** @type {Record<string, { hash: string, size: number, content_type: string }>} */
  const metadata = {}
  let total_size = 0

  for (const file_path of file_paths) {
    const file_meta = build_file_metadata(file_path, base_dir)
    metadata[file_meta.path] = {
      hash: file_meta.hash,
      size: file_meta.size,
      content_type: file_meta.content_type,
    }
    total_size += file_meta.size
  }

  return { metadata, total_size }
}

/**
 * Builds metadata for multiple files (async version)
 * @param {string[]} file_paths - Array of absolute file paths
 * @param {string} base_dir - Base directory for relative path calculation
 * @returns {Promise<{ metadata: Record<string, { hash: string, size: number, content_type: string }>, total_size: number }>}
 */
export async function build_files_metadata_async(file_paths, base_dir) {
  /** @type {Record<string, { hash: string, size: number, content_type: string }>} */
  const metadata = {}
  let total_size = 0

  // Process files in batches to avoid overwhelming the system
  const batch_size = 10
  for (let i = 0; i < file_paths.length; i += batch_size) {
    const batch = file_paths.slice(i, i + batch_size)
    const batch_results = await Promise.all(
      batch.map(fp => build_file_metadata_async(fp, base_dir)),
    )

    for (const file_meta of batch_results) {
      metadata[file_meta.path] = {
        hash: file_meta.hash,
        size: file_meta.size,
        content_type: file_meta.content_type,
      }
      total_size += file_meta.size
    }

    // Yield to event loop between batches to keep UI responsive
    if (i + batch_size < file_paths.length) {
      await new Promise(resolve => setImmediate(resolve))
    }
  }

  return { metadata, total_size }
}
