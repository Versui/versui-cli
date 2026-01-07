import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'

const VERSUI_REGISTRY_ID = '0x80ed579d585d60db342a9082b69671cbcd426acc8a96032fe923caba56b32ada'
const WALLET = '0x306e427a52f9bebf4533343f9af02f81bb2e41001f984bed4a2e58ddb254cab3'
const SITE_NAME = 'versui-app'

const client = new SuiClient({ url: getFullnodeUrl('testnet') })

async function main() {
  console.log('=== Checking Versui registry dynamic fields ===\n')

  // Query all dynamic fields on Versui registry
  const fields = await client.getDynamicFields({
    parentId: VERSUI_REGISTRY_ID,
  })

  console.log(`Found ${fields.data.length} dynamic fields on Versui registry\n`)

  // Look for fields related to versui-app
  const related = fields.data.filter(f => {
    const name_str = JSON.stringify(f.name)
    return name_str.includes('versui-app') || name_str.includes(WALLET.toLowerCase())
  })

  console.log(`Found ${related.length} fields related to versui-app or wallet:`)
  for (const field of related) {
    console.log(JSON.stringify(field, null, 2))
  }

  if (related.length === 0) {
    console.log('\nNo matching fields found. Showing all fields for inspection:')
    for (const field of fields.data.slice(0, 10)) {
      console.log(JSON.stringify(field, null, 2))
    }
  }
}

main().catch(console.error)
