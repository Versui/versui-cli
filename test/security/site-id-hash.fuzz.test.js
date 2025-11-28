import { test } from 'node:test'
import { strictEqual, rejects, doesNotThrow } from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { hash_content, hash_file } from '../../src/lib/hash.js'

/**
 * SITE ID VALIDATION FUZZ TESTS
 * Tests site ID parsing and validation across all commands
 */

// Helper: Extract site ID validation regex from delete.js
const VALID_SUI_OBJECT_ID_REGEX = /^0x[a-fA-F0-9]{64}$/

function is_valid_sui_object_id(id) {
  // Type guard - regex.test() only works on strings
  if (typeof id !== 'string') return false
  return VALID_SUI_OBJECT_ID_REGEX.test(id)
}

test('site ID validation - valid lowercase hex', () => {
  const valid_id = '0x' + 'a'.repeat(64)
  strictEqual(is_valid_sui_object_id(valid_id), true)
})

test('site ID validation - valid uppercase hex', () => {
  const valid_id = '0x' + 'A'.repeat(64)
  strictEqual(is_valid_sui_object_id(valid_id), true)
})

test('site ID validation - valid mixed case hex', () => {
  const valid_id =
    '0x' + 'aAbBcCdDeEfF0123456789'.repeat(2) + 'aAbBcCdDeEfF01234567'
  strictEqual(is_valid_sui_object_id(valid_id), true)
})

test('site ID validation - rejects missing 0x prefix', () => {
  const invalid_id = 'a'.repeat(64)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects 0X uppercase prefix', () => {
  const invalid_id = '0X' + 'a'.repeat(64)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects wrong length (too short)', () => {
  const invalid_id = '0x' + 'a'.repeat(63)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects wrong length (too long)', () => {
  const invalid_id = '0x' + 'a'.repeat(65)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects invalid hex chars (g)', () => {
  const invalid_id = '0x' + 'g'.repeat(64)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects invalid hex chars (z)', () => {
  const invalid_id = '0x' + 'z'.repeat(64)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects unicode lookalike for 0 (Cyrillic О)', () => {
  const invalid_id = '\u041ex' + 'a'.repeat(64) // Cyrillic capital O
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects unicode lookalike for a (Latin Small Letter Alpha)', () => {
  const invalid_id = '0x' + '\u0251'.repeat(64) // ɑ
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects fullwidth digits', () => {
  const invalid_id = '0x' + '\uff10'.repeat(64) // ０ (fullwidth zero)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects null', () => {
  strictEqual(is_valid_sui_object_id(null), false)
})

test('site ID validation - rejects undefined', () => {
  strictEqual(is_valid_sui_object_id(undefined), false)
})

test('site ID validation - rejects empty string', () => {
  strictEqual(is_valid_sui_object_id(''), false)
})

test('site ID validation - rejects object', () => {
  strictEqual(is_valid_sui_object_id({}), false)
})

test('site ID validation - rejects array', () => {
  strictEqual(is_valid_sui_object_id([]), false)
})

test('site ID validation - rejects array with valid ID', () => {
  const valid_id = '0x' + 'a'.repeat(64)
  strictEqual(is_valid_sui_object_id([valid_id]), false)
})

test('site ID validation - rejects number', () => {
  strictEqual(is_valid_sui_object_id(12345), false)
})

test('site ID validation - rejects boolean', () => {
  strictEqual(is_valid_sui_object_id(true), false)
})

test('site ID validation - rejects function', () => {
  strictEqual(
    is_valid_sui_object_id(() => {}),
    false,
  )
})

test('site ID validation - rejects symbol', () => {
  strictEqual(is_valid_sui_object_id(Symbol('test')), false)
})

test('site ID validation - rejects __proto__ injection', () => {
  strictEqual(is_valid_sui_object_id('__proto__'), false)
})

test('site ID validation - rejects constructor injection', () => {
  strictEqual(is_valid_sui_object_id('constructor'), false)
})

test('site ID validation - rejects prototype injection', () => {
  strictEqual(is_valid_sui_object_id('prototype'), false)
})

test('site ID validation - rejects SQL injection attempt', () => {
  const sql_injection = "0x' OR '1'='1"
  strictEqual(is_valid_sui_object_id(sql_injection), false)
})

test('site ID validation - rejects command injection attempt (semicolon)', () => {
  const cmd_injection = '0x' + 'a'.repeat(62) + '; rm -rf /'
  strictEqual(is_valid_sui_object_id(cmd_injection), false)
})

test('site ID validation - rejects command injection attempt (backticks)', () => {
  const cmd_injection = '0x`whoami`' + 'a'.repeat(55)
  strictEqual(is_valid_sui_object_id(cmd_injection), false)
})

test('site ID validation - rejects command injection attempt (dollar parens)', () => {
  const cmd_injection = '0x$(whoami)' + 'a'.repeat(54)
  strictEqual(is_valid_sui_object_id(cmd_injection), false)
})

test('site ID validation - rejects path traversal attempt', () => {
  const path_traversal = '0x../../etc/passwd' + 'a'.repeat(47)
  strictEqual(is_valid_sui_object_id(path_traversal), false)
})

test('site ID validation - rejects newline injection', () => {
  const newline_injection = '0x' + 'a'.repeat(62) + '\n'
  strictEqual(is_valid_sui_object_id(newline_injection), false)
})

test('site ID validation - rejects carriage return injection', () => {
  const cr_injection = '0x' + 'a'.repeat(62) + '\r'
  strictEqual(is_valid_sui_object_id(cr_injection), false)
})

test('site ID validation - rejects null byte injection', () => {
  const null_injection = '0x' + 'a'.repeat(62) + '\0'
  strictEqual(is_valid_sui_object_id(null_injection), false)
})

test('site ID validation - rejects space padding', () => {
  const space_padded = ' 0x' + 'a'.repeat(64)
  strictEqual(is_valid_sui_object_id(space_padded), false)
})

test('site ID validation - rejects tab padding', () => {
  const tab_padded = '\t0x' + 'a'.repeat(64)
  strictEqual(is_valid_sui_object_id(tab_padded), false)
})

test('site ID validation - rejects trailing space', () => {
  const trailing_space = '0x' + 'a'.repeat(64) + ' '
  strictEqual(is_valid_sui_object_id(trailing_space), false)
})

test('site ID validation - rejects unicode normalization exploit (NFC vs NFD)', () => {
  // é can be represented as U+00E9 (NFC) or U+0065 U+0301 (NFD)
  const nfc = '\u00e9' // é as single character
  const nfd = '\u0065\u0301' // e + combining acute accent
  strictEqual(is_valid_sui_object_id('0x' + nfc + 'a'.repeat(62)), false)
  strictEqual(is_valid_sui_object_id('0x' + nfd + 'a'.repeat(62)), false)
})

test('site ID validation - rejects homoglyph attack (Latin a vs Cyrillic а)', () => {
  const latin_a = 'a'
  const cyrillic_a = '\u0430' // Cyrillic а (looks identical)
  const valid_id = '0x' + latin_a.repeat(64)
  const invalid_id = '0x' + cyrillic_a.repeat(64)

  strictEqual(is_valid_sui_object_id(valid_id), true)
  strictEqual(is_valid_sui_object_id(invalid_id), false)
})

test('site ID validation - rejects zero-width characters', () => {
  const zero_width = '0x' + 'a'.repeat(32) + '\u200B' + 'a'.repeat(31) // Zero-width space
  strictEqual(is_valid_sui_object_id(zero_width), false)
})

test('site ID validation - rejects right-to-left override', () => {
  const rtl_override = '0x' + '\u202E' + 'a'.repeat(63) // Right-to-left override
  strictEqual(is_valid_sui_object_id(rtl_override), false)
})

test('site ID validation - rejects bidirectional text markers', () => {
  const bidi = '0x' + '\u202A' + 'a'.repeat(63) // Left-to-right embedding
  strictEqual(is_valid_sui_object_id(bidi), false)
})

/**
 * HASH FUNCTION FUZZ TESTS
 * Tests hash computation with edge cases
 */

test('hash_content - empty string', () => {
  const hash = hash_content('')
  strictEqual(hash.length, 64) // SHA-256 produces 64 hex chars
  strictEqual(
    hash,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  ) // Known SHA-256 of empty string
})

test('hash_content - empty buffer', () => {
  const hash = hash_content(Buffer.from([]))
  strictEqual(hash.length, 64)
  strictEqual(
    hash,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
})

test('hash_content - single null byte', () => {
  const hash = hash_content(Buffer.from([0x00]))
  strictEqual(hash.length, 64)
  strictEqual(
    hash,
    '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  ) // Known SHA-256 of null byte
})

test('hash_content - multiple null bytes', () => {
  const hash = hash_content(Buffer.from([0x00, 0x00, 0x00, 0x00]))
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - binary data with all byte values', () => {
  const binary = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
  const hash = hash_content(binary)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - unicode string (UTF-8)', () => {
  const unicode = 'Hello 世界 🌍'
  const hash = hash_content(unicode)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - emoji', () => {
  const emoji = '🚀💻🔥'
  const hash = hash_content(emoji)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - very long string', () => {
  const long_string = 'a'.repeat(1_000_000) // 1MB
  const hash = hash_content(long_string)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - string with BOM (UTF-8)', () => {
  const bom = '\uFEFF' + 'content'
  const hash = hash_content(bom)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - string with different line endings (LF)', () => {
  const lf = 'line1\nline2\nline3'
  const hash = hash_content(lf)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - string with different line endings (CRLF)', () => {
  const crlf = 'line1\r\nline2\r\nline3'
  const hash = hash_content(crlf)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - string with different line endings (CR)', () => {
  const cr = 'line1\rline2\rline3'
  const hash = hash_content(cr)
  strictEqual(hash.length, 64)
  doesNotThrow(() => Buffer.from(hash, 'hex'))
})

test('hash_content - CRLF vs LF produces different hashes', () => {
  const lf = 'line1\nline2'
  const crlf = 'line1\r\nline2'
  const hash_lf = hash_content(lf)
  const hash_crlf = hash_content(crlf)

  strictEqual(hash_lf.length, 64)
  strictEqual(hash_crlf.length, 64)
  strictEqual(hash_lf === hash_crlf, false) // Different line endings = different hashes
})

test('hash_content - returns lowercase hex', () => {
  const hash = hash_content('test')
  strictEqual(hash, hash.toLowerCase())
  strictEqual(/^[0-9a-f]+$/.test(hash), true) // Only lowercase hex
})

test('hash_content - deterministic (same input = same output)', () => {
  const content = 'deterministic test'
  const hash1 = hash_content(content)
  const hash2 = hash_content(content)
  strictEqual(hash1, hash2)
})

test('hash_content - different content = different hash', () => {
  const hash1 = hash_content('content1')
  const hash2 = hash_content('content2')
  strictEqual(hash1 === hash2, false)
})

test('hash_file - empty file', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'empty.txt')

  try {
    writeFileSync(file_path, '')
    const hash = await hash_file(file_path)

    strictEqual(hash.length, 64)
    strictEqual(
      hash,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - file with null bytes', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'null-bytes.bin')

  try {
    writeFileSync(file_path, Buffer.from([0x00, 0x00, 0x00, 0x00]))
    const hash = await hash_file(file_path)

    strictEqual(hash.length, 64)
    doesNotThrow(() => Buffer.from(hash, 'hex'))
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - binary file', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'binary.bin')

  try {
    const binary = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
    writeFileSync(file_path, binary)
    const hash = await hash_file(file_path)

    strictEqual(hash.length, 64)
    doesNotThrow(() => Buffer.from(hash, 'hex'))
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - file with BOM', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'bom.txt')

  try {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]) // UTF-8 BOM
    const content = Buffer.from('content')
    writeFileSync(file_path, Buffer.concat([bom, content]))
    const hash = await hash_file(file_path)

    strictEqual(hash.length, 64)
    doesNotThrow(() => Buffer.from(hash, 'hex'))
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - large file (simulated 1MB)', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'large.txt')

  try {
    const large_content = 'a'.repeat(1_000_000)
    writeFileSync(file_path, large_content)
    const hash = await hash_file(file_path)

    strictEqual(hash.length, 64)
    doesNotThrow(() => Buffer.from(hash, 'hex'))
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - non-existent file', async () => {
  const non_existent = '/tmp/this-file-does-not-exist-' + Date.now() + '.txt'
  await rejects(() => hash_file(non_existent), {
    code: 'ENOENT',
  })
})

test('hash_file - unicode filename', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'unicode-文件-🚀.txt')

  try {
    writeFileSync(file_path, 'content')
    const hash = await hash_file(file_path)

    strictEqual(hash.length, 64)
    doesNotThrow(() => Buffer.from(hash, 'hex'))
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - filename with spaces', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'file with spaces.txt')

  try {
    writeFileSync(file_path, 'content')
    const hash = await hash_file(file_path)

    strictEqual(hash.length, 64)
    doesNotThrow(() => Buffer.from(hash, 'hex'))
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - LF vs CRLF different hashes', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_lf = join(tmp_dir, 'lf.txt')
  const file_crlf = join(tmp_dir, 'crlf.txt')

  try {
    writeFileSync(file_lf, 'line1\nline2')
    writeFileSync(file_crlf, 'line1\r\nline2')

    const hash_lf = await hash_file(file_lf)
    const hash_crlf = await hash_file(file_crlf)

    strictEqual(hash_lf.length, 64)
    strictEqual(hash_crlf.length, 64)
    strictEqual(hash_lf === hash_crlf, false) // Different line endings = different hashes
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - deterministic (same file = same hash)', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'deterministic.txt')

  try {
    writeFileSync(file_path, 'deterministic content')
    const hash1 = await hash_file(file_path)
    const hash2 = await hash_file(file_path)

    strictEqual(hash1, hash2)
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

test('hash_file - hash matches hash_content for same data', async () => {
  const tmp_dir = mkdtempSync(join(tmpdir(), 'hash-test-'))
  const file_path = join(tmp_dir, 'match.txt')
  const content = 'matching content test'

  try {
    writeFileSync(file_path, content)
    const file_hash = await hash_file(file_path)
    const content_hash = hash_content(content)

    strictEqual(file_hash, content_hash)
  } finally {
    rmSync(tmp_dir, { recursive: true })
  }
})

/**
 * RESOURCE PATH VALIDATION FUZZ TESTS (from delete.js)
 * Tests path validation for shell injection and traversal attacks
 */

// Helper: Extract path validation from delete.js
function is_valid_resource_path(path) {
  // Block shell injection characters: ; | ` $ (command substitution)
  if (/[;|`$]|<\(|\$\(/.test(path)) return false

  // Block path traversal
  const normalized = path.replace(/\\/g, '/') // Normalize backslashes
  if (normalized.includes('..') || normalized.startsWith('/..')) return false

  return true
}

test('resource path validation - valid absolute path', () => {
  strictEqual(is_valid_resource_path('/index.html'), true)
})

test('resource path validation - valid relative path', () => {
  strictEqual(is_valid_resource_path('assets/style.css'), true)
})

test('resource path validation - valid query string', () => {
  strictEqual(is_valid_resource_path('/api?foo=bar&baz=qux'), true)
})

test('resource path validation - valid hash fragment', () => {
  strictEqual(is_valid_resource_path('/page#section'), true)
})

test('resource path validation - rejects semicolon (command chaining)', () => {
  strictEqual(is_valid_resource_path('/index.html; rm -rf /'), false)
})

test('resource path validation - rejects pipe (command piping)', () => {
  strictEqual(is_valid_resource_path('/index.html | cat'), false)
})

test('resource path validation - rejects backticks (command substitution)', () => {
  strictEqual(is_valid_resource_path('/index.html`whoami`'), false)
})

test('resource path validation - rejects dollar sign (variable expansion)', () => {
  strictEqual(is_valid_resource_path('/index.html$PATH'), false)
})

test('resource path validation - rejects $() command substitution', () => {
  strictEqual(is_valid_resource_path('/index.html$(whoami)'), false)
})

test('resource path validation - rejects <() process substitution', () => {
  strictEqual(is_valid_resource_path('/index.html<(ls)'), false)
})

test('resource path validation - rejects path traversal (..)', () => {
  strictEqual(is_valid_resource_path('../etc/passwd'), false)
})

test('resource path validation - rejects path traversal (/../)', () => {
  strictEqual(is_valid_resource_path('/../etc/passwd'), false)
})

test('resource path validation - rejects path traversal in middle', () => {
  strictEqual(is_valid_resource_path('/valid/../etc/passwd'), false)
})

test('resource path validation - rejects multiple parent refs', () => {
  strictEqual(is_valid_resource_path('../../etc/passwd'), false)
})

test('resource path validation - rejects backslash path traversal', () => {
  strictEqual(is_valid_resource_path('..\\etc\\passwd'), false)
})
