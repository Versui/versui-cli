<p align="center">
  <img src="logo.png" alt="VersUI Logo" width="200"/>
</p>
<h1 align="center">VersUI CLI</h1>
<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/npm/v/@versui/cli?style=for-the-badge&logo=npm&logoColor=white" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge" />
</p>

---

## What This Does

VersUI lets you deploy websites that live forever without relying on any single company. Deploy once for $2-5/month, and your site stays online even if hosting companies disappear—your files are stored across 100+ independent nodes worldwide, with permanent records on blockchain. You control your keys, you control your site. No subscriptions, no vendor lock-in, no middleman who can take your site down.

Unlike traditional hosting (Vercel, Netlify, AWS) where you rent access and lose your site if you stop paying or they shut down, VersUI stores your files on decentralized infrastructure. Think of it like the difference between renting an apartment and owning property—except this property can't be seized or demolished.

## How It Works

**The Big Picture:**

Imagine a library with 100+ branches around the world. When you "publish" your website, VersUI splits your files into redundant pieces and distributes them across this global network (called Walrus). Even if 67 libraries close, your files can still be reassembled. The Sui blockchain acts as the permanent card catalog, recording what files exist and where to find them.

**The Process:**

1. **Upload files** → Your website files get split into chunks and distributed across Walrus storage nodes
2. **Register on blockchain** → Sui blockchain creates a permanent record (a "Site object") containing your file manifest and metadata
3. **Generate bootstrap** → You receive a tiny HTML file and service worker that know how to fetch your distributed files
4. **Host bootstrap anywhere** → Put those two small files on any basic hosting (even GitHub Pages), and they'll pull your actual site from the decentralized network

**Why this matters:**

- **Censorship-resistant**: No single entity controls your content
- **Persistent**: Files remain available as long as storage epochs are active (extendable)
- **Non-custodial**: Your private keys never leave your machine
- **Cost-effective**: ~$2-5/month vs $20+ for traditional hosting
- **Portable**: Move your bootstrap files anywhere, site keeps working

**Analogies:**

- **Traditional hosting** = Renting a billboard from one company (they own it, you pay monthly)
- **VersUI** = Buying a distributed network of billboards that you own the rights to

The service worker acts like a smart librarian—when someone visits your site, it knows which storage nodes to ask, handles failovers if some are down, and caches responses for speed.

## Quick Start

### Install

```bash
npm install -g @versui/cli
```

**Prerequisites:**

- Node.js 18+
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (`sui`)
- [Walrus CLI](https://docs.walrus.site/walrus-sites/tutorial-install.html) (`walrus`)
- WAL + SUI tokens (testnet faucet available)

### Deploy Your First Site

```bash
# Deploy static site (interactive)
versui deploy ./dist

# Skip prompts for CI/CD
versui deploy ./dist --yes --json

# Update existing site (only uploads changed files)
versui update ./dist --site 0xYOUR_SITE_ID
```

**Output:**

```
bootstrap/
├── index.html   # Loader that registers service worker
└── sw.js        # Fetches from Walrus network
```

Host `bootstrap/` anywhere (Vercel, Netlify, S3, GitHub Pages). Your site now loads from decentralized storage.

### List and Manage Sites

```bash
# List all your deployments
versui list

# Delete sites
versui delete <site-id>

# Add custom domain (requires DNS CNAME)
versui domain add example.com --site <site-id>

# Link SuiNS name (e.g., mysite.sui)
versui suins add mysite.sui --site <site-id>
```

## Documentation

- **[Installation Guide](./docs/INSTALLATION.md)** - Detailed setup, prerequisites, Sui/Walrus CLI installation, troubleshooting
- **[API Reference](./docs/API.md)** - Complete CLI command reference, all options, flags, examples
- **[Examples](./docs/EXAMPLES.md)** - CI/CD integration, custom domains, SuiNS, multi-network deployments
- **[Architecture](./docs/ARCHITECTURE.md)** - Service worker internals, Walrus storage protocol, Sui blockchain integration, failover mechanisms

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, PR process, and coding standards.

## License

[Apache 2.0](LICENSE)

---

<div align="center">
  <sub>Decentralized static site hosting for the permanent web</sub>
</div>
