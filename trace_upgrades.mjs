#!/usr/bin/env node

import { SuiClient } from '@mysten/sui/client'

const V10_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const ORIGINAL_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' })

async function get_upgrade_chain(package_id, label) {
  console.log(`\n=== Tracing ${label} ===`)
  console.log('Package ID:', package_id)

  try {
    const tx_obj = await client.getObject({
      id: package_id,
      options: { showPreviousTransaction: true }
    })

    const tx_digest = tx_obj.data?.previousTransaction
    if (!tx_digest) {
      console.log('No previous transaction found')
      return null
    }

    const tx = await client.getTransactionBlock({
      digest: tx_digest,
      options: { showInput: true, showObjectChanges: true }
    })

    // Find the UpgradeCap in object changes to see what package it points to
    const obj_changes = tx.objectChanges || []
    const upgrade_cap_created = obj_changes.find(c =>
      c.objectType?.includes('UpgradeCap')
    )

    console.log('TX Digest:', tx_digest)
    console.log('Transaction kind:', tx.transaction?.data?.transaction?.kind)

    // Check if this used an existing UpgradeCap (meaning it's an upgrade)
    const inputs = tx.transaction?.data?.transaction?.inputs || []
    const upgrade_cap_input = inputs.find(i =>
      i.objectId && JSON.stringify(tx).includes('"UpgradeCap"')
    )

    if (upgrade_cap_input) {
      console.log('Used existing UpgradeCap - this is an UPGRADE')
      // Try to find what package this upgraded from
      const tx_json = JSON.stringify(tx, null, 2)
      const package_match = tx_json.match(/"package":\s*"(0x[a-f0-9]{64})"/g)
      if (package_match) {
        console.log('Referenced packages:', package_match)
      }
    } else if (upgrade_cap_created) {
      console.log('Created new UpgradeCap - this is FIRST deployment')
      console.log('UpgradeCap created:', upgrade_cap_created.objectId)
      return { is_first: true, package_id }
    }

    // Look for package field in object changes
    const published = obj_changes.find(c => c.type === 'published')
    if (published) {
      console.log('Published package:', published.packageId)
    }

    return { is_first: false, package_id }
  } catch (e) {
    console.log('Error:', e.message)
    return null
  }
}

async function main() {
  console.log('Tracing package upgrade chains...')

  const v10_chain = await get_upgrade_chain(V10_PACKAGE_ID, 'V10_PACKAGE_ID')
  const orig_chain = await get_upgrade_chain(ORIGINAL_PACKAGE_ID, 'ORIGINAL_PACKAGE_ID')

  console.log('\n=== ANALYSIS ===')
  if (orig_chain?.is_first) {
    console.log('✓ ORIGINAL_PACKAGE_ID is the first deployment')
    console.log(`  ${ORIGINAL_PACKAGE_ID}`)
  } else if (v10_chain?.is_first) {
    console.log('✗ V10_PACKAGE_ID is the first deployment (unexpected)')
    console.log(`  ${V10_PACKAGE_ID}`)
  } else {
    console.log('Both packages show UpgradeCap usage.')
    console.log('ORIGINAL_PACKAGE_ID is likely named correctly as the original.')
    console.log('AdminCap types use ORIGINAL_PACKAGE_ID:', ORIGINAL_PACKAGE_ID)
  }
}

main().catch(console.error)
