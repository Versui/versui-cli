import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'

const network = 'testnet'
const client = new SuiClient({ url: getFullnodeUrl(network) })
const wallet_address = '0x306e427a52f9bebf4533343f9af02f81bb2e41001f984bed4a2e58ddb254cab3'

// CORRECT testnet package ID from @mysten/suins SDK
const correct_package_id = '0x22fa05f21b1ad71442491220bb9338f7b7095fe35000ef88d5400d28523bdd93'
const correct_type = `${correct_package_id}::suins_registration::SuinsRegistration`

// WRONG hardcoded package ID in versui code
const wrong_package_id = '0x22fa05f21b1ad71442571f3a9b954581d59c8d06ee20e828f8a4fdebe79ac716'
const wrong_type = `${wrong_package_id}::suins_registration::SuinsRegistration`

console.log('CORRECT type:', correct_type)
console.log('WRONG type:  ', wrong_type)
console.log('')

// Test with CORRECT type
console.log('Testing with CORRECT type...')
const { data: correct_objects } = await client.getOwnedObjects({
  owner: wallet_address,
  filter: { StructType: correct_type },
  options: { showContent: true },
})

console.log(`Found ${correct_objects.length} SuiNS NFTs with CORRECT type:`)
const now = Date.now()
for (const obj of correct_objects) {
  const { content } = obj.data ?? {}
  if (content?.dataType !== 'moveObject') continue
  const { domain_name, expiration_timestamp_ms: exp_ms } = content.fields ?? {}
  const expiration_timestamp_ms = Number(exp_ms ?? 0)
  const expired = expiration_timestamp_ms < now
  console.log(`  ✓ ${domain_name} (${expired ? 'EXPIRED' : 'active'})`)
}

// Test with WRONG type
console.log('')
console.log('Testing with WRONG type...')
const { data: wrong_objects } = await client.getOwnedObjects({
  owner: wallet_address,
  filter: { StructType: wrong_type },
  options: { showContent: true },
})

console.log(`Found ${wrong_objects.length} SuiNS NFTs with WRONG type`)
