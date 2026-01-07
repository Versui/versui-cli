import { spawn } from 'node:child_process'

import React from 'react'
import { render } from 'ink'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'

import { fetch_site_blob_objects, extend_blob } from '../../renew.js'

import App from './App.js'

/**
 * Renders the Ink-based renew UI with wired business logic
 * @param {Object} options - Renew options
 * @param {string} options.site_id - Site object ID
 * @param {string} options.network - Network (testnet|mainnet)
 * @param {number} options.epochs - Pre-set duration
 * @param {boolean} options.auto_yes - Skip confirmations
 * @returns {Promise} - Resolves with renewal result
 */
export async function render_renew_ui(options) {
  const network = options.network || 'testnet'
  const rpc_url = getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet')
  const sui_client = new SuiClient({ url: rpc_url })

  // Fetch blob object IDs upfront
  const blob_object_ids = await fetch_site_blob_objects(
    options.site_id,
    sui_client,
  )

  if (blob_object_ids.length === 0) {
    throw new Error('No blob objects found for this site')
  }

  // Clear console on startup
  process.stdout.write('\x1Bc')

  return new Promise((resolve, reject) => {
    const { waitUntilExit } = render(
      React.createElement(App, {
        site_id: options.site_id,
        blob_count: blob_object_ids.length,
        epochs: options.epochs,
        auto_yes: options.auto_yes,
        on_step_change: async (step, data) => {
          try {
            switch (step) {
              case 'extending': {
                const results = []
                for (let i = 0; i < blob_object_ids.length; i++) {
                  const blob_object_id = blob_object_ids[i]

                  // Update progress
                  if (data.on_progress) {
                    data.on_progress(i, blob_object_ids.length)
                  }

                  const result = await extend_blob(blob_object_id, data.epochs)
                  results.push({
                    blob_object_id,
                    ...result,
                  })
                }
                return results
              }

              default:
                return {}
            }
          } catch (error) {
            reject(error)
            throw error
          }
        },
        on_complete: resolve,
        on_error: reject,
      }),
    )

    waitUntilExit().catch(reject)
  })
}

export default render_renew_ui
