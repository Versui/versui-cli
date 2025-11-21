<div align="center">
  <img src="logo.png" alt="Versui Logo" width="200"/>

# Versui CLI

**Deploy static sites to Walrus decentralized storage with Sui blockchain coordination**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## What is Versui?

Versui CLI deploys static websites to **Walrus** (decentralized storage with 100+ nodes using Byzantine fault-tolerant erasure coding) and stores metadata on **Sui** blockchain as on-chain objects.

**Key features:**

- One-command deployment with delta upload optimization (only upload changed files)
- Service worker auto-injection for offline-first operation
- Content authentication via SHA-256 hashes stored on-chain
- Self-hosting support (no platform lock-in)
- Multi-RPC/aggregator failover for 99.9% uptime

---

## Installation

```bash
npm install -g @versui/cli
```

**Requirements:**

- Node.js 18+
- Sui wallet (testnet or mainnet)

---

## Usage

### Deploy a static site

```bash
versui deploy <directory>
```

**Options:**

- `-d, --domain <domain>` - Link to SuiNS domain
- `-e, --epochs <number>` - Storage duration in days (default: 365)
- `-o, --output <dir>` - Download bootstrap HTML for self-hosting
- `--network <network>` - Sui network (testnet, mainnet)
- `--no-delta` - Force full upload (bypass delta detection)

**Example:**

```bash
# Deploy dist folder to testnet
versui deploy ./dist --network testnet

# Deploy with custom SuiNS domain
versui deploy ./dist --domain mysite.sui

# Deploy and download bootstrap for self-hosting
versui deploy ./dist --output ./bootstrap
```

### List deployments

```bash
versui list
```

### Manage domains

```bash
# Link SuiNS domain to deployment
versui domain link mysite.sui 0xabc123...

# Unlink domain
versui domain unlink mysite.sui
```

---

## How It Works

### Storage Layer

Static files are uploaded to **Walrus**, a decentralized storage network with:

- 100+ storage nodes
- Byzantine fault-tolerant redundancy
- Erasure coding (5x encoded size)
- Content-addressed deduplication

### Coordination Layer

Deployment metadata is stored on **Sui** blockchain using derived objects pattern:

**Site object:**

```move
struct Site has key, store {
  id: UID,
  name: String,
  resource_count: u64,
}
```

**Resource objects:**

```move
struct Resource has key, store {
  id: UID,
  site_id: ID,
  path: String,
  blob_id: u256,
  blob_hash: vector<u8>,  // SHA-256 for content authentication
  content_type: String,
  size: u64,
}
```

### Access Layer

Service workers enable:

- Direct blob fetching from Walrus aggregators
- Offline operation with browser caching
- Content authentication via on-chain SHA-256 validation
- No dependency on centralized portals

---

## Delta Updates

Only changed files are uploaded, reducing storage costs by 99% on updates:

**First deploy:**

```bash
versui deploy ./dist
→ Hash all files
→ Upload all files to Walrus
→ Create Site + Resource objects on Sui
→ Store manifest: ~/.versui/deployments/{objectId}/manifest-v1.json
```

**Update deploy:**

```bash
versui deploy ./dist
→ Hash all files
→ Compare with previous manifest
→ Upload only changed files (99% savings)
→ Update Resource objects for changed files
→ Reuse existing blobs for unchanged files
```

---

## Configuration

Create `versui.config.js` in your project root:

```javascript
export default {
  network: 'testnet',
  sui: {
    rpc: ['https://fullnode.mainnet.sui.io'],
  },
  walrus: {
    aggregators: ['https://aggregator.walrus.space'],
    epochs: 365,
  },
  ignore: ['*.map', '.DS_Store'],
  headers: {
    '*.html': {
      'Cache-Control': 'no-cache',
    },
    '*.js': {
      'Cache-Control': 'public, max-age=31536000',
    },
  },
}
```

### .versuignore

Create a `.versuignore` file to exclude files from deployment:

```
*.map
*.DS_Store
node_modules/
.git/
.env
```

---

## Self-Hosting

Versui generates a 2KB bootstrap HTML that you can host anywhere:

```bash
# Deploy and download bootstrap
versui deploy ./dist --output ./bootstrap

# Host bootstrap on any static server
cd bootstrap
python -m http.server 8000
```

The bootstrap HTML:

1. Registers a service worker
2. Service worker fetches site metadata from Sui
3. Service worker fetches content from Walrus
4. Site works offline after first load (cached in browser)

**No platform dependency** - you own the Sui object and can host the bootstrap anywhere.

---

## Development

```bash
# Clone repo
git clone https://github.com/Versui/versui-cli
cd versui-cli

# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Format code
npm run format

# Build
npm run build
```

---

## Architecture

**Language:** JavaScript + JSDoc (Node.js 18+)

**Dependencies:**

- `@mysten/sui.js` - Sui blockchain interaction
- `commander` - CLI framework
- `ora` - Loading spinners
- `chalk` - Terminal colors
- `prompts` - User prompts

**Project structure:**

```
src/
├── commands/
│   ├── deploy.js    # Deploy command
│   ├── list.js      # List command (placeholder)
│   └── domain.js    # Domain management (placeholder)
├── lib/
│   ├── walrus.js    # Walrus upload/download
│   ├── sui.js       # Sui transaction builder
│   ├── hash.js      # SHA-256 hashing
│   ├── delta.js     # Delta detection
│   ├── sw.js        # Service worker generation
│   └── bootstrap.js # Bootstrap HTML generation
└── index.js         # CLI entry point
```

---

## Storage Costs

**Walrus:** ~0.5 WAL tokens for 365 days (typical 10MB site, 5x encoded)

**Sui transactions:**

- `create_site`: ~0.001 SUI
- `add_resource` (per resource): ~0.001 SUI
- `update_resource`: ~0.001 SUI

**Cost optimization:**

- Delta updates: Only upload changed files (99% savings)
- Content-addressed deduplication
- Quilt patches for large files (planned)

---

## License

Apache 2.0 - see [LICENSE](LICENSE)

---

## Links

- [Walrus Documentation](https://docs.walrus.site)
- [Sui Documentation](https://docs.sui.io)
- [Versui Platform](https://versui.app) (planned)

---

<div align="center">
  <sub>Open source CLI for decentralized static site hosting</sub>
</div>
