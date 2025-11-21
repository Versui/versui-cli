<div align="center">
  <img src="logo.png" alt="Versui Logo" width="200"/>

# Versui CLI

**Deploy static sites to Walrus decentralized storage with one command**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@versui/cli.svg)](https://www.npmjs.com/package/@versui/cli)

[Website](https://versui.app) • [Documentation](https://docs.versui.app) • [Discord](https://discord.gg/versui)

</div>

---

## Overview

Versui CLI deploys static websites to **Walrus** decentralized storage with **Sui** blockchain coordination. The killer feature: **auto-injected service workers** that make your site work offline and fetch content directly from Walrus nodes—no centralized server required after the first load.

### Why This Matters

**Traditional Web3 hosting** (IPFS, Arweave):

```
User → Gateway Server → Decentralized Storage
        ↑ (Single point of failure, can be shut down)
```

**Versui's offline-first approach**:

```
First visit:  User → Bootstrap HTML (2KB) → Service Worker installed
Second visit: User → Service Worker → Walrus directly (no server!)
```

After the first load, your site is **truly decentralized**:

- ✅ Works offline (cached in browser)
- ✅ Fetches directly from Walrus nodes (no portal dependency)
- ✅ Self-healing (SW retries failed requests across multiple nodes)
- ✅ Censorship-resistant (no single server to shut down)

### Key Features

- 🚀 **One-command deployment**: `versui deploy ./dist`
- 🔧 **Service worker magic**: Auto-injected, handles Walrus fetch + offline caching
- 🔒 **Decentralized**: Walrus (100+ nodes) + Sui blockchain (no SPOF)
- ⚡ **Offline-first**: Works without network after first load
- 🌐 **Self-hosting ready**: Download bootstrap, host anywhere (no platform needed)
- 📦 **No vendor lock-in**: You own the Sui object, content is yours forever

---

## Installation

```bash
npm install -g @versui/cli
```

**Requirements**:

- Node.js 18+
- Sui wallet (for testnet/mainnet deploys)

---

## Quick Start

### 1. Deploy your site

```bash
# Build your static site first
npm run build

# Deploy to Walrus
versui deploy ./dist
```

### 2. Access your site

```bash
✅ Site deployed!
   Object ID: 0xabc123...
   URL: https://5kc3x9m2p1.versui.app
```

### 3. (Optional) Link a SuiNS domain

```bash
versui domain link mysite.sui 0xabc123...
# Now accessible at: https://mysite.versui.app
```

---

## Commands

### `versui deploy <dir>`

Deploy a directory to Walrus.

**Options**:

- `-d, --domain <domain>` - Link to SuiNS domain
- `-e, --epochs <number>` - Storage duration in days (default: 365)
- `-o, --output <dir>` - Download bootstrap for self-hosting
- `--network <network>` - Sui network (testnet, mainnet)

**Example**:

```bash
# Deploy with custom domain
versui deploy ./dist --domain mysite.sui

# Deploy and download bootstrap for self-hosting
versui deploy ./dist --output ./bootstrap
```

---

### `versui list`

List your deployments.

```bash
versui list
```

**Output**:

```
Object ID          Domain              Deployed
0xabc123...        5kc3x9m2p1.versui.app    2025-01-19 12:00
0xdef456...        mysite.versui.app       2025-01-18 10:30
```

---

### `versui domain`

Manage custom domains (requires SuiNS ownership).

```bash
# Link SuiNS domain to deployment
versui domain link mysite.sui 0xabc123...

# Unlink domain
versui domain unlink mysite.sui
```

---

## Self-Hosting

Versui CLI generates a **bootstrap HTML** that you can host anywhere (no platform required).

```bash
# Deploy and download bootstrap
versui deploy ./dist --output ./bootstrap

# Host bootstrap on any static server
cd bootstrap
python -m http.server 8000

# Your site is now accessible at localhost:8000
# Service worker fetches content directly from Walrus
```

**Why this works**:

1. Bootstrap HTML registers a service worker
2. Service worker fetches site metadata from Sui
3. Service worker fetches content from Walrus
4. Site works offline after first load (cached in browser)

**No Versui platform needed** - you're fully independent.

---

## How It Works

### Architecture

```
1. versui deploy ./dist
   ↓
2. Upload files to Walrus (decentralized storage)
   ↓
3. Create Sui object (metadata: routes, resources, blob IDs)
   ↓
4. Generate bootstrap HTML (2KB file with service worker)
   ↓
5. Access via versui.app or self-host bootstrap
```

### Service Worker Magic

Versui auto-detects and handles existing service workers:

**Tier 1: No existing SW**
→ Auto-inject universal service worker (direct Walrus fetch)

**Tier 2: Workbox detected**
→ Auto-inject Workbox plugin (integrates with your PWA)

**Tier 3: Custom SW detected**
→ Portal fallback (provide manual integration guide)

---

## Configuration

Create a `versui.config.js` in your project root:

```javascript
export default {
  // Sui network
  network: 'testnet', // or 'mainnet'

  // Walrus aggregator
  aggregator: 'https://aggregator.walrus-testnet.walrus.space',

  // Storage duration
  epochs: 365,

  // Ignored files
  ignore: ['*.map', '*.DS_Store'],
}
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Development**:

```bash
# Clone repo
git clone https://github.com/Versui/versui-cli
cd versui-cli

# Install dependencies
npm install

# Run in dev mode
npm run dev

# Build
npm run build

# Test
npm test
```

---

## License

Apache 2.0 - see [LICENSE](LICENSE)

---

## Links

- [Versui Platform](https://versui.app) - Managed hosting with custom domains
- [Documentation](https://docs.versui.app)
- [Walrus](https://walrus.site) - Decentralized storage
- [Sui](https://sui.io) - Blockchain coordination
- [Discord](https://discord.gg/versui) - Community support

---

<div align="center">
  <sub>Built with ❤️ for the Web3 community</sub>
</div>
