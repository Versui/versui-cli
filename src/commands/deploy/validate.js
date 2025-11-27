import { existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

/**
 * Validates that a directory exists and is accessible
 * @param {string} dir - Directory path to validate
 * @returns {boolean} True if valid directory
 */
export function validate_directory(dir) {
  if (!dir) return false
  if (!existsSync(dir)) return false
  if (!statSync(dir).isDirectory()) return false
  return true
}

/**
 * Checks if a CLI tool is installed
 * @param {string} command - Command name to check
 * @returns {boolean} True if command exists
 */
export function has_cli(command) {
  try {
    const result = spawnSync('which', [command], {
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Validates all required CLI prerequisites
 * @returns {{ success: boolean, missing: string[] }}
 */
export function check_prerequisites() {
  const missing = []

  if (!has_cli('walrus')) {
    missing.push('walrus')
  }

  if (!has_cli('sui')) {
    missing.push('sui')
  }

  return {
    success: missing.length === 0,
    missing,
  }
}

/**
 * Gets error message for missing prerequisite
 * @param {string} tool - Tool name ('walrus' or 'sui')
 * @returns {string} Error message with installation link
 */
export function get_prerequisite_error(tool) {
  if (tool === 'walrus') {
    return 'Walrus CLI not found. Install from: https://docs.walrus.site'
  }
  if (tool === 'sui') {
    return 'Sui CLI not found. Install from: https://docs.sui.io'
  }
  return `${tool} CLI not found`
}
