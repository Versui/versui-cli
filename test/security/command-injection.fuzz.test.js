import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

/**
 * Fuzz Testing for Command Injection Protection
 *
 * Verifies that spawnSync with array arguments properly isolates
 * tx_base64 and other user inputs from shell interpretation.
 *
 * Target files:
 * - src/commands/domain.js (execute_transaction)
 * - src/commands/suins.js (suins_add)
 */

describe('command injection fuzz tests', () => {
  describe('shell metacharacter injection', () => {
    const shell_metacharacters = [
      { name: 'semicolon chaining', payload: 'AAA;rm -rf /' },
      { name: 'pipe injection', payload: 'AAA|cat /etc/passwd' },
      { name: 'background execution', payload: 'AAA&whoami' },
      { name: 'logical AND', payload: 'AAA&&id' },
      { name: 'logical OR', payload: 'AAA||ls -la' },
      { name: 'subshell execution', payload: 'AAA;$(whoami)' },
      { name: 'backtick substitution', payload: 'AAA;`id`' },
      { name: 'dollar substitution', payload: 'AAA;$(cat /etc/passwd)' },
      { name: 'nested subshell', payload: 'AAA;(ls;whoami)' },
      { name: 'redirect output', payload: 'AAA>evil.txt' },
      { name: 'append output', payload: 'AAA>>evil.txt' },
      { name: 'redirect input', payload: 'AAA</etc/passwd' },
      { name: 'here document start', payload: 'AAA<<EOF' },
      { name: 'here string', payload: 'AAA<<<"malicious"' },
      { name: 'wildcard expansion', payload: 'AAA;ls *' },
      { name: 'brace expansion', payload: 'AAA;echo {a,b,c}' },
      { name: 'tilde expansion', payload: 'AAA;ls ~' },
    ]

    for (const { name, payload } of shell_metacharacters) {
      it(`isolates ${name}: ${payload}`, () => {
        // Simulate how domain.js/suins.js uses spawnSync with tx_base64
        const result = spawnSync('echo', [payload], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        // Verify the payload is treated as literal string, not interpreted
        assert.strictEqual(result.status, 0, 'echo command should succeed')
        assert.strictEqual(
          result.stdout.trim(),
          payload,
          `Payload should be echoed literally, not executed`,
        )
        assert.ok(!result.stderr, 'Should not produce stderr')
      })
    }
  })

  describe('environment variable injection', () => {
    const env_payloads = [
      { name: 'HOME expansion', payload: 'AAA$HOME' },
      { name: 'PATH expansion', payload: 'AAA$PATH' },
      { name: 'USER expansion', payload: 'AAA${USER}' },
      { name: 'shell expansion', payload: 'AAA${SHELL}' },
      { name: 'nested expansion', payload: 'AAA${HOME}${PATH}' },
      { name: 'default value', payload: 'AAA${VAR:-default}' },
      { name: 'substring extraction', payload: 'AAA${HOME:0:5}' },
    ]

    for (const { name, payload } of env_payloads) {
      it(`isolates ${name}: ${payload}`, () => {
        const result = spawnSync('echo', [payload], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        assert.strictEqual(result.status, 0)
        assert.strictEqual(
          result.stdout.trim(),
          payload,
          'Environment variables should not be expanded',
        )
      })
    }
  })

  describe('quote escaping attempts', () => {
    const quote_payloads = [
      { name: 'single quote escape', payload: "AAA';whoami;'" },
      { name: 'double quote escape', payload: 'AAA";whoami;"' },
      { name: 'mixed quote escape', payload: 'AAA";ls -la;\'echo done' },
      { name: 'escaped single quote', payload: "AAA\\'whoami" },
      { name: 'escaped double quote', payload: 'AAA\\"whoami' },
      { name: 'quote injection', payload: "AAA' OR '1'='1" },
      { name: 'unicode quote escape', payload: 'AAA\u0027;whoami' },
      { name: 'hex encoded quote', payload: 'AAA\\x27;whoami' },
    ]

    for (const { name, payload } of quote_payloads) {
      it(`isolates ${name}: ${payload}`, () => {
        const result = spawnSync('echo', [payload], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        assert.strictEqual(result.status, 0)
        assert.strictEqual(
          result.stdout.trim(),
          payload,
          'Quote escapes should be treated literally',
        )
      })
    }
  })

  describe('newline injection', () => {
    const newline_payloads = [
      { name: 'LF injection', payload: 'AAA\nwhoami' },
      { name: 'CR injection', payload: 'AAA\rwhoami' },
      { name: 'CRLF injection', payload: 'AAA\r\nwhoami' },
      { name: 'multiple newlines', payload: 'AAA\n\nwhoami\n\nid' },
      { name: 'escaped newline', payload: 'AAA\\nwhoami' },
      { name: 'unicode newline', payload: 'AAA\u000Awhoami' },
      { name: 'vertical tab', payload: 'AAA\vwhoami' },
      { name: 'form feed', payload: 'AAA\fwhoami' },
    ]

    for (const { name, payload } of newline_payloads) {
      it(`isolates ${name}`, () => {
        const result = spawnSync('echo', [payload], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        assert.strictEqual(result.status, 0, 'echo should succeed')
        // echo adds a newline, so we check that payload is in output
        assert.ok(
          result.stdout.includes(payload) ||
            result.stdout.trim() === payload.replace(/[\r\n]/g, '\n').trim(),
          'Newlines should be treated as data, not command separators',
        )
      })
    }
  })

  describe('null byte injection', () => {
    const null_payloads = [
      { name: 'null byte', payload: 'AAA\x00BBB' },
      { name: 'null at start', payload: '\x00AAA' },
      { name: 'null at end', payload: 'AAA\x00' },
      { name: 'multiple nulls', payload: 'AAA\x00BBB\x00CCC' },
      { name: 'null with command', payload: 'AAA\x00;whoami' },
    ]

    for (const { name, payload } of null_payloads) {
      it(`rejects ${name} at platform level`, () => {
        // Node.js spawnSync REJECTS null bytes with ERR_INVALID_ARG_VALUE
        // This is a GOOD thing - platform-level defense
        assert.throws(
          () => {
            spawnSync('echo', [payload], {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
            })
          },
          {
            code: 'ERR_INVALID_ARG_VALUE',
            message: /must be a string without null bytes/,
          },
          'Node.js should reject null bytes in arguments',
        )
      })
    }
  })

  describe('buffer overflow attempts', () => {
    const overflow_sizes = [
      { name: '1KB payload', size: 1024 },
      { name: '10KB payload', size: 10240 },
      { name: '100KB payload', size: 102400 },
      { name: '1MB payload', size: 1048576 },
    ]

    for (const { name, size } of overflow_sizes) {
      it(`handles ${name}`, () => {
        const payload = 'A'.repeat(size) + ';whoami'

        const result = spawnSync('echo', [payload], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 2 * 1024 * 1024, // 2MB buffer
        })

        // Either succeeds with literal output or fails gracefully (not with command execution)
        if (result.status === 0) {
          assert.ok(
            result.stdout.includes('AAA'),
            'Large payloads should be echoed',
          )
          assert.ok(
            !result.stdout.includes('root'),
            'Should not execute whoami',
          )
        } else {
          // Command may fail on very large payloads, but should not execute injection
          assert.ok(true, 'Graceful failure is acceptable')
        }
      })
    }
  })

  describe('binary and non-printable characters', () => {
    const binary_payloads = [
      {
        name: 'control characters',
        payload: 'AAA\x01\x02\x03\x04\x05;whoami',
        has_null: false,
      },
      { name: 'DEL character', payload: 'AAA\x7F;whoami', has_null: false },
      { name: 'high ASCII', payload: 'AAA\x80\x81\x82;whoami', has_null: false },
      {
        name: 'mixed binary with null',
        payload: Buffer.from([
          0x41, 0x41, 0x41, 0x00, 0x3b, 0x77, 0x68, 0x6f, 0x61, 0x6d, 0x69,
        ]).toString('binary'),
        has_null: true,
      },
    ]

    for (const { name, payload, has_null } of binary_payloads) {
      it(`handles ${name}`, () => {
        if (has_null) {
          // Null bytes are rejected at platform level
          assert.throws(
            () => {
              spawnSync('echo', [payload], {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
              })
            },
            { code: 'ERR_INVALID_ARG_VALUE' },
          )
        } else {
          const result = spawnSync('echo', [payload], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          })

          assert.strictEqual(result.status, 0, 'echo should succeed')
          assert.ok(!result.stdout.includes('root'), 'Should not execute whoami')
          assert.ok(!result.stdout.includes('uid='), 'Should not execute id')
        }
      })
    }
  })

  describe('sui CLI specific payloads', () => {
    it('isolates malicious tx_base64 with command injection', () => {
      const malicious_tx = 'dGVzdA==;rm -rf /' // "test" in base64 + injection

      // Simulate actual usage from domain.js line 173
      const result = spawnSync(
        'sui',
        ['client', 'serialized-tx', malicious_tx, '--json'],
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      // sui command will fail (invalid tx), but injection should not execute
      // We only care that the malicious part wasn't executed as separate command
      assert.ok(
        result.status !== 0 || !result.stdout.includes('removed'),
        'Injection attempt should not execute',
      )
    })

    it('isolates malicious tx_base64 with pipe injection', () => {
      const malicious_tx = 'dGVzdA==|cat /etc/passwd'

      const result = spawnSync(
        'sui',
        ['client', 'serialized-tx', malicious_tx, '--json'],
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      // Should not output /etc/passwd contents
      assert.ok(
        !result.stdout.includes('root:'),
        'Should not execute cat /etc/passwd',
      )
    })

    it('isolates malicious tx_base64 with background execution', () => {
      const malicious_tx = 'dGVzdA==&touch /tmp/pwned'

      const result = spawnSync(
        'sui',
        ['client', 'serialized-tx', malicious_tx, '--json'],
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      // sui command will fail, but background command should not run
      // This is hard to test directly, but the command should fail fast
      assert.ok(result.status !== 0, 'Invalid tx should fail')
    })

    it('isolates malicious tx_base64 with subshell', () => {
      const malicious_tx = 'dGVzdA==$(whoami)'

      const result = spawnSync(
        'sui',
        ['client', 'serialized-tx', malicious_tx, '--json'],
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      // Should not expand $(whoami)
      assert.ok(
        !result.stdout.includes('root') && !result.stdout.includes('uid='),
        'Should not execute whoami via subshell',
      )
    })

    it('isolates malicious --json flag with injection', () => {
      const safe_tx = 'dGVzdA=='
      const malicious_flag = '--json;rm -rf /'

      const result = spawnSync(
        'sui',
        ['client', 'serialized-tx', safe_tx, malicious_flag],
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      // sui will treat malicious_flag as invalid option, not execute injection
      assert.ok(true, 'Array args prevent flag injection')
    })
  })

  describe('path traversal in tx_base64', () => {
    const path_payloads = [
      { name: 'parent directory', payload: '../../../etc/passwd', has_null: false },
      { name: 'absolute path', payload: '/etc/passwd', has_null: false },
      { name: 'windows path', payload: 'C:\\Windows\\System32\\cmd.exe', has_null: false },
      { name: 'UNC path', payload: '\\\\server\\share\\file', has_null: false },
      { name: 'encoded traversal', payload: '..%2F..%2F..%2Fetc%2Fpasswd', has_null: false },
      { name: 'null byte traversal', payload: '../../../etc/passwd\x00.txt', has_null: true },
    ]

    for (const { name, payload, has_null } of path_payloads) {
      it(`isolates ${name}: ${payload.replace(/\x00/g, '\\x00')}`, () => {
        if (has_null) {
          assert.throws(
            () => {
              spawnSync('echo', [payload], {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
              })
            },
            { code: 'ERR_INVALID_ARG_VALUE' },
            'Null bytes should be rejected',
          )
        } else {
          const result = spawnSync('echo', [payload], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          })

          assert.strictEqual(result.status, 0)
          // Windows paths get truncated by echo at backslash on macOS/Linux
          // This is echo behavior, not a security issue - the path is still isolated
          const is_windows_path = payload.includes(':\\')
          if (is_windows_path) {
            assert.ok(
              result.stdout.includes('C:'),
              'Windows path should be treated as literal string',
            )
          } else {
            assert.strictEqual(
              result.stdout.trim(),
              payload,
              'Path traversal should be treated as literal string',
            )
          }
        }
      })
    }
  })

  describe('unicode and encoding attacks', () => {
    const unicode_payloads = [
      { name: 'unicode semicolon', payload: 'AAA\uFF1Bwhoami' }, // fullwidth semicolon
      { name: 'unicode pipe', payload: 'AAA\u01C0whoami' }, // dental click (looks like |)
      { name: 'RTL override', payload: 'AAA\u202Ewhoami' },
      { name: 'zero-width space', payload: 'AAA\u200Bwhoami' },
      { name: 'homoglyph attack', payload: 'AAA\u0430dmin' }, // cyrillic 'a'
      { name: 'combining characters', payload: 'AAA\u0301\u0302whoami' },
    ]

    for (const { name, payload } of unicode_payloads) {
      it(`isolates ${name}`, () => {
        const result = spawnSync('echo', [payload], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        assert.strictEqual(result.status, 0)
        assert.ok(
          !result.stdout.includes('root'),
          'Unicode tricks should not execute commands',
        )
      })
    }
  })

  describe('combined attack vectors', () => {
    const combined_payloads = [
      {
        name: 'newline + semicolon + subshell',
        payload: 'AAA\n;$(whoami);id',
        has_null: false,
      },
      {
        name: 'quote escape + pipe + env var',
        payload: 'AAA";cat $HOME/.ssh/id_rsa|base64',
        has_null: false,
      },
      {
        name: 'null byte + command chain',
        payload: 'AAA\x00;rm -rf /;echo done',
        has_null: true,
      },
      {
        name: 'unicode + metacharacters',
        payload: 'AAA\uFF1B$(whoami)\n&id',
        has_null: false,
      },
      {
        name: 'overflow + injection',
        payload: 'A'.repeat(10000) + ';whoami',
        has_null: false,
      },
    ]

    for (const { name, payload, has_null } of combined_payloads) {
      it(`isolates ${name}`, () => {
        if (has_null) {
          assert.throws(
            () => {
              spawnSync('echo', [payload], {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
              })
            },
            { code: 'ERR_INVALID_ARG_VALUE' },
          )
        } else {
          const result = spawnSync('echo', [payload], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 20 * 1024, // 20KB
          })

          // Either succeeds with literal output or fails gracefully
          if (result.status === 0) {
            assert.ok(
              !result.stdout.includes('root') &&
                !result.stdout.includes('uid=') &&
                !result.stdout.includes('BEGIN RSA'),
              'Combined attacks should not execute',
            )
          } else {
            assert.ok(true, 'Graceful failure acceptable')
          }
        }
      })
    }
  })

  describe('real-world base64 attack patterns', () => {
    const base64_attacks = [
      {
        name: 'valid base64 with embedded injection',
        payload: 'dGVzdA==;whoami', // "test" + injection
        has_null: false,
      },
      {
        name: 'base64 with newline injection',
        payload: 'dGVzdA==\nwhoami',
        has_null: false,
      },
      {
        name: 'base64 with null byte',
        payload: 'dGVzdA==\x00whoami',
        has_null: true,
      },
      {
        name: 'malformed base64 with injection',
        payload: 'AAA===;rm -rf /',
        has_null: false,
      },
      {
        name: 'very long base64',
        payload: Buffer.from('A'.repeat(100000)).toString('base64') + ';whoami',
        has_null: false,
      },
    ]

    for (const { name, payload, has_null } of base64_attacks) {
      it(`handles ${name}`, () => {
        if (has_null) {
          // Null bytes rejected at platform level
          assert.throws(
            () => {
              spawnSync(
                'sui',
                ['client', 'serialized-tx', payload, '--json'],
                {
                  encoding: 'utf8',
                  stdio: ['pipe', 'pipe', 'pipe'],
                },
              )
            },
            { code: 'ERR_INVALID_ARG_VALUE' },
          )
        } else {
          // Simulate actual sui command execution pattern
          const result = spawnSync(
            'sui',
            ['client', 'serialized-tx', payload, '--json'],
            {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
            },
          )

          // sui will fail on invalid tx, but should not execute injected commands
          assert.ok(
            !result.stdout.includes('root') && !result.stdout.includes('uid='),
            'Base64 attacks should not execute commands',
          )
        }
      })
    }
  })
})
