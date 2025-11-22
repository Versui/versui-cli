import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {Object} ServiceWorkerDetection
 * @property {'none' | 'workbox' | 'custom'} type - Service worker type
 * @property {string | null} path - Path to service worker file (null if none)
 */

/**
 * Detect service worker in build directory
 * Checks common service worker file names and determines type
 * @param {string} build_dir - Build directory path
 * @param {Object} [fs_module] - File system module (injectable for testing)
 * @param {Function} fs_module.existsSync - existsSync function
 * @param {Function} fs_module.readFileSync - readFileSync function
 * @returns {Promise<ServiceWorkerDetection>} Service worker detection result
 */
export async function detect_service_worker(
  build_dir,
  fs_module = { existsSync, readFileSync },
) {
  const common_names = ['sw.js', 'service-worker.js']

  // Check each common service worker file name
  for (const name of common_names) {
    const sw_path = join(build_dir, name)

    if (fs_module.existsSync(sw_path)) {
      try {
        const content = fs_module.readFileSync(sw_path, 'utf8')

        // Detect Workbox by checking for workbox imports/references
        if (content.includes('workbox')) {
          return {
            type: 'workbox',
            path: sw_path,
          }
        }

        // Custom service worker (non-Workbox)
        return {
          type: 'custom',
          path: sw_path,
        }
      } catch (error) {
        // If file read fails, continue checking other files
        continue
      }
    }
  }

  // No service worker found
  return {
    type: 'none',
    path: null,
  }
}

/**
 * Generate integration snippet for custom service worker
 * @param {Object<string, string>} resource_map - Path to quilt patch ID mappings
 * @param {string} [sw_path] - Path to detected service worker file (optional, for display)
 * @returns {string} Code snippet for integrating Versui into existing SW
 */
export function generate_sw_snippet(resource_map, sw_path = null) {
  const resources_json = JSON.stringify(resource_map, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n')

  const sw_location = sw_path ? ` (${sw_path})` : ''

  return `
Add this to your service worker${sw_location}:

import { create_versui_handler } from '@versui/sw-plugin'

const versui = create_versui_handler()
versui.load(${resources_json})
self.addEventListener('fetch', e => versui.handle(e))
`.trim()
}
