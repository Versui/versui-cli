#!/usr/bin/env node

import { SuiClient } from '@mysten/sui/client'

const V10_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const ORIGINAL_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' })

async function compare_packages() {
  console.log('Comparing V10 vs ORIGINAL packages...\n')

  // Get both transactions to compare timestamps
  const v10_obj = await client.getObject({
    id: V10_PACKAGE_ID,
    options: { showPreviousTransaction: true }
  })

  const orig_obj = await client.getObject({
    id: ORIGINAL_PACKAGE_ID,
    options: { showPreviousTransaction: true }
  })

  const v10_tx = await client.getTransactionBlock({
    digest: v10_obj.data.previousTransaction,
    options: { showEffects: true }
  })

  const orig_tx = await client.getTransactionBlock({
    digest: orig_obj.data.previousTransaction,
    options: { showEffects: true }
  })

  const v10_timestamp = v10_tx.timestampMs
  const orig_timestamp = orig_tx.timestampMs

  console.log('=== V10_PACKAGE_ID ===')
  console.log('Package:', V10_PACKAGE_ID)
  console.log('Timestamp:', new Date(parseInt(v10_timestamp)).toISOString())
  console.log('TX:', v10_obj.data.previousTransaction)

  console.log('\n=== ORIGINAL_PACKAGE_ID ===')
  console.log('Package:', ORIGINAL_PACKAGE_ID)
  console.log('Timestamp:', new Date(parseInt(orig_timestamp)).toISOString())
  console.log('TX:', orig_obj.data.previousTransaction)

  console.log('\n=== ANALYSIS ===')
  if (orig_timestamp < v10_timestamp) {
    console.log('✓ ORIGINAL_PACKAGE_ID was deployed FIRST')
    console.log(`  Time difference: ${(v10_timestamp - orig_timestamp) / 1000 / 60 / 60} hours`)
    console.log('\nCONCLUSION: ORIGINAL_PACKAGE_ID is correct')
    console.log(`  ${ORIGINAL_PACKAGE_ID}`)
    console.log('\nBoth show as "first deployment" because V10 is a SEPARATE deployment,')
    console.log('not an upgrade of ORIGINAL. AdminCaps from ORIGINAL still use ORIGINAL type.')
  } else {
    console.log('✗ V10_PACKAGE_ID was deployed FIRST (unexpected!)')
    console.log(`  Time difference: ${(orig_timestamp - v10_timestamp) / 1000 / 60 / 60} hours`)
  }
}

compare_packages().catch(console.error)
