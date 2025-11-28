# Contributing to VersUI CLI

Thank you for considering contributing to VersUI! This document outlines the development setup, PR process, and coding standards.

---

## Development Setup

### Prerequisites

- Node.js 18+
- Git
- Sui CLI (`sui`)
- Walrus CLI (`walrus`)

### Clone and Install

```bash
# Clone repository
git clone https://github.com/Versui/versui-cli
cd versui-cli

# Install dependencies
npm install

# Link for local development
npm link

# Verify installation
versui --version
```

---

## Project Structure

```
versui-cli/
├── src/
│   ├── commands/          # CLI command implementations
│   │   ├── deploy.js
│   │   ├── update.js
│   │   ├── list.js
│   │   └── ...
│   ├── lib/               # Core utilities
│   │   ├── scanner.js     # File scanning and hashing
│   │   ├── walrus.js      # Walrus CLI wrapper
│   │   ├── sui.js         # Sui blockchain integration
│   │   └── bootstrap.js   # Bootstrap generator
│   ├── utils/             # Helper functions
│   └── cli.js             # Main CLI entry point
├── test/                  # Test files
├── bootstrap/             # Generated output (gitignored)
├── docs/                  # Documentation
├── package.json
└── README.md
```

---

## Development Workflow

### 1. Create Feature Branch

```bash
git checkout -b feat/your-feature-name
```

**Branch naming:**

- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions

### 2. Make Changes

Write code following our [Coding Standards](#coding-standards).

### 3. Run Linter

```bash
npm run lint
```

**Auto-fix:**

```bash
npm run lint -- --fix
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run specific test
npm test -- scanner.test.js

# Run with coverage
npm run test:coverage
```

### 5. Commit Changes

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git add .
git commit -m "feat(deploy): add custom aggregator support"
```

**Commit message format:**

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code refactor (no behavior change)
- `test`: Add or update tests
- `chore`: Maintenance tasks

### 6. Push and Create PR

```bash
git push -u origin feat/your-feature-name
```

Create PR on GitHub with:

- Clear description of changes
- Link to related issues
- Screenshots (if UI changes)

---

## Coding Standards

### JavaScript Style

**ESM modules** (not CommonJS):

```javascript
// ✅ CORRECT
import { foo } from './lib.js'
export function bar() {}

// ❌ WRONG
const { foo } = require('./lib')
module.exports = { bar }
```

**TypeScript JSDoc** for type checking:

```javascript
/**
 * Deploy static site to Walrus and Sui
 * @param {string} directory - Path to static site
 * @param {Object} options - Deploy options
 * @param {number} options.epochs - Storage duration
 * @param {string} options.network - Sui network
 * @returns {Promise<string>} Site object ID
 */
export async function deploy(directory, options) {
  // ...
}
```

**Error handling:**

```javascript
// ✅ CORRECT - Specific error messages
if (!fs.existsSync(directory)) {
  throw new Error(`Directory not found: ${directory}`)
}

// ❌ WRONG - Generic errors
if (!fs.existsSync(directory)) {
  throw new Error('Error')
}
```

**Async/await** (not callbacks):

```javascript
// ✅ CORRECT
const data = await fs.readFile(path)

// ❌ WRONG
fs.readFile(path, (err, data) => {
  // ...
})
```

---

### File Naming

- Lowercase with hyphens: `scanner.js`, `sui-client.js`
- Tests: `scanner.test.js`
- Constants: `CONSTANTS.js` (uppercase)

---

### Import Order

```javascript
// 1. Node built-ins
import fs from 'node:fs/promises'
import path from 'node:path'

// 2. External dependencies
import chalk from 'chalk'
import ora from 'ora'

// 3. Internal modules
import { scan_directory } from './lib/scanner.js'
import { upload_to_walrus } from './lib/walrus.js'
```

---

### Variable Naming

| Type      | Convention       | Example                             |
| --------- | ---------------- | ----------------------------------- |
| Variables | snake_case       | `file_path`, `blob_id`              |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_EPOCHS`, `MAX_FILE_SIZE`   |
| Functions | snake_case       | `deploy_site()`, `scan_directory()` |
| Classes   | PascalCase       | `SuiClient`, `WalrusUploader`       |

---

### Comments

**Prefer self-documenting code:**

```javascript
// ✅ GOOD - Code explains itself
const is_static_file = file.endsWith('.html') || file.endsWith('.css')

// ❌ BAD - Unnecessary comment
// Check if file is static
const x = file.endsWith('.html') || file.endsWith('.css')
```

**Use comments for WHY, not WHAT:**

```javascript
// ✅ GOOD
// Walrus requires chunks < 13 MiB due to erasure coding overhead
const MAX_CHUNK_SIZE = 12 * 1024 * 1024

// ❌ BAD
// Set max chunk size
const MAX_CHUNK_SIZE = 12 * 1024 * 1024
```

---

## Testing Guidelines

### Test Structure

```javascript
import { describe, it, expect } from 'vitest'
import { scan_directory } from '../src/lib/scanner.js'

describe('scan_directory', () => {
  it('should detect all files in directory', async () => {
    const result = await scan_directory('./test-site')

    expect(result).toHaveProperty('index.html')
    expect(result).toHaveProperty('style.css')
  })

  it('should compute correct SHA-256 hashes', async () => {
    const result = await scan_directory('./test-site')

    expect(result['index.html'].hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should throw error for non-existent directory', async () => {
    await expect(scan_directory('./nonexistent')).rejects.toThrow('not found')
  })
})
```

---

### Test Coverage

**Minimum coverage:** 80%

```bash
npm run test:coverage
```

**Focus areas:**

- Core logic (scanner, walrus uploader, sui client)
- Error handling paths
- Edge cases (empty directories, large files, etc.)

---

## PR Review Process

### Before Submitting

**Checklist:**

- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Code coverage maintained (> 80%)
- [ ] Documentation updated (if API changes)
- [ ] Commit messages follow conventions
- [ ] No console.log or debug artifacts

---

### PR Template

```markdown
## Summary

Brief description of changes.

## Changes

- Change 1
- Change 2

## Test Plan

- [ ] Unit tests added/updated
- [ ] Manual testing completed (describe steps)

## Screenshots (if applicable)

[Add screenshots for CLI UI changes]

## Breaking Changes

None / Describe breaking changes

## Related Issues

Closes #123
```

---

### Review Criteria

PRs are reviewed for:

1. **Correctness** - Does it work as intended?
2. **Test coverage** - Are new features tested?
3. **Code quality** - Follows standards?
4. **Documentation** - User-facing changes documented?
5. **Performance** - No unnecessary slowdowns?
6. **Security** - No secrets exposed, input validated?

---

## Release Process

**Versioning:** Semantic Versioning (semver)

| Change Type     | Version Bump          |
| --------------- | --------------------- |
| Breaking change | Major (1.0.0 → 2.0.0) |
| New feature     | Minor (1.0.0 → 1.1.0) |
| Bug fix         | Patch (1.0.0 → 1.0.1) |

**Release steps** (maintainers only):

```bash
# Update version in package.json
npm version minor  # or major/patch

# Push with tags
git push --follow-tags

# GitHub Actions automatically publishes to npm
```

---

## Getting Help

- **Questions:** Open a GitHub Discussion
- **Bugs:** File a GitHub Issue
- **Chat:** Join our Discord (link in README)

---

## Code of Conduct

Be respectful, inclusive, and professional. We're building tools for everyone.

---

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
