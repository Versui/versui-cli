<p align="center">
  <img src="logo.png" alt="Versui Logo" width="200"/>
</p>
<h1 align="center">Versui CLI</h1>
<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/npm/v/@versui/cli?style=for-the-badge&logo=npm&logoColor=white" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge" />
</p>

```bash
npm i -g versui
versui deploy dist
```

**Versui CLI deploys static sites to Walrus decentralized storage.**

---

## Prerequisites

- Node.js 18+
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (`sui`)
- [Walrus CLI](https://docs.walrus.site/walrus-sites/tutorial-install.html) (`walrus`)
- WAL + SUI tokens (testnet faucet available)

---

## Deploy Your First Site

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

---

## List and Manage Sites

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

---

## Documentation

- **[Installation Guide](./docs/INSTALLATION.md)** - Detailed setup, prerequisites, Sui/Walrus CLI installation, troubleshooting
- **[API Reference](./docs/API.md)** - Complete CLI command reference, all options, flags, examples
- **[Examples](./docs/EXAMPLES.md)** - CI/CD integration, custom domains, SuiNS, multi-network deployments
- **[Architecture](./docs/ARCHITECTURE.md)** - Service worker internals, Walrus storage protocol, Sui blockchain integration, failover mechanisms

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, PR process, and coding standards.

---

## License

[Apache 2.0](LICENSE)

---

<div align="center">
  <sub>Decentralized static site hosting for the permanent web</sub>
</div>
