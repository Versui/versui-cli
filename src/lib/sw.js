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
