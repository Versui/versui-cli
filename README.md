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

Requires: Node.js 18+, sui CLI, walrus CLI

---

## Commands

```bash
# Deploy static site
versui deploy ./dist
versui deploy ./dist --yes --json

# Update existing site (only uploads changed files)
versui update ./dist --site 0xYOUR_SITE_ID

# List all your deployments
versui list

# Delete sites
versui delete <site-id>

# Regenerate bootstrap or service worker
versui regenerate <site-id>

# Custom domains
versui domain add example.com --site <site-id>
versui domain remove example.com --site <site-id>
versui domain list

# SuiNS names
versui suins add mysite.sui --site <site-id>
versui suins list
```

---

## Output

```
bootstrap/
├── index.html   # Loader that registers service worker
└── sw.js        # Fetches from Walrus network
```

Host `bootstrap/` anywhere (Vercel, Netlify, S3, GitHub Pages). Your site now loads from decentralized storage.

---

## License

[Apache 2.0](LICENSE)

---

<div align="center">
  <sub>Decentralized static site hosting for the permanent web</sub>
</div>
