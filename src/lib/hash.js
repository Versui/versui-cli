import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * Hash content using SHA-256
 * Returns hex string (64 characters)
 * @param {string | Buffer} content - Content to hash
 * @returns {string} SHA-256 hash as hex string
 */
export function hash_content(content) {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Hash file contents using SHA-256
 * Streams file to handle large files efficiently
 * Returns hex string (64 characters)
 * @param {string} file_path - Path to file
 * @returns {Promise<string>} SHA-256 hash as hex string
 */
export async function hash_file(file_path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file_path)

    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
