import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

import { minimatch } from 'minimatch'
import mime from 'mime'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'
import { WalrusClient } from '@mysten/walrus'

import { hash_content } from '../lib/hash.js'
import { read_versui_config } from '../lib/config.js'

function get_content_type(file_path) {
  return mime.getType(file_path) || 'application/octet-stream'
}

function read_ignore_patterns(project_dir) {
  const ignore_file = join(project_dir, '.versuignore')
  if (!existsSync(ignore_file)) return []
  return readFileSync(ignore_file, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
}

function should_ignore(file_path, patterns) {
  return patterns.some(p => minimatch(file_path, p, { dot: true }))
}

function scan_directory(dir, base_dir, ignore_patterns = []) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full_path = join(dir, entry)
    const rel_path = relative(base_dir, full_path)
    if (should_ignore(rel_path, ignore_patterns)) continue
    const stat = statSync(full_path)
    if (stat.isDirectory()) {
      files.push(...scan_directory(full_path, base_dir, ignore_patterns))
    } else if (stat.isFile()) {
      files.push(full_path)
    }
  }
  return files
}

/**
 * Prepare deployment: scan files, encode as quilt, output TX1
 * Uses low-level APIs to allow serializing state between prepare/deploy
 */
export async function prepare(dir, options = {}) {
  const {
    network = 'testnet',
    epochs = 1,
    output = 'versui-blob.json',
  } = options

  // Guardrails
  if (!existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`)
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`)
  }

  const parsed_epochs = parseInt(epochs, 10)
  if (isNaN(parsed_epochs) || parsed_epochs < 1) {
    throw new Error('Epochs must be a positive integer')
  }
  if (parsed_epochs > 200) {
    throw new Error('Epochs cannot exceed 200 (~200 days)')
  }

  if (!['testnet', 'mainnet'].includes(network)) {
    throw new Error('Network must be "testnet" or "mainnet"')
  }

  const project_dir = join(dir, '..')
  const config = read_versui_config(project_dir)
  const rpc_url =
    config?.rpc || getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet')
  const sui_client = new SuiClient({ url: rpc_url })

  const sender_address = options.address || config?.address
  if (!sender_address) {
    throw new Error('No address. Use --address or run "versui configure".')
  }
  if (!sender_address.startsWith('0x') || sender_address.length !== 66) {
    throw new Error(
      'Invalid Sui address format. Expected 0x followed by 64 hex chars.',
    )
  }

  const ignore_patterns = read_ignore_patterns(project_dir)

  console.error('Scanning files...')
  const file_paths = scan_directory(dir, dir, ignore_patterns)

  const files_data = []
  const file_metadata = {}

  for (const file_path of file_paths) {
    const rel_path = '/' + relative(dir, file_path).replace(/\\/g, '/')
    const content = readFileSync(file_path)
    const content_type = get_content_type(file_path)
    const hash = hash_content(content)
    const { size } = statSync(file_path)

    files_data.push({
      path: rel_path,
      content,
      content_type,
    })

    file_metadata[rel_path] = { hash, size, content_type }
  }

  console.error(`Found ${files_data.length} files`)

  const walrus_client = new WalrusClient({
    network: network === 'mainnet' ? 'mainnet' : 'testnet',
    suiClient: sui_client,
  })

  // Sort files by path (quilt encoding requires consistent order)
  const sorted_files = files_data.sort((a, b) => (a.path < b.path ? -1 : 1))

  console.error('Encoding quilt...')
  const { quilt, index } = await walrus_client.encodeQuilt({
    blobs: sorted_files.map(f => ({
      contents: f.content,
      identifier: f.path,
      tags: {},
    })),
  })

  console.error('Encoding blob slivers...')
  const encoded = await walrus_client.encodeBlob(quilt)

  console.error('Building register transaction...')
  const tx = new Transaction()
  tx.setSender(sender_address)

  // Register blob with quilt attribute - registerBlob returns a function for tx.add
  const blob_obj = tx.add(
    walrus_client.registerBlob({
      size: quilt.length,
      epochs: parsed_epochs,
      blobId: encoded.blobId,
      rootHash: encoded.rootHash,
      deletable: true,
      attributes: {
        _walrusBlobType: 'quilt',
      },
    }),
  )

  tx.transferObjects([blob_obj], sender_address)

  const tx_bytes = await tx.build({ client: sui_client })
  const tx_base64 = toBase64(tx_bytes)

  // Serialize slivers for deploy step
  // sliversByNode is Map<nodeIndex, { primary: [], secondary: [] }>
  const slivers_serialized = encoded.sliversByNode.map(slivers => ({
    primary: slivers.primary.map(s => ({
      sliverPairIndex: s.sliverPairIndex,
      sliver: toBase64(s.sliver),
    })),
    secondary: slivers.secondary.map(s => ({
      sliverPairIndex: s.sliverPairIndex,
      sliver: toBase64(s.sliver),
    })),
  }))

  // Store file content for site creation
  const files_content = sorted_files.map(f => ({
    path: f.path,
    content: f.content.toString('base64'),
    content_type: f.content_type,
  }))

  // Serialize full metadata (contains V1 structure with hashes)
  const metadata_serialized = JSON.parse(
    JSON.stringify(encoded.metadata, (k, v) => {
      if (v instanceof Uint8Array) return { __uint8array__: Array.from(v) }
      return v
    }),
  )

  const blob = {
    version: 8,
    network,
    epochs: parsed_epochs,
    sender: sender_address,
    files_content,
    file_metadata,
    // Encoded blob data for upload
    blob_id: encoded.blobId,
    root_hash: Array.from(encoded.rootHash),
    metadata: metadata_serialized,
    slivers: slivers_serialized,
    // Quilt index for site creation
    quilt_index: index,
  }

  writeFileSync(output, JSON.stringify(blob))
  console.error(`Blob saved to: ${output}`)

  // Output TX to stdout
  console.log(JSON.stringify({ tx: tx_base64 }))
}
