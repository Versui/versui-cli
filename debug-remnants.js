#!/usr/bin/env node
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { execSync } from 'node:child_process'

// Get active address from Sui CLI
const address = execSync('sui client active-address', {
  encoding: 'utf-8',
}).trim()
const network = execSync('sui client active-env', { encoding: 'utf-8' }).trim()

console.log('Debug Info:')
console.log('  Network:', network)
console.log('  Address:', address)
console.log('')

// Create client
const client = new SuiClient({
  url: getFullnodeUrl(network),
})

// Original package ID used for type filtering
const ORIGINAL_PACKAGE_ID =
  '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const admin_cap_type = `${ORIGINAL_PACKAGE_ID}::site::SiteAdminCap`

console.log('Querying AdminCaps...')
console.log('  Type:', admin_cap_type)
console.log('')

try {
  const admin_caps = await client.getOwnedObjects({
    owner: address,
    filter: {
      StructType: admin_cap_type,
    },
    options: {
      showContent: true,
    },
  })

  console.log(`Found ${admin_caps.data.length} AdminCap(s)`)
  console.log('')

  for (const [i, item] of admin_caps.data.entries()) {
    console.log(`AdminCap #${i + 1}:`)
    console.log('  Object ID:', item.data?.objectId)
    console.log('  Content:', JSON.stringify(item.data?.content, null, 2))

    if (item.data?.content?.fields?.site_id) {
      const site_id = item.data.content.fields.site_id
      console.log('  Site ID:', site_id)

      // Try to fetch the Site object
      try {
        const site_obj = await client.getObject({
          id: site_id,
          options: {
            showContent: true,
          },
        })

        console.log('  Site Status:', site_obj.data ? 'EXISTS' : 'NOT FOUND')
        if (site_obj.data) {
          console.log(
            '  Site Content:',
            JSON.stringify(site_obj.data.content?.fields, null, 2),
          )
        } else {
          console.log('  ⚠️  REMNANT DETECTED - Site object does not exist!')
        }
      } catch (error) {
        console.log('  Site Fetch Error:', error.message)
        console.log('  ⚠️  REMNANT DETECTED - Failed to fetch Site!')
      }
    }
    console.log('')
  }

  // Also try to query ALL owned objects to see what types exist
  console.log('---')
  console.log('Checking all owned objects for debugging...')
  const all_objects = await client.getOwnedObjects({
    owner: address,
    options: {
      showType: true,
    },
  })

  const types = new Set()
  for (const obj of all_objects.data) {
    if (obj.data?.type) {
      types.add(obj.data.type)
    }
  }

  console.log(`Found ${all_objects.data.length} total objects`)
  console.log('Unique types:')
  for (const type of Array.from(types).sort()) {
    if (type.includes('SiteAdminCap') || type.includes('Site')) {
      console.log('  ⭐', type)
    } else {
      console.log('   ', type)
    }
  }
} catch (error) {
  console.error('Error:', error.message)
  process.exit(1)
}
