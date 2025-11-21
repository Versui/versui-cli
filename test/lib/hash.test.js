import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { hash_file, hash_content } from '../../src/lib/hash.js'

describe('hash_content', () => {
  it('should hash empty string', () => {
    const result = hash_content('')
    assert.equal(
      result,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('should hash simple content', () => {
    const result = hash_content('hello world')
    assert.equal(
      result,
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    )
  })

  it('should hash binary content', () => {
    const buffer = Buffer.from([0x00, 0xff, 0xaa, 0x55])
    const result = hash_content(buffer)
    assert.equal(
      result,
      'df7d75aad696b49ea81cbddff8c30a794ce0243bf9895db26e8127e0485f4de5',
    )
  })

  it('should produce consistent hashes', () => {
    const content = 'test content for consistency'
    const hash1 = hash_content(content)
    const hash2 = hash_content(content)
    assert.equal(hash1, hash2)
  })
})

describe('hash_file', () => {
  it('should hash file contents', async () => {
    const tmp_dir = join(tmpdir(), `versui-test-${Date.now()}`)
    await mkdir(tmp_dir, { recursive: true })

    const file_path = join(tmp_dir, 'test.txt')
    await writeFile(file_path, 'hello world')

    const result = await hash_file(file_path)
    assert.equal(
      result,
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    )

    await rm(tmp_dir, { recursive: true })
  })

  it('should handle large files', async () => {
    const tmp_dir = join(tmpdir(), `versui-test-${Date.now()}`)
    await mkdir(tmp_dir, { recursive: true })

    const file_path = join(tmp_dir, 'large.bin')
    const large_content = Buffer.alloc(1024 * 1024, 'x') // 1MB
    await writeFile(file_path, large_content)

    const result = await hash_file(file_path)
    assert.equal(typeof result, 'string')
    assert.equal(result.length, 64) // SHA-256 hex string

    await rm(tmp_dir, { recursive: true })
  })

  it('should throw on non-existent file', async () => {
    await assert.rejects(
      async () => await hash_file('/non/existent/file.txt'),
      { code: 'ENOENT' },
    )
  })
})
