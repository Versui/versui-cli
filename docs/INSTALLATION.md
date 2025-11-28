# Installation Guide

Complete setup instructions for VersUI CLI and its dependencies.

---

## Prerequisites

### Node.js 18+

Check your Node.js version:

```bash
node --version  # Should be v18.0.0 or higher
```

**Install Node.js:**

- **macOS**: `brew install node`
- **Linux**: [NodeSource distributions](https://github.com/nodesource/distributions)
- **Windows**: [nodejs.org downloads](https://nodejs.org/)

---

## Installing VersUI CLI

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

## Installing Sui CLI

Required for blockchain interactions (signing transactions, managing wallets).

### macOS/Linux (via Homebrew)

```bash
brew install sui
```

### Build from Source

```bash
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui
```

**Verify installation:**

```bash
sui --version
```

### Initial Sui Setup

Create your first address:

```bash
# Create new address (recommended: ed25519)
sui client new-address ed25519

# List all addresses
sui client addresses

# Check active address
sui client active-address

# Switch active address
sui client switch --address 0xYOUR_ADDRESS
```

**Get testnet tokens:**

```bash
# Request SUI testnet tokens
sui client faucet

# Check balance
sui client gas
```

---

## Installing Walrus CLI

Required for decentralized storage operations.

### Download Binary

**Latest release:**
[Walrus Installation Guide](https://docs.walrus.site/walrus-sites/tutorial-install.html)

**macOS (Apple Silicon):**

```bash
curl -LO https://storage.googleapis.com/mysten-walrus-binaries/walrus-latest-macos-arm64
chmod +x walrus-latest-macos-arm64
sudo mv walrus-latest-macos-arm64 /usr/local/bin/walrus
```

**macOS (Intel):**

```bash
curl -LO https://storage.googleapis.com/mysten-walrus-binaries/walrus-latest-macos-x86_64
chmod +x walrus-latest-macos-x86_64
sudo mv walrus-latest-macos-x86_64 /usr/local/bin/walrus
```

**Linux (x86_64):**

```bash
curl -LO https://storage.googleapis.com/mysten-walrus-binaries/walrus-latest-ubuntu-x86_64
chmod +x walrus-latest-ubuntu-x86_64
sudo mv walrus-latest-ubuntu-x86_64 /usr/local/bin/walrus
```

**Verify installation:**

```bash
walrus --version
```

### Get WAL Tokens (Testnet)

1. Get your Sui address: `sui client active-address`
2. Visit [Walrus Testnet Faucet](https://walrus.site/faucet)
3. Enter your address and request tokens

**Check WAL balance:**

```bash
sui client gas
# Look for WAL token objects
```

---

## Verification Checklist

Ensure all dependencies are installed:

```bash
# Node.js
node --version  # v18.0.0+

# VersUI CLI
versui --version

# Sui CLI
sui --version

# Walrus CLI
walrus --version

# Sui active address
sui client active-address

# Gas balance (SUI + WAL)
sui client gas
```

---

## Troubleshooting

### `versui: command not found`

**Cause**: npm global bin not in PATH

**Fix (macOS/Linux):**

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$PATH:$(npm config get prefix)/bin"
source ~/.zshrc
```

**Fix (Windows):**

Add `%APPDATA%\npm` to system PATH.

---

### `sui: command not found`

**Cause**: Sui CLI not in PATH

**Fix:**

```bash
# Find where cargo installed sui
which sui

# If in ~/.cargo/bin, add to PATH
export PATH="$PATH:$HOME/.cargo/bin"
source ~/.zshrc
```

---

### `walrus: command not found`

**Cause**: Walrus binary not in PATH

**Fix:**

```bash
# Move to /usr/local/bin (already in PATH)
sudo mv walrus /usr/local/bin/

# Or add custom location to PATH
export PATH="$PATH:/path/to/walrus/dir"
```

---

### `Insufficient gas for transaction`

**Cause**: Not enough SUI or WAL tokens

**Fix:**

```bash
# Get testnet SUI
sui client faucet

# Get testnet WAL
# Visit https://walrus.site/faucet with your Sui address
```

---

### `Error: No active address`

**Cause**: Sui wallet not initialized

**Fix:**

```bash
# Create new address
sui client new-address ed25519

# Verify active address
sui client active-address
```

---

### `Permission denied` when installing globally

**Cause**: npm permissions issue

**Fix (avoid sudo):**

```bash
# Configure npm to use home directory for globals
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'

# Add to PATH in ~/.zshrc
export PATH="$PATH:$HOME/.npm-global/bin"
source ~/.zshrc

# Reinstall VersUI
npm install -g @versui/cli
```

---

## Uninstalling

```bash
# Remove VersUI CLI
npm uninstall -g @versui/cli

# Remove Sui CLI
cargo uninstall sui
# or: brew uninstall sui

# Remove Walrus CLI
sudo rm /usr/local/bin/walrus
```

---

## Next Steps

- [API Reference](./API.md) - Learn all CLI commands
- [Examples](./EXAMPLES.md) - See real-world usage patterns
- [Architecture](./ARCHITECTURE.md) - Understand how it works
