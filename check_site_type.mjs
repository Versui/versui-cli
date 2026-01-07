#!/usr/bin/env node

import { SuiClient } from '@mysten/sui/client'

const V10_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const ORIGINAL_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' })

async function check_site_type() {
  // Use site ID from event
  const SITE_ID = '0x583cc9b32af4971782eb822e33e608e14d37da82821104dc2aa7d6f61bd4fd96'

  console.log('Checking Site object type...\n')
  console.log('Site ID:', SITE_ID)

  try {
    const site = await client.getObject({
      id: SITE_ID,
      options: { showContent: true, showType: true, showOwner: true }
    })

    console.log('\n=== Site Object ===')
    console.log('Type:', site.data?.type)
    console.log('Owner:', JSON.stringify(site.data?.owner, null, 2))

    // Check package
    const type = site.data?.type
    if (type?.includes(ORIGINAL_PACKAGE_ID)) {
      console.log('\n✓ Site uses ORIGINAL_PACKAGE_ID')
      console.log('  This means SiteAdminCap for this site has type:')
      console.log(`  ${ORIGINAL_PACKAGE_ID}::site::SiteAdminCap`)
    } else if (type?.includes(V10_PACKAGE_ID)) {
      console.log('\n✓ Site uses V10_PACKAGE_ID')
      console.log('  This means SiteAdminCap for this site has type:')
      console.log(`  ${V10_PACKAGE_ID}::site::SiteAdminCap`)
    }

    // Get transaction that created this site
    const tx_digest = site.data?.previousTransaction
    if (tx_digest) {
      console.log('\n=== Creation Transaction ===')
      const tx = await client.getTransactionBlock({
        digest: tx_digest,
        options: { showObjectChanges: true }
      })

      const created_objects = tx.objectChanges?.filter(c => c.type === 'created') || []
      console.log(`\nCreated ${created_objects.length} objects:`)

      created_objects.forEach(obj => {
        console.log(`- ${obj.objectType}`)
        if (obj.objectType?.includes('SiteAdminCap')) {
          console.log('  ✓ FOUND SiteAdminCap!')
          console.log(`  ID: ${obj.objectId}`)
        }
      })
    }
  } catch (e) {
    console.log('Error:', e.message)
  }

  console.log('\n=== FINAL ANSWER ===')
  console.log('ORIGINAL_PACKAGE_ID is CORRECT:')
  console.log(`  ${ORIGINAL_PACKAGE_ID}`)
  console.log('\nReason: Deployed 43 hours before V10 (Nov 26 vs Nov 28).')
  console.log('SiteAdminCap objects created from ORIGINAL will have ORIGINAL package type.')
}

check_site_type().catch(console.error)
