# API Reference

Complete command reference for Versui CLI.

---

## Global Options

Available on all commands:

| Flag              | Description                        |
| ----------------- | ---------------------------------- |
| `--network <net>` | Sui network (`testnet`, `mainnet`) |
| `--help`          | Show command help                  |
| `--version`       | Show CLI version                   |

---

## `versui deploy <directory>`

Deploy static site to Walrus + Sui.

### Arguments

| Argument      | Description                   | Required |
| ------------- | ----------------------------- | -------- |
| `<directory>` | Path to static site directory | Yes      |

### Options

| Flag                | Description                                      | Default                             |
| ------------------- | ------------------------------------------------ | ----------------------------------- |
| `-e, --epochs <n>`  | Storage duration in epochs (1 epoch ≈ 24 hours)  | Prompted (1 if `-y`)                |
| `-n, --name <name>` | Site name (displayed in metadata)                | From package.json or directory name |
| `-s, --suins`       | Link SuiNS name during deployment                | Not linked                          |
| `-y, --yes`         | Skip all confirmation prompts (for CI/CD)        | `false`                             |
| `--json`            | Output JSON only (no interactive UI)             | `false`                             |
| `--custom-sw`       | Generate service worker snippet instead of files | `false`                             |

### Examples

```bash
# Interactive deploy with defaults
versui deploy ./dist

# Named site with extended storage
versui deploy ./dist --name "My Portfolio" --epochs 30

# CI/CD mode (non-interactive)
versui deploy ./dist --yes --json --network testnet

# Deploy with SuiNS name
versui deploy ./dist --suins mysite.sui
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
| `-e, --epochs <n>` | Storage epochs for new files | Prompted (1 if `-y`) |
| `-y, --yes`        | Skip confirmation prompts    | `false`  |
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

---

## `versui delete <site-ids...>`

Delete one or more sites.

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
```

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
```

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

---

## Configuration File

Create `.versui` at project root to customize behavior.

### Format

```json
{
  "name": "My Site Name",
  "aggregators": [
    "https://custom-aggregator.example.com",
    "https://backup-aggregator.example.com"
  ]
}
```

### Options

| Field         | Type       | Description                                           | Default |
| ------------- | ---------- | ----------------------------------------------------- | ------- |
| `name`        | `string`   | Default site name for deployments                     | -       |
| `aggregators` | `string[]` | Custom Walrus aggregator URLs (prepended to defaults) | `[]`    |

---

## Environment Variables

| Variable                       | Description                               |
| ------------------------------ | ----------------------------------------- |
| `VERSUI_PACKAGE_ID_TESTNET`    | Override Versui package ID (testnet)      |
| `VERSUI_PACKAGE_ID_MAINNET`    | Override Versui package ID (mainnet)      |
| `VERSUI_OBJECT_ID_TESTNET`     | Override registry object ID (testnet)     |
| `VERSUI_OBJECT_ID_MAINNET`     | Override registry object ID (mainnet)     |
| `DOMAIN_REGISTRY_ID_TESTNET`   | Override domain registry ID (testnet)     |
| `DOMAIN_REGISTRY_ID_MAINNET`   | Override domain registry ID (mainnet)     |

---

## Next Steps

- [Examples](./EXAMPLES.md) - Real-world usage patterns
- [Architecture](./ARCHITECTURE.md) - How it works under the hood
