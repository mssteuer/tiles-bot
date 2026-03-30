# Tailwind CSS v4 Migration + Component Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all inline `style={{}}` objects with Tailwind CSS v4 utility classes across 18 files, decompose TilePanel.js and Grid.js into focused sub-components, and rebuild globals.css component classes using `@apply`.

**Architecture:** Tailwind v4 CSS-first config via `@theme` maps existing CSS variables to utility classes. Component decomposition uses barrel re-exports to preserve all existing import paths. Migration proceeds smallest-risk-first.

**Tech Stack:** Tailwind CSS v4, @tailwindcss/postcss, PostCSS, Next.js 16, React 19

**Design Spec:** `docs/superpowers/specs/task-561-design.md`

---

## File Structure Overview

### New files created:
- `postcss.config.mjs` — PostCSS config for Tailwind v4
- `src/components/tile-panel/utils.js` — shared constants + utilities
- `src/components/tile-panel/ShareButton.js` — copy-link share button
- `src/components/tile-panel/VerificationBadge.js` — badge + copy button
- `src/components/tile-panel/VerifyGithubButton.js` — GitHub verification flow
- `src/components/tile-panel/VerifyXButton.js` — X/Twitter verification flow
- `src/components/tile-panel/NeighborNetworkPanel.js` — connections panel
- `src/components/tile-panel/TilePanel.js` — main tile panel
- `src/components/grid/utils.js` — pure functions + constants
- `src/components/grid/MobileHints.js` — touch gesture overlay
- `src/components/grid/ListView.js` — table view
- `src/components/grid/TileTooltip.js` — hover tooltip
- `src/components/grid/SelectionOverlay.js` — drag-select overlay
- `src/components/grid/ToolToggle.js` — pan/select toggle
- `src/components/grid/Grid.js` — main canvas grid

### Modified files:
- `src/app/globals.css` — full rewrite with `@import "tailwindcss"`, `@theme`, `@apply`
- `src/components/TilePanel.js` — becomes barrel re-export
- `src/components/Grid.js` — becomes barrel re-export
- All 18 files with inline styles (converted to Tailwind classes)

---

## Task 1: Install Tailwind v4 and Configure Theme

**Files:**
- Create: `postcss.config.mjs`
- Modify: `package.json` (via npm install)
- Modify: `src/app/globals.css`

- [ ] **Step 1: Install Tailwind v4 packages**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
npm install tailwindcss @tailwindcss/postcss
```

- [ ] **Step 2: Create PostCSS config**

Create `postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 3: Add `@import "tailwindcss"` and `@theme` to globals.css**

At the very top of `src/app/globals.css`, before all existing content, add:

```css
@import "tailwindcss";

@theme {
  --color-bg: #07071a;
  --color-surface: #0d0d1a;
  --color-surface-2: #12122a;
  --color-border: #1e1e3a;
  --color-border-bright: #2a2a4e;
  --color-text: #e2e8f0;
  --color-text-dim: #94a3b8;
  --color-text-muted: #64748b;
  --color-accent-blue: #3b82f6;
  --color-accent-purple: #a855f7;
  --color-accent-green: #22c55e;
  --color-accent-pink: #ec4899;
  --color-accent-amber: #f59e0b;
  --color-accent-cyan: #06b6d4;
  --color-accent-red: #ef4444;
  --color-accent-red-light: #f87171;
  --color-surface-dark: #0a0a0f;
  --color-surface-alt: #0f0f1a;
  --color-border-dim: #1a1a2e;
  --color-text-gray: #9ca3af;
  --color-text-light: #cbd5e1;

  --font-body: 'Space Grotesk', system-ui, sans-serif;
  --font-pixel: 'Silkscreen', 'Courier New', monospace;
  --font-mono: 'Space Mono', 'Courier New', monospace;
}
```

Remove the old `:root { ... }` block (the CSS variable declarations). Keep everything else below for now.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds. Existing styles still work because `@theme` generates the same CSS variables. The old component classes in globals.css are still present and functional.

- [ ] **Step 5: Commit**

```bash
git add postcss.config.mjs src/app/globals.css package.json package-lock.json
git commit -m "feat: install Tailwind CSS v4 and configure theme tokens"
```

---

## Task 2: Rebuild globals.css Component Classes with @apply

**Files:**
- Modify: `src/app/globals.css`

This task replaces all the hand-written component classes with Tailwind `@apply` equivalents. The visual output must be pixel-identical.

- [ ] **Step 1: Rebuild `.btn-retro` family**

Replace the existing `.btn-retro`, `.btn-retro:hover`, `.btn-retro:active`, `.btn-retro-primary`, `.btn-retro-primary:hover`, `.btn-retro-green`, `.btn-retro-green:hover` blocks with:

```css
.btn-retro {
  @apply font-body font-semibold text-[13px] px-4 py-2 border-2 border-border-bright
         rounded-sm bg-surface-2 text-text whitespace-nowrap relative;
  image-rendering: pixelated;
  transition: all 0.1s;
}
.btn-retro:hover {
  @apply border-accent-blue text-white;
  background: rgba(59, 130, 246, 0.1);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.2);
}
.btn-retro:active {
  @apply translate-x-px translate-y-px;
}
.btn-retro-primary {
  @apply bg-accent-blue text-white;
  border-color: #60a5fa;
  box-shadow: inset -2px -2px 0 rgba(0,0,0,0.2), inset 2px 2px 0 rgba(255,255,255,0.1);
}
.btn-retro-primary:hover {
  background: #60a5fa;
  border-color: #93c5fd;
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.3), inset -2px -2px 0 rgba(0,0,0,0.2);
}
.btn-retro-green {
  @apply bg-accent-green text-black;
  border-color: #4ade80;
  box-shadow: inset -2px -2px 0 rgba(0,0,0,0.2), inset 2px 2px 0 rgba(255,255,255,0.1);
}
.btn-retro-green:hover {
  background: #4ade80;
  border-color: #86efac;
  box-shadow: 0 0 16px rgba(34, 197, 94, 0.3), inset -2px -2px 0 rgba(0,0,0,0.2);
}
```

- [ ] **Step 2: Rebuild `.retro-panel` and `.retro-modal` family**

Replace existing blocks:

```css
.retro-panel {
  @apply bg-surface border-2 border-border-bright rounded-sm;
  box-shadow:
    inset 1px 1px 0 rgba(255,255,255,0.05),
    inset -1px -1px 0 rgba(0,0,0,0.3),
    0 0 30px rgba(59, 130, 246, 0.05);
}

.retro-modal-overlay {
  @apply fixed inset-0 z-[9999] flex items-center justify-center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
}

.retro-modal {
  @apply bg-surface border-3 border-border-bright rounded-sm p-6 text-text overflow-y-auto;
  max-width: 520px;
  width: 95%;
  max-height: 85vh;
  box-shadow:
    inset 1px 1px 0 rgba(255,255,255,0.08),
    inset -1px -1px 0 rgba(0,0,0,0.3),
    0 0 60px rgba(59, 130, 246, 0.1),
    0 20px 60px rgba(0, 0, 0, 0.5);
}

.retro-modal h2 {
  @apply font-pixel text-[16px] m-0 mb-4 text-white;
}
```

- [ ] **Step 3: Rebuild `.retro-input` and `.retro-tag`**

```css
.retro-input {
  @apply font-body text-[13px] px-3 py-2 bg-surface-dark border-2 border-border rounded-sm text-text outline-none;
  transition: border-color 0.15s;
}
.retro-input:focus {
  @apply border-accent-blue;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.15);
}

.retro-tag {
  @apply font-body text-[11px] font-semibold px-2 py-[3px] border border-border rounded-sm text-text-dim whitespace-nowrap;
  background: rgba(255, 255, 255, 0.03);
}
```

- [ ] **Step 4: Rebuild layout classes (`.app-shell`, `.main-content`, `.side-panel`)**

```css
.app-shell {
  @apply flex flex-col h-dvh overflow-hidden;
}

.main-content {
  @apply flex flex-1 overflow-hidden relative;
}

.side-panel {
  @apply w-0 overflow-hidden bg-bg border-l-2 border-border shrink-0 flex flex-col;
  transition: width 0.2s ease;
}
.side-panel.open {
  @apply w-[340px] overflow-y-auto;
}

@media (max-width: 640px) {
  .side-panel {
    @apply absolute bottom-0 left-0 right-0 w-full border-l-0 border-t-2 border-border z-20 overflow-y-auto;
    max-height: 0;
    transition: max-height 0.25s ease;
  }
  .side-panel.open {
    @apply w-full;
    max-height: 60dvh;
  }
}
```

- [ ] **Step 5: Rebuild `.filter-bar`, `.pill`, `.search-input`, `.icon-btn` classes**

```css
.filter-bar {
  @apply flex items-center gap-2 px-3 py-1.5 bg-surface border-b-2 border-border overflow-x-auto shrink-0;
  -webkit-overflow-scrolling: touch;
}
.filter-bar::-webkit-scrollbar { display: none; }

.filter-pills { @apply flex gap-[5px] shrink-0; }

.pill {
  @apply font-body py-[5px] px-3 rounded-sm border-2 border-border bg-transparent text-text-dim
         text-[11px] font-semibold whitespace-nowrap;
  cursor: url("/cursors/pointer.png") 5 0, pointer;
  transition: all 0.1s;
}
.pill:hover { @apply border-accent-blue text-white; }
.pill.active {
  @apply border-accent-blue text-accent-blue;
  background: rgba(59, 130, 246, 0.15);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.15);
}

.filter-spacer { @apply flex-1 min-w-2; }

.search-input {
  @apply font-body bg-surface-dark border-2 border-border rounded-sm py-[5px] px-2.5 text-text text-[12px]
         outline-none w-[120px] shrink-0;
  transition: border-color 0.15s;
}
.search-input:focus { @apply border-accent-blue; }

.icon-btn-group { @apply flex gap-[3px] shrink-0; }
.icon-btn {
  @apply bg-surface-2 border-2 border-border rounded-sm text-text-dim text-[13px]
         w-[30px] h-[30px] flex items-center justify-center p-0;
  cursor: url("/cursors/pointer.png") 5 0, pointer;
}
.icon-btn:hover { @apply border-accent-blue text-white; }
.icon-btn.active { @apply text-accent-blue border-accent-blue; }

@media (min-width: 768px) {
  .filter-bar { @apply px-4 py-2 gap-2.5; }
  .search-input { @apply w-40; }
  .pill { @apply text-[12px] py-[5px] px-[13px]; }
}
```

- [ ] **Step 6: Rebuild `.header-nav-desktop`**

```css
.header-nav-desktop { @apply hidden; }

@media (min-width: 768px) {
  .header-nav-desktop { @apply flex !important; }
  .header-nav-desktop a {
    @apply font-body text-[13px] text-text-dim no-underline py-1 px-2 rounded-sm whitespace-nowrap
           flex items-center gap-[3px];
    transition: color 0.1s, background 0.1s;
  }
  .header-nav-desktop a:hover {
    @apply text-white;
    background: rgba(59, 130, 246, 0.1);
  }
}
```

- [ ] **Step 7: Remove old hand-written CSS blocks**

Remove ALL the original versions of the blocks rebuilt above. Keep ONLY:
- The `@import "tailwindcss"` and `@theme` block (from Task 1)
- The newly rebuilt `@apply` blocks (from this task)
- `* { box-sizing: border-box; }` (kept for safety)
- Font comment block
- `@keyframes spin`, `pulse-glow`, `pixel-blink`
- `.btn-loading` + `.btn-loading .spinner`
- `body { ... }` base styles (margin, padding, background, color, font — rebuild with `@apply`)
- `h1-h6` heading font rule (rebuild: `h1, h2, h3, h4, h5, h6 { @apply font-pixel tracking-wide; }`)
- `code, .mono { @apply font-mono; }`
- `body:has(.app-shell)` and `body:not(:has(.app-shell))` overflow rules
- Scrollbar styles (`::-webkit-scrollbar` family)
- Selection styles (`::selection`)
- All pixel cursor rules (`body`, `button`, `[role="button"]`, etc.)

- [ ] **Step 8: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 9: Browser QA — verify pixel cursors and button styles**

Open https://tiles.bot in browser. Verify:
- Pixel cursors appear on hover over buttons and links
- `.btn-retro` buttons look identical (border, colors, hover glow)
- Modals appear correctly styled
- Filter bar pills work (active state highlighting)
- Side panel opens/closes with correct styling

- [ ] **Step 10: Commit**

```bash
git add src/app/globals.css
git commit -m "refactor: rebuild globals.css component classes with Tailwind @apply"
```

---

## Task 3: Extract TilePanel Sub-Components

**Files:**
- Create: `src/components/tile-panel/utils.js`
- Create: `src/components/tile-panel/ShareButton.js`
- Create: `src/components/tile-panel/VerificationBadge.js`
- Create: `src/components/tile-panel/VerifyGithubButton.js`
- Create: `src/components/tile-panel/VerifyXButton.js`
- Create: `src/components/tile-panel/NeighborNetworkPanel.js`
- Create: `src/components/tile-panel/TilePanel.js`
- Modify: `src/components/TilePanel.js` (becomes barrel re-export)

This task is STRUCTURAL ONLY — no style changes. Copy code verbatim into new files, fix imports, verify build.

- [ ] **Step 1: Create `src/components/tile-panel/utils.js`**

Extract from `src/components/TilePanel.js` (lines 8-66 constants/utilities):
- `getSizedImageUrl` function
- `truncateAddress` function
- `truncateTx` function
- `CONTRACT_ADDRESS` constant
- `CHAIN_ID` constant
- `CATEGORY_COLORS` object
- `X_ICON_STYLE` constant (if present as a shared constant)

Export all as named exports.

- [ ] **Step 2: Create `src/components/tile-panel/ShareButton.js`**

Extract `ShareButton` function (lines 24-66). Add `'use client'` directive. Import `useState` from React. Export as default.

- [ ] **Step 3: Create `src/components/tile-panel/VerificationBadge.js`**

Extract `VerificationBadge` (lines 67-84) and `CopyButton` (lines 85-113). Both export as named exports. Add `'use client'` directive for `CopyButton` (uses `useState`).

- [ ] **Step 4: Create `src/components/tile-panel/VerifyGithubButton.js`**

Extract `VerifyGithubButton` (lines 114-266). Add `'use client'` directive. Import `useState` from React. Import needed utils from `./utils`. Export as default.

- [ ] **Step 5: Create `src/components/tile-panel/VerifyXButton.js`**

Extract `VerifyXButton` (lines 267-440). Add `'use client'` directive. Import `useState` from React. Import needed utils from `./utils`. Export as default.

- [ ] **Step 6: Create `src/components/tile-panel/NeighborNetworkPanel.js`**

Extract `NeighborNetworkPanel` (lines 441-828). Add `'use client'` directive. Import `useState`, `useEffect` from React. Import `useSignMessage` from wagmi. Import needed utils from `./utils`. Export as default.

- [ ] **Step 7: Create `src/components/tile-panel/TilePanel.js`**

Copy the `TilePanel` default export function (lines 829-1692) into this file. Add `'use client'` directive. Update imports to reference sibling files:
```js
import ShareButton from './ShareButton';
import { VerificationBadge, CopyButton } from './VerificationBadge';
import VerifyGithubButton from './VerifyGithubButton';
import VerifyXButton from './VerifyXButton';
import NeighborNetworkPanel from './NeighborNetworkPanel';
import InteractionsPanel from '../InteractionsPanel';
import { getSizedImageUrl, truncateAddress, truncateTx, CONTRACT_ADDRESS, CHAIN_ID, CATEGORY_COLORS } from './utils';
```
Export as default.

- [ ] **Step 8: Convert `src/components/TilePanel.js` to barrel re-export**

Replace entire file contents with:
```js
export { default } from './tile-panel/TilePanel';
```

- [ ] **Step 9: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds. All TilePanel functionality works exactly as before.

- [ ] **Step 10: Commit**

```bash
git add src/components/tile-panel/ src/components/TilePanel.js
git commit -m "refactor: extract TilePanel into sub-components"
```

---

## Task 4: Extract Grid Sub-Components

**Files:**
- Create: `src/components/grid/utils.js`
- Create: `src/components/grid/MobileHints.js`
- Create: `src/components/grid/ListView.js`
- Create: `src/components/grid/TileTooltip.js`
- Create: `src/components/grid/SelectionOverlay.js`
- Create: `src/components/grid/ToolToggle.js`
- Create: `src/components/grid/Grid.js`
- Modify: `src/components/Grid.js` (becomes barrel re-export)

This task is STRUCTURAL ONLY — no style changes.

- [ ] **Step 1: Create `src/components/grid/utils.js`**

Extract from `src/components/Grid.js`:
- Constants: `GRID_SIZE`, `TILE_SIZE`, `GRID_PX`, `CATEGORY_COLORS`, `HB_GREEN`, `HB_YELLOW`
- Functions: `getTileActivityScore`, `heatmapColor`, `getThumbUrl`, `scheduleFetch`, `loadTileImage`, `getHeartbeatGlowColor`, `tileMatchesFilter`, `hasActiveFilter`, `getFirstMatchingTile`

Note: `scheduleFetch` and `loadTileImage` reference module-level caches (`fetchCache`, `imageCache` Maps). These must be declared in utils.js as module-level variables so they persist across renders.

Export all as named exports.

- [ ] **Step 2: Create `src/components/grid/MobileHints.js`**

Extract `MobileHints` function (lines 196-219). Add `'use client'` directive. Import `useState`, `useEffect` from React. Export as default.

- [ ] **Step 3: Create `src/components/grid/ListView.js`**

Extract the list view JSX block (the `if (viewMode === 'list') { ... return (...) }` block, approximately lines 1560-1631).

Create as a component:
```js
export default function ListView({ tiles, searchQuery, categoryFilter, onTileClick }) {
```

Import `getThumbUrl`, `tileMatchesFilter`, `hasActiveFilter` from `./utils`. Export as default.

- [ ] **Step 4: Create `src/components/grid/TileTooltip.js`**

Extract the hover tooltip overlay (the `hoveredTile !== null` conditional block, approximately lines 1674-1703).

Create as a component:
```js
export default function TileTooltip({ tile, hoveredTile }) {
```

Import `getThumbUrl` from `./utils`. Export as default.

- [ ] **Step 5: Create `src/components/grid/SelectionOverlay.js`**

Extract the selection rect + selection hint (approximately lines 1660-1720).

Create as a component:
```js
export default function SelectionOverlay({ selectionRect }) {
```

Export as default.

- [ ] **Step 6: Create `src/components/grid/ToolToggle.js`**

Extract the tool toggle buttons (approximately lines 1725-1760).

Create as a component:
```js
export default function ToolToggle({ tool, onToolChange }) {
```

Import `playSound` from `@/lib/sound`. Export as default.

- [ ] **Step 7: Create `src/components/grid/Grid.js`**

Copy the main `Grid` default export function into this file. Replace extracted sections with component usage:
```jsx
import ListView from './ListView';
import MobileHints from './MobileHints';
import TileTooltip from './TileTooltip';
import SelectionOverlay from './SelectionOverlay';
import ToolToggle from './ToolToggle';
import { GRID_SIZE, TILE_SIZE, GRID_PX, ... } from './utils';
```

The list view branch becomes:
```jsx
if (viewMode === 'list') {
  return <ListView tiles={tiles} searchQuery={searchQuery} categoryFilter={categoryFilter} onTileClick={onTileClick} />;
}
```

The canvas return block uses the extracted overlay components.

Export as default.

- [ ] **Step 8: Convert `src/components/Grid.js` to barrel re-export**

Replace entire file contents with:
```js
export { default } from './grid/Grid';
```

- [ ] **Step 9: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds. Grid functionality (pan, zoom, click, list view, tooltips, selection) works exactly as before.

- [ ] **Step 10: Commit**

```bash
git add src/components/grid/ src/components/Grid.js
git commit -m "refactor: extract Grid into sub-components"
```

---

## Task 5: Convert Page Files to Tailwind (Part 1 — Small Pages)

**Files:**
- Modify: `src/app/faq/page.js`
- Modify: `src/app/activity/page.js`
- Modify: `src/app/network/page.js`

For each file: replace every `style={{...}}` with equivalent Tailwind utility classes.

### Color reference guide (use for ALL conversion tasks):

| Hex | Tailwind class |
|-----|---------------|
| `#07071a` | `bg-bg` |
| `#0d0d1a` | `bg-surface` / `text-surface` |
| `#0a0a0f` | `bg-surface-dark` |
| `#0f0f1a` | `bg-surface-alt` |
| `#12122a` | `bg-surface-2` |
| `#1e1e3a` | `border-border` |
| `#1a1a2e` | `border-border-dim` |
| `#2a2a4e` | `border-border-bright` |
| `#e2e8f0` | `text-text` |
| `#94a3b8` | `text-text-dim` |
| `#64748b` | `text-text-muted` |
| `#9ca3af` | `text-text-gray` |
| `#cbd5e1` | `text-text-light` |
| `#3b82f6` | `text-accent-blue` / `bg-accent-blue` |
| `#a855f7` | `text-accent-purple` |
| `#22c55e` | `text-accent-green` / `bg-accent-green` |
| `#ec4899` | `text-accent-pink` |
| `#f59e0b` | `text-accent-amber` |
| `#06b6d4` | `text-accent-cyan` |
| `#ef4444` | `text-accent-red` |
| `#f87171` | `text-accent-red-light` |
| `#fff` / `#ffffff` | `text-white` / `bg-white` |
| `#000` / `#000000` | `text-black` / `bg-black` |

### Common pattern translations:

| Inline Style | Tailwind |
|-------------|----------|
| `display: 'flex'` | `flex` |
| `alignItems: 'center'` | `items-center` |
| `justifyContent: 'center'` | `justify-center` |
| `flexDirection: 'column'` | `flex-col` |
| `gap: 8` | `gap-2` |
| `gap: 16` | `gap-4` |
| `gap: 24` | `gap-6` |
| `padding: '16px 24px'` | `px-6 py-4` |
| `padding: '8px 12px'` | `px-3 py-2` |
| `fontSize: 11` | `text-[11px]` |
| `fontSize: 12` | `text-[12px]` |
| `fontSize: 13` | `text-[13px]` |
| `fontSize: 14` | `text-sm` |
| `fontSize: 16` | `text-base` |
| `fontSize: 18` | `text-lg` |
| `fontSize: 24` | `text-2xl` |
| `fontWeight: 500` | `font-medium` |
| `fontWeight: 600` | `font-semibold` |
| `fontWeight: 700` | `font-bold` |
| `borderRadius: 8` | `rounded-lg` |
| `borderRadius: 12` | `rounded-xl` |
| `borderRadius: '50%'` | `rounded-full` |
| `textAlign: 'center'` | `text-center` |
| `textDecoration: 'none'` | `no-underline` |
| `overflow: 'hidden'` | `overflow-hidden` |
| `textOverflow: 'ellipsis'` + `whiteSpace: 'nowrap'` + `overflow: 'hidden'` | `truncate` |
| `minHeight: '100vh'` | `min-h-screen` |
| `maxWidth: 1200` | `max-w-[1200px]` |
| `margin: '0 auto'` | `mx-auto` |
| `flex: 1` | `flex-1` |
| `flexShrink: 0` | `shrink-0` |
| `minWidth: 0` | `min-w-0` |
| `objectFit: 'cover'` | `object-cover` |
| `position: 'relative'` | `relative` |
| `position: 'absolute'` | `absolute` |
| `position: 'fixed'` | `fixed` |

- [ ] **Step 1: Convert `src/app/faq/page.js`** (19 inline styles)

Replace all `style={{...}}` with Tailwind classes using the reference tables above.

- [ ] **Step 2: Convert `src/app/activity/page.js`** (19 inline styles)

Replace all `style={{...}}` with Tailwind classes.

- [ ] **Step 3: Convert `src/app/network/page.js`** (17 inline styles)

Replace all `style={{...}}` with Tailwind classes.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

- [ ] **Step 5: Browser QA — check FAQ, Activity, and Network pages**

Open each page in browser. Verify layout, colors, spacing, and typography match pre-migration.

- [ ] **Step 6: Commit**

```bash
git add src/app/faq/page.js src/app/activity/page.js src/app/network/page.js
git commit -m "refactor: convert FAQ, Activity, Network pages to Tailwind"
```

---

## Task 6: Convert Page Files to Tailwind (Part 2 — Larger Pages)

**Files:**
- Modify: `src/app/owner/[address]/page.js` (42 inline styles)
- Modify: `src/app/agents/page.js` (43 inline styles)
- Modify: `src/app/leaderboard/page.js` (52 inline styles)
- Modify: `src/app/admin/analytics/page.js` (53 inline styles)

- [ ] **Step 1: Convert `src/app/owner/[address]/page.js`**

Replace all `style={{...}}` with Tailwind classes.

- [ ] **Step 2: Convert `src/app/agents/page.js`**

Replace all `style={{...}}` with Tailwind classes. Note: agent card components (`AgentCard`, `AgentListItem`) have repeated patterns — use consistent class combinations.

- [ ] **Step 3: Convert `src/app/leaderboard/page.js`**

Replace all `style={{...}}` with Tailwind classes.

- [ ] **Step 4: Convert `src/app/admin/analytics/page.js`**

Replace all `style={{...}}` with Tailwind classes.

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Browser QA — check Owner, Agents, Leaderboard, Analytics pages**

Open each page. Verify layout, card designs, table styling, responsive behavior.

- [ ] **Step 7: Commit**

```bash
git add src/app/owner/ src/app/agents/page.js src/app/leaderboard/page.js src/app/admin/analytics/page.js
git commit -m "refactor: convert Owner, Agents, Leaderboard, Analytics pages to Tailwind"
```

---

## Task 7: Convert Small Extracted Components to Tailwind

**Files:**
- Modify: `src/components/tile-panel/ShareButton.js`
- Modify: `src/components/tile-panel/VerificationBadge.js`
- Modify: `src/components/grid/MobileHints.js`
- Modify: `src/components/grid/ToolToggle.js`
- Modify: `src/components/grid/TileTooltip.js`
- Modify: `src/components/grid/SelectionOverlay.js`
- Modify: `src/components/grid/ListView.js`

- [ ] **Step 1: Convert `ShareButton.js`** (~5 inline styles)

- [ ] **Step 2: Convert `VerificationBadge.js`** (~3 inline styles)

- [ ] **Step 3: Convert `MobileHints.js`** (~2 inline styles)

- [ ] **Step 4: Convert `ToolToggle.js`** (~5 inline styles — note: active tool state uses conditional styles, keep dynamic background/borderColor inline or use ternary with class names)

- [ ] **Step 5: Convert `TileTooltip.js`** (~8 inline styles — note: position is always `absolute bottom-4 left-1/2 -translate-x-1/2`, status dot color is dynamic)

- [ ] **Step 6: Convert `SelectionOverlay.js`** (~4 inline styles — note: `left`, `top`, `width`, `height` from selectionRect MUST stay inline as they're computed from mouse coordinates)

- [ ] **Step 7: Convert `ListView.js`** (~25 inline styles — table styles, cell padding, colors)

- [ ] **Step 8: Verify build passes**

```bash
npm run build
```

- [ ] **Step 9: Browser QA — check grid view, list view, tile panel**

Test: grid canvas tooltips, selection overlay, tool toggle, list view table, tile panel share button.

- [ ] **Step 10: Commit**

```bash
git add src/components/tile-panel/ShareButton.js src/components/tile-panel/VerificationBadge.js
git add src/components/grid/MobileHints.js src/components/grid/ToolToggle.js src/components/grid/TileTooltip.js
git add src/components/grid/SelectionOverlay.js src/components/grid/ListView.js
git commit -m "refactor: convert small extracted components to Tailwind"
```

---

## Task 8: Convert Medium Components to Tailwind

**Files:**
- Modify: `src/components/Header.js` (33 inline styles)
- Modify: `src/components/FilterBar.js` (0 inline styles — may already use CSS classes, verify)
- Modify: `src/components/StatsPanel.js` (29 inline styles + style constant objects)
- Modify: `src/components/OnboardingModal.js` (11 inline styles)
- Modify: `src/components/ClaimModal.js` (25 inline styles)
- Modify: `src/components/BatchClaimModal.js` (32 inline styles)
- Modify: `src/components/BlockClaimModal.js` (35 inline styles)
- Modify: `src/components/MultiTileSpanModal.js` (35 inline styles)
- Modify: `src/components/InteractionsPanel.js` (52 inline styles)

- [ ] **Step 1: Convert `Header.js`**

- [ ] **Step 2: Convert `StatsPanel.js`** — remove `panelStyle`, `headerStyle`, `sectionTitle` constant objects, replace with className strings

- [ ] **Step 3: Convert `OnboardingModal.js`**

- [ ] **Step 4: Convert `ClaimModal.js`**

- [ ] **Step 5: Convert `BatchClaimModal.js`**

- [ ] **Step 6: Convert `BlockClaimModal.js`**

- [ ] **Step 7: Convert `MultiTileSpanModal.js`**

- [ ] **Step 8: Convert `InteractionsPanel.js`**

- [ ] **Step 9: Verify build passes**

```bash
npm run build
```

- [ ] **Step 10: Browser QA — check header, stats panel, all modals, interactions**

Test: header responsive nav, stats panel expand/collapse, onboarding modal, claim modals (single/batch/block/span), interactions panel tabs.

- [ ] **Step 11: Commit**

```bash
git add src/components/Header.js src/components/StatsPanel.js src/components/OnboardingModal.js
git add src/components/ClaimModal.js src/components/BatchClaimModal.js src/components/BlockClaimModal.js
git add src/components/MultiTileSpanModal.js src/components/InteractionsPanel.js
git commit -m "refactor: convert medium components to Tailwind"
```

---

## Task 9: Convert Large TilePanel Components to Tailwind

**Files:**
- Modify: `src/components/tile-panel/VerifyGithubButton.js` (~20 inline styles)
- Modify: `src/components/tile-panel/VerifyXButton.js` (~25 inline styles)
- Modify: `src/components/tile-panel/NeighborNetworkPanel.js` (~50 inline styles)
- Modify: `src/components/tile-panel/TilePanel.js` (~80 inline styles + style constant objects)

- [ ] **Step 1: Convert `VerifyGithubButton.js`**

- [ ] **Step 2: Convert `VerifyXButton.js`**

- [ ] **Step 3: Convert `NeighborNetworkPanel.js`**

- [ ] **Step 4: Convert `TilePanel.js`** — remove `inputStyle`, `labelStyle`, `panelStyle` constant objects, replace with className strings. Note: `isMobile` conditional panelStyle should become responsive Tailwind classes.

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Browser QA — full tile panel test**

Test: open a claimed tile panel, check metadata display, edit form, verification buttons (GitHub gist flow UI, X verification flow UI), neighbor network, share button, mobile responsive behavior.

- [ ] **Step 7: Commit**

```bash
git add src/components/tile-panel/
git commit -m "refactor: convert TilePanel sub-components to Tailwind"
```

---

## Task 10: Convert Grid.js to Tailwind

**Files:**
- Modify: `src/components/grid/Grid.js`

- [ ] **Step 1: Convert static inline styles to Tailwind classes**

Convert styles that are NOT dynamic:
- Container div: `style={{ flex: 1, overflow: 'hidden', position: 'relative' }}` → `className="flex-1 overflow-hidden relative"`
- Canvas element: `style={{ display: 'block', width: '100%', height: '100%' }}` → `className="block w-full h-full"`

- [ ] **Step 2: Keep dynamic styles inline**

These MUST remain as inline styles (values computed at runtime):
- `selectionRect` position/dimensions (`.x1`, `.y1`, width/height from mouse coords)
- Tool toggle active state conditional backgrounds (or convert to ternary className)

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

- [ ] **Step 4: Browser QA — full grid test**

Test: canvas pan (drag), zoom (scroll/pinch), tile click, tile hover tooltip, drag-select (shift+drag or select tool), batch claim modal from selection, tool toggle, list view switch, mobile gestures.

- [ ] **Step 5: Commit**

```bash
git add src/components/grid/Grid.js
git commit -m "refactor: convert Grid.js static styles to Tailwind"
```

---

## Task 11: Final Cleanup and Verification

**Files:**
- Modify: `src/app/globals.css` (final cleanup pass)
- All files (verification)

- [ ] **Step 1: Scan for remaining inline styles**

```bash
grep -rn "style={{" src/ | grep -v node_modules | grep -v ".next"
```

Expected: Only Grid.js canvas dynamic values (selectionRect position, canvas dimensions) and data-driven category colors. Everything else should be Tailwind classes.

- [ ] **Step 2: Scan for hardcoded hex in className**

```bash
grep -rn "className=.*#[0-9a-fA-F]" src/ | grep -v node_modules
```

Expected: Zero results. All colors should use theme tokens.

- [ ] **Step 3: Clean up globals.css**

Remove any CSS that is now dead (no longer referenced by any component). Verify the file contains only:
- `@import "tailwindcss"` + `@theme`
- `@apply`-based component classes
- Keyframes
- Cursor rules
- Scrollbar styles
- Selection styles
- Overflow rules

- [ ] **Step 4: Verify line counts**

```bash
wc -l src/components/tile-panel/*.js src/components/grid/*.js
```

Verify: No single file > 900 lines (TilePanel) or > 1400 lines (Grid).

- [ ] **Step 5: Full build**

```bash
npm run build
```

Expected: Zero errors, zero warnings related to CSS.

- [ ] **Step 6: Full browser QA — every page**

Open each page and verify visual fidelity:
1. Main grid page (canvas view + list view)
2. Tile panel (open a claimed tile)
3. Claim modals (single, batch, block, span)
4. Agents page
5. Leaderboard page
6. Activity page
7. Network page
8. FAQ page
9. Owner dashboard (`/owner/[address]`)
10. Admin analytics
11. Onboarding modal
12. Mobile responsive: test at 375px width

Verify for each:
- Colors match pre-migration
- Spacing/padding consistent
- Fonts correct (pixel headings, mono numbers, body text)
- Pixel cursors work
- Hover/active states work
- Responsive breakpoints work

- [ ] **Step 7: Final commit**

```bash
git add src/app/globals.css
git commit -m "refactor: final Tailwind migration cleanup"
```

- [ ] **Step 8: Push all commits**

```bash
git remote set-url origin "https://$(cat ~/.openclaw/workspace/.secrets/github-token-mssteuer.txt)@github.com/mssteuer/tiles-bot.git"
git push origin master
```
