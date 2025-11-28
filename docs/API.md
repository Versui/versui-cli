# API Reference

Complete command reference for VersUI CLI.

---

## Global Options

Available on all commands:

| Flag              | Description                        | Default   |
| ----------------- | ---------------------------------- | --------- |
| `--network <net>` | Sui network (`testnet`, `mainnet`) | `testnet` |
| `--help`          | Show command help                  | -         |
| `--version`       | Show CLI version                   | -         |

---

## `versui deploy <directory>`

Deploy static site to Walrus + Sui.

### Arguments

| Argument      | Description                   | Required |
| ------------- | ----------------------------- | -------- |
| `<directory>` | Path to static site directory | Yes      |

### Options

| Flag                | Description                                     | Default                             |
| ------------------- | ----------------------------------------------- | ----------------------------------- |
| `-e, --epochs <n>`  | Storage duration in epochs (1 epoch ≈ 24 hours) | `1`                                 |
| `-n, --name <name>` | Site name (displayed in metadata)               | From package.json or directory name |
| `-y, --yes`         | Skip all confirmation prompts (for CI/CD)       | `false`                             |
| `--json`            | Output JSON only (no interactive UI)            | `false`                             |

### Examples

```bash
# Interactive deploy with defaults
versui deploy ./dist

# Named site with extended storage
versui deploy ./dist --name "My Portfolio" --epochs 30

# CI/CD mode (non-interactive)
versui deploy ./dist --yes --json --network testnet

# Mainnet deploy with custom name
versui deploy ./build --network mainnet -n "Production Site" -e 365
```

### Output

**Interactive mode:**

- Beautiful terminal UI with progress indicators
- Wallet selection prompt
- Confirmation prompts for network/epochs
- Final URLs and site ID

**JSON mode** (`--json`):

```json
{
  "success": true,
  "siteId": "0x123abc...",
  "network": "testnet",
  "files": 42,
  "totalSize": "2.3 MB",
  "urls": [
    "https://123abc.walrus.site",
    "https://sui-testnet.walrus.site/site/123abc"
  ],
  "bootstrapPath": "./bootstrap"
}
```

---

## `versui update <directory>`

Update existing site with new/changed files (delta deployment).

### Arguments

| Argument      | Description                 | Required |
| ------------- | --------------------------- | -------- |
| `<directory>` | Path to updated static site | Yes      |

### Options

| Flag               | Description                  | Default  |
| ------------------ | ---------------------------- | -------- |
| `--site <id>`      | Site object ID to update     | Required |
| `-e, --epochs <n>` | Storage epochs for new files | `1`      |
| `--json`           | Output JSON only             | `false`  |

### Examples

```bash
# Update site (only uploads changed files)
versui update ./dist --site 0x123abc...

# Update with extended storage for new files
versui update ./dist --site 0x123abc... --epochs 10

# JSON output for CI/CD
versui update ./dist --site 0x123abc... --json --yes
```

### Behavior

- **Unchanged files**: Reused from existing site (no re-upload)
- **Modified files**: Detected via content hash, uploaded to Walrus
- **New files**: Uploaded to Walrus
- **Deleted files**: Removed from site manifest

**Requirements:**

- Must own the site's `AdminCap` object
- Active address must be the site creator

---

## `versui list`

List all sites deployed by active Sui address.

### Options

| Flag     | Description       | Default |
| -------- | ----------------- | ------- |
| `--json` | Output JSON array | `false` |

### Examples

```bash
# List sites on testnet
versui list

# List mainnet sites
versui list --network mainnet

# JSON output
versui list --json
```

### Output

**Interactive mode:**

```
Your Sites (testnet)
────────────────────────────────────────────
Name: My Portfolio
Site ID: 0x123abc...
Created: 2024-01-15 10:30:42
Files: 42
Size: 2.3 MB
URLs:
  - https://123abc.walrus.site
  - https://sui-testnet.walrus.site/site/123abc
────────────────────────────────────────────
```

**JSON mode:**

```json
[
  {
    "id": "0x123abc...",
    "name": "My Portfolio",
    "created": "2024-01-15T10:30:42Z",
    "files": 42,
    "size": 2415919,
    "urls": ["https://123abc.walrus.site"]
  }
]
```

---

## `versui delete <site-ids...>`

Delete one or more sites (including Walrus resources).

### Arguments

| Argument        | Description                 | Required |
| --------------- | --------------------------- | -------- |
| `<site-ids...>` | One or more site object IDs | Yes      |

### Options

| Flag        | Description              | Default |
| ----------- | ------------------------ | ------- |
| `-y, --yes` | Skip confirmation prompt | `false` |
| `--json`    | Output JSON              | `false` |

### Examples

```bash
# Delete single site (with confirmation)
versui delete 0x123abc...

# Delete multiple sites
versui delete 0x123abc... 0x456def... 0x789ghi...

# Skip confirmation (CI/CD)
versui delete 0x123abc... --yes

# Mainnet delete
versui delete 0x123abc... --network mainnet
```

### Behavior

**Deletion order:**

1. Deletes Walrus resource objects (files)
2. Deletes site metadata object
3. Removes bootstrap files (if present locally)

**Requirements:**

- Must own the site's `AdminCap`

---

## `versui regenerate <site-id>`

Regenerate bootstrap files (HTML + service worker) for existing site.

### Arguments

| Argument    | Description    | Required |
| ----------- | -------------- | -------- |
| `<site-id>` | Site object ID | Yes      |

### Examples

```bash
# Regenerate bootstrap (interactive prompt)
versui regenerate 0x123abc...

# Mainnet site
versui regenerate 0x123abc... --network mainnet
```

### Interactive Prompt

```
Choose bootstrap output:
  1. Full bootstrap (index.html + sw.js)
  2. Service worker snippet only
```

**Option 1**: Overwrites `bootstrap/` directory
**Option 2**: Outputs code snippet to integrate into existing SW

---

## `versui domain add <domain>`

Link custom domain to a site.

### Arguments

| Argument   | Description                         | Required |
| ---------- | ----------------------------------- | -------- |
| `<domain>` | Custom domain (e.g., `example.com`) | Yes      |

### Options

| Flag          | Description    | Default                 |
| ------------- | -------------- | ----------------------- |
| `--site <id>` | Site object ID | Prompts if not provided |
| `--json`      | Output JSON    | `false`                 |

### Examples

```bash
# Add domain (interactive site selection)
versui domain add example.com

# Add to specific site
versui domain add example.com --site 0x123abc...

# Mainnet domain
versui domain add example.com --site 0x123abc... --network mainnet
```

### DNS Configuration

After adding domain, configure DNS:

```
CNAME: example.com → versui.app
```

**Propagation time**: Up to 48 hours

---

## `versui domain remove <domain>`

Remove custom domain from a site.

### Arguments

| Argument   | Description      | Required |
| ---------- | ---------------- | -------- |
| `<domain>` | Domain to remove | Yes      |

### Options

| Flag          | Description    | Default                 |
| ------------- | -------------- | ----------------------- |
| `--site <id>` | Site object ID | Prompts if not provided |

### Examples

```bash
# Remove domain
versui domain remove example.com --site 0x123abc...
```

---

## `versui domain list`

List all custom domains across your sites.

### Examples

```bash
# List domains on testnet
versui domain list

# List mainnet domains
versui domain list --network mainnet --json
```

### Output

```
Custom Domains (testnet)
────────────────────────────────────────────
example.com → 0x123abc... (My Portfolio)
blog.example.com → 0x456def... (Blog Site)
────────────────────────────────────────────
```

---

## `versui suins add <name>`

Link SuiNS name (e.g., `mysite.sui`) to a site.

### Arguments

| Argument | Description                         | Required |
| -------- | ----------------------------------- | -------- |
| `<name>` | SuiNS name (with or without `.sui`) | Yes      |

### Options

| Flag          | Description    | Default                 |
| ------------- | -------------- | ----------------------- |
| `--site <id>` | Site object ID | Prompts if not provided |

### Examples

```bash
# Link SuiNS name (interactive site selection)
versui suins add mysite.sui

# Alternative format (@ prefix)
versui suins add @mysite

# Link to specific site
versui suins add mysite.sui --site 0x123abc...
```

**Requirements:**

- Must own the SuiNS name object
- Name must be registered and not expired

**Access site after linking:**

```
https://mysite.suins.site
```

---

## `versui suins list`

List all owned SuiNS names with linked site status.

### Examples

```bash
# List SuiNS names
versui suins list

# JSON output
versui suins list --json
```

### Output

```
Your SuiNS Names (testnet)
────────────────────────────────────────────
mysite.sui
  Linked: Yes (0x123abc... - My Portfolio)
  Expires: 2025-06-15

portfolio.sui
  Linked: No
  Expires: 2025-03-20
────────────────────────────────────────────
```

---

## Configuration File

Create `.versui` at project root to customize behavior.

### Format

```json
{
  "aggregators": [
    "https://custom-aggregator.example.com",
    "https://backup-aggregator.example.com"
  ]
}
```

### Options

| Field         | Type       | Description                                           | Default |
| ------------- | ---------- | ----------------------------------------------------- | ------- |
| `aggregators` | `string[]` | Custom Walrus aggregator URLs (prepended to defaults) | `[]`    |

**Custom aggregators**:

- Checked first (priority-based failover)
- Defaults still used as fallback

---

## Exit Codes

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| `0`  | Success                                      |
| `1`  | General error (validation, network, etc.)    |
| `2`  | Missing dependencies (`sui` or `walrus` CLI) |
| `3`  | Insufficient gas/tokens                      |
| `4`  | Permission denied (not site owner)           |
| `5`  | File system error                            |

---

## Environment Variables

| Variable          | Description                            | Default   |
| ----------------- | -------------------------------------- | --------- |
| `VERSUI_NETWORK`  | Default network (`testnet`, `mainnet`) | `testnet` |
| `VERSUI_EPOCHS`   | Default storage epochs                 | `1`       |
| `VERSUI_NO_COLOR` | Disable colored output                 | `false`   |

### Examples

```bash
# Override default network
export VERSUI_NETWORK=mainnet
versui deploy ./dist  # Uses mainnet

# CI/CD with no color
export VERSUI_NO_COLOR=1
versui deploy ./dist --yes --json
```

---

## Next Steps

- [Examples](./EXAMPLES.md) - Real-world usage patterns
- [Architecture](./ARCHITECTURE.md) - How it works under the hood
