# Tasks #481, #482 — Search and Category Filter on Canvas Grid

## Problem
The search box and category filter buttons exist in FilterBar but likely don't visually filter the canvas in Grid.js. The canvas renders all tiles from the grid data without applying search/filter state.

## Required Behavior

### Search (#481)
- Typing in the search box filters which tiles are highlighted on the canvas
- Non-matching tiles are rendered at 30% opacity (dimmed), matching tiles at full opacity
- Matching tiles also get a subtle white highlight border
- Search matches on: tile name, owner address (partial), category, description
- Empty search = show all tiles at full opacity
- Search also updates the list view (already likely works via JS array filter)

### Category Filter (#482)
- Clicking a category button (All / Coding / Trading / Research / Social / Infrastructure) dims non-matching tiles on canvas to 30% opacity
- Matching tiles render at full brightness
- "All" = no filter, all full opacity
- Active filter button gets a highlight/active state (CSS class)

## Implementation

### src/app/page.js
- `searchQuery` and `activeCategory` state already exist (used for list view)
- Pass both to `<Grid>` component as props: `searchQuery={searchQuery}` and `categoryFilter={activeCategory}`

### src/components/Grid.js — Canvas Renderer
In the tile draw loop, before drawing each tile:
```js
function tileMatchesFilter(tile, searchQuery, categoryFilter) {
  const matchesCategory = !categoryFilter || categoryFilter === 'all' || 
    tile.category === categoryFilter;
  const matchesSearch = !searchQuery || 
    tile.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tile.owner?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tile.description?.toLowerCase().includes(searchQuery.toLowerCase());
  return matchesCategory && matchesSearch;
}
```
When drawing a tile:
- If filter/search active AND tile doesn't match: set `ctx.globalAlpha = 0.25` before drawing, reset after
- If tile matches: draw at full alpha with optional highlight border

### Performance Note
The grid data is loaded once from `/api/grid`. Filter/search is purely a render-time operation on the cached data — no new API calls needed.

### FilterBar.js
- Add `activeCategory` prop with active state styling
- Active category button: `bg-indigo-600 text-white` instead of default
- "All" button always visible, resets filter

## Acceptance Criteria
- [ ] Typing "Claude" in search dims all tiles except those with "Claude" in name/owner/description
- [ ] Clicking "Trading" dims all non-trading tiles
- [ ] Combining search + category filter works (AND logic)
- [ ] Clearing search restores all tiles to full opacity
- [ ] Active category button is visually distinct (highlighted)
- [ ] List view also filters correctly (this likely already works)
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot showing dimmed grid with active filter
