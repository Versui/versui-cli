# Versui CLI Display Specification

## Overview

This document describes the EXACT expected display behavior for the versui-cli interactive mode.

## Core Principle

**ASCII art header should ALWAYS be visible from the start and NEVER disappear throughout the entire session.**

---

## Flow Stages

### Stage 1: Initial Launch

When user runs `vsui deploy <dir>`:

1. Console CLEARS
2. ASCII art appears at top:

```
 __   __ ___  ___  ___  _   _  ___
 \ \ / /| __|| _ \/ __|| | | ||_ _|
  \ V / | _| |   /\__ \| |_| | | |
   \_/  |___||_|_\|___/ \___/ |___|

  Decentralized Site Hosting on Walrus + Sui
```

3. Site name prompt appears BELOW the header

### Stage 2: Site Name Prompt

```
[ASCII HEADER - stays visible]

? Site name: █
```

- User types site name
- After entering, prompt text gets CLEANED (not the header)

### Stage 3: Network Selection

```
[ASCII HEADER - stays visible]

? Select network
❯ Testnet (recommended)
  Mainnet
```

- After selection, this prompt gets CLEANED

### Stage 4: Fetching Data Spinner

```
[ASCII HEADER - stays visible]

⠹ Fetching sui data...
```

- Dim/gray animated spinner
- Disappears when done

### Stage 5: Storage Duration Prompt

```
[ASCII HEADER - stays visible]

? Storage duration (epochs, max: 53): █
```

- After entering, this prompt gets CLEANED

### Stage 6: Progress Display

After all prompts are done:

```
[ASCII HEADER - stays visible]

  Dir: dist  │  Network: testnet  │  Duration: 1 epoch(s)  │  Wallet: 0x306e...  │  Balances: SUI: X │ WAL: Y

  ✓ Scan files → 127 files (5.21 MB)
  ● Upload to Walrus
  ○ Create Site on Sui
```

### Stage 7: Confirmation Prompts

Before upload and before site creation:

```
[ASCII HEADER - stays visible]
[Config line - stays visible]
[Progress steps - stay visible]

  ⚠  Upload to Walrus
     127 files (5.21 MB)
     Storage: 1 epoch(s) on testnet

? Continue
❯ ▶ Continue
  ✗ Cancel
```

### Stage 8: Final Output

```
[ASCII HEADER - stays visible]

  Dir: dist  │  Network: testnet  │  ...

  ✓ Scan files → 127 files (5.21 MB)
  ✓ Upload to Walrus → Blob MddKScA9te_g...
  ✓ Create Site on Sui → Site 0x90607208b7...

  ✓ Deployment complete!

  Site ID:     0x90607208b77ce035e23b7157f421c0c6a0821b745eb979bd6d9a67902167b6e9
  URL:         https://xxx.versui.app
  Bootstrap:   ./bootstrap/index.html
```

---

## Rules

### MUST

1. ASCII header MUST appear IMMEDIATELY when CLI starts
2. ASCII header MUST remain visible at ALL times
3. ASCII header MUST be at the TOP of the screen always
4. Prompts appear BELOW header, not above
5. After each prompt is answered, the prompt text cleans but header stays
6. Progress updates BELOW header without touching header
7. Spinners animate without affecting header position

### MUST NOT

1. Header MUST NOT disappear at any point
2. Header MUST NOT be printed twice (no duplication)
3. Prompts MUST NOT appear above the header
4. console.clear() MUST NOT clear the header (only content below)
5. Progress steps MUST NOT duplicate

---

## --yes Mode (Non-Interactive)

When using `--yes` flag:

- NO prompts shown
- Only JSON output OR minimal progress
- Header can be shown or omitted (user preference)
