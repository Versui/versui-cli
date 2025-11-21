# Versui CLI Specification

## Overview

Versui CLI deploys static sites to Walrus decentralized storage with Sui blockchain coordination. Core features include delta uploads, service worker generation, and self-hosting bootstrap creation.

## Architecture

### Storage Layer

Static files uploaded to Walrus, a decentralized storage network with 100+ nodes providing Byzantine fault-tolerant redundancy. Encoded blob size is approximately 5x original size due to erasure coding.

### Coordination Layer

Sui blockchain stores deployment metadata as on-chain objects using **derived objects** pattern (not dynamic fields).

**Site object:**

```move
struct Site has key, store {
  id: UID,
  name: String,
  resource_count: u64,
}
```

**Resource objects (derived from Site):**

```move
struct Resource has key, store {
  id: UID,
  site_id: ID,           // Parent site reference
  path: String,
  blob_id: u256,
  blob_hash: vector<u8>, // SHA-256 for authentication
  headers: vector<Header>,
  content_type: String,
  size: u64,
}
```

**Advantages of derived objects:**

- Independent resource queries (no need to load entire Site)
- Parallel fetching (concurrent resource loads)
- Content-type indexing (query all images, JS files, etc.)
- Efficient updates (update one resource without touching others)

### Access Layer

Service workers enable direct blob fetching from Walrus aggregators, offline operation with browser caching, and eliminate dependency on centralized portals.

## CLI Commands

### `versui deploy <dir>`

Deploy directory to Walrus with delta upload optimization.

**Options:**

- `-d, --domain <domain>` - Link to SuiNS domain
- `-e, --epochs <number>` - Storage duration in days (default: 365)
- `-o, --output <dir>` - Download bootstrap for self-hosting
- `--network <network>` - Sui network (testnet, mainnet)
- `--no-delta` - Force full upload (bypass delta detection)

**Process:**

1. Pre-flight checks: Validate directory, check wallet connection
2. Delta detection: Hash all files, compare with previous manifest, identify changes
3. Walrus upload: Upload only changed files with progress bar
4. Sui transaction: Create/update Site and Resource objects
5. Service worker generation: Auto-inject based on tier detection
6. Bootstrap creation: Generate self-contained 2KB HTML file
7. Content authentication: Store SHA-256 hash on-chain for each resource

### `versui list`

List all deployments owned by connected wallet.

**Output:**

```
Object ID          Domain                   Deployed
0xabc123...        mysite.versui.app       2025-01-20 12:00
```

### `versui domain`

Manage SuiNS domain linking.

**Subcommands:**

- `link <domain> <site-id>` - Link SuiNS domain to site
- `unlink <domain>` - Unlink domain

## Delta Updates

Content-addressed storage enables automatic deduplication:

**First deploy:**

```bash
versui deploy ./dist
→ Hash all files
→ Upload all files to Walrus
→ Create Site + Resource objects
→ Store manifest locally: ~/.versui/deployments/0xabc123/manifest-v1.json
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

**Manifest format:**

```json
{
  "version": 1,
  "site_id": "0xabc123...",
  "deployed_at": "2025-01-20T12:00:00Z",
  "resources": {
    "/index.html": {
      "hash": "abc123...",
      "blob_id": "blob_xyz",
      "size": 10240,
      "content_type": "text/html"
    }
  }
}
```

## Service Worker Strategies

### Tier 1: No Existing SW (Auto-inject)

Generate universal service worker that:

- Fetches Site object from Sui
- Queries Resource objects by path (derived object queries)
- Fetches blobs from Walrus aggregators
- Validates content against on-chain SHA-256 hashes
- Caches in browser (Cache API)
- Enables offline operation

**Detection:** No `service-worker.js` or SW registration in HTML

### Tier 2: Workbox Detected (Plugin)

**Status:** Not yet implemented. Will integrate with existing Workbox service workers via plugin.

**Detection:** `workbox-*.js` files or Workbox imports

### Tier 3: Custom SW (Manual Integration)

Provide integration guide for custom service workers.

**Detection:** Custom SW registration or non-Workbox SW files

## Content Authentication

Each resource's SHA-256 hash stored on-chain alongside blob metadata. Service workers validate fetched content against on-chain hashes before serving, detecting tampering by aggregators or caches.

**Process:**

1. During upload: Hash file content with SHA-256
2. Store hash in Resource object on Sui
3. Service worker: Fetch blob from Walrus
4. Service worker: Hash fetched content
5. Service worker: Compare with on-chain hash
6. If mismatch: Throw error, try different aggregator

## Bootstrap Generation

Generate self-contained 2KB HTML file with inline service worker:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Loading...</title>
  </head>
  <body>
    <div id="loading">Loading from Walrus...</div>
    <script>
      // Inline service worker registration
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
      }
    </script>
    <script>
      // Inline service worker code (embedded as data URI)
      const swCode = `
      const SITE_ID = '0xabc123...';
      const SUI_RPC = 'https://fullnode.mainnet.sui.io';
      const WALRUS_AGGREGATOR = 'https://aggregator.walrus.space';

      // Fetch Site + Resources from Sui
      // Fetch blobs from Walrus
      // Validate SHA-256 hashes
      // Cache in browser
    `
    </script>
  </body>
</html>
```

## Multi-RPC/Aggregator Pools

Automatic failover for 99.9% uptime:

**RPC pool (default):**

```javascript
const rpcPool = [
  'https://fullnode.mainnet.sui.io',
  'https://sui-mainnet.nodeinfra.com',
  'https://sui-mainnet-rpc.allthatnode.com',
]
```

**Aggregator pool (default):**

```javascript
const aggregatorPool = [
  'https://aggregator.walrus.space',
  'https://wal.app',
  'https://walrus-testnet-aggregator.nodes.guru',
]
```

**Retry logic:** Exponential backoff with automatic pool rotation on failure.

## Advanced Features

### Quilt Patches (Byte-Range Fetches)

**Status:** Not yet implemented. Will support partial blob fetching via Walrus quilt patches.

**Use case:** Large video files, progressive image loading

### Wildcard Routing

Longest-match resolution for SPA routing:

```javascript
{
  "/blog/*": "blog-template.html",
  "/blog/featured": "featured.html", // Takes priority
  "*": "index.html" // Catch-all
}
```

### Per-Resource Headers

Custom HTTP headers stored in Resource objects:

```javascript
{
  path: "/api/data.json",
  headers: [
    { key: "Content-Type", value: "application/json" },
    { key: "Cache-Control", value: "max-age=3600" }
  ]
}
```

### Site Redirects (NFT Use Cases)

Resource can redirect to another Site object via Display property.

**Use case:** NFT collections where each NFT has personalized site

## Storage Costs

**Walrus:** ~0.5 WAL tokens for 365 days (typical 10MB site, 5x encoded)

**Sui transactions:**

- `create_site`: ~0.001 SUI
- `add_resource` (per resource): ~0.001 SUI
- `update_resource`: ~0.001 SUI

**Cost optimization:**

- Delta updates: Only upload changed files (99% savings)
- Content-addressed deduplication
- Quilt patches for large files

## Configuration

Optional `versui.config.js` in project root:

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

## Implementation Notes

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

## Future Enhancements (Platform-Only)

### Deploy Previews (Seal Integration)

Platform feature using Sui Seal for authenticated previews:

```bash
# Platform dashboard only
versui deploy ./dist --preview --expires 7d
→ Creates Sealed<PreviewSite>
→ Share preview URL with team
→ Publish to production via dashboard
```

**Seal workflow:**

1. Deploy creates `Sealed<PreviewSite>` object
2. Generate preview token (signed by owner)
3. Service worker verifies Seal + token before serving
4. Auto-expire after specified duration
5. Publish unseals → creates public Site

**Use cases:**

- Team review before production
- Client approval workflows
- A/B testing different versions

### Private Sites

Platform feature for permanent private sites using Seal:

**Use cases:**

- Internal documentation
- Client-specific portals
- NFT-gated content
- Team collaboration spaces

## Testing Strategy

**Unit tests:** Test individual functions (hashing, delta detection, SW generation)

**Integration tests:** Test CLI commands against testnet

**No E2E tests:** Per project conventions, E2E reserved for future standalone user bot

## Security Considerations

**Content integrity:** SHA-256 validation prevents tampering

**Wallet security:** Never store private keys, use wallet extensions

**Secret detection:** Pre-commit hook blocks `.env`, `credentials.json`, etc.

## Success Metrics

**Technical:**

- Deploy in < 2 minutes
- First load < 3 seconds
- Cached load < 100ms
- 99.9% uptime (multi-RPC/aggregator resilience)

**Cost:**

- 99% savings on updates (delta uploads)
- No bandwidth costs (Walrus handles it)
