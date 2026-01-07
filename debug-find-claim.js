import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { deriveObjectID, normalizeSuiAddress } from '@mysten/sui/utils'
import { bcs } from '@mysten/sui/bcs'

const PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const VERSUI_REGISTRY_ID = '0x80ed579d585d60db342a9082b69671cbcd426acc8a96032fe923caba56b32ada'
const WALLET = '0x306e427a52f9bebf4533343f9af02f81bb2e41001f984bed4a2e58ddb254cab3'
const SITE_NAME = 'versui-app'

const client = new SuiClient({ url: getFullnodeUrl('testnet') })

// Derive expected Site ID
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
  const expected_site_id = derive_site_id(VERSUI_REGISTRY_ID, WALLET, SITE_NAME)
  console.log('Expected Site ID:', expected_site_id)
  console.log()

  // Query all dynamic fields
  const fields = await client.getDynamicFields({
    parentId: VERSUI_REGISTRY_ID,
  })

  console.log(`Checking ${fields.data.length} claimed sites...`)
  console.log()

  // Check if our expected site ID matches any claimed site
  const match = fields.data.find(f => {
    const pos0 = f.name?.value?.pos0
    return pos0 && normalizeSuiAddress(pos0) === normalizeSuiAddress(expected_site_id)
  })

  if (match) {
    console.log('✓ FOUND MATCH!')
    console.log('This site HAS been claimed before (marker exists on-chain)')
    console.log()
    console.log('Claim details:')
    console.log(JSON.stringify(match, null, 2))
    console.log()
    console.log('Status object ID:', match.objectId)

    // Fetch the ClaimedStatus object to see if it has additional info
    const status_obj = await client.getObject({
      id: match.objectId,
      options: { showContent: true },
    })

    console.log()
    console.log('ClaimedStatus object:')
    console.log(JSON.stringify(status_obj, null, 2))
  } else {
    console.log('✗ No match found')
    console.log('This site has NOT been claimed before')
    console.log()
    console.log('First 5 claimed sites for reference:')
    for (const field of fields.data.slice(0, 5)) {
      console.log('  pos0:', field.name?.value?.pos0)
    }
  }
}

main().catch(console.error)
