# Installation Guide

## Prerequisites

- **Node.js 18+**: Check with `node --version`
- **Sui CLI**: Install from [official sources](https://docs.sui.io/guides/developer/getting-started/sui-install)
- **Walrus CLI**: Install from [official sources](https://docs.walrus.site/walrus-sites/tutorial-install.html)

---

## Installing Versui CLI

### Global Installation (Recommended)

```bash
npm install -g @versui/cli
```

Verify installation:

```bash
versui --version
```

### Local Project Installation

```bash
npm install @versui/cli --save-dev
```

Run via npx:

```bash
npx versui deploy ./dist
```

---

## Verification

Ensure all dependencies are installed:

```bash
node --version      # v18.0.0+
versui --version    # Versui CLI
sui --version       # Sui CLI
walrus --version    # Walrus CLI
```

---

## Troubleshooting

### `versui: command not found`

Add npm global bin to PATH:

```bash
export PATH="$PATH:$(npm config get prefix)/bin"
source ~/.zshrc
```

### Permission denied when installing globally

Configure npm to use home directory:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH="$PATH:$HOME/.npm-global/bin"
npm install -g @versui/cli
```

---

## Uninstalling

```bash
npm uninstall -g @versui/cli
```

---

## Next Steps

- [API Reference](./API.md) - Learn all CLI commands
- [Examples](./EXAMPLES.md) - See real-world usage patterns
- [Architecture](./ARCHITECTURE.md) - Understand how it works
