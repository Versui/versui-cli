import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { deriveObjectID, normalizeSuiAddress } from '@mysten/sui/utils'
import { bcs } from '@mysten/sui/bcs'

const PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const VERSUI_REGISTRY_ID = '0x80ed579d585d60db342a9082b69671cbcd426acc8a96032fe923caba56b32ada'
const WALLET = '0x306e427a52f9bebf4533343f9af02f81bb2e41001f984bed4a2e58ddb254cab3'
const SITE_NAME = 'versui-app'
const NETWORK = 'testnet'

const client = new SuiClient({ url: getFullnodeUrl('testnet') })

// Derive expected Site ID using same logic as CLI
function derive_site_id(versui_object_id, owner_address, site_name) {
  const normalized_owner = normalizeSuiAddress(owner_address)
  const normalized_versui_id = normalizeSuiAddress(versui_object_id)

  const site_key_bcs = bcs.struct('SiteKey', {
    owner: bcs.Address,
    name: bcs.String,
  })

  const encoded_key = site_key_bcs
    .serialize({
      owner: normalized_owner,
      name: site_name,
    })
    .toBytes()

  const type_tag = `${PACKAGE_ID}::site::SiteKey`
  return deriveObjectID(normalized_versui_id, type_tag, encoded_key)
}

async function main() {
  console.log('=== Debug: versui-app site mystery ===\n')
  console.log('Config:')
  console.log('  Package:', PACKAGE_ID)
  console.log('  Registry:', VERSUI_REGISTRY_ID)
  console.log('  Wallet:', WALLET)
  console.log('  Site Name:', SITE_NAME)
  console.log()

  // Step 1: Derive expected Site ID
  const expected_site_id = derive_site_id(VERSUI_REGISTRY_ID, WALLET, SITE_NAME)
  console.log('Step 1: Expected Site ID (derived)')
  console.log('  ID:', expected_site_id)
  console.log()

  // Step 2: Check if Site exists on-chain
  console.log('Step 2: Check Site existence on-chain')
  try {
    const site = await client.getObject({
      id: expected_site_id,
      options: { showContent: true, showOwner: true },
    })

    if (site?.data) {
      console.log('  ✓ Site EXISTS')
      console.log('  Owner:', JSON.stringify(site.data.owner, null, 2))
      console.log('  Type:', site.data.type)
      console.log('  Content:', JSON.stringify(site.data.content, null, 2))
    } else {
      console.log('  ✗ Site does NOT exist (data is null)')
    }
  } catch (error) {
    console.log('  ✗ Site does NOT exist (error)')
    console.log('  Error:', error.message)
  }
  console.log()

  // Step 3: Check AdminCaps owned by wallet
  console.log('Step 3: Check AdminCaps owned by wallet')
  const admin_cap_type = `${PACKAGE_ID}::site::SiteAdminCap`
  const admin_caps = await client.getOwnedObjects({
    owner: WALLET,
    filter: { StructType: admin_cap_type },
    options: { showContent: true },
  })

  console.log(`  Found ${admin_caps.data.length} AdminCap(s)`)

  for (const cap of admin_caps.data) {
    if (cap.data?.content) {
      const { fields } = cap.data.content
      console.log('  -', {
        admin_cap_id: cap.data.objectId,
        site_id: fields.site_id,
        matches_expected: fields.site_id === expected_site_id,
      })
    }
  }
  console.log()

  // Step 4: If Site exists but no AdminCap, check Site owner
  console.log('Step 4: Alternative ownership check')
  try {
    const site = await client.getObject({
      id: expected_site_id,
      options: { showContent: true },
    })

    if (site?.data?.content) {
      const { fields } = site.data.content
      console.log('  Site fields:', JSON.stringify(fields, null, 2))

      // Check if there's an owner field in Site
      if (fields.owner) {
        console.log('  Site owner address:', fields.owner)
        console.log('  Matches wallet?:', fields.owner === WALLET)
      }
    }
  } catch (error) {
    console.log('  Could not fetch site details:', error.message)
  }
}

main().catch(console.error)
