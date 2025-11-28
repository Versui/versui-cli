# Architecture

Technical internals of Versui CLI.

---

## System Overview

```
┌─────────────┐
│  User CLI   │ versui deploy ./dist
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│           Versui CLI (Node.js)              │
│  ┌──────────────────────────────────────┐   │
│  │ 1. File Scanner                      │   │
│  │    - Read directory recursively      │   │
│  │    - MIME type detection             │   │
│  │    - .versuignore/.gitignore support │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ 2. Walrus Upload (SDK)               │   │
│  │    - @mysten/walrus client           │   │
│  │    - Encode blobs + upload to nodes  │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ 3. Sui Transaction Builder           │   │
│  │    - Create/update Site object       │   │
│  │    - Store file manifest             │   │
│  │    - Sign with local keys            │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ 4. Bootstrap Generator               │   │
│  │    - Generate index.html             │   │
│  │    - Generate sw.js (service worker) │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│        Walrus Decentralized Storage         │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│          Sui Blockchain (Metadata)          │
│  Site object: { name, routes, domains }     │
│  AdminCap: Ownership token for updates      │
└─────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── index.js                    # CLI entry point
├── commands/
│   ├── deploy.js              # Deploy command
│   ├── update.js              # Update command
│   ├── delete.js              # Delete site
│   ├── list.js                # List sites
│   ├── regenerate.js          # Regenerate bootstrap
│   ├── domain.js              # Domain management
│   ├── suins.js               # SuiNS integration
│   └── deploy/
│       ├── transaction.js     # Sui transaction building
│       ├── file-metadata.js   # File manifest prep
│       ├── walrus-info.js     # Epoch info fetching
│       ├── domain.js          # Domain validation
│       └── validate.js        # Input validation
└── lib/
    ├── walrus.js              # Walrus SDK wrapper
    ├── files.js               # File scanning/reading
    ├── bootstrap.js           # Bootstrap generation
    ├── sui.js                 # Sui client setup
    ├── config.js              # .versui config parsing
    ├── env.js                 # Environment detection
    ├── sw.js                  # Service worker generation
    ├── delta.js               # Delta detection (updates)
    ├── hash.js                # Content hashing
    ├── suins.js               # SuiNS resolution
    └── base36.js              # Base36 encoding
```

---

## Component Details

### 1. File Scanner (`src/lib/files.js`)

**Responsibilities:**

- Recursively traverse static site directory
- Detect MIME types (using `mime` library)
- Respect `.versuignore` or `.gitignore` patterns

**Key function:**

```javascript
scan_directory(dir, base_dir, ignore_patterns)
```

**Ignore patterns:**

- `.versuignore` takes precedence (if exists, `.gitignore` is ignored)
- Falls back to `.gitignore` if `.versuignore` doesn't exist
- Path traversal (`../`) rejected for security

---

### 2. Walrus Integration (`src/lib/walrus.js`)

**Implementation:**
Uses `@mysten/walrus` SDK (NOT subprocess/CLI).

**Key functions:**

- `create_walrus_client(network, sui_client)` - Initialize client
- `encode_files(walrus_client, files)` - Encode and get blob IDs
- `upload_files_to_nodes(walrus_client, files, blob_object_ids)` - Upload to storage nodes
- `download_blob(walrus_client, blob_id)` - Retrieve blob

**Storage epochs:**
| Network | epoch_duration_days | max_epochs |
|---------|---------------------|------------|
| mainnet | 14 | 53 |
| testnet | 1 | 53 |

_Source: `src/commands/deploy/walrus-info.js` (fallback values)_

---

### 3. Sui Blockchain Integration (`src/lib/sui.js`)

**Transaction flow:**

1. Encode files with Walrus SDK (get blob IDs)
2. Create/update Site object on Sui blockchain
3. Upload encoded blobs to Walrus storage nodes

**AdminCap:**
Ownership token issued on site creation, required for updates.

---

### 4. Bootstrap Generator

**Files generated:**

- `bootstrap/index.html` - Service worker registration page
- `bootstrap/sw.js` - Service worker that fetches from Walrus

**Service Worker:**

- Intercepts fetch requests
- Maps URL paths to Walrus blob IDs
- Fetches from Walrus aggregators with failover

---

## Data Flow

### Deploy Flow

```
versui deploy ./dist
       │
       ▼
1. Scan files (lib/files.js)
       │
       ▼
2. Encode files → get blob IDs (lib/walrus.js)
       │
       ▼
3. Create Site object on Sui (commands/deploy/transaction.js)
       │
       ▼
4. Upload encoded blobs to nodes (lib/walrus.js)
       │
       ▼
5. Generate bootstrap/ (lib/bootstrap.js, lib/sw.js)
```

---

### Update Flow

```
versui update ./dist
       │
       ▼
1. Fetch existing site manifest from Sui
       │
       ▼
2. Scan new files + detect changes (lib/delta.js)
       │
       ▼
3. Encode ONLY changed files
       │
       ▼
4. Update Site object on Sui (requires AdminCap)
       │
       ▼
5. Upload changed blobs to nodes
       │
       ▼
6. Regenerate bootstrap/
```

---

## Configuration

**`.versui` file (JSON):**

- `name` - Site name
- `aggregators` - Custom Walrus aggregator URLs
- Other site-specific settings

**`.versuignore` file:**

- Glob patterns of files to exclude from deployment
- Same format as `.gitignore`
- Takes precedence over `.gitignore`

---

## Security

**Key management:**

- Private keys stored in `~/.sui/sui_config/sui.keystore`
- Never transmitted over network
- Used locally to sign transactions

**Ownership verification:**

- AdminCap token required for site updates
- AdminCap references Site object ID
- Only AdminCap holder can modify site

---

## Limitations

**File size:**

- Walrus max blob size varies by network configuration
- CLI automatically handles chunking if needed

**Browser compatibility:**

- Service Worker required (Chrome 40+, Firefox 44+, Safari 11.1+, Edge 17+)
