import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  build_file_metadata,
  build_files_metadata,
} from '../../../src/commands/deploy/file-metadata.js'

describe('build_file_metadata', () => {
  test('should build metadata for a single file', () => {
    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-meta-'), {
      recursive: true,
    })
    const file_path = join(temp_dir, 'test.html')
    writeFileSync(file_path, '<html>test</html>')

    try {
      const meta = build_file_metadata(file_path, temp_dir)

      assert.strictEqual(meta.path, '/test.html')
      assert.ok(typeof meta.hash === 'string')
      assert.ok(meta.hash.length > 0)
      assert.strictEqual(meta.size, 17) // '<html>test</html>'.length
      assert.strictEqual(meta.content_type, 'text/html')
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })

  test('should handle nested paths correctly', () => {
    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-meta-'), {
      recursive: true,
    })
    const nested_dir = join(temp_dir, 'assets', 'css')
    mkdirSync(nested_dir, { recursive: true })
    const file_path = join(nested_dir, 'style.css')
    writeFileSync(file_path, 'body { color: red; }')

    try {
      const meta = build_file_metadata(file_path, temp_dir)

      assert.strictEqual(meta.path, '/assets/css/style.css')
      assert.strictEqual(meta.content_type, 'text/css')
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })
})

describe('build_files_metadata', () => {
  test('should build metadata for multiple files', () => {
    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-meta-'), {
      recursive: true,
    })
    const file1 = join(temp_dir, 'index.html')
    const file2 = join(temp_dir, 'style.css')
    writeFileSync(file1, '<html></html>')
    writeFileSync(file2, 'body {}')

    try {
      const result = build_files_metadata([file1, file2], temp_dir)

      assert.ok(typeof result === 'object')
      assert.ok(typeof result.metadata === 'object')
      assert.ok(typeof result.total_size === 'number')

      assert.ok(result.metadata['/index.html'])
      assert.ok(result.metadata['/style.css'])
      assert.strictEqual(result.total_size, 20) // 13 + 7
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })

  test('should return empty metadata for empty file list', () => {
    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-meta-'), {
      recursive: true,
    })

    try {
      const result = build_files_metadata([], temp_dir)

      assert.deepStrictEqual(result.metadata, {})
      assert.strictEqual(result.total_size, 0)
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })

  test('should accumulate total size correctly', () => {
    const temp_dir = mkdirSync(join(tmpdir(), 'versui-test-meta-'), {
      recursive: true,
    })
    const files = []
    const sizes = [100, 200, 300]

    for (let i = 0; i < sizes.length; i++) {
      const file_path = join(temp_dir, `file${i}.txt`)
      writeFileSync(file_path, 'x'.repeat(sizes[i]))
      files.push(file_path)
    }

    try {
      const result = build_files_metadata(files, temp_dir)

      assert.strictEqual(result.total_size, 600)
    } finally {
      rmSync(temp_dir, { recursive: true })
    }
  })
})
