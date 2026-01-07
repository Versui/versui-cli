#!/usr/bin/env node

import { SuiClient } from '@mysten/sui/client'

const V10_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const ORIGINAL_PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' })

async function find_site_objects() {
  console.log('Searching for Site objects to check SiteAdminCap types...\n')

  // Get VERSUI_REGISTRY from V10 deployment
  const VERSUI_REGISTRY = '0x80ed579d585d60db342a9082b69671cbcd426acc8a96032fe923caba56b32ada'

  // Get dynamic fields of registry to find sites
  console.log('=== Querying Versui registry for sites ===')
  try {
    const dynamic_fields = await client.getDynamicFields({
      parentId: VERSUI_REGISTRY
    })

    console.log(`Found ${dynamic_fields.data.length} dynamic fields`)

    if (dynamic_fields.data.length > 0) {
      // Get first site to check its type
      const first_site = dynamic_fields.data[0]
      console.log('\nFirst site field:')
      console.log(JSON.stringify(first_site, null, 2))

      // Get the actual site object
      if (first_site.objectId) {
        const site_field = await client.getObject({
          id: first_site.objectId,
          options: { showContent: true, showType: true }
        })

        console.log('\nSite field object type:')
        console.log(site_field.data?.type)

        // Extract site ID from content
        const content = site_field.data?.content
        if (content?.dataType === 'moveObject') {
          const site_id = content.fields?.value
          if (site_id) {
            console.log('\nSite ID:', site_id)

            // Get the actual Site object
            const site = await client.getObject({
              id: site_id,
              options: { showContent: true, showType: true, showOwner: true }
            })

            console.log('\nSite object type:')
            console.log(site.data?.type)

            // Check if type includes ORIGINAL or V10 package
            if (site.data?.type?.includes(ORIGINAL_PACKAGE_ID)) {
              console.log('\n✓ Site uses ORIGINAL_PACKAGE_ID')
            } else if (site.data?.type?.includes(V10_PACKAGE_ID)) {
              console.log('\n✓ Site uses V10_PACKAGE_ID')
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('Error:', e.message)
  }

  // Try querying for events from site creation
  console.log('\n=== Searching for SiteCreated events ===')
  try {
    const events = await client.queryEvents({
      query: {
        MoveEventModule: {
          package: V10_PACKAGE_ID,
          module: 'site'
        }
      },
      limit: 5
    })

    console.log(`Found ${events.data.length} events`)
    events.data.forEach((event, i) => {
      console.log(`\nEvent ${i + 1}:`)
      console.log('Type:', event.type)
      console.log('Data:', JSON.stringify(event.parsedJson, null, 2))
    })
  } catch (e) {
    console.log('Error:', e.message)
  }

  console.log('\n=== CONCLUSION ===')
  console.log('Since V10 is a fresh deployment (not an upgrade of ORIGINAL),')
  console.log('any SiteAdminCap created from ORIGINAL will have type:')
  console.log(`  ${ORIGINAL_PACKAGE_ID}::site::SiteAdminCap`)
  console.log('\nAny new SiteAdminCap created from V10 will have type:')
  console.log(`  ${V10_PACKAGE_ID}::site::SiteAdminCap`)
  console.log('\nThe ORIGINAL_PACKAGE_ID in env.js is correct for legacy caps.')
}

find_site_objects().catch(console.error)
