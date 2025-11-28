<div align="center">
  <img src="logo.png" alt="Versui Logo" width="200"/>

# Versui CLI

**Deploy static sites to Walrus decentralized storage with Sui blockchain**

[![npm version](https://img.shields.io/npm/v/@versui/cli.svg?style=for-the-badge)](https://www.npmjs.com/package/@versui/cli)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## What is Versui?

Versui CLI deploys static websites to **Walrus** (decentralized storage with 100+ nodes) and stores metadata on **Sui** blockchain.

**Key features:**

- **Interactive CLI** - Beautiful UI with wallet selection and confirmations
- **Non-custodial** - Your keys never leave your machine
- **Service Worker bootstrap** - Generated files for self-hosting
- **Aggregator failover** - Multiple Walrus aggregators for reliability
- **Auto-retry on expiry** - Sites automatically retry when storage is restored

---

## Installation

```bash
npm install -g @versui/cli
```

**Requirements:**

- Node.js 18+
- Walrus CLI (`walrus`) - [Install from Walrus docs](https://docs.walrus.site/walrus-sites/tutorial-install.html)
- Sui CLI (`sui`) - [Install from Sui docs](https://docs.sui.io/guides/developer/getting-started/sui-install)
- WAL + SUI tokens for storage and gas fees

---

## Usage

### Manage Sui Accounts

VersUI uses your Sui CLI wallet. Switch accounts before deploying:

```bash
# List available addresses
sui client addresses

# Switch active address
sui client switch --address 0xYOUR_ADDRESS

# Or create new address
sui client new-address ed25519

# Check current active address
sui client active-address
```

### Deploy a static site

```bash
versui deploy <directory>
```

**Options:**

| Flag                | Description                    | Default           |
| ------------------- | ------------------------------ | ----------------- |
| `-e, --epochs <n>`  | Storage duration in epochs     | `1`               |
| `--network <net>`   | Sui network (testnet, mainnet) | `testnet`         |
| `-n, --name <name>` | Site name (metadata)           | From package.json |
| `-y, --yes`         | Skip confirmations (for CI)    | `false`           |
| `--json`            | Output JSON only (for scripts) | `false`           |

**Examples:**

```bash
# Interactive deploy
versui deploy ./dist

# Deploy with specific name
versui deploy ./dist --name "My Portfolio"

# CI/CD deploy (no prompts)
versui deploy ./dist -y --network testnet -e 5

# Get JSON output for scripting
versui deploy ./dist --json
```

### List deployments

```bash
# List all sites deployed by active address
versui list

# List sites on specific network
versui list --network mainnet
```

### Delete deployments

```bash
# Delete single site
versui delete <site-id>

# Delete multiple sites at once
versui delete <site-id-1> <site-id-2> <site-id-3>

# Skip confirmation prompt
versui delete <site-id> --yes
```

**Note:** Sites with resources are automatically cleaned up - resources are deleted first, then the site itself.

### Update existing site

Update an existing site with new files (incremental deployment):

```bash
versui update <directory> --site <site-id>
```

**Options:**

| Flag               | Description                    | Default   |
| ------------------ | ------------------------------ | --------- |
| `--site <id>`      | Site object ID to update       | Required  |
| `--network <net>`  | Sui network (testnet, mainnet) | `testnet` |
| `-e, --epochs <n>` | Storage epochs for new files   | `1`       |
| `--json`           | Output JSON only (for scripts) | `false`   |

**Examples:**

```bash
# Update site with new files
versui update ./dist --site 0xYOUR_SITE_ID

# Update on mainnet with extended storage
versui update ./dist --site 0xYOUR_SITE_ID --network mainnet -e 10

# JSON output for CI/CD
versui update ./dist --site 0xYOUR_SITE_ID --json
```

**Note:** Only added/updated/deleted files are uploaded. Unchanged files are reused. You must own the site's AdminCap to update.

### Regenerate bootstrap files

Regenerate bootstrap HTML and service worker for an existing site:

```bash
versui regenerate <site-id>
```

**Options:**

| Flag              | Description                    | Default   |
| ----------------- | ------------------------------ | --------- |
| `--network <net>` | Sui network (testnet, mainnet) | `testnet` |

**Example:**

```bash
# Regenerate bootstrap for a site
versui regenerate 0xYOUR_SITE_ID --network testnet
```

**Interactive prompt:** Choose between full bootstrap (HTML + SW) or SW snippet only.

### Custom domain management

Link custom domains to your sites:

```bash
# Add custom domain to a site
versui domain add <domain> --site <site-id>

# Remove custom domain
versui domain remove <domain> --site <site-id>

# List all domains across your sites
versui domain list
```

**Options:**

| Flag              | Description                    | Default   |
| ----------------- | ------------------------------ | --------- |
| `--site <id>`     | Site object ID (optional)      | Prompts   |
| `--network <net>` | Sui network (testnet, mainnet) | `testnet` |

**Examples:**

```bash
# Add domain (interactive site selection)
versui domain add example.com

# Add domain to specific site
versui domain add example.com --site 0xYOUR_SITE_ID

# List domains
versui domain list --network testnet
```

**Note:** After adding a domain, configure DNS CNAME to `versui.app`. DNS propagation may take up to 48 hours.

### SuiNS integration

Link SuiNS names (e.g., `mysite.sui`) to your sites:

```bash
# Link SuiNS name to a site
versui suins add <name> --site <site-id>

# List all owned SuiNS names with linked status
versui suins list
```

**Options:**

| Flag              | Description                      | Default   |
| ----------------- | -------------------------------- | --------- |
| `--site <id>`     | Site object ID (optional)        | Prompts   |
| `--network <net>` | Sui network (testnet, mainnet)   | `testnet` |

**Examples:**

```bash
# Link SuiNS name (interactive site selection)
versui suins add mysite.sui

# Link with @ prefix (equivalent)
versui suins add @mysite

# Link to specific site
versui suins add mysite.sui --site 0xYOUR_SITE_ID

# List all owned SuiNS names
versui suins list
```

**Note:** You must own the SuiNS name. After linking, access your site at `https://mysite.suins.site`.

---

## How It Works

### 1. Interactive Flow

```
versui deploy ./dist
  ↓
Select wallet from sui keytool
  ↓
Confirm network and epochs
  ↓
Upload files to Walrus (walrus store-quilt)
  ↓
Create Site object on Sui
  ↓
Generate bootstrap/ folder
  ↓
Done! Host bootstrap/ anywhere
```

### 2. Bootstrap Output

After deploy, you get a `bootstrap/` folder:

```
bootstrap/
├── index.html   # Loader that registers SW
└── sw.js        # Service Worker fetching from Walrus
```

Host these files anywhere (Vercel, Netlify, S3, IPFS) and your site loads from Walrus.

### 3. Service Worker Architecture

The SW intercepts requests and fetches from Walrus aggregators:

- **Multiple aggregators** - Failover if one is down
- **Exponential backoff** - Retries on failure (5s → 60s cap)
- **MIME type detection** - Correct Content-Type headers
- **Auto-recovery** - Sites reload when storage is restored after expiry

---

## Configuration

Create a `.versui` file at your project root to customize behavior:

```json
{
  "aggregators": ["https://my-custom-aggregator.example.com"]
}
```

Custom aggregators are prepended to defaults for priority-based failover.

---

## Custom Service Worker

Already have a service worker? Add Versui in 3 lines:

```js
import { create_versui_handler } from '@versui/sw-plugin'

const versui = create_versui_handler()
versui.load({ '/index.html': 'blob-id' }) // From deploy output
self.addEventListener('fetch', e => versui.handle(e))
```

[Full API docs →](https://github.com/Versui/versui-sw-plugin#readme)

---

## Error Handling

- **Missing walrus CLI** - Shows install instructions
- **Missing sui CLI** - Shows install instructions
- **Expired storage** - Bootstrap shows expiry message with auto-retry
- **No SW support** - Shows browser compatibility message

---

## Development

```bash
git clone https://github.com/Versui/versui-cli
cd versui-cli
npm install
npm run lint
npm test
```

---

## License

Apache 2.0

---

<div align="center">
  <sub>Open source CLI for decentralized static site hosting</sub>
</div>
