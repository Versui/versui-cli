import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  get_content_type,
  read_file,
  scan_directory,
} from '../../src/lib/files.js'

describe('get_content_type', () => {
  test('should return correct MIME type for .js files', () => {
    assert.strictEqual(get_content_type('script.js'), 'text/javascript')
  })

  test('should return correct MIME type for .html files', () => {
    assert.strictEqual(get_content_type('index.html'), 'text/html')
  })

  test('should return correct MIME type for .css files', () => {
    assert.strictEqual(get_content_type('styles.css'), 'text/css')
  })

  test('should return correct MIME type for .json files', () => {
    assert.strictEqual(get_content_type('data.json'), 'application/json')
  })

  test('should return correct MIME type for .png files', () => {
    assert.strictEqual(get_content_type('image.png'), 'image/png')
  })

  test('should fallback to application/octet-stream for unknown extensions', () => {
    // mime library returns 'chemical/x-xyz' for .xyz, let's use a truly unknown extension
    assert.strictEqual(
      get_content_type('unknown.unknownext123'),
      'application/octet-stream',
    )
  })

  test('should fallback to application/octet-stream for no extension', () => {
    assert.strictEqual(
      get_content_type('noextension'),
      'application/octet-stream',
    )
  })
})

describe('read_file', () => {
  test('should read file and return buffer', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const file_path = join(temp_dir, 'test.txt')
    writeFileSync(file_path, 'Hello World')

    const result = read_file(file_path)
    assert.ok(Buffer.isBuffer(result))
    assert.strictEqual(result.toString(), 'Hello World')

    rmSync(temp_dir, { recursive: true })
  })

  test('should read binary file', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const file_path = join(temp_dir, 'test.bin')
    const binary_data = Buffer.from([0x00, 0x01, 0x02, 0xff])
    writeFileSync(file_path, binary_data)

    const result = read_file(file_path)
    assert.ok(Buffer.isBuffer(result))
    assert.deepStrictEqual(result, binary_data)

    rmSync(temp_dir, { recursive: true })
  })
})

describe('scan_directory', () => {
  test('should find all files in directory', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    writeFileSync(join(temp_dir, 'file1.txt'), 'content1')
    writeFileSync(join(temp_dir, 'file2.js'), 'content2')
    writeFileSync(join(temp_dir, 'file3.html'), 'content3')

    const result = scan_directory(temp_dir, temp_dir)
    assert.strictEqual(result.length, 3)

    rmSync(temp_dir, { recursive: true })
  })

  test('should scan nested directories recursively', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    writeFileSync(join(temp_dir, 'root.txt'), 'root')
    mkdirSync(join(temp_dir, 'subdir'))
    writeFileSync(join(temp_dir, 'subdir', 'nested.txt'), 'nested')
    mkdirSync(join(temp_dir, 'subdir', 'deep'))
    writeFileSync(join(temp_dir, 'subdir', 'deep', 'deep.txt'), 'deep')

    const result = scan_directory(temp_dir, temp_dir)
    assert.strictEqual(result.length, 3)

    rmSync(temp_dir, { recursive: true })
  })

  test('should respect .versuignore patterns', () => {
    // NOTE: scan_directory looks for .versuignore in parent dir (join(dir, '..'))
    // So we create project structure: parent/.versuignore, parent/dist/*
    const parent_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const dist_dir = join(parent_dir, 'dist')
    mkdirSync(dist_dir)

    writeFileSync(join(parent_dir, '.versuignore'), 'node_modules\n*.log')
    writeFileSync(join(dist_dir, 'keep.txt'), 'keep')
    writeFileSync(join(dist_dir, 'debug.log'), 'log')
    mkdirSync(join(dist_dir, 'node_modules'))
    writeFileSync(join(dist_dir, 'node_modules', 'package.json'), '{}')

    const result = scan_directory(dist_dir, dist_dir)
    // Should only find keep.txt (not debug.log or node_modules/*)
    assert.strictEqual(result.length, 1)
    assert.ok(result.some(p => p.endsWith('keep.txt')))

    rmSync(parent_dir, { recursive: true })
  })

  test('should ignore comments in .versuignore', () => {
    const parent_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const dist_dir = join(parent_dir, 'dist')
    mkdirSync(dist_dir)

    writeFileSync(
      join(parent_dir, '.versuignore'),
      '# Comment\n*.log\n# Another comment\nnode_modules',
    )
    writeFileSync(join(dist_dir, 'keep.txt'), 'keep')
    writeFileSync(join(dist_dir, 'debug.log'), 'log')

    const result = scan_directory(dist_dir, dist_dir)
    assert.strictEqual(result.length, 1) // Only keep.txt
    assert.ok(!result.some(p => p.endsWith('debug.log')))

    rmSync(parent_dir, { recursive: true })
  })

  test('should ignore empty lines in .versuignore', () => {
    const parent_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const dist_dir = join(parent_dir, 'dist')
    mkdirSync(dist_dir)

    writeFileSync(
      join(parent_dir, '.versuignore'),
      '*.log\n\n\nnode_modules\n\n',
    )
    writeFileSync(join(dist_dir, 'keep.txt'), 'keep')
    writeFileSync(join(dist_dir, 'debug.log'), 'log')

    const result = scan_directory(dist_dir, dist_dir)
    assert.strictEqual(result.length, 1) // Only keep.txt

    rmSync(parent_dir, { recursive: true })
  })

  test('should work when .versuignore does not exist', () => {
    const temp_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    writeFileSync(join(temp_dir, 'file1.txt'), 'content')
    writeFileSync(join(temp_dir, 'file2.txt'), 'content')

    const result = scan_directory(temp_dir, temp_dir)
    assert.strictEqual(result.length, 2)

    rmSync(temp_dir, { recursive: true })
  })

  test('should handle dot files (hidden files)', () => {
    const parent_dir = mkdtempSync(join(tmpdir(), 'versui-test-'))
    const dist_dir = join(parent_dir, 'dist')
    mkdirSync(dist_dir)

    writeFileSync(join(parent_dir, '.versuignore'), '.git')
    writeFileSync(join(dist_dir, '.hidden'), 'hidden')
    mkdirSync(join(dist_dir, '.git'))
    writeFileSync(join(dist_dir, '.git', 'config'), 'git')

    const result = scan_directory(dist_dir, dist_dir)
    // Should find .hidden only (not .git/*)
    assert.strictEqual(result.length, 1)
    assert.ok(result.some(p => p.endsWith('.hidden')))
    assert.ok(!result.some(p => p.includes('.git')))

    rmSync(parent_dir, { recursive: true })
  })
})
