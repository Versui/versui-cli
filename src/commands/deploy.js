import { existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import { join, relative } from 'node:path'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64, toBase64 } from '@mysten/sui/utils'
import chalk from 'chalk'
import gradient from 'gradient-string'
import figlet from 'figlet'
import prompts from 'prompts'
import logUpdate from 'log-update'

import { hash_content } from '../lib/hash.js'
import { scan_directory, get_content_type, read_file } from '../lib/files.js'
import { MIME_TYPES_BROWSER } from '../lib/mime-browser.js'
import { read_versui_config, get_aggregators } from '../lib/config.js'
import { detect_service_worker, generate_sw_snippet } from '../lib/sw.js'

const VERSUI_PACKAGE_IDS = {
  testnet: '0xda3719ae702534b4181c5f2ddf2780744ee512dae7a5b22bce6b5fda4893471b',
  mainnet: null, // TODO: Add mainnet package ID when deployed
}
const versui_gradient = gradient(['#00d4ff', '#00ffd1', '#7c3aed'])

// State for tracking progress
const state = {
  dir: null,
  network: null,
  epochs: null,
  wallet: null,
  files_count: 0,
  total_size: 0,
  walrus_cost: null,
  sui_cost: null,
  blob_id: null,
  site_id: null,
  step: 'init', // init, config, scan, walrus, sui, done
  spinner_text: null,
}

function format_bytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function render_header() {
  const logo = figlet.textSync('VERSUI', {
    font: 'Small',
    horizontalLayout: 'fitted',
  })
  return (
    versui_gradient(logo) +
    '\n' +
    chalk.dim('  Decentralized Site Hosting on Walrus + Sui')
  )
}

function render_state(include_header = false) {
  const lines = []

  // Header (only when requested)
  if (include_header) {
    lines.push('')
    lines.push(render_header())
    lines.push('')
  }

  // Config summary (after config step)
  if (state.network) {
    const config_items = []
    if (state.dir)
      config_items.push(`${chalk.dim('Dir:')} ${chalk.cyan(state.dir)}`)
    if (state.network)
      config_items.push(
        `${chalk.dim('Network:')} ${chalk.yellow(state.network)}`,
      )
    if (state.epochs)
      config_items.push(
        `${chalk.dim('Duration:')} ${chalk.yellow(state.epochs + ' epoch(s)')}`,
      )
    if (state.wallet)
      config_items.push(
        `${chalk.dim('Wallet:')} ${chalk.dim(state.wallet.slice(0, 10) + '...' + state.wallet.slice(-4))}`,
      )
    lines.push('  ' + config_items.join('  │  '))
    lines.push('')
  }

  // Progress steps
  const steps = [
    {
      id: 'scan',
      label: 'Scan files',
      done: state.files_count > 0,
      result:
        state.files_count > 0
          ? `${state.files_count} files (${format_bytes(state.total_size)})`
          : null,
    },
    {
      id: 'walrus',
      label: 'Upload to Walrus',
      done: !!state.blob_id,
      result: state.blob_id ? `Blob ${state.blob_id.slice(0, 12)}...` : null,
    },
    {
      id: 'sui',
      label: 'Create Site on Sui',
      done: !!state.site_id,
      result: state.site_id ? `Site ${state.site_id.slice(0, 12)}...` : null,
    },
  ]

  for (const step of steps) {
    const is_current = state.step === step.id
    const icon = step.done
      ? chalk.green('✓')
      : is_current
        ? chalk.yellow('●')
        : chalk.dim('○')
    const label = step.done
      ? chalk.dim(step.label)
      : is_current
        ? chalk.white(step.label)
        : chalk.dim(step.label)
    const result = step.result ? chalk.dim(` → ${step.result}`) : ''
    lines.push(`  ${icon} ${label}${result}`)
  }

  // Current action spinner
  if (state.spinner_text) {
    lines.push('')
    lines.push(`  ${chalk.cyan('⠋')} ${state.spinner_text}`)

    // Show progress bar if uploading
    if (state.upload_progress > 0) {
      const bar_width = 30
      const filled = Math.floor((state.upload_progress / 100) * bar_width)
      const empty = bar_width - filled
      const bar = chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(empty))
      lines.push(`      ${bar} ${state.upload_progress}%`)
    }
  }

  lines.push('')
  lines.push('')

  return lines.join('\n')
}

function update_display() {
  logUpdate(render_state())
}

function finish_display() {
  logUpdate.done()
}

function get_sui_active_address() {
  try {
    return execSync('sui client active-address', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

async function get_walrus_price_estimate(size_bytes, epochs) {
  try {
    const output = execSync('walrus info price --json', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const price_info = JSON.parse(output)
    const encoding = price_info.encodingDependentPriceInfo?.[0] || {}
    const metadata_price = encoding.metadataPrice || 9300000
    const marginal_price = encoding.marginalPrice || 900000
    const marginal_size = encoding.marginalSize || 1048576
    const size_units = Math.ceil(size_bytes / marginal_size)
    const total_mist = metadata_price + size_units * marginal_price
    return (total_mist * epochs) / 1_000_000_000
  } catch {
    return null
  }
}

async function get_sui_gas_estimate(tx_bytes, sui_client) {
  try {
    const dry_run = await sui_client.dryRunTransactionBlock({
      transactionBlock: tx_bytes,
    })
    const gas = dry_run.effects?.gasUsed
    if (gas) {
      const total =
        BigInt(gas.computationCost) +
        BigInt(gas.storageCost) -
        BigInt(gas.storageRebate)
      return Number(total) / 1_000_000_000
    }
  } catch {}
  return null
}

async function confirm_action(
  title,
  details,
  cost_label,
  cost_value,
  auto_yes,
) {
  if (auto_yes) return true

  finish_display()
  console.log('')
  console.log('')
  console.log(chalk.bold.yellow(`  ⚠  ${title}`))
  console.log('')
  for (const line of details) {
    console.log(chalk.dim(`     ${line}`))
  }
  if (cost_label && cost_value) {
    console.log('')
    console.log(
      `     ${chalk.dim(cost_label + ':')} ${chalk.yellow(cost_value)}`,
    )
  }
  console.log('')
  console.log('')

  const response = await prompts(
    {
      type: 'select',
      name: 'action',
      message: '  ',
      choices: [
        { title: chalk.red('  ✗ Cancel'), value: 'cancel' },
        { title: chalk.green('  ▶ Continue'), value: 'continue' },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        console.log(chalk.yellow('\n  Cancelled.\n'))
        process.exit(0)
      },
    },
  )

  console.log('')

  // Escape or cancel = exit
  if (!response.action || response.action === 'cancel') {
    console.log(chalk.yellow('  Cancelled.\n'))
    process.exit(0)
  }

  // Clear and redraw after confirmation
  console.clear()
  console.log('')
  console.log(render_header())
  console.log('')

  return true
}

export async function deploy(dir, options = {}) {
  const {
    json: json_mode = false,
    yes: auto_yes = false,
    customSw: force_custom_sw = false,
  } = options
  let { network, epochs } = options

  state.dir = dir

  // JSON mode - minimal output
  if (json_mode) {
    return deploy_json(dir, {
      network: network || 'testnet',
      epochs: epochs || 1,
    })
  }

  // Validate directory
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Invalid directory: ${dir}`)
  }

  // Read .versui config from project root (parent of dist dir)
  const project_dir = join(dir, '..')
  const versui_config = read_versui_config(project_dir)

  // Show header once
  console.log('')
  console.log(render_header())
  console.log('')

  const on_cancel = () => {
    console.log(chalk.yellow('\n  Cancelled.\n'))
    process.exit(0)
  }

  // Prompt network (or default for -y)
  if (!network) {
    if (auto_yes) {
      network = 'testnet'
    } else {
      const r = await prompts(
        {
          type: 'select',
          name: 'network',
          message: 'Select network',
          choices: [
            {
              title: chalk.yellow('Testnet') + chalk.dim(' (recommended)'),
              value: 'testnet',
            },
            { title: chalk.green('Mainnet'), value: 'mainnet' },
          ],
        },
        { onCancel: on_cancel },
      )
      if (!r.network) on_cancel()
      ;({ network } = r)
    }
  }
  state.network = network

  // Prompt epochs (or default for -y)
  if (!epochs) {
    if (auto_yes) {
      epochs = 1
    } else {
      const epoch_days = network === 'mainnet' ? 14 : 1
      const r = await prompts(
        {
          type: 'number',
          name: 'epochs',
          message: `Storage duration in epochs (1 epoch ≈ ${epoch_days} days)`,
          initial: 1,
          min: 1,
          max: 200,
        },
        { onCancel: on_cancel },
      )
      if (r.epochs === undefined) on_cancel()
      ;({ epochs } = r)
    }
  }
  state.epochs = epochs

  // Check prerequisites
  try {
    execSync('which walrus', { stdio: 'pipe' })
  } catch {
    throw new Error(
      'Walrus CLI not found. Install from: https://docs.walrus.site',
    )
  }
  try {
    execSync('which sui', { stdio: 'pipe' })
  } catch {
    throw new Error('Sui CLI not found. Install from: https://docs.sui.io')
  }

  state.wallet = get_sui_active_address()
  if (!state.wallet)
    throw new Error('No active Sui wallet. Run: sui client new-address ed25519')

  // Clear screen and show progress tracker
  console.clear()
  console.log('')
  console.log(render_header())
  console.log('')

  // Scan files
  state.step = 'scan'
  state.spinner_text = 'Scanning directory...'
  update_display()

  const file_paths = scan_directory(dir, dir)
  const file_metadata = {}

  for (const file_path of file_paths) {
    const rel_path = '/' + relative(dir, file_path).replace(/\\/g, '/')
    const content = read_file(file_path)
    const { size } = statSync(file_path)
    state.total_size += size
    file_metadata[rel_path] = {
      hash: hash_content(content),
      size,
      content_type: get_content_type(file_path),
    }
  }

  state.files_count = file_paths.length
  state.spinner_text = null
  update_display()

  // Get cost estimate
  state.walrus_cost = await get_walrus_price_estimate(state.total_size, epochs)

  // Confirm Walrus upload
  state.step = 'walrus'
  await confirm_action(
    'Upload to Walrus',
    [
      `${state.files_count} files (${format_bytes(state.total_size)})`,
      `Storage: ${epochs} epoch(s) on ${network}`,
      'Your wallet pays WAL tokens for storage.',
    ],
    'Estimated cost',
    state.walrus_cost ? `~${state.walrus_cost.toFixed(4)} WAL` : 'unknown',
    auto_yes,
  )

  // Upload to Walrus with progress tracking
  state.spinner_text = 'Uploading to Walrus...'
  state.upload_progress = 0
  update_display()

  const quilt_result = await upload_to_walrus_with_progress(
    dir,
    epochs,
    (progress, message) => {
      state.upload_progress = progress
      if (message) {
        state.spinner_text = `Uploading to Walrus... ${message}`
      }
      update_display()
    },
  )

  const blob_store = quilt_result.blobStoreResult
  state.blob_id =
    blob_store?.newlyCreated?.blobObject?.blobId ||
    blob_store?.alreadyCertified?.blobId
  const quilt_patches = quilt_result.storedQuiltBlobs || []

  state.spinner_text = null
  state.upload_progress = 0
  update_display()

  // Build transaction
  state.step = 'sui'
  state.spinner_text = 'Building transaction...'
  update_display()

  const rpc_url = getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet')
  const sui_client = new SuiClient({ url: rpc_url })

  const package_id = VERSUI_PACKAGE_IDS[network]
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network} yet`)
  }

  const tx = new Transaction()
  tx.setSender(state.wallet)

  const [site] = tx.moveCall({
    target: `${package_id}::site::create_site`,
    arguments: [tx.pure.string('Versui Site')],
  })

  // Build identifier -> full path mapping (walrus flattens paths)
  const identifier_to_path = {}
  for (const rel_path of Object.keys(file_metadata)) {
    const filename = rel_path.split('/').pop()
    identifier_to_path[filename] = rel_path
  }

  const resources = []
  for (const patch of quilt_patches) {
    const full_path =
      identifier_to_path[patch.identifier] || '/' + patch.identifier
    const info = file_metadata[full_path]
    if (!info) continue
    const [resource] = tx.moveCall({
      target: `${package_id}::site::create_resource`,
      arguments: [
        site,
        tx.pure.string(full_path),
        tx.pure.string(patch.quiltPatchId),
        tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
        tx.pure.string(info.content_type),
        tx.pure.u64(info.size),
      ],
    })
    resources.push(resource)
  }

  tx.transferObjects([site, ...resources], state.wallet)

  const tx_bytes = await tx.build({ client: sui_client })
  const tx_base64 = toBase64(tx_bytes)

  state.sui_cost = await get_sui_gas_estimate(tx_base64, sui_client)
  state.spinner_text = null
  update_display()

  // Confirm Sui transaction
  await confirm_action(
    'Create Site on Sui',
    [
      'Creates a Site object you own',
      `References ${quilt_patches.length} resources on Walrus`,
      'Your wallet pays SUI gas fees.',
    ],
    'Estimated gas',
    state.sui_cost ? `~${state.sui_cost.toFixed(6)} SUI` : '~0.01 SUI',
    auto_yes,
  )

  state.spinner_text = 'Executing transaction...'
  update_display()

  // Execute transaction
  let tx_result
  try {
    const output = execSync(`sui client serialized-tx ${tx_base64} --json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    tx_result = JSON.parse(output)
  } catch (err) {
    // Log orphaned blob for reference (walrus upload succeeded but sui tx failed)
    if (state.blob_id) {
      console.error(
        chalk.yellow(`\n  ⚠ Walrus blob uploaded but Sui tx failed.`),
      )
      console.error(chalk.yellow(`    Orphaned blob ID: ${state.blob_id}`))
      console.error(
        chalk.dim(`    (Blob will expire after ${epochs} epoch(s))`),
      )
    }
    throw new Error(`Transaction failed: ${err.stderr || err.message}`)
  }

  state.site_id =
    tx_result?.objectChanges?.find(
      c => c.type === 'created' && c.objectType?.includes('::site::Site'),
    )?.objectId || 'unknown'

  // Detect service worker in build (skip if --custom-sw flag)
  let sw_detection
  if (force_custom_sw) {
    sw_detection = { type: 'custom', path: null }
  } else {
    sw_detection = await detect_service_worker(dir)
  }

  // If no SW detected, ask user interactively
  if (sw_detection.type === 'none' && !auto_yes && !json_mode) {
    console.log('')
    console.log(
      chalk.yellow('⚠️  No service worker detected in build directory.'),
    )
    console.log('')
    console.log(
      chalk.dim('  Versui can generate a bootstrap for you, or you can'),
    )
    console.log(
      chalk.dim('  integrate manually if you have a custom service worker.'),
    )
    console.log('')

    const response = await prompts({
      type: 'confirm',
      name: 'has_custom_sw',
      message: 'Do you have a custom service worker?',
      initial: false,
    })

    if (response.has_custom_sw) {
      sw_detection = { type: 'custom', path: null }
    }
  }

  // Generate bootstrap (only if no SW detected and user didn't say they have one)
  if (sw_detection.type === 'none') {
    const index_patch = quilt_patches.find(p => p.identifier === 'index.html')
    if (!index_patch) throw new Error('No index.html found')

    const resource_map = {}
    for (const patch of quilt_patches) {
      const full_path =
        identifier_to_path[patch.identifier] || '/' + patch.identifier
      resource_map[full_path] = patch.quiltPatchId
    }

    const aggregators = get_aggregators(versui_config, network)
    const { html, sw } = generate_bootstrap(
      'Versui Site',
      aggregators,
      resource_map,
    )

    const bootstrap_dir = join(process.cwd(), 'bootstrap')
    if (existsSync(bootstrap_dir)) {
      console.log(chalk.yellow('  ⚠ bootstrap/ folder exists, overwriting...'))
    }
    mkdirSync(bootstrap_dir, { recursive: true })
    writeFileSync(join(bootstrap_dir, 'index.html'), html)
    writeFileSync(join(bootstrap_dir, 'sw.js'), sw)
  }

  state.step = 'done'
  state.spinner_text = null
  finish_display()

  // Final output - clear and show final state
  console.clear()
  console.log('')
  console.log(render_header())
  console.log('')
  console.log(render_state())
  console.log(chalk.green.bold('  ✓ Deployment complete!'))
  console.log('')
  console.log(`  ${chalk.dim('Site ID:')}     ${chalk.magenta(state.site_id)}`)
  console.log(`  ${chalk.dim('Blob ID:')}     ${chalk.magenta(state.blob_id)}`)

  if (sw_detection.type === 'none') {
    console.log(
      `  ${chalk.dim('Bootstrap:')}   ${chalk.cyan('./bootstrap/index.html')}`,
    )
    console.log('')
    console.log(
      chalk.dim(
        '  Host the bootstrap HTML anywhere to serve your site from Walrus.',
      ),
    )
  } else {
    // Build resource map for snippet
    /** @type {Object<string, string>} */
    const resource_map = {}
    for (const patch of quilt_patches) {
      const full_path =
        identifier_to_path[patch.identifier] || '/' + patch.identifier
      resource_map[full_path] = patch.quiltPatchId
    }

    const snippet = generate_sw_snippet(resource_map, sw_detection.path)

    console.log(
      `  ${chalk.dim('SW Detected:')} ${chalk.yellow(sw_detection.path)}`,
    )
    console.log('')
    console.log(chalk.green('  ✓ Service worker detected!'))
    console.log('')
    console.log(chalk.dim('  Install the Versui SW plugin:'))
    console.log('')
    console.log(chalk.cyan('    npm install @versui/sw-plugin'))
    console.log('')
    snippet.split('\n').forEach(line => {
      console.log(chalk.cyan(`  ${line}`))
    })
    console.log('')
    console.log(
      chalk.dim('  Docs: https://github.com/Versui/versui-sw-plugin#readme'),
    )
  }
  console.log('')
}

async function deploy_json(dir, options) {
  // Minimal JSON-only flow for scripts
  const { network, epochs } = options

  execSync('which walrus', { stdio: 'pipe' })
  execSync('which sui', { stdio: 'pipe' })

  const wallet = get_sui_active_address()
  if (!wallet) throw new Error('No wallet')

  const file_paths = scan_directory(dir, dir)
  const file_metadata = {}
  for (const fp of file_paths) {
    const rel = '/' + relative(dir, fp).replace(/\\/g, '/')
    const content = read_file(fp)
    file_metadata[rel] = {
      hash: hash_content(content),
      size: statSync(fp).size,
      content_type: get_content_type(fp),
    }
  }

  const walrus_output = execSync(
    `walrus store-quilt --paths "${dir}" --epochs ${epochs} --json`,
    {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  const quilt = JSON.parse(walrus_output)
  const blob_store = quilt.blobStoreResult
  const blob_id =
    blob_store?.newlyCreated?.blobObject?.blobId ||
    blob_store?.alreadyCertified?.blobId
  const patches = quilt.storedQuiltBlobs || []

  const sui_client = new SuiClient({
    url: getFullnodeUrl(network === 'mainnet' ? 'mainnet' : 'testnet'),
  })

  const package_id = VERSUI_PACKAGE_IDS[network]
  if (!package_id) {
    throw new Error(`Versui package not deployed on ${network} yet`)
  }

  const tx = new Transaction()
  tx.setSender(wallet)

  const [site] = tx.moveCall({
    target: `${package_id}::site::create_site`,
    arguments: [tx.pure.string('Versui Site')],
  })

  // Build identifier -> full path mapping (walrus flattens paths)
  const identifier_to_path = {}
  for (const rel_path of Object.keys(file_metadata)) {
    const filename = rel_path.split('/').pop()
    identifier_to_path[filename] = rel_path
  }

  for (const patch of patches) {
    const full_path =
      identifier_to_path[patch.identifier] || '/' + patch.identifier
    const info = file_metadata[full_path]
    if (!info) continue
    tx.moveCall({
      target: `${package_id}::site::create_resource`,
      arguments: [
        site,
        tx.pure.string(full_path),
        tx.pure.string(patch.quiltPatchId),
        tx.pure.vector('u8', Array.from(fromBase64(info.hash))),
        tx.pure.string(info.content_type),
        tx.pure.u64(info.size),
      ],
    })
  }

  tx.transferObjects([site], wallet)
  const tx_bytes = await tx.build({ client: sui_client })
  const tx_base64 = toBase64(tx_bytes)

  const exec_output = execSync(`sui client serialized-tx ${tx_base64} --json`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const result = JSON.parse(exec_output)

  const site_id = result?.objectChanges?.find(
    c => c.type === 'created' && c.objectType?.includes('::site::Site'),
  )?.objectId

  console.log(
    JSON.stringify({
      site_id,
      blob_id,
      patches: patches.length,
      tx_digest: result?.digest,
    }),
  )
}

function generate_bootstrap(site_name, aggregators, resource_map) {
  // XSS: escape for HTML context
  const escaped_html = site_name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const resources = JSON.stringify(resource_map)
  const agg_json = JSON.stringify(aggregators)

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaped_html}</title>
<style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#111;font-family:system-ui,sans-serif}.s{width:16px;height:16px;border:2px solid #333;border-top-color:#fff;border-radius:50%;animation:r .6s linear infinite}@keyframes r{to{transform:rotate(360deg)}}.e{text-align:center;max-width:400px;padding:2em}.e h1{color:#f97316;font-size:1.1em;margin:0 0 .4em;font-weight:500}.e p{color:#555;font-size:.75em;margin:0 0 1.2em;line-height:1.4}.retry{display:flex;align-items:center;justify-content:center;gap:6px;color:#333;font-size:.65em}.retry .s{width:10px;height:10px;border-width:1.5px}.nosw{color:#666;font-size:.8em;text-align:center;max-width:300px;line-height:1.5}</style>
</head>
<body>
<div class="s" id="l"></div>
<div class="e" id="err" style="display:none"><h1>Site Awaiting Renewal</h1><p>This site's storage has expired on Walrus. It will automatically load once the administrator renews it.</p><div class="retry"><div class="s"></div><span>Checking for renewal...</span></div></div>
<div class="nosw" id="nosw" style="display:none">Your browser doesn't support Service Workers.<br>Please use a modern browser to view this site.</div>
<script>
(()=>{
if(!('serviceWorker'in navigator)){document.getElementById('l').style.display='none';document.getElementById('nosw').style.display='block';return}
let d=5000;
const check=async()=>{try{
if(!navigator.serviceWorker.controller){await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;location.reload();return}
const i=await fetch('/index.html');if(!i.ok)throw new Error('expired');
const h=await i.text();document.open();document.write(h);document.close()
}catch(e){document.getElementById('l').style.display='none';document.getElementById('err').style.display='block';setTimeout(check,d);d=Math.min(d*1.5,60000)}};
check()})();
</script>
</body>
</html>`

  const sw = `const A=${agg_json},R=${resources};
const M=${JSON.stringify(MIME_TYPES_BROWSER)};
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  const p=new URL(e.request.url).pathname;
  const b=R[p];
  if(b)e.respondWith((async()=>{
    for(const a of A){try{const r=await fetch(a+'/v1/blobs/by-quilt-patch-id/'+b);if(r.ok){const ext=p.match(/\\.[^.]+$/)?.[0]||'';const type=M[ext]||'application/octet-stream';return new Response(await r.blob(),{headers:{'Content-Type':type}})}}catch(e){}}
    return new Response('expired',{status:404});
  })());
});`

  return { html, sw }
}

/**
 * Upload to Walrus with progress tracking
 * @param {string} dir - Directory to upload
 * @param {number} epochs - Storage duration
 * @param {Function} on_progress - Progress callback (progress: 0-100, message: string)
 * @returns {Promise<Object>} Quilt result
 */
async function upload_to_walrus_with_progress(dir, epochs, on_progress) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'walrus',
      ['store-quilt', '--paths', dir, '--epochs', String(epochs), '--json'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    let stdout_data = ''
    let stderr_data = ''
    let last_progress = 0

    child.stdout.on('data', chunk => {
      stdout_data += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr_data += chunk.toString()

      // Parse progress from walrus CLI stderr output
      // Walrus outputs progress like: "Uploading blob 1/5" or "Encoding blob 2/5"
      const match = stderr_data.match(
        /(Encoding|Uploading|Storing)\s+.*?(\d+)\/(\d+)/i,
      )
      if (match) {
        const current = parseInt(match[2], 10)
        const total = parseInt(match[3], 10)
        const progress = Math.floor((current / total) * 100)
        if (progress > last_progress) {
          last_progress = progress
          on_progress(progress, `${current}/${total}`)
        }
      }
    })

    child.on('error', err => {
      reject(new Error(`Failed to spawn walrus: ${err.message}`))
    })

    child.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(`Walrus upload failed: ${stderr_data || 'Unknown error'}`),
        )
        return
      }

      try {
        const result = JSON.parse(stdout_data)
        on_progress(100, 'Complete')
        resolve(result)
      } catch (err) {
        reject(new Error(`Failed to parse walrus output: ${err.message}`))
      }
    })
  })
}
