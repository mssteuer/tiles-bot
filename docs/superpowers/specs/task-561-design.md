# Task #561: Migrate from Inline Styles to Tailwind CSS v4 + Extract Sub-Components

## Goal

Replace all inline `style={{}}` objects across 18 files (~600+ occurrences) with Tailwind CSS v4 utility classes, decompose TilePanel.js (1692 lines) and Grid.js (1786 lines) into focused sub-components, and rebuild existing globals.css component classes using Tailwind's `@apply` directive.

## Architecture

Tailwind v4 uses CSS-first configuration via `@theme` and `@import "tailwindcss"`. The project's existing CSS variable design system (15 color tokens, 3 font families) maps directly into Tailwind theme tokens, giving utility classes like `bg-bg`, `text-text-dim`, `border-border-bright`, `font-pixel`. No `tailwind.config.js` needed.

Component decomposition creates barrel re-exports at original import paths so no external consumers change.

## Tech Stack

- Tailwind CSS v4 (`tailwindcss` + `@tailwindcss/postcss`)
- PostCSS (via `postcss.config.mjs`)
- Next.js 16 / React 19 (unchanged)

---

## 1. Tailwind v4 Setup

### Installation

```bash
npm install tailwindcss @tailwindcss/postcss
```

### PostCSS Config

New file: `postcss.config.mjs`

```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

### Theme Registration

Replace the `:root` CSS variable block in `globals.css` with `@theme`:

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

This generates utility classes: `bg-bg`, `bg-surface`, `text-text-dim`, `border-border-bright`, `font-pixel`, etc.

Additional tokens added for one-off hex values that appear in multiple files:
- `--color-accent-red` (#ef4444) — error states
- `--color-accent-red-light` (#f87171) — inline error messages
- `--color-surface-dark` (#0a0a0f) — input backgrounds, list view bg
- `--color-surface-alt` (#0f0f1a) — panel backgrounds
- `--color-border-dim` (#1a1a2e) — subtle borders
- `--color-text-gray` (#9ca3af) — secondary text
- `--color-text-light` (#cbd5e1) — descriptions

---

## 2. TilePanel.js Decomposition

Current: 1692 lines, 10 functions in one file.

### New File Structure

```
src/components/tile-panel/
  utils.js              — shared constants + utility functions
  ShareButton.js        — copy-link share button (~42 lines)
  VerificationBadge.js  — badge display + CopyButton (~45 lines)
  VerifyGithubButton.js — GitHub gist verification flow (~152 lines)
  VerifyXButton.js      — X/Twitter verification flow (~173 lines)
  NeighborNetworkPanel.js — connection requests & neighbor display (~387 lines)
  TilePanel.js          — main panel: edit form, metadata, tabs (~700 lines)
src/components/TilePanel.js — barrel re-export
```

### utils.js Contents

```js
// Constants
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID;
export const CATEGORY_COLORS = { coding: '...', trading: '...', ... };
export const X_ICON_STYLE = { ... };

// Utilities
export function getSizedImageUrl(url, size) { ... }
export function truncateAddress(addr) { ... }
export function truncateTx(hash) { ... }
```

### Barrel Re-export

`src/components/TilePanel.js` becomes:
```js
export { default } from './tile-panel/TilePanel';
```

No external import paths change.

---

## 3. Grid.js Decomposition

Current: 1786 lines, main Grid function is 1566 lines.

### New File Structure

```
src/components/grid/
  utils.js            — pure functions + constants (~120 lines)
  MobileHints.js      — touch gesture hint overlay (~23 lines)
  ListView.js         — table view of tiles (~70 lines)
  TileTooltip.js      — floating tile info on hover (~30 lines)
  SelectionOverlay.js — drag-select visual feedback (~40 lines)
  ToolToggle.js       — pan/select tool switcher (~35 lines)
  Grid.js             — canvas rendering, pan/zoom, events (~1300 lines)
src/components/Grid.js — barrel re-export
```

### utils.js Contents

```js
export const GRID_SIZE = 256;
export const TILE_SIZE = 32;
export const GRID_PX = GRID_SIZE * TILE_SIZE;
export const CATEGORY_COLORS = { ... };
export const HB_GREEN = 5 * 60 * 1000;
export const HB_YELLOW = 30 * 60 * 1000;

export function getTileActivityScore(tile) { ... }
export function heatmapColor(score, alpha) { ... }
export function getThumbUrl(tile, hd) { ... }
export function scheduleFetch(url, cacheKey, priority) { ... }
export function loadTileImage(tile, hd) { ... }
export function getHeartbeatGlowColor(lastHeartbeat) { ... }
export function tileMatchesFilter(tile, searchQuery, categoryFilter) { ... }
export function hasActiveFilter(searchQuery, categoryFilter) { ... }
export function getFirstMatchingTile(tiles, searchQuery, categoryFilter) { ... }
```

### Barrel Re-export

`src/components/Grid.js` becomes:
```js
export { default } from './grid/Grid';
```

---

## 4. globals.css Conversion

### Rebuilt with @apply

Existing component classes are rebuilt using Tailwind utilities:

**`.btn-retro`:**
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
.btn-retro:active { @apply translate-x-px translate-y-px; }
```

Same treatment for: `.btn-retro-primary`, `.btn-retro-green`, `.retro-panel`, `.retro-modal-overlay`, `.retro-modal`, `.retro-input`, `.retro-tag`, `.pill`, `.filter-bar`, `.search-input`, `.icon-btn`, `.side-panel`, `.header-nav-desktop`.

### Removed from globals.css

- `:root` variable declarations (replaced by `@theme`)
- Hand-written layout CSS for `.app-shell`, `.main-content`, `.filter-bar`, `.side-panel`, `.header-nav-desktop` (replaced by Tailwind utilities + `@apply`)
- Media queries for responsive behavior (replaced by Tailwind responsive prefixes)

### Preserved in globals.css

- `@keyframes spin`, `pulse-glow`, `pixel-blink`
- `.btn-loading` animation class
- Pixel cursor rules (`url()` + `!important`)
- Scrollbar styles (`::-webkit-scrollbar`)
- Selection styles (`::selection`)
- `body:has(.app-shell)` overflow rules
- `* { box-sizing: border-box; }` (Tailwind preflight covers this, but keeping explicitly for safety)

---

## 5. Inline Style Conversion Patterns

### Static styles → Tailwind classes

```jsx
// Before
<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>

// After
<div className="flex items-center gap-2 text-[13px]">
```

### Color references → theme tokens

```jsx
// Before
<span style={{ color: '#94a3b8' }}>

// After
<span className="text-text-dim">
```

### Style constant objects → className strings

```jsx
// Before
const panelStyle = { background: '#0f0f1a', border: '1px solid #2a2a3e', ... };
<div style={panelStyle}>

// After
<div className="bg-surface-alt border border-border-dim rounded-xl overflow-hidden text-[13px] text-text-dim w-full min-w-0 shrink">
```

### Stays inline (dynamic values)

```jsx
// Canvas selection rect — position computed from mouse coords
<div style={{
  position: 'absolute',
  left: selectionRect.x1,
  top: selectionRect.y1,
  width: selectionRect.x2 - selectionRect.x1,
  height: selectionRect.y2 - selectionRect.y1,
}} />

// Data-driven category color
<span style={{ background: CATEGORY_COLORS[tile.category] }} />
```

---

## 6. Migration Order

1. Install Tailwind v4 + configure theme (zero visual changes)
2. Rebuild globals.css component classes with `@apply`
3. Extract TilePanel sub-components (structural, no style changes)
4. Extract Grid sub-components (structural, no style changes)
5. Convert page files (smallest first): FAQ → Activity → Network → Owner → Agents → Leaderboard → Admin/Analytics
6. Convert extracted small components: ShareButton → VerificationBadge → MobileHints → ToolToggle → TileTooltip → SelectionOverlay → ListView
7. Convert medium components: Header → FilterBar → StatsPanel → OnboardingModal → ClaimModal → BatchClaimModal → BlockClaimModal → MultiTileSpanModal → InteractionsPanel
8. Convert large components: NeighborNetworkPanel → VerifyGithubButton → VerifyXButton → TilePanel
9. Convert Grid.js (last — most dynamic styles)
10. Final cleanup: remove dead CSS, verify zero remaining unnecessary `style={{}}`

---

## 7. Acceptance Criteria

1. Zero `style={{}}` in any file except Grid.js canvas-specific dynamic values (selection rect position/dimensions, canvas element dimensions) and data-driven color values (category colors from JS objects)
2. All colors reference Tailwind theme tokens — no hardcoded hex values in `className` or `style`
3. `npm run build` passes with zero errors
4. TilePanel.js decomposed into `tile-panel/` directory with 7 files, no single file > 900 lines
5. Grid.js decomposed into `grid/` directory with 7 files, main Grid.js < 1400 lines
6. Pixel cursors work (hover states show custom cursor on buttons, links, interactive elements)
7. All pages visually identical to pre-migration state
8. Responsive behavior preserved (mobile side panel drawer, filter bar horizontal scroll, nav collapse at 768px breakpoint)
9. globals.css contains only: `@import "tailwindcss"`, `@theme`, `@apply`-based component classes, keyframes, cursor rules, scrollbar styles, selection styles, and overflow rules
