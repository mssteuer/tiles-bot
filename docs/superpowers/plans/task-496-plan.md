# Multi-Tile Image Spanning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow tile owners to upload a single image that spans a rectangular area of tiles, sliced into individual NFT images with combined canvas rendering.

**Architecture:** New `block_groups` table and spanning layer independent of existing `tile_blocks`. Backend slices images via `sharp`, uploads to Filebase/IPFS. Canvas renders full image as one rectangle when all tiles share the same owner, falls back to individual slices otherwise.

**Tech Stack:** Next.js API routes, better-sqlite3, sharp (image processing), Filebase/IPFS (storage), HTML Canvas (rendering), React (SpanImageModal component)

**Spec:** `docs/superpowers/specs/task-496-design.md`

---

## File Structure

### New Files
- `src/lib/block-groups.js` — DB helpers for block_groups CRUD, rectangle validation, image slicing logic
- `src/app/api/block-groups/route.js` — GET (list) + POST (create) block groups
- `src/app/api/block-groups/[id]/route.js` — GET (detail) + DELETE (dissolve)
- `src/app/api/block-groups/[id]/image/route.js` — POST (upload spanning image)
- `src/components/SpanImageModal.js` — Modal for uploading spanning image (both entry points)

### Modified Files
- `src/lib/db.js` — Schema migration (block_groups table, block_group_id column on tiles)
- `src/lib/openseaMetadata.cjs` — Add Block Group trait to tile metadata
- `src/components/Grid.js` — Render combined block_group images on canvas, modify drag-select to detect owned rectangles
- `src/components/BatchClaimModal.js` — Add "Upload Spanning Image" button in success state
- `src/app/page.js` — Fetch block_groups, pass as prop, handle SSE events, wire SpanImageModal

---

## Task 1: Database Schema — block_groups table + migration

**Files:**
- Modify: `src/lib/db.js` (in `initSchema` function, around line 81-103)

- [ ] **Step 1: Add block_groups table creation to initSchema**

In `src/lib/db.js`, inside the `initSchema(db)` function, after the existing `tile_blocks` table creation (around line 103), add:

```javascript
  // — Block groups (image spanning)
  db.exec(`
    CREATE TABLE IF NOT EXISTS block_groups (
      id            TEXT PRIMARY KEY,
      owner         TEXT NOT NULL,
      tile_ids      TEXT NOT NULL,
      cols          INTEGER NOT NULL,
      rows          INTEGER NOT NULL,
      top_left_id   INTEGER NOT NULL,
      full_image_url TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_block_groups_owner ON block_groups(owner);
    CREATE INDEX IF NOT EXISTS idx_block_groups_status ON block_groups(status);
  `);
```

- [ ] **Step 2: Add block_group_id column migration on tiles table**

After the existing `ALTER TABLE` migrations (around line 80), add:

```javascript
  try { db.exec(`ALTER TABLE tiles ADD COLUMN block_group_id TEXT`); } catch {}
```

- [ ] **Step 3: Add block_group_id to rowToTile function**

In the `rowToTile` function (around line 109), add to the returned object:

```javascript
    blockGroupId: row.block_group_id || null,
```

- [ ] **Step 4: Verify schema loads without errors**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && node -e "import('./src/lib/db.js').then(m => { console.log('DB loaded OK, tile count:', m.getClaimedCount()); })"`

Expected: `DB loaded OK, tile count: <number>` with no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/lib/db.js
git commit -m "feat(db): add block_groups table and block_group_id column for image spanning"
```

---

## Task 2: Block Groups Library — CRUD helpers + rectangle validation

**Files:**
- Create: `src/lib/block-groups.js`

- [ ] **Step 1: Create the block-groups.js module**

Create `src/lib/block-groups.js` with:

```javascript
import { randomUUID } from 'crypto';
import { getDb, getTile, TOTAL_TILES } from './db.js';

const GRID_SIZE = 256;
const MAX_SPAN_SIDE = 16;
const MIN_TILES = 2;
const MAX_TILES = MAX_SPAN_SIDE * MAX_SPAN_SIDE; // 256

/**
 * Validate that a list of tile IDs forms a contiguous rectangle on the 256x256 grid.
 * Returns { cols, rows, topLeftId } or throws with a descriptive error.
 */
export function validateRectangle(tileIds) {
  if (!Array.isArray(tileIds) || tileIds.length < MIN_TILES) {
    throw new Error(`At least ${MIN_TILES} tiles required`);
  }
  if (tileIds.length > MAX_TILES) {
    throw new Error(`Maximum ${MAX_TILES} tiles (${MAX_SPAN_SIDE}x${MAX_SPAN_SIDE})`);
  }

  const coords = tileIds.map(id => ({
    id,
    row: Math.floor(id / GRID_SIZE),
    col: id % GRID_SIZE,
  }));

  const minRow = Math.min(...coords.map(c => c.row));
  const maxRow = Math.max(...coords.map(c => c.row));
  const minCol = Math.min(...coords.map(c => c.col));
  const maxCol = Math.max(...coords.map(c => c.col));

  const cols = maxCol - minCol + 1;
  const rows = maxRow - minRow + 1;

  if (cols > MAX_SPAN_SIDE || rows > MAX_SPAN_SIDE) {
    throw new Error(`Rectangle exceeds maximum ${MAX_SPAN_SIDE}x${MAX_SPAN_SIDE}`);
  }

  // Check that the tile count matches the expected rectangle area
  const expectedCount = cols * rows;
  if (tileIds.length !== expectedCount) {
    throw new Error(`Tile IDs don't form a complete rectangle: expected ${expectedCount} tiles for ${cols}x${rows}, got ${tileIds.length}`);
  }

  // Verify every position in the rectangle is present
  const idSet = new Set(tileIds);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const expected = r * GRID_SIZE + c;
      if (!idSet.has(expected)) {
        throw new Error(`Missing tile #${expected} at row ${r}, col ${c} — not a contiguous rectangle`);
      }
    }
  }

  const topLeftId = minRow * GRID_SIZE + minCol;
  return { cols, rows, topLeftId };
}

/**
 * Validate ownership: all tiles must be claimed and owned by the given wallet.
 */
export function validateOwnership(tileIds, wallet) {
  const db = getDb();
  const stmt = db.prepare('SELECT id, owner FROM tiles WHERE id = ?');

  for (const id of tileIds) {
    const row = stmt.get(id);
    if (!row) {
      throw new Error(`Tile #${id} is not claimed`);
    }
    if (row.owner.toLowerCase() !== wallet.toLowerCase()) {
      throw new Error(`Tile #${id} is not owned by ${wallet}`);
    }
  }
}

/**
 * Create a block group. Removes tiles from any existing group first.
 * Returns the new group object.
 */
export function createBlockGroup(tileIds, wallet) {
  const { cols, rows, topLeftId } = validateRectangle(tileIds);
  validateOwnership(tileIds, wallet);

  const db = getDb();
  const groupId = randomUUID();

  const createTx = db.transaction(() => {
    // Remove tiles from any existing block group
    const existingGroups = new Set();
    const checkStmt = db.prepare('SELECT block_group_id FROM tiles WHERE id = ? AND block_group_id IS NOT NULL');
    for (const id of tileIds) {
      const row = checkStmt.get(id);
      if (row?.block_group_id) existingGroups.add(row.block_group_id);
    }

    // Clear block_group_id from tiles in old groups
    if (existingGroups.size > 0) {
      const clearStmt = db.prepare('UPDATE tiles SET block_group_id = NULL WHERE block_group_id = ?');
      const deleteStmt = db.prepare('DELETE FROM block_groups WHERE id = ? AND (SELECT COUNT(*) FROM tiles WHERE block_group_id = ?) = 0');
      for (const oldGroupId of existingGroups) {
        clearStmt.run(oldGroupId);
        // Delete orphaned groups (no tiles remaining)
        deleteStmt.run(oldGroupId, oldGroupId);
      }
    }

    // Insert block group
    db.prepare(`
      INSERT INTO block_groups (id, owner, tile_ids, cols, rows, top_left_id, status, created_at)
      VALUES (@id, @owner, @tile_ids, @cols, @rows, @top_left_id, 'pending', datetime('now'))
    `).run({
      id: groupId,
      owner: wallet,
      tile_ids: JSON.stringify(tileIds),
      cols,
      rows,
      top_left_id: topLeftId,
    });

    // Assign tiles to the new group
    const assignStmt = db.prepare('UPDATE tiles SET block_group_id = ? WHERE id = ?');
    for (const id of tileIds) {
      assignStmt.run(groupId, id);
    }

    return {
      id: groupId,
      owner: wallet,
      tileIds,
      cols,
      rows,
      topLeftId,
      fullImageUrl: null,
      status: 'pending',
    };
  });

  return createTx();
}

/**
 * Get a block group by ID.
 */
export function getBlockGroup(groupId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM block_groups WHERE id = ?').get(groupId);
  if (!row) return null;
  return {
    id: row.id,
    owner: row.owner,
    tileIds: JSON.parse(row.tile_ids),
    cols: row.cols,
    rows: row.rows,
    topLeftId: row.top_left_id,
    fullImageUrl: row.full_image_url,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * List all block groups, optionally filtered by status.
 */
export function listBlockGroups(status = 'ready') {
  const db = getDb();
  const rows = status
    ? db.prepare('SELECT * FROM block_groups WHERE status = ?').all(status)
    : db.prepare('SELECT * FROM block_groups').all();
  return rows.map(row => ({
    id: row.id,
    owner: row.owner,
    tileIds: JSON.parse(row.tile_ids),
    cols: row.cols,
    rows: row.rows,
    topLeftId: row.top_left_id,
    fullImageUrl: row.full_image_url,
    status: row.status,
    createdAt: row.created_at,
  }));
}

/**
 * Update block group fields (e.g. status, full_image_url).
 */
export function updateBlockGroup(groupId, updates) {
  const db = getDb();
  const allowed = ['status', 'full_image_url'];
  const sets = [];
  const values = { id: groupId };

  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = @${key}`);
      values[key] = val;
    }
  }

  if (sets.length === 0) return getBlockGroup(groupId);
  db.prepare(`UPDATE block_groups SET ${sets.join(', ')} WHERE id = @id`).run(values);
  return getBlockGroup(groupId);
}

/**
 * Dissolve a block group: clear block_group_id on all tiles, delete the group.
 * Tiles keep their individual slice images.
 */
export function dissolveBlockGroup(groupId, wallet) {
  const db = getDb();
  const group = getBlockGroup(groupId);
  if (!group) throw new Error('Block group not found');
  if (group.owner.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error('Unauthorized — must be group owner');
  }

  const dissolveTx = db.transaction(() => {
    db.prepare('UPDATE tiles SET block_group_id = NULL WHERE block_group_id = ?').run(groupId);
    db.prepare('DELETE FROM block_groups WHERE id = ?').run(groupId);
  });

  dissolveTx();
  return { ok: true, dissolved: groupId };
}

/**
 * Update a tile's image_url (used when setting slice images).
 */
export function setTileImageUrl(tileId, imageUrl) {
  const db = getDb();
  db.prepare('UPDATE tiles SET image_url = ? WHERE id = ?').run(imageUrl, tileId);
}
```

- [ ] **Step 2: Verify module loads correctly**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && node -e "import('./src/lib/block-groups.js').then(m => { console.log('block-groups loaded OK, validateRectangle exists:', typeof m.validateRectangle); })"`

Expected: `block-groups loaded OK, validateRectangle exists: function`

- [ ] **Step 3: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/lib/block-groups.js
git commit -m "feat(block-groups): add CRUD helpers, rectangle validation, ownership checks"
```

---

## Task 3: API — Create and List Block Groups

**Files:**
- Create: `src/app/api/block-groups/route.js`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/block-groups/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { createBlockGroup, listBlockGroups } from '@/lib/block-groups';

/**
 * GET /api/block-groups
 * List all block groups with status=ready (for canvas rendering).
 * Pass ?status=all to include all statuses.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const status = statusParam === 'all' ? null : (statusParam || 'ready');

  const groups = listBlockGroups(status);
  return NextResponse.json({ groups });
}

/**
 * POST /api/block-groups
 * Create a new block group (no image yet).
 * Body: { tileIds: number[] }
 * Header: x-wallet — must own all tiles.
 */
export async function POST(request) {
  const wallet = request.headers.get('x-wallet') || request.headers.get('x-address');
  if (!wallet) {
    return NextResponse.json({ error: 'x-wallet header required' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tileIds } = body;
  if (!Array.isArray(tileIds) || tileIds.length === 0) {
    return NextResponse.json({ error: 'tileIds array required' }, { status: 400 });
  }

  // Ensure all IDs are valid integers
  const ids = tileIds.map(id => parseInt(id, 10));
  if (ids.some(id => isNaN(id) || id < 0 || id >= 65536)) {
    return NextResponse.json({ error: 'Invalid tile ID in array' }, { status: 400 });
  }

  try {
    const group = createBlockGroup(ids, wallet);
    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    const status = err.message.includes('not claimed') || err.message.includes('not owned') ? 403 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
```

- [ ] **Step 2: Verify build compiles the new route**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && npx next build 2>&1 | tail -20`

Expected: Build succeeds, route `/api/block-groups` appears in output.

- [ ] **Step 3: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/app/api/block-groups/route.js
git commit -m "feat(api): add GET/POST /api/block-groups for create and list"
```

---

## Task 4: API — Block Group Detail + Dissolve

**Files:**
- Create: `src/app/api/block-groups/[id]/route.js`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/block-groups/[id]/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { getBlockGroup, dissolveBlockGroup } from '@/lib/block-groups';

/**
 * GET /api/block-groups/:id
 * Get block group details.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const group = getBlockGroup(id);
  if (!group) {
    return NextResponse.json({ error: 'Block group not found' }, { status: 404 });
  }
  return NextResponse.json(group);
}

/**
 * DELETE /api/block-groups/:id
 * Dissolve a block group. Tiles keep their slice images.
 * Header: x-wallet — must be group owner.
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const wallet = request.headers.get('x-wallet') || request.headers.get('x-address');
  if (!wallet) {
    return NextResponse.json({ error: 'x-wallet header required' }, { status: 401 });
  }

  try {
    const result = dissolveBlockGroup(id, wallet);
    return NextResponse.json(result);
  } catch (err) {
    if (err.message.includes('not found')) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err.message.includes('Unauthorized')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/app/api/block-groups/[id]/route.js
git commit -m "feat(api): add GET/DELETE /api/block-groups/:id for detail and dissolve"
```

---

## Task 5: API — Image Upload + Slicing Pipeline

**Files:**
- Create: `src/app/api/block-groups/[id]/image/route.js`

This is the most complex endpoint. It handles: validation, aspect-ratio fitting, full image upload, async slicing, per-tile slice uploads.

- [ ] **Step 1: Create the image upload route**

Create `src/app/api/block-groups/[id]/image/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { getBlockGroup, updateBlockGroup, setTileImageUrl } from '@/lib/block-groups';
import { isFilebaseConfigured, uploadToFilebase } from '@/lib/filebase';
import { updateTileMetadata } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'public', 'tile-images');
const SLICE_SIZE = 512; // each tile slice is 512x512
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_SOURCE_DIM = 4096;
const UPLOAD_BATCH_SIZE = 4; // parallel Filebase uploads per batch

export async function POST(request, { params }) {
  const { id: groupId } = await params;
  const wallet = request.headers.get('x-wallet') || request.headers.get('x-address');
  if (!wallet) {
    return NextResponse.json({ error: 'x-wallet header required' }, { status: 401 });
  }

  const group = getBlockGroup(groupId);
  if (!group) {
    return NextResponse.json({ error: 'Block group not found' }, { status: 404 });
  }
  if (group.owner.toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json({ error: 'Unauthorized — must be group owner' }, { status: 403 });
  }

  // Parse image from request
  let imageBuffer;
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    const bytes = await file.arrayBuffer();
    imageBuffer = Buffer.from(bytes);
  } else {
    const bytes = await request.arrayBuffer();
    imageBuffer = Buffer.from(bytes);
  }

  if (imageBuffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413 });
  }

  // Validate image
  let metadata;
  try {
    const img = sharp(imageBuffer, { failOn: 'error' });
    metadata = await img.metadata();
    if (!metadata.width || !metadata.height) {
      return NextResponse.json({ error: 'Could not read image dimensions' }, { status: 400 });
    }
    if (metadata.width > MAX_SOURCE_DIM || metadata.height > MAX_SOURCE_DIM) {
      return NextResponse.json({ error: `Image too large (max ${MAX_SOURCE_DIM}x${MAX_SOURCE_DIM})` }, { status: 413 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid image format. Use PNG, JPG, or WebP.' }, { status: 400 });
  }

  // Resize full image to match tile grid: cols * SLICE_SIZE by rows * SLICE_SIZE
  const fullWidth = group.cols * SLICE_SIZE;
  const fullHeight = group.rows * SLICE_SIZE;

  let fullBuffer;
  try {
    fullBuffer = await sharp(imageBuffer)
      .resize(fullWidth, fullHeight, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process image: ' + err.message }, { status: 500 });
  }

  // Save full image locally
  if (!existsSync(IMAGES_DIR)) {
    await mkdir(IMAGES_DIR, { recursive: true });
  }
  const fullLocalPath = path.join(IMAGES_DIR, `group-${groupId}-full.png`);
  await writeFile(fullLocalPath, fullBuffer);

  // Upload full image to Filebase
  let fullImageUrl = `/tile-images/group-${groupId}-full.png`;
  if (isFilebaseConfigured()) {
    try {
      const result = await uploadToFilebase(fullBuffer, `groups/${groupId}/full.png`, 'image/png');
      if (result.gateway) fullImageUrl = result.gateway;
      console.log(`[block-groups] Full image uploaded for group ${groupId}: ${fullImageUrl}`);
    } catch (err) {
      console.error(`[block-groups] Filebase upload failed for full image:`, err.message);
    }
  }

  // Update group: set full_image_url and status=processing
  updateBlockGroup(groupId, { full_image_url: fullImageUrl, status: 'processing' });

  // Start async slicing in background (non-blocking)
  sliceAndUpload(groupId, group, fullBuffer).catch(err => {
    console.error(`[block-groups] Slice pipeline failed for group ${groupId}:`, err);
    updateBlockGroup(groupId, { status: 'error' });
  });

  return NextResponse.json({
    groupId,
    status: 'processing',
    fullImageUrl,
    message: 'Image uploaded. Slicing in progress.',
  }, { status: 202 });
}

/**
 * Async pipeline: slice the full image and upload each slice to Filebase.
 */
async function sliceAndUpload(groupId, group, fullBuffer) {
  const { cols, rows, tileIds, topLeftId } = group;
  const GRID_SIZE = 256;

  // Sort tile IDs by position (row-major order)
  const sortedTiles = [...tileIds].sort((a, b) => a - b);

  // Slice into individual tiles
  const slices = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tileId = sortedTiles[r * cols + c];
      const sliceBuffer = await sharp(fullBuffer)
        .extract({
          left: c * SLICE_SIZE,
          top: r * SLICE_SIZE,
          width: SLICE_SIZE,
          height: SLICE_SIZE,
        })
        .png()
        .toBuffer();

      slices.push({ tileId, buffer: sliceBuffer, row: r, col: c });
    }
  }

  // Save slices locally and upload to Filebase in batches
  const imagesDir = process.env.IMAGES_DIR || path.join(process.cwd(), 'public', 'tile-images');

  for (let i = 0; i < slices.length; i += UPLOAD_BATCH_SIZE) {
    const batch = slices.slice(i, i + UPLOAD_BATCH_SIZE);

    await Promise.all(batch.map(async ({ tileId, buffer }) => {
      // Save locally
      const localPath = path.join(imagesDir, `${tileId}.png`);
      await writeFile(localPath, buffer);

      // Upload to Filebase
      let sliceImageUrl = `/tile-images/${tileId}.png`;
      if (isFilebaseConfigured()) {
        try {
          const result = await uploadToFilebase(buffer, `tiles/${tileId}.png`, 'image/png');
          if (result.gateway) sliceImageUrl = result.gateway;
        } catch (err) {
          console.error(`[block-groups] Slice upload failed for tile ${tileId}:`, err.message);
        }
      }

      // Update tile's image_url
      setTileImageUrl(tileId, sliceImageUrl);
    }));
  }

  // Mark group as ready
  updateBlockGroup(groupId, { status: 'ready' });

  // Broadcast SSE event
  try {
    broadcast({
      type: 'block_group_ready',
      groupId,
      topLeftId: group.topLeftId,
      cols: group.cols,
      rows: group.rows,
      fullImageUrl: group.fullImageUrl,
      tileIds: group.tileIds,
    });
  } catch {
    // Best-effort
  }

  console.log(`[block-groups] Slicing complete for group ${groupId}: ${slices.length} slices uploaded`);
}
```

- [ ] **Step 2: Verify build compiles the new route**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && npx next build 2>&1 | tail -20`

Expected: Build succeeds, route `/api/block-groups/[id]/image` appears.

- [ ] **Step 3: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/app/api/block-groups/[id]/image/route.js
git commit -m "feat(api): add POST /api/block-groups/:id/image with sharp slicing pipeline"
```

---

## Task 6: OpenSea Metadata — Block Group trait

**Files:**
- Modify: `src/lib/openseaMetadata.cjs`

- [ ] **Step 1: Add Block Group trait to buildTileAttributes**

In `src/lib/openseaMetadata.cjs`, in the `buildTileAttributes` function, after the existing GitHub verified attributes block (around line 74), add:

```javascript
  // Block group (image spanning)
  if (tile.blockGroupId) {
    attributes.push({ trait_type: 'Block Group', value: String(tile.blockGroupId) });
  }
```

- [ ] **Step 2: Verify metadata output includes the trait**

Run a quick sanity check:
```bash
cd /home/jeanclaude/workspace/million-bot-homepage
node -e "
  const m = require('./src/lib/openseaMetadata.cjs');
  const result = m.buildTileTokenMetadata({
    siteUrl: 'https://tiles.bot',
    tileId: 100,
    tile: { name: 'Test', blockGroupId: 'test-uuid-123' },
  });
  const bgAttr = result.attributes.find(a => a.trait_type === 'Block Group');
  console.log('Block Group trait:', bgAttr);
"
```

Expected: `Block Group trait: { trait_type: 'Block Group', value: 'test-uuid-123' }`

- [ ] **Step 3: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/lib/openseaMetadata.cjs
git commit -m "feat(metadata): add Block Group trait to NFT metadata for image spans"
```

---

## Task 7: SpanImageModal Component

**Files:**
- Create: `src/components/SpanImageModal.js`

- [ ] **Step 1: Create the SpanImageModal component**

Create `src/components/SpanImageModal.js`:

```javascript
'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import { useAccount } from 'wagmi';

const GRID_SIZE = 256;

function getTileRect(tileIds) {
  if (!tileIds || tileIds.length === 0) return null;
  const coords = tileIds.map(id => ({ row: Math.floor(id / GRID_SIZE), col: id % GRID_SIZE }));
  const minRow = Math.min(...coords.map(c => c.row));
  const maxRow = Math.max(...coords.map(c => c.row));
  const minCol = Math.min(...coords.map(c => c.col));
  const maxCol = Math.max(...coords.map(c => c.col));
  return {
    cols: maxCol - minCol + 1,
    rows: maxRow - minRow + 1,
    topLeftId: minRow * GRID_SIZE + minCol,
  };
}

export default function SpanImageModal({ tileIds, onClose, onComplete }) {
  const [step, setStep] = useState('upload'); // upload | creating | processing | ready | error
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const fileRef = useRef(null);
  const { address } = useAccount();

  const rect = useMemo(() => getTileRect(tileIds), [tileIds]);
  const aspectRatio = rect ? rect.cols / rect.rows : 1;

  const handleFileSelect = useCallback((file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large (max 10MB)');
      return;
    }
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleCreate = async () => {
    if (!imageFile || !address || !rect) return;
    setError(null);
    setStep('creating');

    try {
      // Step 1: Create block group
      const createRes = await fetch('/api/block-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet': address,
        },
        body: JSON.stringify({ tileIds }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'Failed to create block group');

      const gId = createData.id;
      setGroupId(gId);

      // Step 2: Upload image
      const formData = new FormData();
      formData.append('image', imageFile);

      const uploadRes = await fetch(`/api/block-groups/${gId}/image`, {
        method: 'POST',
        headers: { 'x-wallet': address },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload image');

      setStep('processing');

      // Step 3: Poll for ready status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/block-groups/${gId}`);
          const statusData = await statusRes.json();
          if (statusData.status === 'ready') {
            clearInterval(pollInterval);
            setStep('ready');
            if (onComplete) onComplete(statusData);
          } else if (statusData.status === 'error') {
            clearInterval(pollInterval);
            setError('Image processing failed');
            setStep('error');
          }
        } catch {
          // Keep polling
        }
      }, 2000);

      // Safety timeout: stop polling after 2 minutes
      setTimeout(() => clearInterval(pollInterval), 120000);
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  };

  if (!rect) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 16,
        padding: 24, maxWidth: 520, width: '95%', maxHeight: '85vh', overflowY: 'auto',
        color: '#e2e8f0',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Upload Spanning Image</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              {rect.cols}×{rect.rows} tiles ({tileIds.length} total)
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        {step === 'upload' && (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed #3b82f6',
                borderRadius: 12,
                padding: preview ? 0 : 40,
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(59,130,246,0.05)',
                marginBottom: 16,
                overflow: 'hidden',
                aspectRatio: `${rect.cols}/${rect.rows}`,
                maxHeight: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                  <div style={{ fontSize: 14, color: '#94a3b8' }}>
                    Drop an image here or click to select
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    PNG, JPG, or WebP — max 10MB
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Best results with {rect.cols}:{rect.rows} aspect ratio
                  </div>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={e => handleFileSelect(e.target.files?.[0])}
            />

            {/* Info box */}
            <div style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>How it works</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
                <li>Your image will be auto-fitted to a {rect.cols}×{rect.rows} grid</li>
                <li>Each tile gets its own slice as an individual NFT image</li>
                <li>The grid shows the full combined image as one piece</li>
                <li>If a tile is sold, the grid falls back to showing individual slices</li>
              </ul>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{
                flex: 1, padding: '12px 0', borderRadius: 10,
                background: 'transparent', border: '1px solid #333',
                color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 14,
              }}>Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!imageFile || !address}
                style={{
                  flex: 2, padding: '12px 0', borderRadius: 10,
                  background: !imageFile ? '#222' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: !imageFile ? '#555' : '#fff',
                  border: 'none', fontWeight: 600, cursor: !imageFile ? 'not-allowed' : 'pointer', fontSize: 14,
                }}
              >Create Spanning Image</button>
            </div>
          </>
        )}

        {step === 'creating' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
            <div style={{ color: '#f59e0b', fontSize: 14 }}>Creating block group...</div>
          </div>
        )}

        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>✂️</div>
            <div style={{ color: '#3b82f6', fontSize: 14, marginBottom: 8 }}>
              Slicing image into {tileIds.length} tiles...
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Each slice is being uploaded to IPFS. This may take a minute.
            </div>
            {preview && (
              <img src={preview} alt="Uploading" style={{
                marginTop: 16, maxWidth: '100%', maxHeight: 150, borderRadius: 8, opacity: 0.6,
              }} />
            )}
          </div>
        )}

        {step === 'ready' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Spanning image live!
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              Your {rect.cols}×{rect.rows} image is now displayed on the grid. Each tile has its own NFT image slice.
            </div>
            <button onClick={onClose} style={{
              padding: '10px 24px', borderRadius: 8,
              background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
            }}>Done</button>
          </div>
        )}

        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</div>
            <button onClick={() => { setStep('upload'); setError(null); }} style={{
              padding: '10px 24px', borderRadius: 8,
              background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
            }}>Try Again</button>
          </div>
        )}

        {error && step === 'upload' && (
          <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{error}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles the component**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/components/SpanImageModal.js
git commit -m "feat(ui): add SpanImageModal component for spanning image upload"
```

---

## Task 8: Grid.js — Render Block Groups on Canvas

**Files:**
- Modify: `src/components/Grid.js`

- [ ] **Step 1: Add blockGroups prop to Grid component**

In `Grid.js`, update the component signature (around line 178) to accept `blockGroups`:

Change:
```javascript
export default function Grid({ tiles, connections, onConnectionsChange, onTileClick, selectedTile, zoom, onZoomChange, viewMode, searchQuery, categoryFilter, heatmapMode, blocks, onBlockClaimRequest }) {
```

To:
```javascript
export default function Grid({ tiles, connections, onConnectionsChange, onTileClick, selectedTile, zoom, onZoomChange, viewMode, searchQuery, categoryFilter, heatmapMode, blocks, onBlockClaimRequest, blockGroups, onSpanRequest }) {
```

- [ ] **Step 2: Add blockGroups ref and map (after blockMapRef around line 290)**

Add after the existing `blockMapRef` useEffect:

```javascript
  // Block group map ref: tileId → group object (for span render lookup)
  const blockGroupMapRef = useRef({});
  useEffect(() => {
    const map = {};
    if (blockGroups) {
      for (const group of blockGroups) {
        const tileIds = Array.isArray(group.tileIds) ? group.tileIds : JSON.parse(group.tileIds || '[]');
        for (const tid of tileIds) {
          map[tid] = group;
        }
      }
    }
    blockGroupMapRef.current = map;
  }, [blockGroups]);
```

- [ ] **Step 3: Add block group rendering in the draw function**

In the `draw` callback, after the existing block rendering loop (after `drawnBlockIds` loop, around line 470), add block group rendering:

```javascript
    // — Block group (image spanning) rendering
    const drawnGroupIds = new Set();
    if (blockGroups) {
      for (const group of blockGroups) {
        if (group.status !== 'ready' || !group.fullImageUrl) continue;
        if (drawnGroupIds.has(group.id)) continue;

        const topLeftId = group.topLeftId;
        const tlCol = topLeftId % GRID_SIZE;
        const tlRow = Math.floor(topLeftId / GRID_SIZE);
        const gx = tlCol * TILE_SIZE;
        const gy = tlRow * TILE_SIZE;
        const gw = group.cols * TILE_SIZE;
        const gh = group.rows * TILE_SIZE;

        // Skip groups fully outside viewport
        if (gx + gw < left || gx > right || gy + gh < top || gy > bottom) continue;

        // Lazy ownership check: all tiles must still share the same owner
        const groupTileIds = Array.isArray(group.tileIds) ? group.tileIds : JSON.parse(group.tileIds || '[]');
        let sameOwner = true;
        const firstOwner = tiles[groupTileIds[0]]?.owner;
        if (!firstOwner) { sameOwner = false; }
        else {
          for (const tid of groupTileIds) {
            if (!tiles[tid] || tiles[tid].owner?.toLowerCase() !== firstOwner.toLowerCase()) {
              sameOwner = false;
              break;
            }
          }
        }

        if (!sameOwner) continue; // Fall back to individual tile rendering

        drawnGroupIds.add(group.id);

        // Load and draw the full group image
        const groupImgKey = `group:${group.id}`;
        let cachedImg = imageCache[groupImgKey];
        if (!cachedImg) {
          imageCache[groupImgKey] = 'loading';
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          img.src = group.fullImageUrl;
          img.onload = () => { imageCache[groupImgKey] = img; };
          img.onerror = () => { imageCache[groupImgKey] = 'error'; };
        } else if (cachedImg !== 'loading' && cachedImg !== 'error') {
          ctx.save();
          ctx.drawImage(cachedImg, gx, gy, gw, gh);

          // Dashed border around the group
          ctx.strokeStyle = 'rgba(59,130,246,0.5)';
          ctx.lineWidth = 2 / cam.zoom;
          ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
          ctx.strokeRect(gx, gy, gw, gh);
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Mark all tiles in this group so individual tile rendering skips them
        for (const tid of groupTileIds) {
          blockGroupMapRef.current[tid] = { ...group, _rendered: true };
        }
      }
    }
```

- [ ] **Step 4: Skip individual tile rendering for rendered group tiles**

In the per-tile rendering loop (around line 502), after the existing block-skip check, add:

```javascript
        // Skip tiles rendered as part of a block group
        const tileGroupEntry = blockGroupMapRef.current[id];
        if (tileGroupEntry?._rendered) continue;
```

- [ ] **Step 5: Modify drag-select mouseUp to detect owned rectangles**

In the `handleMouseUp` callback (around line 930), where it currently does `if (selected.length > 1) { setBatchTiles(selected); return; }`, replace that with logic to detect if all selected tiles are owned by the connected wallet:

```javascript
        if (selected.length > 1) {
          // Check if all selected tiles are already claimed and owned by the connected wallet
          // If so, open SpanImageModal instead of BatchClaimModal
          const allOwned = selected.every(id => {
            const t = tiles[id];
            return t && t.owner;
          });

          if (allOwned && address) {
            const allMine = selected.every(id => {
              const t = tiles[id];
              return t && t.owner && t.owner.toLowerCase() === address.toLowerCase();
            });
            if (allMine && onSpanRequest) {
              onSpanRequest(selected);
              return;
            }
          }

          setBatchTiles(selected);
          return;
        }
```

Note: `address` comes from `useAccount()`. Add the import and hook at the top of the component:

```javascript
import { useAccount } from 'wagmi';
```

And inside the component function:
```javascript
  const { address } = useAccount();
```

- [ ] **Step 6: Build and verify**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/components/Grid.js
git commit -m "feat(grid): render block group spanning images and detect owned rectangles for span"
```

---

## Task 9: BatchClaimModal — Post-Claim Spanning Option

**Files:**
- Modify: `src/components/BatchClaimModal.js`

- [ ] **Step 1: Add onSpanRequest prop and rectangle detection**

Update the component signature to accept `onSpanRequest`:

```javascript
export default function BatchClaimModal({ tileIds, tiles, onClose, onClaimed, onSpanRequest }) {
```

- [ ] **Step 2: Add rectangle check helper**

Add inside the component, before the return statement:

```javascript
  // Check if the claimed tiles form a rectangle (for spanning image offer)
  const claimedFormRect = useMemo(() => {
    if (!frozenTiles.current || unclaimed.length < 2) return false;
    const ids = unclaimed;
    const coords = ids.map(id => ({ row: Math.floor(id / 256), col: id % 256 }));
    const minRow = Math.min(...coords.map(c => c.row));
    const maxRow = Math.max(...coords.map(c => c.row));
    const minCol = Math.min(...coords.map(c => c.col));
    const maxCol = Math.max(...coords.map(c => c.col));
    const expectedCount = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    return ids.length === expectedCount && ids.length >= 2;
  }, [unclaimed]);
```

- [ ] **Step 3: Add spanning image button in success state**

In the success state JSX (the `step === 'success'` block), add a "Create Spanning Image" button after the existing "Done" button:

```javascript
        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 600 }}>
              {claimedCount} tiles claimed!
            </div>
            {claimedFormRect && onSpanRequest && (
              <button onClick={() => { onClose(); onSpanRequest(frozenTiles.current.unclaimed); }} style={{
                marginTop: 12, padding: '10px 24px', borderRadius: 8,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, width: '100%',
              }}>
                🖼️ Upload Spanning Image
              </button>
            )}
            <button onClick={onClose} style={{
              marginTop: 8, padding: '10px 24px', borderRadius: 8,
              background: claimedFormRect ? 'transparent' : '#22c55e',
              color: claimedFormRect ? '#94a3b8' : '#fff',
              border: claimedFormRect ? '1px solid #333' : 'none',
              cursor: 'pointer',
            }}>
              {claimedFormRect ? 'Skip' : 'Done'}
            </button>
          </div>
        )}
```

This replaces the existing success block.

- [ ] **Step 4: Build and verify**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/components/BatchClaimModal.js
git commit -m "feat(batch-claim): add spanning image option in post-claim success state"
```

---

## Task 10: Page.js — Wire Everything Together

**Files:**
- Modify: `src/app/page.js`

- [ ] **Step 1: Add imports and fetch function**

At the top of the file, add SpanImageModal import:

```javascript
import SpanImageModal from '../components/SpanImageModal';
```

Add the fetch function alongside the existing ones:

```javascript
async function fetchBlockGroups() {
  try {
    const res = await fetch('/api/block-groups');
    if (!res.ok) return [];
    const data = await res.json();
    return data.groups || [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Add state for block groups and span modal**

In `HomeInner`, add state:

```javascript
  const [blockGroups, setBlockGroups] = useState([]);
  const [spanTileIds, setSpanTileIds] = useState(null); // tile IDs for SpanImageModal
```

- [ ] **Step 3: Add block groups to data fetching**

In the `refreshGridAndStats` function inside the SSE useEffect, add `fetchBlockGroups()` to the Promise.all:

```javascript
      const [grid, statsSnapshot, conns, blockList, groupList] = await Promise.all([
        fetchGrid(), fetchStatsSnapshot(), fetchConnections(), fetchBlocks(), fetchBlockGroups()
      ]);
```

And after the existing setBlocks:
```javascript
      setBlockGroups(groupList);
```

- [ ] **Step 4: Handle block_group_ready SSE event**

In the SSE `onmessage` handler, add a case:

```javascript
        if (event.type === 'block_group_ready') {
          fetchBlockGroups().then(gl => setBlockGroups(gl));
        }
```

- [ ] **Step 5: Add block groups to initial data fetch**

In the standalone useEffect that calls `fetchGrid()` + `fetchBlocks()`, add fetchBlockGroups:

```javascript
      const [data, blockList0, groupList0] = await Promise.all([fetchGrid(), fetchBlocks(), fetchBlockGroups()]);
```

And:
```javascript
      setBlockGroups(groupList0);
```

- [ ] **Step 6: Pass blockGroups and onSpanRequest to Grid**

Update the Grid component props:

```javascript
          <Grid
            tiles={tiles}
            blocks={blocks}
            blockGroups={blockGroups}
            connections={connections}
            onConnectionsChange={setConnections}
            onTileClick={handleTileClick}
            onBlockClaimRequest={setBlockClaimTopLeft}
            onSpanRequest={setSpanTileIds}
            selectedTile={selectedTile}
            zoom={zoom}
            onZoomChange={setZoom}
            viewMode={viewMode}
            searchQuery={searchQuery}
            categoryFilter={filterCategory}
            heatmapMode={heatmapMode}
          />
```

- [ ] **Step 7: Pass onSpanRequest to BatchClaimModal (inside Grid)**

This is actually passed from Grid.js to BatchClaimModal. In Grid.js where BatchClaimModal is rendered, add the prop:

```javascript
<BatchClaimModal
  tileIds={batchTiles}
  tiles={tiles}
  onClose={() => setBatchTiles(null)}
  onClaimed={...}
  onSpanRequest={(ids) => { setBatchTiles(null); if (onSpanRequest) onSpanRequest(ids); }}
/>
```

- [ ] **Step 8: Render SpanImageModal in page.js**

Add the modal alongside the other modals:

```javascript
      {spanTileIds && (
        <SpanImageModal
          tileIds={spanTileIds}
          onClose={() => setSpanTileIds(null)}
          onComplete={async () => {
            setSpanTileIds(null);
            const gl = await fetchBlockGroups();
            setBlockGroups(gl);
            const data = await fetchGrid();
            if (data) { setTiles(data.tiles); setStats({ ...data.stats }); }
          }}
        />
      )}
```

- [ ] **Step 9: Build and verify full integration**

Run: `cd /home/jeanclaude/workspace/million-bot-homepage && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git add src/app/page.js src/components/Grid.js
git commit -m "feat(page): wire block groups, SpanImageModal, and SSE events"
```

---

## Task 11: Browser QA — Full Feature Verification

**Files:** None (testing only)

- [ ] **Step 1: Restart the service**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
npm run build
sudo systemctl restart million-bot
```

- [ ] **Step 2: Verify the site loads**

Open https://tiles.bot in the browser tool and take a screenshot. Verify the grid loads correctly with no console errors.

- [ ] **Step 3: Verify /api/block-groups endpoint**

```bash
curl -s https://tiles.bot/api/block-groups | jq .
```

Expected: `{ "groups": [] }` (empty initially).

- [ ] **Step 4: Test drag-select on owned tiles**

If test tiles are available, drag-select a rectangle of owned tiles and verify SpanImageModal opens instead of BatchClaimModal.

- [ ] **Step 5: Test image upload flow**

Upload a test image through SpanImageModal and verify:
- Group creation succeeds
- Image slicing completes (status transitions to `ready`)
- Canvas renders the full image as one rectangle
- Individual tile images are updated

- [ ] **Step 6: Verify NFT metadata**

```bash
curl -s "https://tiles.bot/api/collection/0" | jq '.attributes[] | select(.trait_type == "Block Group")'
```

(Replace `0` with a tile ID that's in a block group.)

- [ ] **Step 7: Take final screenshot of working state**

Screenshot the grid showing a spanning image rendered correctly.

---

## Task 12: Git Push

- [ ] **Step 1: Set remote URL with token**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
git remote set-url origin "https://$(cat ~/.openclaw/workspace/.secrets/github-token-mssteuer.txt)@github.com/mssteuer/tiles-bot.git"
```

- [ ] **Step 2: Verify staged files (no binaries, no node_modules)**

```bash
git diff --cached --name-only
git log --oneline -10
```

- [ ] **Step 3: Push**

```bash
git push origin master
```

Expected: Push succeeds.
