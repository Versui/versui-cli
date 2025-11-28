import { describe, test } from 'node:test'
import { strictEqual } from 'node:assert'

// Import target functions from actual source
import { sanitize_ignore_pattern } from '../../src/lib/files.js'
import { is_valid_resource_path } from '../../src/commands/delete.js'

describe('Path Traversal Fuzz Tests', () => {
  const project_dir = '/home/user/project'

  describe('sanitize_ignore_pattern - Basic Path Traversal', () => {
    test('rejects classic unix path traversal', () => {
      strictEqual(
        sanitize_ignore_pattern('../../../etc/passwd', project_dir),
        null,
      )
    })

    test('rejects relative parent directory', () => {
      strictEqual(sanitize_ignore_pattern('../config', project_dir), null)
    })

    test('rejects double parent directory', () => {
      strictEqual(sanitize_ignore_pattern('../../secrets', project_dir), null)
    })

    test('rejects current then parent directory', () => {
      strictEqual(sanitize_ignore_pattern('./../etc/passwd', project_dir), null)
    })

    test('accepts valid relative paths', () => {
      strictEqual(
        sanitize_ignore_pattern('node_modules', project_dir),
        'node_modules',
      )
    })

    test('accepts valid subdirectory paths', () => {
      strictEqual(sanitize_ignore_pattern('src/temp', project_dir), 'src/temp')
    })
  })

  describe('sanitize_ignore_pattern - URL Encoding Attacks', () => {
    test('rejects URL encoded path traversal (%2e%2e%2f)', () => {
      strictEqual(
        sanitize_ignore_pattern('..%2f..%2f..%2fetc/passwd', project_dir),
        null,
      )
    })

    test('rejects partial URL encoding', () => {
      strictEqual(
        sanitize_ignore_pattern('..%2f../etc/passwd', project_dir),
        null,
      )
    })

    test('rejects double URL encoding (%252e)', () => {
      strictEqual(sanitize_ignore_pattern('%252e%252e%252f', project_dir), null)
    })

    test('rejects mixed encoding', () => {
      strictEqual(sanitize_ignore_pattern('%2e%2e/..%2f', project_dir), null)
    })
  })

  describe('sanitize_ignore_pattern - Obfuscated Separators', () => {
    test('rejects extra dots with slashes (....//)', () => {
      strictEqual(
        sanitize_ignore_pattern('....//....//etc/passwd', project_dir),
        null,
      )
    })

    test('rejects backslash separators on unix', () => {
      strictEqual(
        sanitize_ignore_pattern('..\\..\\..\\etc\\passwd', project_dir),
        null,
      )
    })

    test('rejects mixed forward/backslash', () => {
      strictEqual(
        sanitize_ignore_pattern('foo\\../bar/../etc', project_dir),
        null,
      )
    })

    test('rejects double slashes with parent', () => {
      strictEqual(sanitize_ignore_pattern('..//etc/passwd', project_dir), null)
    })

    test('rejects triple dots', () => {
      strictEqual(sanitize_ignore_pattern('.../', project_dir), null)
    })
  })

  describe('sanitize_ignore_pattern - Absolute Path Escapes', () => {
    test('rejects absolute unix path', () => {
      strictEqual(sanitize_ignore_pattern('/etc/passwd', project_dir), null)
    })

    test('rejects absolute windows path (C:)', () => {
      strictEqual(
        sanitize_ignore_pattern('C:\\Windows\\System32', project_dir),
        null,
      )
    })

    test('rejects windows UNC path', () => {
      strictEqual(
        sanitize_ignore_pattern('\\\\share\\folder', project_dir),
        null,
      )
    })

    test('rejects absolute path with traversal', () => {
      strictEqual(
        sanitize_ignore_pattern('/home/../etc/passwd', project_dir),
        null,
      )
    })
  })

  describe('sanitize_ignore_pattern - Null Byte Injection', () => {
    test('rejects null byte in middle of path', () => {
      strictEqual(
        sanitize_ignore_pattern('foo\x00/../etc/passwd', project_dir),
        null,
      )
    })

    test('rejects null byte at end', () => {
      strictEqual(
        sanitize_ignore_pattern('../etc/passwd\x00.txt', project_dir),
        null,
      )
    })

    test('rejects multiple null bytes', () => {
      strictEqual(
        sanitize_ignore_pattern('foo\x00\x00/../etc', project_dir),
        null,
      )
    })
  })

  describe('sanitize_ignore_pattern - Unicode and Encoding Tricks', () => {
    test('rejects unicode homoglyphs for dots', () => {
      // U+2024 (one dot leader) instead of period
      strictEqual(
        sanitize_ignore_pattern('\u2024\u2024/etc', project_dir),
        null,
      )
    })

    test('rejects overlong UTF-8 sequences', () => {
      // Overlong encoding of '.' character
      strictEqual(sanitize_ignore_pattern('%c0%2e%c0%2e/', project_dir), null)
    })

    test('rejects unicode normalized path traversal', () => {
      // Different unicode representations that normalize to ..
      strictEqual(sanitize_ignore_pattern('\uFF0E\uFF0E/', project_dir), null)
    })
  })

  describe('sanitize_ignore_pattern - Very Long Paths', () => {
    test('rejects extremely long path (10000 chars)', () => {
      const long_path = '../'.repeat(5000)
      strictEqual(sanitize_ignore_pattern(long_path, project_dir), null)
    })

    test('rejects long path with traversal at end', () => {
      const long_path = 'a'.repeat(9990) + '/../etc'
      strictEqual(sanitize_ignore_pattern(long_path, project_dir), null)
    })

    test('accepts long valid path (no traversal)', () => {
      const long_valid = 'a'.repeat(1000)
      strictEqual(sanitize_ignore_pattern(long_valid, project_dir), long_valid)
    })
  })

  describe('sanitize_ignore_pattern - Symlink-like Patterns', () => {
    test('rejects simulated symlink traversal', () => {
      strictEqual(sanitize_ignore_pattern('link/../../etc', project_dir), null)
    })

    test('rejects hidden traversal in subpath', () => {
      strictEqual(
        sanitize_ignore_pattern(
          'normal/path/../../../../../../etc',
          project_dir,
        ),
        null,
      )
    })

    test('rejects alternating valid and invalid segments', () => {
      strictEqual(
        sanitize_ignore_pattern('foo/../bar/../../etc', project_dir),
        null,
      )
    })
  })

  describe('is_valid_resource_path - Basic Path Traversal', () => {
    test('rejects classic unix path traversal', () => {
      strictEqual(is_valid_resource_path('../../../etc/passwd'), false)
    })

    test('rejects single parent directory', () => {
      strictEqual(is_valid_resource_path('../config.json'), false)
    })

    test('rejects double dot in path', () => {
      strictEqual(is_valid_resource_path('/api/../admin'), false)
    })

    test('accepts valid web paths', () => {
      strictEqual(is_valid_resource_path('/api/users'), true)
    })

    test('accepts paths with query strings', () => {
      strictEqual(is_valid_resource_path('/search?q=test'), true)
    })

    test('accepts root path', () => {
      strictEqual(is_valid_resource_path('/'), true)
    })
  })

  describe('is_valid_resource_path - Shell Injection', () => {
    test('rejects semicolon (command separator)', () => {
      strictEqual(is_valid_resource_path('/api; rm -rf /'), false)
    })

    test('rejects pipe character', () => {
      strictEqual(is_valid_resource_path('/api | cat /etc/passwd'), false)
    })

    test('rejects backticks (command substitution)', () => {
      strictEqual(is_valid_resource_path('/api/`whoami`'), false)
    })

    test('rejects dollar sign (variable expansion)', () => {
      strictEqual(is_valid_resource_path('/api/$HOME'), false)
    })

    test('rejects $() command substitution', () => {
      strictEqual(is_valid_resource_path('/api/$(cat /etc/passwd)'), false)
    })

    test('rejects process substitution <()', () => {
      strictEqual(is_valid_resource_path('/api/<(ls)'), false)
    })
  })

  describe('is_valid_resource_path - URL Encoding Attacks', () => {
    test('rejects URL encoded path traversal', () => {
      strictEqual(is_valid_resource_path('/api/..%2f..%2fadmin'), false)
    })

    test('rejects double URL encoding', () => {
      strictEqual(is_valid_resource_path('%252e%252e%252f'), false)
    })

    test('rejects mixed encoding with traversal', () => {
      strictEqual(is_valid_resource_path('/api/%2e%2e/admin'), false)
    })
  })

  describe('is_valid_resource_path - Backslash Variants', () => {
    test('rejects backslash path traversal (Windows-style)', () => {
      strictEqual(is_valid_resource_path('..\\..\\..\\etc\\passwd'), false)
    })

    test('rejects mixed forward/backslash', () => {
      strictEqual(is_valid_resource_path('/api\\..\\admin'), false)
    })

    test('rejects triple backslash', () => {
      strictEqual(is_valid_resource_path('\\\\\\etc\\passwd'), false)
    })
  })

  describe('is_valid_resource_path - Absolute Paths', () => {
    test('accepts absolute web path', () => {
      strictEqual(is_valid_resource_path('/index.html'), true)
    })

    test('rejects windows absolute path (C:)', () => {
      strictEqual(is_valid_resource_path('C:\\Windows\\System32'), false)
    })

    test('rejects UNC path', () => {
      strictEqual(is_valid_resource_path('\\\\server\\share'), false)
    })
  })

  describe('is_valid_resource_path - Obfuscated Separators', () => {
    test('rejects extra dots', () => {
      strictEqual(is_valid_resource_path('....//....//etc'), false)
    })

    test('rejects double slashes with parent', () => {
      strictEqual(is_valid_resource_path('..//admin'), false)
    })

    test('accepts double slashes in path (URL normalization)', () => {
      strictEqual(is_valid_resource_path('/api//users'), true)
    })
  })

  describe('is_valid_resource_path - Null Bytes', () => {
    test('rejects null byte in middle', () => {
      strictEqual(is_valid_resource_path('/api\x00/../admin'), false)
    })

    test('rejects null byte at end', () => {
      strictEqual(is_valid_resource_path('/admin\x00.html'), false)
    })

    test('rejects multiple null bytes', () => {
      strictEqual(is_valid_resource_path('/\x00\x00admin'), false)
    })
  })

  describe('is_valid_resource_path - Unicode Attacks', () => {
    test('rejects unicode fullwidth dots', () => {
      strictEqual(is_valid_resource_path('/\uFF0E\uFF0E/admin'), false)
    })

    test('rejects unicode dot leader character', () => {
      strictEqual(is_valid_resource_path('/\u2024\u2024/admin'), false)
    })

    test('accepts valid unicode in path', () => {
      strictEqual(is_valid_resource_path('/api/用户'), true)
    })
  })

  describe('is_valid_resource_path - Very Long Paths', () => {
    test('rejects very long path with traversal (10000 chars)', () => {
      const long_path = '../'.repeat(5000)
      strictEqual(is_valid_resource_path(long_path), false)
    })

    test('accepts very long valid path (no traversal)', () => {
      const long_path = '/api/' + 'a'.repeat(9995)
      strictEqual(is_valid_resource_path(long_path), true)
    })

    test('rejects long path with hidden traversal', () => {
      const long_path = '/api/' + 'a'.repeat(1000) + '/../admin'
      strictEqual(is_valid_resource_path(long_path), false)
    })
  })

  describe('is_valid_resource_path - Case Variations', () => {
    test('rejects uppercase windows drive letter', () => {
      strictEqual(is_valid_resource_path('C:\\WINDOWS\\SYSTEM32'), false)
    })

    test('rejects lowercase windows drive letter', () => {
      strictEqual(is_valid_resource_path('c:\\windows\\system32'), false)
    })

    test('rejects mixed case shell injection', () => {
      strictEqual(is_valid_resource_path('/API/$(WhOaMi)'), false)
    })
  })

  describe('is_valid_resource_path - Edge Cases', () => {
    test('rejects starting with parent directory marker', () => {
      strictEqual(is_valid_resource_path('/../admin'), false)
    })

    test('accepts empty path component', () => {
      strictEqual(is_valid_resource_path('/api//users'), true)
    })

    test('accepts path with fragment', () => {
      strictEqual(is_valid_resource_path('/page#section'), true)
    })

    test('accepts path with ampersand (query param)', () => {
      strictEqual(is_valid_resource_path('/search?a=1&b=2'), true)
    })

    test('accepts path with brackets', () => {
      strictEqual(is_valid_resource_path('/api/users[0]'), true)
    })

    test('accepts path with braces', () => {
      strictEqual(is_valid_resource_path('/api/{id}'), true)
    })

    test('rejects path ending with parent directory', () => {
      strictEqual(is_valid_resource_path('/api/..'), false)
    })

    test('rejects path with parent in middle', () => {
      strictEqual(is_valid_resource_path('/api/../admin/users'), false)
    })
  })

  describe('is_valid_resource_path - Multiple Exploit Combinations', () => {
    test('rejects traversal + shell injection', () => {
      strictEqual(is_valid_resource_path('../etc; cat passwd'), false)
    })

    test('rejects encoding + traversal + shell', () => {
      strictEqual(is_valid_resource_path('%2e%2e/admin; whoami'), false)
    })

    test('rejects null byte + traversal', () => {
      strictEqual(is_valid_resource_path('admin\x00/../etc'), false)
    })

    test('rejects unicode + traversal', () => {
      strictEqual(is_valid_resource_path('\uFF0E\uFF0E/../admin'), false)
    })

    test('rejects backslash + forward slash traversal', () => {
      strictEqual(is_valid_resource_path('..\\/../admin'), false)
    })
  })
})
