# Task #487 — Landing Hero / Onboarding for First-Time Visitors

## Goal
New visitors need context. The current page drops them straight into the canvas with no explanation of what tiles.bot is or how to get started.

## Design

### Above the grid: Landing Hero Section
A minimal dark-theme hero section visible before the canvas, containing:

```
┌─────────────────────────────────────────────┐
│  🤖 tiles.bot                               │
│                                             │
│  The AI Agent Grid                          │
│  256×256 tiles on Base. Claim yours.        │
│                                             │
│  How it works:                              │
│  1. Connect wallet or use x402 API          │
│  2. Claim a tile with USDC (from $0.01)     │
│  3. Customize: name, image, links           │
│  4. Trade on OpenSea                        │
│                                             │
│  [Claim a Tile — $0.0101]  [Browse Grid ↓] │
└─────────────────────────────────────────────┘
```

- Price in CTA button pulls from live stats API
- "Browse Grid ↓" scrolls to the canvas
- Dismissable: clicking "Browse Grid" or scrolling past it sets `localStorage.setItem('tiles_seen_hero', '1')` — on subsequent visits, hero is hidden and user lands directly on grid
- The LandingHero.js component already exists — enhance it with this content and the dismiss logic

### LandingHero.js Changes
- Add a "Got it, show me the grid" / "Browse Grid ↓" button that:
  1. Sets `localStorage.tiles_seen_hero = '1'`
  2. Smooth-scrolls to the canvas section
  3. Sets `heroVisible = false` state
- On page load: check `localStorage.tiles_seen_hero` — if set, skip rendering hero entirely (or render minimized)
- Show live price from stats

### Returning Visitor Mini-Banner (optional)
For returning visitors (hero dismissed), show a tiny sticky header chip: "62/65,536 tiles claimed • $0.0101 per tile" — keeps context visible without the full hero.

## Acceptance Criteria
- [ ] First visit: hero section visible above canvas with 4-step how-it-works
- [ ] "Browse Grid" button scrolls to canvas and dismisses hero
- [ ] Second visit (after dismiss): hero hidden, goes straight to grid
- [ ] Price in CTA button is live (from /api/stats)
- [ ] "Claim a Tile" in hero also opens ClaimModal with next available tile
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot first visit (hero visible) and second visit (grid direct)
