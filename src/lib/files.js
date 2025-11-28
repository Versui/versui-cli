import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative, normalize, resolve } from 'node:path'

import { minimatch } from 'minimatch'
import mime from 'mime'

export function get_content_type(file_path) {
  return mime.getType(file_path) || 'application/octet-stream'
}

export function read_file(file_path) {
  return readFileSync(file_path)
}

export function sanitize_ignore_pattern(pattern, project_dir) {
  // Limit pattern length to prevent DoS
  if (pattern.length > 10000) return null

  // Decode URL encoding (including double encoding) to prevent bypasses
  let decoded = pattern
  let prev_decoded = ''
  while (decoded !== prev_decoded) {
    prev_decoded = decoded
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      return null // Invalid encoding
    }
  }

  // Normalize unicode to prevent homoglyph attacks
  const normalized_pattern = decoded.normalize('NFC')

  // Block null bytes
  if (normalized_pattern.includes('\x00')) return null

  // Block unicode lookalikes for dots and slashes
  if (/[\uFF0E\u2024\u3002\uFE52\uFF61]/.test(normalized_pattern)) return null

  // Block Windows-style paths (absolute or UNC)
  if (/^[a-zA-Z]:/.test(normalized_pattern)) return null // C:\
  if (/^\\\\/.test(normalized_pattern)) return null // \\server\share

  // Block backslashes (Windows path separators)
  if (normalized_pattern.includes('\\')) return null

  // Block patterns with triple or more dots
  if (/\.{3,}/.test(normalized_pattern)) return null

  // Block path traversal - check for .. as a path segment
  // Match .. as a path segment (not just substring, to allow "file..txt")
  if (/(?:^|\/|\\)\.\.(?:\/|\\|$)/.test(normalized_pattern)) return null

  // Use path.resolve() to normalize and check if result stays within project bounds
  const resolved = resolve(project_dir, normalized_pattern)
  const normalized_project = resolve(project_dir)

  // If resolved path escapes project directory, reject
  if (!resolved.startsWith(normalized_project + '/') && resolved !== normalized_project) {
    return null
  }

  return pattern
}

function read_ignore_patterns(project_dir) {
  const patterns = []

  // Check for .versuiignore first - if exists, use ONLY that
  const versuignore_file = join(project_dir, '.versuignore')
  if (existsSync(versuignore_file)) {
    const versuignore_patterns = readFileSync(versuignore_file, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(p => sanitize_ignore_pattern(p, project_dir))
      .filter(p => p !== null)
    patterns.push(...versuignore_patterns)
    return patterns // Early return - don't check .gitignore
  }

  // Fall back to .gitignore only if .versuiignore doesn't exist
  const gitignore_file = join(project_dir, '.gitignore')
  if (existsSync(gitignore_file)) {
    const gitignore_patterns = readFileSync(gitignore_file, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(p => sanitize_ignore_pattern(p, project_dir))
      .filter(p => p !== null)
    patterns.push(...gitignore_patterns)
  }

  return patterns
}

function should_ignore(file_path, patterns) {
  // Normalize file path to prevent path traversal
  const normalized_path = normalize(file_path).replace(/\\/g, '/')
  return patterns.some(p => minimatch(normalized_path, p, { dot: true }))
}

export function scan_directory(dir, base_dir, ignore_patterns = null) {
  if (ignore_patterns === null) {
    const project_dir = join(dir, '..')
    ignore_patterns = read_ignore_patterns(project_dir)
  }

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
