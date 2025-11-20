import chalk from 'chalk'

export const domain = {
  async link(domainName: string, siteId: string) {
    console.log(chalk.gray(`Linking ${domainName} to ${siteId}...`))
    // TODO: Implement domain linking logic
    console.log(chalk.yellow('CLI implementation in progress'))
  },

  async unlink(domainName: string) {
    console.log(chalk.gray(`Unlinking ${domainName}...`))
    // TODO: Implement domain unlinking logic
    console.log(chalk.yellow('CLI implementation in progress'))
  },
}
