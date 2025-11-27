import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative, normalize } from 'node:path'

import { minimatch } from 'minimatch'
import mime from 'mime'

export function get_content_type(file_path) {
  return mime.getType(file_path) || 'application/octet-stream'
}

export function read_file(file_path) {
  return readFileSync(file_path)
}

function sanitize_ignore_pattern(pattern) {
  // Reject patterns containing path traversal sequences
  if (pattern.includes('../') || pattern.includes('..\\')) {
    return null
  }
  return pattern
}

function read_ignore_patterns(project_dir) {
  const ignore_file = join(project_dir, '.versuignore')
  if (!existsSync(ignore_file)) return []
  return readFileSync(ignore_file, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(sanitize_ignore_pattern)
    .filter(p => p !== null)
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
