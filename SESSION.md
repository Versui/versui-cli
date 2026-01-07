# Deploy.js Reversion Session

## Current Broken State (HEAD: de68864)

**Symptoms:**

- Deploy failures with unclear transaction errors
- Display issues (header duplication, spinner conflicts)
- ESC key handler causing complexity/bugs
- Multiple attempted fixes in rapid succession (63, 65, 67, 68)

**Root Cause:**
Over-engineering with ESC handler, readline raw mode, transaction state tracking causing cascading issues.

## Stable Revert Point: 2b10796

**Commit:** `2b1079675659d3496a57ddf25c72b3ab5bb825af`
**Date:** Sat Nov 29 00:56:34 2025
**Message:** "fix: validate site existence before delete/deploy operations"

**Why This Commit:**

- Has name-taken validation (prevents wasted WAL tokens)
- Clean state before ESC handler complexity
- Before VERSION_OBJECT_ID changes
- Known working state

## Features Added AFTER 2b10796 (Need Re-Implementation)

### 1. VERSION_OBJECT_ID Support (Commit: 7698f45)

**Priority:** CRITICAL
**Required For:** New Move contract compatibility

**Changes Needed:**

- `src/lib/env.js`: Add `VERSION_OBJECT_ID` constant
- `src/commands/deploy/transaction.js`: Pass version object as first arg to all Move calls
- `src/commands/deploy.js`: Fetch version object, pass to transaction builders
- `src/commands/update.js`: Same version parameter
- `src/commands/delete.js`: Same version parameter
- `src/commands/domain.js`: Same version parameter
- `src/lib/sui.js`: Helper to get version object

**Files Modified:**

```
src/lib/env.js                     | 25 ++++++++++++++++++++++---
src/commands/deploy.js             | 10 ++++++++++
src/commands/deploy/transaction.js | 18 ++++++++++++++++++
src/commands/update.js             | 23 +++++++++++++++++++++--
src/commands/delete.js             | 13 +++++++++++++
src/commands/domain.js             | 18 +++++++++++++++++-
src/lib/sui.js                     | 36 +++++++++++++++++++++++++++++++++++-
```

### 2. ESC Key Cancellation (Commit: 6c74b54)

**Priority:** LOW (nice-to-have, not critical)

**Features:**

- ESC key handler with readline raw mode
- Transaction-in-progress state tracking
- Confirmation prompt before canceling active transactions
- Cleanup handler for graceful exit

**Opinion:** Skip this initially. Adds significant complexity. Ctrl+C works fine.

### 3. Header Display Fixes (Commits: 5245343, 3dcf0d0)

**Priority:** LOW (cosmetic)

**Changes:**

- `state.show_header` toggle to prevent duplication after prompts
- Reset header visibility after confirmations

**Opinion:** Only re-add if header duplication resurfaces.

### 4. add_resource Argument Fix (Commit: 73c1b11)

**Priority:** MEDIUM

**Change:** Specific to `add_resource` Move function argument order/count.

**Action:** Review actual error if it occurs, fix surgically.

## Re-Implementation Plan

### Phase 1: Revert & Verify (NOW)

1. ✅ Revert to 2b10796
2. ✅ Document features in SESSION.md
3. Test basic deploy flow (should work)

### Phase 2: Add VERSION_OBJECT_ID (NEXT)

1. Port changes from 7698f45 carefully
2. Test each file modification
3. Verify contract compatibility

### Phase 3: Surgical Fixes (IF NEEDED)

1. add_resource argument fix (73c1b11) - only if error occurs
2. Header display (5245343, 3dcf0d0) - only if duplication occurs

### Phase 4: Optional UX (LATER)

1. ESC handler (6c74b54) - if user wants it, do it cleanly

## Anti-Patterns to Avoid

❌ **Don't:** Add ESC handler, readline raw mode, transaction state tracking all at once
❌ **Don't:** Fix display issues with complex state toggles - use simpler solutions
❌ **Don't:** Rapid-fire commits without testing each change

✅ **Do:** Revert to known good state first
✅ **Do:** Add one critical feature at a time (VERSION_OBJECT_ID)
✅ **Do:** Test after each change
✅ **Do:** Keep display logic simple

## Commit Log Reference

```
de68864 1.9.2 (#68)                          ← HEAD (broken)
3dcf0d0 fix: restore header after prompts (#67)
453ce0b chore: bump version to 1.9.0 (#66)
6c74b54 feat: ESC key to cancel deployment with transaction safety (#65)
e790ad8 1.8.2 (#64)
5245343 fix: display duplication after prompts (#63)
73c1b11 fix: add_resource argument mismatch (#62)
7698f45 feat: support new contract with version parameter (#61)  ← CRITICAL FEATURE
cdb8ca4 chore: bump version to 1.7.6 (#60)
2b10796 fix: validate site existence before delete/deploy operations (#59)  ← REVERT TO THIS
1d82fe9 fix: critical - deployment blob ID extraction (#51)
4d5e4da Security hardening + comprehensive fuzz test suite (#47)
```

## Next Actions

1. Revert: `git checkout 2b10796 -- src/commands/deploy.js`
2. Test: Deploy a simple site to testnet
3. Add VERSION_OBJECT_ID changes from 7698f45
4. Test again with new contract
