import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'

const client = new SuiClient({ url: getFullnodeUrl('testnet') })

const package_id =
  '0x833d7ed0610c60df9cc430079ec9c21ac1a35d576d1b81123b918bd85fd73333'
const settings_id =
  '0x8323eda9c72a824b89704e123ae2c32fb41f7e001822682879635e43a0016e7a'
const initial_shared_version = 663962635
const wallet =
  '0x306f6ea034cc73e45de1c0e5b86157ce1cb78350671cbc6bc9f3f7f19f799cf4'
const platform_fee = 100_000_000

console.log('Testing PREMIUM transaction...')

const tx = new Transaction()
tx.setSender(wallet)

// Split coin for platform fee
const [payment_coin] = tx.splitCoins(tx.gas, [tx.pure.u64(platform_fee)])

tx.moveCall({
  target: `${package_id}::site::create_site_with_domain`,
  arguments: [
    tx.pure.string('Premium Test'),
    tx.sharedObjectRef({
      objectId: settings_id,
      initialSharedVersion: initial_shared_version,
      mutable: true,
    }),
    payment_coin,
  ],
})

try {
  console.log('Building transaction...')
  const tx_bytes = await tx.build({ client })
  console.log('✓ Transaction built successfully')
  console.log('Bytes length:', tx_bytes.length)
} catch (error) {
  console.error('✗ Error:', error.message)
  console.error('Full error:', error)
}
