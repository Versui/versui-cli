#!/usr/bin/env node

import { Command } from 'commander'

import { deploy } from './commands/deploy.js'
import { list } from './commands/list.js'
import { domain } from './commands/domain.js'

const program = new Command()

program
  .name('versui')
  .description('Deploy static sites to Walrus decentralized storage')
  .version('0.1.0')

program
  .command('deploy')
  .description('Deploy a directory to Walrus')
  .argument('<dir>', 'directory to deploy')
  .option('-d, --domain <domain>', 'link to SuiNS domain')
  .option('-e, --epochs <number>', 'storage duration in days', '365')
  .option('-o, --output <dir>', 'download bootstrap for self-hosting')
  .option('--network <network>', 'sui network (testnet, mainnet)', 'testnet')
  .option('--no-delta', 'force full upload (bypass delta detection)')
  .action(deploy)

program.command('list').description('List your deployments').action(list)

program
  .command('domain')
  .description('Manage custom domains')
  .addCommand(
    new Command('link')
      .description('Link SuiNS domain to deployment')
      .argument('<domain>', 'SuiNS domain (e.g., mysite.sui)')
      .argument('<site-id>', 'Site object ID')
      .action(domain.link),
  )
  .addCommand(
    new Command('unlink')
      .description('Unlink SuiNS domain')
      .argument('<domain>', 'SuiNS domain')
      .action(domain.unlink),
  )

program.parse()
