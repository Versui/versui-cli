# Examples

Real-world usage patterns for VersUI CLI.

---

## CI/CD Integration

### GitHub Actions (Deploy on Push)

**.github/workflows/deploy.yml**

```yaml
name: Deploy to VersUI

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build site
        run: npm run build

      - name: Install Sui CLI
        run: |
          cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui

      - name: Install Walrus CLI
        run: |
          curl -LO https://storage.googleapis.com/mysten-walrus-binaries/walrus-latest-ubuntu-x86_64
          chmod +x walrus-latest-ubuntu-x86_64
          sudo mv walrus-latest-ubuntu-x86_64 /usr/local/bin/walrus

      - name: Configure Sui Wallet
        run: |
          echo "${{ secrets.SUI_KEYSTORE }}" > ~/.sui/sui_config/sui.keystore
          echo "${{ secrets.SUI_CLIENT_CONFIG }}" > ~/.sui/sui_config/client.yaml

      - name: Install VersUI CLI
        run: npm install -g @versui/cli

      - name: Deploy to VersUI
        run: versui deploy ./dist --yes --json --network testnet -e 30
```

**Secrets to configure:**

- `SUI_KEYSTORE`: Contents of `~/.sui/sui_config/sui.keystore`
- `SUI_CLIENT_CONFIG`: Contents of `~/.sui/sui_config/client.yaml`

---

### GitLab CI

**.gitlab-ci.yml**

```yaml
stages:
  - build
  - deploy

build:
  stage: build
  image: node:18
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/

deploy:
  stage: deploy
  image: node:18
  dependencies:
    - build
  before_script:
    # Install Sui CLI
    - apt-get update && apt-get install -y curl build-essential
    - curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    - source $HOME/.cargo/env
    - cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui

    # Install Walrus CLI
    - curl -LO https://storage.googleapis.com/mysten-walrus-binaries/walrus-latest-ubuntu-x86_64
    - chmod +x walrus-latest-ubuntu-x86_64
    - mv walrus-latest-ubuntu-x86_64 /usr/local/bin/walrus

    # Configure Sui wallet
    - mkdir -p ~/.sui/sui_config
    - echo "$SUI_KEYSTORE" > ~/.sui/sui_config/sui.keystore
    - echo "$SUI_CLIENT_CONFIG" > ~/.sui/sui_config/client.yaml

    # Install VersUI
    - npm install -g @versui/cli
  script:
    - versui deploy ./dist --yes --json --network testnet
  only:
    - main
```

---

### Update Existing Site (CI/CD)

**Workflow for incremental deployments:**

```yaml
- name: Update VersUI Site
  run: |
    versui update ./dist \
      --site ${{ secrets.VERSUI_SITE_ID }} \
      --network mainnet \
      --yes \
      --json
```

**Benefits:**

- Only uploads changed files (faster deploys)
- Reuses existing Walrus blobs for unchanged content
- Lower gas costs

---

## Custom Domains

### Full Domain Setup Flow

**1. Deploy site:**

```bash
versui deploy ./dist --network mainnet -e 365 --name "Production Site"
# Note the site ID: 0x123abc...
```

**2. Add domain to site:**

```bash
versui domain add example.com --site 0x123abc... --network mainnet
```

**3. Configure DNS:**

At your domain registrar (Cloudflare, GoDaddy, etc.):

```
Type: CNAME
Name: @ (or www)
Target: versui.app
TTL: Auto
```

**4. Verify:**

```bash
# Check DNS propagation
dig example.com CNAME

# Test site access
curl -I https://example.com
```

**Propagation time:** Up to 48 hours

---

### Multiple Subdomains

```bash
# Deploy site once
versui deploy ./dist --network mainnet -e 365
# Site ID: 0x123abc...

# Add multiple domains
versui domain add www.example.com --site 0x123abc...
versui domain add blog.example.com --site 0x123abc...
versui domain add docs.example.com --site 0x123abc...

# Each domain serves the same content from Walrus
```

---

## SuiNS Integration

### Register and Link SuiNS Name

**1. Register SuiNS name** (external):

Visit [suins.io](https://suins.io) and register `mysite.sui`

**2. Deploy site:**

```bash
versui deploy ./dist --network mainnet -e 365
# Site ID: 0x123abc...
```

**3. Link SuiNS name:**

```bash
versui suins add mysite.sui --site 0x123abc... --network mainnet
```

**4. Access site:**

```
https://mysite.suins.site
```

---

### List All SuiNS Names

```bash
versui suins list --network mainnet
```

**Output:**

```
Your SuiNS Names (mainnet)
────────────────────────────────────────────
mysite.sui
  Linked: Yes (0x123abc... - My Portfolio)
  Expires: 2025-06-15
  URL: https://mysite.suins.site

myproject.sui
  Linked: No
  Expires: 2025-03-20
────────────────────────────────────────────
```

---

## Multi-Network Deployments

### Deploy to Both Testnet and Mainnet

**Testnet (staging):**

```bash
versui deploy ./dist --network testnet -e 7 --name "Staging Site"
# Test at https://{site-id}.walrus.site
```

**Mainnet (production):**

```bash
versui deploy ./dist --network mainnet -e 365 --name "Production Site"
# Production site with 1-year storage
```

---

### Environment-Specific Scripts

**package.json:**

```json
{
  "scripts": {
    "deploy:testnet": "versui deploy ./dist --network testnet -e 7 --yes",
    "deploy:mainnet": "versui deploy ./dist --network mainnet -e 365 --yes",
    "update:testnet": "versui update ./dist --site $TESTNET_SITE_ID --network testnet --yes",
    "update:mainnet": "versui update ./dist --site $MAINNET_SITE_ID --network mainnet --yes"
  }
}
```

**Usage:**

```bash
npm run deploy:testnet   # Deploy to staging
npm run deploy:mainnet   # Deploy to production
npm run update:mainnet   # Update production site
```

---

## Custom Service Worker Integration

### Embed VersUI in Existing Service Worker

**Your existing `sw.js`:**

```javascript
import { create_versui_handler } from '@versui/sw-plugin'

// Your existing SW logic
self.addEventListener('install', event => {
  console.log('Service worker installing...')
})

// Add VersUI handler
const versui = create_versui_handler()

// Load site manifest (from VersUI deploy output)
versui.load({
  '/index.html': 'blob-id-1',
  '/style.css': 'blob-id-2',
  '/app.js': 'blob-id-3',
})

// Intercept fetch events
self.addEventListener('fetch', event => {
  // Let VersUI handle static files
  if (versui.handle(event)) {
    return
  }

  // Your custom fetch logic for API calls, etc.
  event.respondWith(fetch(event.request))
})
```

**Benefits:**

- Mix decentralized static hosting with dynamic API calls
- Keep existing SW features (push notifications, caching strategies)
- Progressive enhancement

---

## Scripting and Automation

### Parse JSON Output

**Deploy and extract site ID:**

```bash
#!/bin/bash

OUTPUT=$(versui deploy ./dist --yes --json --network testnet)
SITE_ID=$(echo "$OUTPUT" | jq -r '.siteId')

echo "Deployed site: $SITE_ID"

# Save for future updates
echo "VERSUI_SITE_ID=$SITE_ID" >> .env
```

**Update using saved site ID:**

```bash
#!/bin/bash

source .env

versui update ./dist --site "$VERSUI_SITE_ID" --yes --json
```

---

### Automated Domain Setup

```bash
#!/bin/bash

SITE_ID="0x123abc..."
DOMAINS=("www.example.com" "blog.example.com" "docs.example.com")

for domain in "${DOMAINS[@]}"; do
  echo "Adding domain: $domain"
  versui domain add "$domain" --site "$SITE_ID" --yes --json
done

echo "All domains added. Configure DNS CNAMEs to versui.app"
```

---

## Monitoring and Maintenance

### Check Site Status

```bash
# List all sites with details
versui list --network mainnet --json | jq '.[].name, .[].size'
```

**Output:**

```
"Production Site"
2415919
"Blog Site"
1048576
```

---

### Storage Expiry Alerts

**Script to check epochs remaining:**

```bash
#!/bin/bash

# Get site details
SITE_DATA=$(versui list --network mainnet --json)

# Parse epochs remaining
EPOCHS=$(echo "$SITE_DATA" | jq '.[0].epochsRemaining')

if [ "$EPOCHS" -lt 30 ]; then
  echo "WARNING: Only $EPOCHS epochs remaining!"
  echo "Extend storage with: versui update ./dist --site <id> -e 365"
fi
```

**Run as cron job:**

```cron
0 0 * * * /path/to/check-expiry.sh
```

---

## Advanced Patterns

### Monorepo Multi-Site Deployment

**Directory structure:**

```
monorepo/
├── apps/
│   ├── landing/
│   │   └── dist/
│   ├── blog/
│   │   └── dist/
│   └── docs/
│       └── dist/
└── deploy.sh
```

**deploy.sh:**

```bash
#!/bin/bash

# Deploy landing page
versui deploy apps/landing/dist --name "Landing" --yes --json

# Deploy blog
versui deploy apps/blog/dist --name "Blog" --yes --json

# Deploy docs
versui deploy apps/docs/dist --name "Docs" --yes --json
```

---

### Preview Deployments (PR Workflow)

**GitHub Actions - Deploy on PR:**

```yaml
name: Preview Deployment

on:
  pull_request:
    branches: [main]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm ci && npm run build
      - name: Deploy Preview
        run: |
          versui deploy ./dist --yes --json --network testnet -e 1 --name "PR-${{ github.event.number }}"
      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview deployed: https://{site-id}.walrus.site'
            })
```

---

## Troubleshooting Common Scenarios

### Deploy Fails with "Insufficient Gas"

**Check balance:**

```bash
sui client gas
```

**Get testnet tokens:**

```bash
sui client faucet  # SUI tokens
# Visit https://walrus.site/faucet for WAL tokens
```

---

### Update Fails with "Not Site Owner"

**Verify active address:**

```bash
sui client active-address
```

**Switch to correct address:**

```bash
sui client switch --address 0xOWNER_ADDRESS
```

---

### Site Not Loading (404)

**Check site exists:**

```bash
versui list --network mainnet
```

**Regenerate bootstrap:**

```bash
versui regenerate 0xSITE_ID --network mainnet
```

**Verify DNS (custom domains):**

```bash
dig example.com CNAME
# Should point to versui.app
```

---

## Next Steps

- [Installation Guide](./INSTALLATION.md) - Setup all dependencies
- [API Reference](./API.md) - Complete command documentation
- [Architecture](./ARCHITECTURE.md) - Deep dive into internals
