import { bcs } from '@mysten/sui/bcs'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import crypto from 'crypto'

const PACKAGE_ID = '0xc3352e420352af5339cefd764c232e59553f02885628fdeb130e33cef7709ade'
const VERSUI_REGISTRY_ID = '0x80ed579d585d60db342a9082b69671cbcd426acc8a96032fe923caba56b32ada'
const WALLET = '0x306e427a52f9bebf4533343f9af02f81bb2e41001f984bed4a2e58ddb254cab3'
const SITE_NAME = 'versui-app'

// Define SiteKey struct
const site_key_bcs = bcs.struct('SiteKey', {
  owner: bcs.Address,
  name: bcs.String,
})

const normalized_owner = normalizeSuiAddress(WALLET)

// Encode the key
const encoded_key = site_key_bcs
  .serialize({
    owner: normalized_owner,
    name: SITE_NAME,
  })
  .toBytes()

console.log('Encoded SiteKey bytes:', Buffer.from(encoded_key).toString('hex'))

// Compute hash of encoded key (this might be what pos0 represents)
const hash = crypto.createHash('sha256').update(encoded_key).digest('hex')
console.log('SHA256 hash:', '0x' + hash)

// Try Blake2b (Sui uses this for some derivations)
const blake2b = crypto.createHash('blake2b512').update(encoded_key).digest('hex')
console.log('Blake2b hash:', '0x' + blake2b.substring(0, 64))

// Print the Site ID we expect
const { deriveObjectID } = await import('@mysten/sui/utils')
const normalized_versui_id = normalizeSuiAddress(VERSUI_REGISTRY_ID)
const type_tag = `${PACKAGE_ID}::site::SiteKey`
const site_id = deriveObjectID(normalized_versui_id, type_tag, encoded_key)

console.log('\nExpected Site ID:', site_id)
console.log('Normalized owner:', normalized_owner)
console.log('Site name:', SITE_NAME)
