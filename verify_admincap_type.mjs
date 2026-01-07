#!/usr/bin/env node

import { SuiClient } from '@mysten/sui/client'

const V10_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const ORIGINAL_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' })

async function find_admincap_objects() {
  console.log('Searching for SiteAdminCap objects on testnet...\n')

  // Try to find created objects in the ORIGINAL package deployment
  const orig_obj = await client.getObject({
    id: ORIGINAL_PACKAGE_ID,
    options: { showPreviousTransaction: true }
  })

  const orig_tx = await client.getTransactionBlock({
    digest: orig_obj.data.previousTransaction,
    options: { showObjectChanges: true }
  })

  console.log('=== Objects created in ORIGINAL package deployment ===')
  const orig_created = orig_tx.objectChanges?.filter(c => c.type === 'created') || []
  orig_created.forEach(obj => {
    console.log(`Type: ${obj.objectType}`)
    console.log(`ID: ${obj.objectId}`)
    if (obj.objectType?.includes('SiteAdminCap')) {
      console.log('✓ Found SiteAdminCap!')
    }
    console.log()
  })

  // Check V10 package deployment
  const v10_obj = await client.getObject({
    id: V10_PACKAGE_ID,
    options: { showPreviousTransaction: true }
  })

  const v10_tx = await client.getTransactionBlock({
    digest: v10_obj.data.previousTransaction,
    options: { showObjectChanges: true }
  })

  console.log('=== Objects created in V10 package deployment ===')
  const v10_created = v10_tx.objectChanges?.filter(c => c.type === 'created') || []
  v10_created.forEach(obj => {
    console.log(`Type: ${obj.objectType}`)
    console.log(`ID: ${obj.objectId}`)
    if (obj.objectType?.includes('SiteAdminCap')) {
      console.log('✓ Found SiteAdminCap!')
    }
    console.log()
  })

  console.log('=== FINAL VERIFICATION ===')
  const original_admincap = orig_created.find(o => o.objectType?.includes('SiteAdminCap'))
  const v10_admincap = v10_created.find(o => o.objectType?.includes('SiteAdminCap'))

  if (original_admincap) {
    console.log('✓ ORIGINAL_PACKAGE_ID has SiteAdminCap with type:')
    console.log(`  ${original_admincap.objectType}`)
    console.log('\nThis confirms ORIGINAL_PACKAGE_ID is correct for AdminCap types:')
    console.log(`  ${ORIGINAL_PACKAGE_ID}`)
  }

  if (v10_admincap && !original_admincap) {
    console.log('✗ Only V10 has SiteAdminCap (unexpected)')
    console.log(`  ${v10_admincap.objectType}`)
  }
}

find_admincap_objects().catch(console.error)
