# Architecture

Deep dive into VersUI's technical internals.

---

## System Overview

```
┌─────────────┐
│  User CLI   │ versui deploy ./dist
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│           VersUI CLI (Node.js)              │
│  ┌──────────────────────────────────────┐   │
│  │ 1. File Scanner                      │   │
│  │    - Read directory recursively      │   │
│  │    - Generate content hashes         │   │
│  │    - MIME type detection             │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ 2. Walrus Upload (via CLI)           │   │
│  │    - Invoke `walrus store-quilt`     │   │
│  │    - Get blob IDs                    │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ 3. Sui Transaction Builder           │   │
│  │    - Create Site object              │   │
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
│  100+ storage nodes (fault-tolerant)        │
│  Erasure coding: 2/3 availability guarantee │
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

## Component Deep Dive

### 1. File Scanner

**Responsibilities:**

- Recursively traverse static site directory
- Generate SHA-256 hashes for each file (content addressing)
- Detect MIME types (using `mime-types` library)
- Build file manifest (path → hash → MIME)

**Code location:** `src/scanner.js`

**Key logic:**

```javascript
async function scan_directory(dir) {
  const files = await fs.readdir(dir, { recursive: true })

  const manifest = {}
  for (const file of files) {
    const content = await fs.readFile(file)
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    const mime = mime.lookup(file) || 'application/octet-stream'

    manifest[file] = { hash, mime, size: content.length }
  }

  return manifest
}
```

**Delta detection (for updates):**

```javascript
function detect_changes(old_manifest, new_manifest) {
  const added = []
  const modified = []
  const deleted = []

  for (const [path, meta] of Object.entries(new_manifest)) {
    if (!old_manifest[path]) {
      added.push(path)
    } else if (old_manifest[path].hash !== meta.hash) {
      modified.push(path)
    }
  }

  for (const path of Object.keys(old_manifest)) {
    if (!new_manifest[path]) {
      deleted.push(path)
    }
  }

  return { added, modified, deleted }
}
```

---

### 2. Walrus Storage Integration

**Architecture:**

VersUI uses Walrus CLI as a subprocess (not direct SDK integration).

**Storage process:**

```javascript
async function upload_to_walrus(files, epochs) {
  // Invoke walrus CLI for each file
  for (const [path, content] of files) {
    const result = await exec(`walrus store-quilt --epochs ${epochs}`, {
      input: content,
    })

    // Parse blob ID from output
    const blob_id = extract_blob_id(result.stdout)

    file_to_blob[path] = blob_id
  }

  return file_to_blob
}
```

**Walrus Storage Properties:**

| Property      | Value                                               |
| ------------- | --------------------------------------------------- |
| Redundancy    | 2/3 erasure coding (67% node availability required) |
| Durability    | 99.999% (5 nines)                                   |
| Storage unit  | Epochs (1 epoch ≈ 24 hours)                         |
| Max file size | 13 MiB (Walrus limitation)                          |
| Network       | 100+ storage nodes (decentralized)                  |

**Blob ID format:**

```
blob_id: 32-byte hex string (content-addressed)
Example: 0xa3f5b8c9d2e1f4a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3
```

---

### 3. Sui Blockchain Integration

**Smart Contracts (Move):**

VersUI interacts with Sui Move contracts deployed at:

```
Package: 0xVERSUI_PACKAGE_ID (network-specific)
Modules: site, admin_cap, domain, suins
```

**Site Object Structure:**

```move
struct Site has key, store {
  id: UID,
  name: String,
  routes: Table<String, Route>,  // path → blob_id + mime
  created_at: u64,
  updated_at: u64,
  epochs: u64,
  domains: vector<String>,
  suins_name: Option<String>
}

struct Route has store {
  blob_id: vector<u8>,
  mime_type: String,
  size: u64
}

struct AdminCap has key, store {
  id: UID,
  site_id: ID  // References Site object
}
```

**Transaction Flow (Deploy):**

```javascript
async function create_site_on_sui(manifest, name, epochs) {
  const tx = new TransactionBlock()

  // Convert manifest to Move-compatible format
  const routes = Object.entries(manifest).map(([path, { blob_id, mime }]) => ({
    path,
    blob_id: Array.from(Buffer.from(blob_id, 'hex')),
    mime_type: mime,
  }))

  // Call Move function
  tx.moveCall({
    target: `${PACKAGE_ID}::site::create`,
    arguments: [tx.pure(name), tx.pure(routes), tx.pure(epochs)],
  })

  // Sign and execute
  const result = await signer.signAndExecuteTransactionBlock({
    transactionBlock: tx,
  })

  // Extract Site object ID from transaction result
  const site_id = result.objectChanges.find(c =>
    c.objectType.includes('Site'),
  ).objectId

  return site_id
}
```

**Transaction Flow (Update):**

```javascript
async function update_site(site_id, changes) {
  const tx = new TransactionBlock()

  // Load site object
  tx.moveCall({
    target: `${PACKAGE_ID}::site::update`,
    arguments: [
      tx.object(site_id),
      tx.object(admin_cap_id), // Prove ownership
      tx.pure(changes.added),
      tx.pure(changes.modified),
      tx.pure(changes.deleted),
    ],
  })

  await signer.signAndExecuteTransactionBlock({ transactionBlock: tx })
}
```

---

### 4. Bootstrap Generator

**Generated Files:**

**`bootstrap/index.html`:**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Loading...</title>
    <script>
      // Register service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(() => {
          window.location.reload()
        })
      } else {
        document.body.innerHTML =
          'Service Worker not supported. Use a modern browser.'
      }
    </script>
  </head>
  <body>
    Loading site from Walrus...
  </body>
</html>
```

**`bootstrap/sw.js`:**

```javascript
const SITE_ID = '0x123abc...'
const AGGREGATORS = [
  'https://aggregator.walrus.site',
  'https://fallback.walrus.site',
]

const ROUTES = {
  '/index.html': { blob: '0xa3f5...', mime: 'text/html' },
  '/style.css': { blob: '0xb2e4...', mime: 'text/css' },
}

// Install event
self.addEventListener('install', event => {
  self.skipWaiting()
})

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim())
})

// Fetch event with aggregator failover
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  const path = url.pathname === '/' ? '/index.html' : url.pathname

  if (!ROUTES[path]) {
    return event.respondWith(fetch(event.request))
  }

  const route = ROUTES[path]

  event.respondWith(fetch_from_walrus(route.blob, route.mime))
})

async function fetch_from_walrus(blob_id, mime_type) {
  let last_error

  for (const aggregator of AGGREGATORS) {
    try {
      const response = await fetch(`${aggregator}/v1/${blob_id}`, {
        headers: { Accept: mime_type },
      })

      if (response.ok) {
        return new Response(response.body, {
          headers: {
            'Content-Type': mime_type,
            'Cache-Control': 'public, max-age=31536000',
          },
        })
      }
    } catch (err) {
      last_error = err
      continue // Try next aggregator
    }
  }

  // All aggregators failed
  return new Response('Site temporarily unavailable', { status: 503 })
}
```

---

## Service Worker Deep Dive

### Request Flow

```
User navigates to https://example.com/about.html
       ▼
Service Worker intercepts fetch event
       ▼
Look up '/about.html' in ROUTES manifest
       ▼
Found: { blob: '0xabc...', mime: 'text/html' }
       ▼
Try primary aggregator:
  GET https://aggregator.walrus.site/v1/0xabc...
       ▼
If failed, try next aggregator (failover)
       ▼
Return response with correct Content-Type
       ▼
Browser renders HTML
```

---

### Failover Strategy

**Aggregator priority:**

1. **Custom aggregators** (from `.versui` config) - tried first
2. **Default aggregators** (built-in) - fallback

**Retry logic:**

```javascript
const RETRY_DELAYS = [1000, 2000, 5000, 10000] // Exponential backoff

async function fetch_with_retry(url, max_retries = 3) {
  for (let attempt = 0; attempt < max_retries; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch (err) {
      if (attempt < max_retries - 1) {
        await sleep(RETRY_DELAYS[attempt])
      }
    }
  }
  throw new Error('All retries failed')
}
```

---

### Expiry Handling

**When storage epochs expire:**

```javascript
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch_from_walrus(route.blob, route.mime).catch(err => {
      // Show expiry message
      return new Response(
        `
          <!DOCTYPE html>
          <html>
          <body>
            <h1>Site Storage Expired</h1>
            <p>This site's storage period has ended.</p>
            <p>Contact the site owner to extend storage.</p>
            <script>
              // Auto-retry every 60 seconds (in case renewed)
              setTimeout(() => location.reload(), 60000)
            </script>
          </body>
          </html>
        `,
        {
          headers: { 'Content-Type': 'text/html' },
        },
      )
    }),
  )
})
```

---

## Data Flow Diagrams

### Deploy Flow

```
┌──────────────┐
│ versui deploy│
└──────┬───────┘
       │
       ▼
┌────────────────────┐
│ 1. Scan ./dist     │
│    - List files    │
│    - Hash content  │
│    - Detect MIME   │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 2. Upload to Walrus│
│    (via walrus CLI)│
│    - Get blob IDs  │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 3. Create Site on  │
│    Sui blockchain  │
│    - Store manifest│
│    - Get AdminCap  │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 4. Generate        │
│    bootstrap/      │
│    - index.html    │
│    - sw.js         │
└────────────────────┘
```

---

### Update Flow

```
┌──────────────┐
│versui update │
└──────┬───────┘
       │
       ▼
┌────────────────────┐
│ 1. Fetch old       │
│    manifest from   │
│    Sui blockchain  │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 2. Scan new ./dist │
│    - Compare hashes│
│    - Find diffs    │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 3. Upload ONLY     │
│    changed files   │
│    to Walrus       │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 4. Update Site     │
│    object on Sui   │
│    (verify AdminCap│
│     ownership)     │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 5. Regenerate      │
│    bootstrap/      │
└────────────────────┘
```

---

## Security Model

### Key Management

**Private keys:**

- Stored in `~/.sui/sui_config/sui.keystore` (encrypted)
- Never transmitted over network
- Used locally to sign transactions

**Ownership verification:**

```javascript
// Only AdminCap holder can update site
async function verify_ownership(site_id, signer_address) {
  const admin_caps = await sui.getOwnedObjects({
    owner: signer_address,
    filter: { StructType: `${PACKAGE_ID}::admin_cap::AdminCap` },
  })

  const owns_site = admin_caps.some(
    cap => cap.data.content.fields.site_id === site_id,
  )

  if (!owns_site) {
    throw new Error('Not site owner (missing AdminCap)')
  }
}
```

---

### Content Addressing

**Why blob IDs are secure:**

- Blob ID = SHA-256 hash of content
- Impossible to serve different content for same blob ID
- Walrus nodes verify hash matches on retrieval
- Tampering detected immediately

---

### Decentralization Benefits

| Attack Vector          | Traditional Hosting                       | VersUI                                         |
| ---------------------- | ----------------------------------------- | ---------------------------------------------- |
| **Censorship**         | Single point of control (host can remove) | No single authority (100+ nodes)               |
| **Data loss**          | Single datacenter failure                 | Survives 67% node failure (2/3 erasure coding) |
| **Vendor lock-in**     | Proprietary APIs, migration friction      | Portable (bootstrap works anywhere)            |
| **Cost inflation**     | Recurring subscriptions, price hikes      | One-time epoch payment, predictable costs      |
| **Account suspension** | Host can ban account                      | Non-custodial (self-sovereign)                 |

---

## Performance Characteristics

### Deployment Times

| Metric                 | Value          |
| ---------------------- | -------------- |
| Small site (< 1 MB)    | ~10-15 seconds |
| Medium site (1-10 MB)  | ~30-60 seconds |
| Large site (10-100 MB) | ~2-5 minutes   |

**Bottlenecks:**

- Walrus upload (depends on file count + size)
- Sui transaction confirmation (~3 seconds)

---

### Update Times (Delta Deployments)

**Scenario:** Change 1 file in 100-file site

| Step                | Time            |
| ------------------- | --------------- |
| Hash comparison     | < 1 second      |
| Upload changed file | ~5 seconds      |
| Update transaction  | ~3 seconds      |
| **Total**           | **~10 seconds** |

**Savings:** 10 seconds vs 60+ seconds for full redeploy

---

### Runtime Performance

**Service worker overhead:**

- First load: ~500ms (register SW + reload)
- Subsequent loads: ~50ms (SW intercept)
- Cache hit: ~5ms (in-memory)

**Walrus aggregator response times:**

- Median: ~100-200ms
- P99: ~500ms
- Failover adds ~300ms per retry

---

## Limitations and Constraints

### File Size Limits

| Component       | Limit                              |
| --------------- | ---------------------------------- |
| Walrus max blob | 13 MiB per file                    |
| Sui transaction | 128 KB data per tx                 |
| Total site size | No hard limit (chunking supported) |

**Workaround for large files:**

```javascript
// CLI automatically chunks files > 13 MiB
async function upload_large_file(file) {
  const chunks = split_into_chunks(file, 12 * 1024 * 1024) // 12 MiB chunks

  const blob_ids = []
  for (const chunk of chunks) {
    const blob_id = await upload_to_walrus(chunk)
    blob_ids.push(blob_id)
  }

  // Store chunk manifest
  return { chunks: blob_ids, mime: file.mime }
}
```

---

### Browser Compatibility

**Service Worker support:**

| Browser | Version |
| ------- | ------- |
| Chrome  | 40+     |
| Firefox | 44+     |
| Safari  | 11.1+   |
| Edge    | 17+     |

**Fallback for unsupported browsers:**

```javascript
if (!('serviceWorker' in navigator)) {
  // Show error message
  document.body.innerHTML = `
    <h1>Browser Not Supported</h1>
    <p>Please use a modern browser (Chrome, Firefox, Safari 11+)</p>
  `
}
```

---

## Cost Analysis

### Storage Costs

**Walrus pricing (testnet estimates):**

| Duration            | Cost (WAL) |
| ------------------- | ---------- |
| 1 epoch (~24h)      | ~0.01 WAL  |
| 30 epochs (1 month) | ~0.30 WAL  |
| 365 epochs (1 year) | ~3.65 WAL  |

**Sui gas costs (mainnet estimates):**

| Operation   | Cost (SUI)  |
| ----------- | ----------- |
| Create site | ~0.001 SUI  |
| Update site | ~0.0005 SUI |
| Add domain  | ~0.0002 SUI |

**Example total cost (1-year 10 MB site):**

```
Storage: 3.65 WAL × $0.50 = $1.83
Gas: 0.001 SUI × $2.00 = $0.002
────────────────────────────
Total: ~$1.83 vs $20/month Vercel ($240/year)
```

---

## Next Steps

- [Installation Guide](./INSTALLATION.md) - Setup dependencies
- [API Reference](./API.md) - CLI command documentation
- [Examples](./EXAMPLES.md) - Real-world usage patterns
