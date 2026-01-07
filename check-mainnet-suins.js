// From @mysten/suins SDK constants (line 8-11 of constants.js)
const mainnet_package_id_v1 = '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0'
const testnet_package_id_v1 = '0x22fa05f21b1ad71442491220bb9338f7b7095fe35000ef88d5400d28523bdd93'

console.log('CORRECT Package IDs from @mysten/suins SDK:')
console.log('  Testnet:', testnet_package_id_v1)
console.log('  Mainnet:', mainnet_package_id_v1)
console.log('')

// What versui-cli is using (hardcoded, wrong)
const versui_cli_hardcoded = '0x22fa05f21b1ad71442571f3a9b954581d59c8d06ee20e828f8a4fdebe79ac716'
console.log('WRONG hardcoded in versui-cli/src/lib/suins.js:', versui_cli_hardcoded)
console.log('')

// What versui-platform is using
const versui_platform_testnet = '0x22fa05f21b1ad71442491220bb9338f7b7095fe35000ef88d5400d28523bdd93'
const versui_platform_mainnet = '0x22fa05f21b1ad71442571f3a9b954581d59c8d06ee20e828f8a4fdebe79ac716'
console.log('Versui platform config:')
console.log('  Testnet:', versui_platform_testnet, versui_platform_testnet === testnet_package_id_v1 ? '✓ CORRECT' : '✗ WRONG')
console.log('  Mainnet:', versui_platform_mainnet, versui_platform_mainnet === mainnet_package_id_v1 ? '✓ CORRECT' : '✗ WRONG')
