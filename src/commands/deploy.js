import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { join, extname, relative } from 'node:path'

import { hash_content } from '../lib/hash.js'
import { compute_delta } from '../lib/delta.js'
import { upload_blob } from '../lib/walrus.js'
import { create_site, create_resource, update_resource } from '../lib/sui.js'
import { detect_service_worker } from '../lib/sw.js'
import { generate_bootstrap_html } from '../lib/bootstrap.js'

/**
 * @typedef {Object} DeployOptions
 * @property {string} [domain] - SuiNS domain to link
 * @property {number} [epochs=365] - Storage duration in epochs
 * @property {string} [output] - Output directory for bootstrap HTML
 * @property {string} [network='testnet'] - Network to deploy to
 * @property {boolean} [noDelta=false] - Force full upload (bypass delta)
 */

/**
 * Get MIME type from file extension
 * @param {string} file_path - File path
 * @returns {string} MIME type
 */
function get_content_type(file_path) {
  const ext = extname(file_path).toLowerCase()
  const mime_types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  }
  return mime_types[ext] || 'application/octet-stream'
}

/**
 * Recursively scan directory for files
 * @param {string} dir - Directory to scan
 * @param {string} base_dir - Base directory for relative paths
 * @param {Object} fs_module - File system module (injectable)
 * @returns {string[]} Array of file paths
 */
function scan_directory(dir, base_dir, fs_module = { readdirSync, statSync }) {
  const files = []
  const entries = fs_module.readdirSync(dir)

  for (const entry of entries) {
    const full_path = join(dir, entry)
    const stat = fs_module.statSync(full_path)

    if (stat.isDirectory()) {
      files.push(...scan_directory(full_path, base_dir, fs_module))
    } else if (stat.isFile()) {
      files.push(full_path)
    }
  }

  return files
}

/**
 * Deploy site to Walrus + Sui
 * @param {string} dir - Directory to deploy
 * @param {DeployOptions} options - Deployment options
 * @param {Object} [context] - Injectable dependencies (for testing)
 * @returns {Promise<void>}
 */
export async function deploy(dir, options = {}, context = {}) {
  // Default dependencies (can be overridden for testing)
  const fs = context.fs || {
    existsSync,
    readdirSync,
    statSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
  }
  const walrus = context.walrus || { upload_blob }
  const sui = context.sui || { create_site, create_resource, update_resource }

  const build_dir = dir
  const { network = 'testnet', epochs = 365 } = options
  const site_name = 'Versui Site'

  // Configuration
  const aggregator_url =
    network === 'mainnet'
      ? 'https://aggregator.walrus.space'
      : 'https://aggregator.walrus-testnet.walrus.space'

  const publisher_url =
    network === 'mainnet'
      ? 'https://publisher.walrus.space'
      : 'https://publisher.walrus-testnet.walrus.space'

  const manifest_path = join(build_dir, '../.versui/manifest.json')

  // Step 1: Scan build directory
  const file_paths = scan_directory(build_dir, build_dir, fs)

  // Step 2: Hash all files
  /** @type {Record<string, {hash: string, size: number, content_type: string}>} */
  const current_files = {}
  for (const file_path of file_paths) {
    const rel_path = '/' + relative(build_dir, file_path).replace(/\\/g, '/')
    const content = fs.readFileSync(file_path)
    const hash = hash_content(content)
    const stat = fs.statSync(file_path)

    current_files[rel_path] = {
      hash,
      size: stat.size,
      content_type: get_content_type(file_path),
    }
  }

  // Step 3: Load previous manifest (if exists)
  let previous_manifest = null
  if (fs.existsSync(manifest_path)) {
    const manifest_data = fs.readFileSync(manifest_path, 'utf8')
    previous_manifest = JSON.parse(manifest_data)
  }

  // Step 4: Compute delta
  const delta = compute_delta(current_files, previous_manifest)

  // Step 5: Create site object (first deploy) or reuse existing
  let site_id
  if (!previous_manifest) {
    const { site_id: created_site_id } = await sui.create_site(
      site_name,
      context.sui_client,
    )
    site_id = created_site_id
  } else {
    ;({ site_id } = previous_manifest)
  }

  // Step 6: Upload changed files to Walrus
  const new_resources = { ...(previous_manifest?.resources || {}) }

  for (const path of [...delta.added, ...delta.modified]) {
    const file_path = join(build_dir, path.slice(1)) // Remove leading /
    const content = fs.readFileSync(file_path)

    const upload_result = await walrus.upload_blob(
      content,
      publisher_url,
      epochs,
    )

    new_resources[path] = {
      path,
      blob_id: upload_result.blob_id,
      blob_hash: current_files[path].hash,
      content_type: current_files[path].content_type,
      size: current_files[path].size,
    }
  }

  // Remove deleted files from resources
  for (const path of delta.removed) {
    delete new_resources[path]
  }

  // Step 7: Create/update Sui Resource objects
  for (const path of delta.added) {
    await sui.create_resource(site_id, new_resources[path], context.sui_client)
  }

  for (const path of delta.modified) {
    await sui.update_resource(
      new_resources[path].blob_id,
      new_resources[path],
      context.sui_client,
    )
  }

  // Step 8: Detect service worker
  const sw_detection = await detect_service_worker(build_dir, fs)

  let sw_blob_id = null
  if (sw_detection.type !== 'none') {
    const sw_content = fs.readFileSync(sw_detection.path)
    const sw_upload = await walrus.upload_blob(
      sw_content,
      publisher_url,
      epochs,
    )
    sw_blob_id = sw_upload.blob_id
  }

  // Step 9: Generate and upload bootstrap HTML
  const bootstrap_html = generate_bootstrap_html({
    site_name,
    aggregator_url,
    index_blob_id: new_resources['/index.html'].blob_id,
    service_worker: {
      type: sw_detection.type,
      path: sw_detection.path,
      blob_id: sw_blob_id,
    },
  })

  const bootstrap_buffer = Buffer.from(bootstrap_html)
  const bootstrap_upload = await walrus.upload_blob(
    bootstrap_buffer,
    publisher_url,
    epochs,
  )

  // Step 10: Save manifest
  const new_manifest = {
    version: 1,
    site_id,
    deployed_at: new Date().toISOString(),
    bootstrap_blob_id: bootstrap_upload.blob_id,
    resources: new_resources,
  }

  const manifest_dir = join(build_dir, '../.versui')
  if (!fs.existsSync(manifest_dir)) {
    fs.mkdirSync(manifest_dir, { recursive: true })
  }

  fs.writeFileSync(manifest_path, JSON.stringify(new_manifest, null, 2))
}
