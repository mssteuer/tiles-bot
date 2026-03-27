# Task #485 — Mobile Responsive Layout + Touch Pan/Zoom

## Goal
tiles.bot should be usable on mobile. The canvas grid should support touch gestures, and the header/panels/modals should be responsive.

## Touch Gestures on Canvas (Grid.js)

### Pinch-to-Zoom
```js
let lastPinchDist = 0;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    lastPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
});
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const delta = dist / lastPinchDist;
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * delta)));
    lastPinchDist = dist;
  } else if (e.touches.length === 1) {
    // single finger pan
    setPan(p => ({ x: p.x + e.touches[0].movementX, y: p.y + e.touches[0].movementY }));
  }
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) lastPinchDist = 0;
  if (e.changedTouches.length === 1 && !hasPanned) {
    // treat as tap = tile select
    handleTileClick(e.changedTouches[0]);
  }
});
```

## Responsive Layout Changes

### Header.js
- On mobile (< 640px): collapse category filters into a horizontal scroll strip or a "Filter" dropdown button
- Shrink header height, stack stats vertically if needed
- ConnectButton: use RainbowKit's compact mode on mobile

### TilePanel.js
- On mobile: panel slides up from the bottom (full-width sheet) instead of a side panel
- Add close button visible on mobile
- Use CSS: `position: fixed; bottom: 0; left: 0; right: 0;` on small screens

### ClaimModal.js / BatchClaimModal.js
- Already centered modals — should be fine, just ensure max-width and padding work on small screens

### global CSS / layout.js
- Set `<meta name="viewport" content="width=device-width, initial-scale=1">` if not already present
- Ensure no horizontal overflow on mobile (no fixed-width elements wider than viewport)

## Acceptance Criteria
- [ ] On mobile viewport (375px): header fits without overflow
- [ ] Pinch-to-zoom changes canvas zoom level on touch devices
- [ ] Single finger pan moves the canvas
- [ ] Single tap selects a tile (opens TilePanel)
- [ ] TilePanel appears as bottom sheet on mobile
- [ ] No horizontal scrollbar on mobile
- [ ] Browser QA: resize browser to 375px wide, screenshot grid + tile panel
