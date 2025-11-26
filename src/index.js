#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Command } from 'commander'
import chalk from 'chalk'

import { deploy } from './commands/deploy.js'
import { list } from './commands/list.js'
import { delete_site } from './commands/delete.js'
import { regenerate } from './commands/regenerate.js'

const current_dir = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(current_dir, '../package.json'), 'utf-8'),
)

function handle_error(error) {
  console.error('')
  console.error(chalk.red('  ✗ Error: ') + error.message)
  console.error('')
  process.exit(1)
}

const program = new Command()

program
  .name('versui')
  .description('Deploy static sites to Walrus decentralized storage')
  .version(pkg.version)

program
  .command('deploy')
  .description('Deploy site to Walrus + Sui (interactive)')
  .argument('<dir>', 'directory to deploy')
  .option('-e, --epochs <number>', 'storage duration in epochs')
  .option('--network <network>', 'sui network (testnet, mainnet)')
  .option('-n, --name <name>', 'site name (overrides .versui and package.json)')
  .option('-s, --suins <name>', 'Link SuiNS domain to deployed site')
  .option('-y, --yes', 'skip confirmations (for CI/scripts)')
  .option('--json', 'output JSON only (for scripts/services)')
  .option('--custom-sw', 'force plugin mode (skip SW auto-detection)')
  .action(async (dir, options) => {
    try {
      await deploy(dir, options)
    } catch (error) {
      handle_error(error)
    }
  })

program
  .command('list')
  .description('List your deployments')
  .option('--network <network>', 'sui network (testnet, mainnet)')
  .action(list)

program
  .command('delete')
  .description('Delete one or more site deployments')
  .argument('<site-ids...>', 'site object ID(s) to delete')
  .option('-y, --yes', 'skip confirmation prompt')
  .option('--network <network>', 'sui network (testnet, mainnet)')
  .action(delete_site)

program
  .command('regenerate')
  .description('Regenerate bootstrap or SW snippet for an existing site')
  .argument('<site-id>', 'site object ID')
  .option('--network <network>', 'sui network (testnet, mainnet)')
  .action(async (site_id, options) => {
    try {
      const result = await regenerate(site_id, options)

      console.log('')
      console.log(chalk.green('  ✓ Regenerated successfully!'))
      console.log('')
      console.log(chalk.dim('  Site:'), chalk.cyan(result.site_name))
      console.log('')

      if (result.output_type === 'bootstrap') {
        console.log(chalk.dim('  Bootstrap HTML:'))
        console.log('')
        console.log(result.bootstrap_html)
        console.log('')
        console.log(chalk.dim('  Service Worker:'))
        console.log('')
        console.log(result.bootstrap_sw)
      } else {
        console.log(chalk.dim('  SW Plugin snippet:'))
        console.log('')
        console.log(result.sw_snippet)
      }
      console.log('')
    } catch (error) {
      handle_error(error)
    }
  })

program.parse()
