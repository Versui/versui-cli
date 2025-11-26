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

import { encode_base36 } from '../lib/base36.js'
import {
  read_versui_config,
  get_aggregators,
  get_site_name,
} from '../lib/config.js'
import { scan_directory, get_content_type, read_file } from '../lib/files.js'
import { generate_bootstrap } from '../lib/generate.js'
import { hash_content } from '../lib/hash.js'
import {
  get_owned_suins_names,
  link_suins_to_site,
  normalize_suins_name,
} from '../lib/suins.js'
import { detect_service_worker, generate_sw_snippet } from '../lib/sw.js'

import { build_files_metadata } from './deploy/file-metadata.js'
import { format_bytes, format_wallet_address } from './deploy/formatting.js'
import {
  build_identifier_map,
  create_site_transaction,
  add_resources_transaction,
} from './deploy/transaction.js'
import {
  validate_directory,
  check_prerequisites,
  get_prerequisite_error,
} from './deploy/validate.js'
import { get_epoch_info_with_fallback } from './deploy/walrus-info.js'

const VERSUI_PACKAGE_IDS = {
  testnet: '0x03ba7b9619c24fc18bb0b329886ae1a79a5ddb8f432a60f138dab770a9d0277d',
  mainnet: null, // TODO: Add mainnet package ID when deployed
}
const versui_gradient = gradient(['#00d4ff', '#00ffd1', '#7c3aed'])

// Spinner frames for animated loading indicator
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

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
  upload_progress: 0,
  spinner_frame: 0,
}

// format_bytes moved to ./deploy/formatting.js and imported above

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
        `${chalk.dim('Wallet:')} ${chalk.dim(format_wallet_address(state.wallet))}`,
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
    const spinner_char =
      SPINNER_FRAMES[state.spinner_frame % SPINNER_FRAMES.length]
    lines.push(`  ${chalk.cyan(spinner_char)} ${state.spinner_text}`)
  }

  lines.push('')
  lines.push('')

  return lines.join('\n')
}

function update_display() {
  state.spinner_frame++
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
    name: cli_site_name = null,
    suins: suins_flag = null,
  } = options
  let { network, epochs } = options

  state.dir = dir

  // JSON mode - minimal output
  if (json_mode) {
    return deploy_json(dir, {
      network: network || 'testnet',
      epochs: epochs || 1,
      name: cli_site_name,
    })
  }

  // Validate directory
  if (!validate_directory(dir)) {
    throw new Error(`Invalid directory: ${dir}`)
  }

  // Read .versui config from project root (parent of dist dir)
  const project_dir = join(dir, '..')
  const versui_config = read_versui_config(project_dir)

  // Read package.json from project root
  let package_json = null
  const package_json_path = join(project_dir, 'package.json')
  if (existsSync(package_json_path)) {
    try {
      package_json = JSON.parse(read_file(package_json_path).toString())
    } catch {
      // Ignore invalid package.json
    }
  }

  // Resolve site name with priority cascade
  let site_name = get_site_name({
    cli_name: cli_site_name,
    versui_config,
    package_json,
  })

  // If no name found and interactive mode, prompt for it
  if (site_name === 'Versui Site' && !auto_yes) {
    console.log('')
    const response = await prompts({
      type: 'text',
      name: 'site_name',
      message: 'Site name:',
      initial: 'Versui Site',
    })

    if (response.site_name && response.site_name.trim()) {
      site_name = response.site_name.trim()
    }
  }

  // Show header once
  console.log('')
  console.log(render_header())
  console.log('')

  // Start global spinner animation (update every 80ms for smooth animation)
  const spinner_interval = setInterval(() => {
    if (state.spinner_text) {
      update_display()
    }
  }, 80)

  const on_cancel = () => {
    clearInterval(spinner_interval)
    console.log(chalk.yellow('\n  Cancelled.\n'))
    process.exit(0)
  }

  try {
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
        // Get live epoch configuration from Walrus (or fallback to defaults)
        const { max_epochs } = get_epoch_info_with_fallback(network)
        const r = await prompts(
          {
            type: 'number',
            name: 'epochs',
            message: `Storage duration (epochs, max: ${max_epochs})`,
            initial: 1,
            min: 1,
            max: max_epochs,
          },
          { onCancel: on_cancel },
        )
        if (r.epochs === undefined) on_cancel()
        ;({ epochs } = r)
      }
    }
    state.epochs = epochs

    // Check prerequisites
    const prereqs = check_prerequisites()
    if (!prereqs.success) {
      const [first_missing] = prereqs.missing
      throw new Error(get_prerequisite_error(first_missing))
    }

    state.wallet = get_sui_active_address()
    if (!state.wallet)
      throw new Error(
        'No active Sui wallet. Run: sui client new-address ed25519',
      )

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
    const { metadata: file_metadata, total_size } = build_files_metadata(
      file_paths,
      dir,
    )

    state.files_count = file_paths.length
    state.total_size = total_size
    state.spinner_text = null
    update_display()

    // Get cost estimate
    state.walrus_cost = await get_walrus_price_estimate(
      state.total_size,
      epochs,
    )

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

    // === TRANSACTION 1: Create Site ===
    state.step = 'sui'
    state.spinner_text = 'Building create site transaction...'
    update_display()

    const rpc_url = getFullnodeUrl(
      network === 'mainnet' ? 'mainnet' : 'testnet',
    )
    const sui_client = new SuiClient({ url: rpc_url })

    const package_id = VERSUI_PACKAGE_IDS[network]
    if (!package_id) {
      throw new Error(`Versui package not deployed on ${network} yet`)
    }

    const tx1 = create_site_transaction({
      package_id,
      wallet: state.wallet,
      site_name,
    })

    const tx1_bytes = await tx1.build({ client: sui_client })
    const tx1_base64 = toBase64(tx1_bytes)

    state.sui_cost = await get_sui_gas_estimate(tx1_base64, sui_client)
    state.spinner_text = null
    update_display()

    // Confirm Sui transaction
    await confirm_action(
      'Create Site on Sui',
      [
        'Creates a Site object (shared)',
        'Returns AdminCap to your wallet',
        'Your wallet pays SUI gas fees.',
      ],
      'Estimated gas',
      state.sui_cost ? `~${state.sui_cost.toFixed(6)} SUI` : '~0.01 SUI',
      auto_yes,
    )

    // Execute transaction 1
    state.spinner_text = 'Creating site...'
    update_display()

    let tx1_result
    try {
      const output = execSync(`sui client serialized-tx ${tx1_base64} --json`, {
        encoding: 'utf8',
        stdio: ['inherit', 'pipe', 'pipe'],
      })
      tx1_result = JSON.parse(output)
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

    const site_obj = tx1_result?.objectChanges?.find(
      c => c.type === 'created' && c.objectType?.endsWith('::site::Site'),
    )
    const admin_cap_obj = tx1_result?.objectChanges?.find(
      c =>
        c.type === 'created' && c.objectType?.endsWith('::site::SiteAdminCap'),
    )

    if (!site_obj?.objectId || !admin_cap_obj?.objectId) {
      throw new Error(
        'Failed to extract Site ID or AdminCap ID from transaction',
      )
    }

    const site_id = site_obj.objectId
    const admin_cap_id = admin_cap_obj.objectId
    const initial_shared_version =
      site_obj.owner?.Shared?.initial_shared_version

    if (!initial_shared_version) {
      throw new Error(
        'Failed to extract initial_shared_version from Site object',
      )
    }

    state.site_id = site_id

    // === TRANSACTION 2: Add Resources ===
    // Stop spinner before building next transaction (prevents duplication with prompts)
    state.spinner_text = null
    update_display()

    // Build transaction (fast, no spinner needed)
    const tx2 = add_resources_transaction({
      package_id,
      wallet: state.wallet,
      admin_cap_id,
      site_id,
      initial_shared_version,
      quilt_patches,
      file_metadata,
    })

    const tx2_bytes = await tx2.build({ client: sui_client })
    const tx2_base64 = toBase64(tx2_bytes)

    const tx2_gas_cost = await get_sui_gas_estimate(tx2_base64, sui_client)

    // Confirm second transaction
    await confirm_action(
      'Add Resources to Site',
      [
        `Adds ${quilt_patches.length} resources to your site`,
        'References Walrus blob storage',
        'Your wallet pays SUI gas fees.',
      ],
      'Estimated gas',
      tx2_gas_cost ? `~${tx2_gas_cost.toFixed(6)} SUI` : '~0.01 SUI',
      auto_yes,
    )

    state.spinner_text = 'Adding resources...'
    update_display()

    // Execute transaction 2
    try {
      execSync(`sui client serialized-tx ${tx2_base64} --json`, {
        encoding: 'utf8',
        stdio: ['inherit', 'pipe', 'pipe'],
      })
    } catch (err) {
      throw new Error(`Transaction failed: ${err.stderr || err.message}`)
    }

    // Detect service worker in build (skip if --custom-sw flag)
    let sw_detection
    if (force_custom_sw) {
      sw_detection = { type: 'custom', path: null }
    } else {
      sw_detection = await detect_service_worker(dir)
    }

    // If no SW detected, ask user interactively
    if (sw_detection.type === 'none' && !auto_yes && !json_mode) {
      state.spinner_text = null
      update_display()
      finish_display() // Stop spinner before showing prompt
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
      const index_patch = quilt_patches.find(
        p => p.identifier === '/index.html',
      )
      if (!index_patch) throw new Error('No index.html found')

      const identifier_to_path = build_identifier_map(file_metadata)
      /** @type {Object<string, string>} */
      const resource_map = {}
      for (const patch of quilt_patches) {
        const normalized_identifier = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        const full_path =
          identifier_to_path[normalized_identifier] || normalized_identifier
        resource_map[full_path] = patch.quiltPatchId
      }

      const aggregators = get_aggregators(versui_config, network)
      const { html, sw } = generate_bootstrap(
        site_name,
        aggregators,
        resource_map,
      )

      const bootstrap_dir = join(process.cwd(), 'bootstrap')
      if (existsSync(bootstrap_dir)) {
        console.log(
          chalk.yellow('  ⚠ bootstrap/ folder exists, overwriting...'),
        )
      }
      mkdirSync(bootstrap_dir, { recursive: true })
      writeFileSync(join(bootstrap_dir, 'index.html'), html)
      writeFileSync(join(bootstrap_dir, 'sw.js'), sw)
    }

    state.step = 'done'
    state.spinner_text = null
    finish_display()

    // Stop spinner animation
    clearInterval(spinner_interval)

    // SuiNS domain linking (after successful deploy)
    let linked_suins_name = null
    const subdomain = encode_base36(site_id)

    /**
     * Execute SuiNS link transaction
     * @param {string} name - SuiNS name to link
     * @returns {Promise<boolean>} Success status
     */
    const execute_suins_link = async name => {
      const result = await link_suins_to_site(name, site_id)
      if (!result.success) {
        console.log(chalk.yellow(`  ⚠ Failed to link SuiNS: ${result.error}`))
        return false
      }

      // Build and execute the transaction
      try {
        result.transaction.setSender(state.wallet)
        const tx_bytes = await result.transaction.build({ client: sui_client })
        const tx_base64 = toBase64(tx_bytes)

        execSync(`sui client serialized-tx ${tx_base64} --json`, {
          encoding: 'utf8',
          stdio: ['inherit', 'pipe', 'pipe'],
        })
        return true
      } catch (err) {
        console.log(
          chalk.yellow(`  ⚠ Failed to execute SuiNS link: ${err.message}`),
        )
        return false
      }
    }

    if (suins_flag) {
      // Flag provided: link directly
      const normalized = normalize_suins_name(suins_flag)
      if (await execute_suins_link(normalized)) {
        linked_suins_name = normalized
      }
    } else if (!auto_yes && !json_mode) {
      // Interactive: check for owned names
      const owned_names = await get_owned_suins_names(state.wallet)

      if (owned_names.length > 0) {
        console.log('')
        const response = await prompts({
          type: 'select',
          name: 'selected',
          message: 'Link a SuiNS name to this site?',
          choices: [
            ...owned_names.map(name => ({ title: name, value: name })),
            { title: chalk.dim('Skip'), value: 'skip' },
          ],
        })

        if (response.selected && response.selected !== 'skip') {
          if (await execute_suins_link(response.selected)) {
            linked_suins_name = response.selected
          }
        }
      }
    }

    // Final output - clear and show final state
    console.clear()
    console.log('')
    console.log(render_header())
    console.log('')
    console.log(render_state())
    console.log(chalk.green.bold('  ✓ Deployment complete!'))
    console.log('')
    console.log(
      `  ${chalk.dim('Site ID:')}     ${chalk.magenta(state.site_id)}`,
    )
    console.log(
      `  ${chalk.dim('Blob ID:')}     ${chalk.magenta(state.blob_id)}`,
    )

    // Output URLs (base36 + SuiNS if linked)
    console.log(
      `  ${chalk.dim('URL:')}         ${chalk.cyan(`https://${subdomain}.versui.app`)}`,
    )
    if (linked_suins_name) {
      const suins_subdomain = linked_suins_name.replace('.sui', '')
      console.log(
        `  ${chalk.dim('SuiNS URL:')}   ${chalk.cyan(`https://${suins_subdomain}.versui.app`)}`,
      )
    }

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
      const identifier_to_path = build_identifier_map(file_metadata)
      /** @type {Object<string, string>} */
      const resource_map = {}
      for (const patch of quilt_patches) {
        const normalized_identifier = patch.identifier.startsWith('/')
          ? patch.identifier
          : '/' + patch.identifier
        const full_path =
          identifier_to_path[normalized_identifier] || normalized_identifier
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
  } catch (error) {
    // Clean up spinner on error
    clearInterval(spinner_interval)
    throw error
  }
}

async function deploy_json(dir, options) {
  // Minimal JSON-only flow for scripts
  const { network, epochs, name: cli_site_name = null } = options

  execSync('which walrus', { stdio: 'pipe' })
  execSync('which sui', { stdio: 'pipe' })

  const wallet = get_sui_active_address()
  if (!wallet) throw new Error('No wallet')

  // Read configs for site name resolution
  const project_dir = join(dir, '..')
  const versui_config = read_versui_config(project_dir)
  let package_json = null
  const package_json_path = join(project_dir, 'package.json')
  if (existsSync(package_json_path)) {
    try {
      package_json = JSON.parse(read_file(package_json_path).toString())
    } catch {
      // Ignore invalid package.json
    }
  }

  const site_name = get_site_name({
    cli_name: cli_site_name,
    versui_config,
    package_json,
  })

  const file_paths = scan_directory(dir, dir)
  const file_metadata = {}
  const blobs_args = []
  for (const fp of file_paths) {
    const rel = '/' + relative(dir, fp).replace(/\\/g, '/')
    const content = read_file(fp)
    file_metadata[rel] = {
      hash: hash_content(content),
      size: statSync(fp).size,
      content_type: get_content_type(fp),
    }
    // Build --blobs args with JSON format: {"path":"...", "identifier":"..."}
    const blob_spec = JSON.stringify({ path: fp, identifier: rel })
    blobs_args.push(`'${blob_spec}'`)
  }

  const walrus_output = execSync(
    `walrus store-quilt --blobs ${blobs_args.join(' ')} --epochs ${epochs} --json`,
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

  // === TRANSACTION 1: Create Site ===
  const tx1 = new Transaction()
  tx1.setSender(wallet)

  // create_site returns AdminCap to sender, creates shared Site
  tx1.moveCall({
    target: `${package_id}::site::create_site`,
    arguments: [tx1.pure.string(site_name)],
  })

  const tx1_bytes = await tx1.build({ client: sui_client })
  const tx1_base64 = toBase64(tx1_bytes)

  // Execute transaction 1 (sui client auto-signs and executes)
  const tx1_output = execSync(`sui client serialized-tx ${tx1_base64} --json`, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  const tx1_result = JSON.parse(tx1_output)

  // Extract Site ID and AdminCap ID from transaction effects
  const site_obj = tx1_result?.objectChanges?.find(
    c => c.type === 'created' && c.objectType?.includes('::site::Site'),
  )
  const admin_cap_obj = tx1_result?.objectChanges?.find(
    c => c.type === 'created' && c.objectType?.includes('::SiteAdminCap'),
  )

  if (!site_obj?.objectId || !admin_cap_obj?.objectId) {
    throw new Error('Failed to extract Site ID or AdminCap ID from transaction')
  }

  const site_id = site_obj.objectId
  const admin_cap_id = admin_cap_obj.objectId

  // === TRANSACTION 2: Add Resources ===
  // Build identifier -> full path mapping (with --blobs, identifier = full path)
  const identifier_to_path = {}
  for (const rel_path of Object.keys(file_metadata)) {
    identifier_to_path[rel_path] = rel_path
  }

  const tx2 = new Transaction()
  tx2.setSender(wallet)

  // Add all resources to the shared Site
  for (const patch of patches) {
    // Normalize identifier: ensure leading slash, no double slashes
    const normalized_identifier = patch.identifier.startsWith('/')
      ? patch.identifier
      : '/' + patch.identifier
    const full_path =
      identifier_to_path[normalized_identifier] || normalized_identifier
    const info = file_metadata[full_path]
    if (!info) continue

    tx2.moveCall({
      target: `${package_id}::site::add_resource`,
      arguments: [
        tx2.object(admin_cap_id), // AdminCap reference
        tx2.object(site_id), // Shared Site reference
        tx2.pure.string(full_path),
        tx2.pure.string(patch.quiltPatchId),
        tx2.pure.vector('u8', Array.from(fromBase64(info.hash))),
        tx2.pure.string(info.content_type),
        tx2.pure.u64(info.size),
      ],
    })
  }

  const tx2_bytes = await tx2.build({ client: sui_client })
  const tx2_base64 = toBase64(tx2_bytes)

  // Execute transaction 2 (sui client auto-signs and executes)
  const tx2_output = execSync(`sui client serialized-tx ${tx2_base64} --json`, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  const tx2_result = JSON.parse(tx2_output)

  const subdomain = encode_base36(site_id)
  const gateway_host = network === 'mainnet' ? 'walrus.site' : 'walrus.site'

  console.log(
    JSON.stringify({
      site_id,
      admin_cap_id,
      blob_id,
      subdomain,
      url: `https://${subdomain}.${gateway_host}`,
      patches: patches.length,
      tx1_digest: tx1_result?.digest,
      tx2_digest: tx2_result?.digest,
    }),
  )
}

/**
 * Upload to Walrus with progress tracking
 * @param {string} dir - Directory to upload
 * @param {number} epochs - Storage duration
 * @param {Function} on_progress - Progress callback (progress: 0-100, message: string)
 * @param {Function} spawn_fn - Spawn function (injectable for testing)
 * @returns {Promise<Object>} Quilt result
 */
async function upload_to_walrus_with_progress(
  dir,
  epochs,
  on_progress,
  spawn_fn = spawn,
) {
  return new Promise((resolve, reject) => {
    // Scan files and build --blobs args with JSON format
    const file_paths = scan_directory(dir, dir)
    const blobs_args = ['--blobs']
    for (const fp of file_paths) {
      const rel = '/' + relative(dir, fp).replace(/\\/g, '/')
      const blob_spec = JSON.stringify({ path: fp, identifier: rel })
      blobs_args.push(blob_spec)
    }

    const child = spawn_fn(
      'walrus',
      ['store-quilt', ...blobs_args, '--epochs', String(epochs), '--json'],
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
      // Track different stages: encoding -> storing -> retrieving status -> obtaining resources
      let progress = last_progress
      let message = null

      // Stage 1: Encoding (25%)
      if (stderr_data.includes('encoded sliver pairs and metadata')) {
        progress = 25
        message = 'Encoding...'
      }
      // Stage 2: Storing (50%)
      else if (
        stderr_data.includes('storing') &&
        stderr_data.includes('sliver')
      ) {
        progress = 50
        message = 'Storing...'
      }
      // Stage 3: Retrieving status (75%)
      else if (
        stderr_data.includes('retrieved') &&
        stderr_data.includes('blob statuses')
      ) {
        progress = 75
        message = 'Verifying...'
      }
      // Stage 4: Obtaining resources (90%)
      else if (stderr_data.includes('blob resources obtained')) {
        progress = 90
        message = 'Finalizing...'
      }

      if (progress > last_progress) {
        last_progress = progress
        on_progress(progress, message)
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

// Export testable functions (format_bytes moved to ./deploy/formatting.js)
export {
  get_sui_active_address,
  get_walrus_price_estimate,
  upload_to_walrus_with_progress,
  generate_bootstrap,
}
