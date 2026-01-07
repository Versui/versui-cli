# VERSUI CLI UI Design Plan

## Current Problems

1. **Double separator bug** - OR condition renders both separators when steps complete
2. **Cramped layout** - no breathing room between header and content
3. **Confusing flow** - separators don't convey meaning
4. **Step indicator position** - vertical list takes too much space

---

## Proposed Layout

```
┌─────────────────────────────────────────────────────────┐
│  __   __ ___  ___  ___  _   _  ___                      │
│  \ \ / /| __|| _ \/ __|| | | ||_ _|                     │
│   \ V / | _| |   /\__ \| |_| | | |                      │
│    \_/  |___||_|_\|___/ \___/ |___|                     │
│                                                         │
│  Decentralized Site Hosting on Walrus + Sui            │
└─────────────────────────────────────────────────────────┘

  ✓ Site name: versui-app              ← Teal colored, inline
  ✓ Network: testnet                   ← Teal colored, inline
  ✓ Duration: 1 epoch                  ← Teal colored, inline
  ✓ Scanned 127 files (5.2 MB)         ← Teal colored, inline

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ⚠  Upload to Walrus?                 ← Current action (yellow warning)

     • Files: 127
     • Total size: 5.2 MB
     • Estimated cost: ~0.5 SUI

     [Y] Continue  [N] Cancel          ← Clear key hints

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ Scan ━━ ◉ Upload ── ○ Create ── ○ Resources

```

---

## Design Principles

### 1. Three Zones

- **HEADER ZONE** - Logo + tagline (static, never changes)
- **CONTENT ZONE** - Completed info + current prompt (scrolls)
- **FOOTER ZONE** - Progress indicator (always visible)

### 2. Single Separator Rule

- ONE separator between content zone and footer
- NO separator after header (use marginTop instead)
- Separator only renders when there's content above AND below

### 3. Inline Everything

- Completed steps: inline `✓ Label: value` format
- Progress: inline `✓ Scan ━━ ◉ Upload ── ○ Create`
- Prompts: inline `Site name [default]: ___`

### 4. Color Hierarchy

```
COLORS = {
  sui:     '#4DA2FF'  // Primary blue - current step icon, links
  accent:  '#00D4FF'  // Cyan - highlights, URLs
  success: '#2DD4BF'  // Teal - completed items (✓)
  warning: '#FBBF24'  // Amber - confirmations (⚠)
  error:   '#F43F5E'  // Rose - errors
  dim:     '#64748B'  // Slate - separators, hints, defaults
  text:    '#E2E8F0'  // Light slate - primary text
}
```

### 5. Spacing Rules

- `marginTop: 1` after header (breathing room)
- `marginTop: 1` before separator
- `marginBottom: 1` after separator
- No double margins

---

## Render Structure (Simplified)

```javascript
return React.createElement(
  Box,
  { flexDirection: 'column' },

  // 1. HEADER (Static - renders once)
  React.createElement(Static, { items: [{ id: 'header' }] }, () =>
    React.createElement(Header),
  ),

  // 2. COMPLETED STEPS (with top margin for spacing from header)
  completedSteps.length > 0 &&
    React.createElement(
      Box,
      {
        flexDirection: 'column',
        marginTop: 1,
        marginBottom: 1,
      },
      completedSteps.map(step =>
        React.createElement(
          Text,
          { color: COLORS.success, key: step.id },
          `✓ ${step.label}: ${step.value}`,
        ),
      ),
    ),

  // 3. SEPARATOR (only if we have completed steps AND not done)
  completedSteps.length > 0 &&
    step !== STEPS.DONE &&
    React.createElement(Text, { color: COLORS.dim }, '━'.repeat(55)),

  // 4. CURRENT PROMPT/ACTION
  React.createElement(
    Box,
    { marginTop: 1, marginBottom: 1 },
    renderCurrentStep(),
  ),

  // 5. SEPARATOR (only if not done)
  step !== STEPS.DONE &&
    React.createElement(Text, { color: COLORS.dim }, '━'.repeat(55)),

  // 6. FOOTER - Progress indicator (only if not done)
  step !== STEPS.DONE &&
    React.createElement(StepIndicator, { steps, currentStep: step }),
)
```

---

## Step Indicator Design

**Horizontal with semantic connectors:**

```
✓ Scan ━━ ◉ Upload ── ○ Create ── ○ Resources
```

- `━━` (double line) = completed connection
- `──` (single line) = pending connection
- `✓` = completed (teal)
- `◉` = current (blue, pulsing)
- `○` = pending (dim)

**Short labels:**

- "Scan files" → "Scan"
- "Upload to Walrus" → "Upload"
- "Create Site on Sui" → "Create"
- "Add Resources" → "Resources"

---

## Confirmation Dialog Design

```
  ⚠  Upload to Walrus?

     • Files: 127
     • Size: 5.2 MB
     • Cost: ~0.5 SUI

     [Y] Continue  [N] Cancel
```

- Yellow ⚠ icon
- Bulleted details (not labeled "Files:", just "• 127 files")
- Clear keyboard hints at bottom

---

## Implementation Steps

1. **Fix separator logic** - Remove OR condition, use simple conditional
2. **Restructure render** - Three clear zones with proper margins
3. **Update StepIndicator** - Horizontal, short labels, semantic connectors
4. **Update completed steps** - Inline format with values
5. **Update ConfirmDialog** - Cleaner bullet format
6. **Format file sizes** - Human readable (5.2 MB not 5459186)
7. **Test full flow** - Ensure no double lines, proper colors

---

## Files to Modify

1. `App.js` - Main render restructure
2. `StepIndicator.js` - Horizontal layout, short labels
3. `ConfirmDialog.js` - Cleaner format
4. `Header.js` - Add marginBottom or let App.js handle spacing
