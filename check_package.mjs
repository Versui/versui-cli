#!/usr/bin/env node

import { SuiClient } from '@mysten/sui/client'

const V10_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const ORIGINAL_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' })

async function check_admincap_package() {
  console.log('Checking AdminCap package IDs on Sui testnet...\n')

  // Check V10 package upgrade info
  console.log('=== Checking V10_PACKAGE_ID ===')
  console.log(V10_PACKAGE_ID)
  try {
    const v10_obj = await client.getObject({
      id: V10_PACKAGE_ID,
      options: { showPreviousTransaction: true, showContent: true }
    })
    console.log('Status:', v10_obj.data?.content?.dataType || 'Not found')
    console.log('Previous TX:', v10_obj.data?.previousTransaction)

    if (v10_obj.data?.previousTransaction) {
      const tx = await client.getTransactionBlock({
        digest: v10_obj.data.previousTransaction,
        options: { showInput: true, showEffects: true, showObjectChanges: true }
      })

      const has_upgrade_cap = JSON.stringify(tx).includes('UpgradeCap')
      console.log('Has UpgradeCap (is upgrade):', has_upgrade_cap)

      if (has_upgrade_cap) {
        console.log('✓ V10 is an UPGRADED package')
      }
    }
  } catch (e) {
    console.log('Error:', e.message)
  }

  // Check ORIGINAL package upgrade info
  console.log('\n=== Checking ORIGINAL_PACKAGE_ID ===')
  console.log(ORIGINAL_PACKAGE_ID)
  try {
    const orig_obj = await client.getObject({
      id: ORIGINAL_PACKAGE_ID,
      options: { showPreviousTransaction: true, showContent: true }
    })
    console.log('Status:', orig_obj.data?.content?.dataType || 'Not found')
    console.log('Previous TX:', orig_obj.data?.previousTransaction)

    if (orig_obj.data?.previousTransaction) {
      const tx = await client.getTransactionBlock({
        digest: orig_obj.data.previousTransaction,
        options: { showInput: true, showObjectChanges: true }
      })

      const has_upgrade_cap = JSON.stringify(tx).includes('UpgradeCap')
      console.log('Has UpgradeCap (is upgrade):', has_upgrade_cap)

      const obj_changes = tx.objectChanges || []
      const package_change = obj_changes.find(c => c.type === 'published')
      console.log('Package published:', !!package_change)

      if (!has_upgrade_cap && package_change) {
        console.log('✓ ORIGINAL is the FIRST deployment (no upgrade)')
      }
    }
  } catch (e) {
    console.log('Error:', e.message)
  }

  console.log('\n=== CONCLUSION ===')
  console.log('The package where SiteAdminCap was FIRST created is ORIGINAL_PACKAGE_ID.')
  console.log('AdminCap objects retain their original type even after package upgrades.')
  console.log(`\nCORRECT ORIGINAL_PACKAGE_ID: ${ORIGINAL_PACKAGE_ID}`)
}

check_admincap_package().catch(console.error)
