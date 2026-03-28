# Multi-Tile Image Spanning — Design Spec

> **Task:** CCC #496 — Upload one image across a rectangular tile area
> **Date:** 2026-03-28
> **Status:** Approved

## Overview

Allow tile owners to upload a single image that spans across a rectangular area of tiles they own, creating a large visual presence on the grid (like the original Million Dollar Homepage). The image is sliced into individual tile-sized pieces for NFT independence, while the canvas renders the full image as one seamless rectangle.

This is implemented as a **separate spanning layer** — a new `block_groups` concept independent of the existing `tile_blocks` (2×2/3×3 premium blocks). This means:
- Existing block system is untouched
- Tiles can be from batch claims, individual claims, or any mix
- Retroactive spanning is supported — owners who already hold a rectangle can span it anytime

## Data Model

### New Table: `block_groups`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `owner` | TEXT | Wallet address that created the span |
| `tile_ids` | TEXT (JSON array) | All tile IDs in the group |
| `cols` | INTEGER | Rectangle width in tiles |
| `rows` | INTEGER | Rectangle height in tiles |
| `top_left_id` | INTEGER | Tile ID of the top-left corner |
| `full_image_url` | TEXT | IPFS/Filebase URL of the unsliced full image |
| `created_at` | TEXT | ISO timestamp |
| `status` | TEXT | `pending` / `processing` / `ready` / `error` |

### Modified Table: `tiles`

New nullable column:
- `block_group_id` TEXT — references `block_groups.id`

### Constraints

- A tile can belong to at most one block_group
- Creating a new span on tiles already in a span removes them from the old group (if the old group becomes empty, it is deleted)
- Max group size: 16×16 (256 tiles)
- Min group size: 2×1 or 1×2 (at least 2 tiles)
- All tiles must be owned by the same wallet

## API Endpoints

### POST `/api/block-groups`

Create a block group (no image yet).

**Request:**
```json
{
  "tileIds": [1024, 1025, 1280, 1281],
  "wallet": "0x..."
}
```

**Headers:** `x-wallet` — must match owner of all tiles.

**Validation:**
- All tile IDs exist in DB and are claimed
- All tiles owned by the `x-wallet` address
- Tiles form a contiguous rectangle (computed from tile positions on the 256×256 grid)
- Rectangle within 2×1 to 16×16 bounds

**Response (201):**
```json
{
  "groupId": "uuid-here",
  "cols": 2,
  "rows": 2,
  "tileIds": [1024, 1025, 1280, 1281],
  "topLeftId": 1024,
  "status": "pending"
}
```

### POST `/api/block-groups/[id]/image`

Upload a spanning image for an existing group.

**Request:** Multipart form-data with `image` field (PNG/JPG/WebP, max 10MB).

**Headers:** `x-wallet` — must match group owner.

**Processing pipeline:**
1. Validate image format and dimensions (max 4096×4096 source)
2. Resize/crop full image to match tile rectangle aspect ratio (cols × 512 by rows × 512)
3. Upload full image to Filebase/IPFS → store on `block_groups.full_image_url`
4. Set `status = processing`
5. Return response (async slicing begins)
6. Slice into cols×rows pieces (each 512×512)
7. Upload each slice to Filebase in parallel (batches of 4)
8. Update each tile's `image_url` with its slice IPFS URL
9. Set `status = ready`

**Response (202):**
```json
{
  "groupId": "uuid-here",
  "status": "processing",
  "fullImageUrl": "https://ipfs.filebase.io/ipfs/...",
  "message": "Image uploaded. Slicing in progress."
}
```

### GET `/api/block-groups/[id]`

Get group details including status and all tile IDs.

**Response (200):**
```json
{
  "id": "uuid-here",
  "owner": "0x...",
  "cols": 4,
  "rows": 3,
  "topLeftId": 1024,
  "tileIds": [1024, 1025, ...],
  "fullImageUrl": "https://ipfs.filebase.io/ipfs/...",
  "status": "ready",
  "createdAt": "2026-03-28T01:00:00Z"
}
```

### DELETE `/api/block-groups/[id]`

Dissolve a span.

**Headers:** `x-wallet` — must match group owner.

**Behavior:**
- Clears `block_group_id` on all member tiles
- Deletes the `block_groups` row
- Individual tiles keep their slice images (no data loss)

**Response (200):**
```json
{ "ok": true, "dissolved": "uuid-here" }
```

### GET `/api/block-groups`

List all block groups (for canvas rendering).

**Response (200):**
```json
{
  "groups": [
    {
      "id": "uuid-here",
      "owner": "0x...",
      "cols": 4,
      "rows": 3,
      "topLeftId": 1024,
      "tileIds": [1024, 1025, ...],
      "fullImageUrl": "https://ipfs.filebase.io/ipfs/...",
      "status": "ready"
    }
  ]
}
```

Only returns groups with `status = ready`.

## Canvas Rendering

### Combined Image Rendering

- On grid data load, fetch `/api/block-groups` alongside existing grid/block data
- Build a lookup map: `tileId → group`
- During draw loop, track rendered group IDs (like existing `drawnBlockIds`)
- For each group with `status = ready`:
  - **Lazy ownership check:** verify all tile IDs in the group still have the same owner in the client-side tiles map
  - If ownership intact: draw `full_image_url` as a single rectangle at `topLeftId` position, spanning `cols × TILE_SIZE` by `rows × TILE_SIZE`
  - If ownership diverged: skip combined rendering — tiles render individually with their slice images (which tile together visually)
- Skip individual tile rendering for tiles in a fully-rendered group

### Visual Treatment

- Subtle dashed border around combined group (distinguishes from existing blocks' solid purple border)
- On hover: highlight the entire group rectangle
- No zoom-dependent behavior — full image renders at all zoom levels (scales naturally)

## Frontend Entry Points

### Entry 1: Post-Batch-Claim

In `BatchClaimModal.js` success state:
- Check if the just-claimed tile IDs form a rectangle
- If yes, show "Upload Spanning Image" button
- Button opens `SpanImageModal` with tile IDs pre-filled

### Entry 2: Drag-Select on Owned Tiles

In `Grid.js` drag-select logic:
- Current behavior: drag-select opens `BatchClaimModal` for unclaimed tiles
- New behavior: if ALL selected tiles are claimed AND all owned by the connected wallet → open `SpanImageModal`
- Mixed case (some claimed, some not): still opens `BatchClaimModal`, no spanning option

### SpanImageModal (New Component)

- Displays selected rectangle dimensions (e.g. "4×3 = 12 tiles")
- Image upload area with drag-and-drop and file picker
- Live preview: shows the uploaded image cropped to the tile rectangle aspect ratio
- "Create Span" button:
  1. POST `/api/block-groups` to create the group
  2. POST `/api/block-groups/[id]/image` to upload the image
- Progress indicator while slices upload in background
- Polls GET `/api/block-groups/[id]` until `status = ready`
- Success state showing the spanning image

## Ownership Validation

All ownership checks use the `x-wallet` header matched against the `owner` field in the DB — consistent with all other owner-gated endpoints (`/api/tiles/[id]/image`, `/api/tiles/[id]/metadata`, etc.). The DB is synced from chain events so it's a reliable proxy.

This works for both:
- **WalletConnect users** — frontend passes connected wallet in `x-wallet` header
- **x402 agent users** — agents pass their wallet address in the same header after claiming via x402

## Transfer / Ownership Break Behavior

**Lazy break:** When a tile in a span is transferred or sold:
- The `block_group_id` stays on the tile — no active cleanup
- The canvas checks if all tiles in the group still share the same owner before rendering combined
- If ownership diverges: falls back to individual tile rendering (slice images still tile together visually)
- The new tile owner can dissolve the span (their tile leaves the group) or join a new span
- No errors, no data corruption — graceful degradation

## Storage Strategy (Hybrid)

1. **Full image** → uploaded to Filebase/IPFS once, stored on `block_groups.full_image_url`, used for canvas rendering
2. **Slices** → each tile-sized piece uploaded to Filebase/IPFS individually, stored as each tile's `image_url`, used for NFT metadata on OpenSea/marketplaces
3. **Local copies** → both full image and slices saved to `public/tile-images/` as fallback (Filebase is primary)

Slicing happens asynchronously after the full image upload, so the user sees the span immediately on canvas while individual NFT images populate in the background.

## NFT Metadata Impact

- Each tile remains a separate ERC-721 NFT with its own slice as `image`
- Metadata (via `openseaMetadata.cjs`) includes a `Block Group` trait with the group UUID when a tile belongs to a group
- Marketplaces can use this trait to show related tiles in the same span

## Constraints Summary

| Constraint | Value |
|---|---|
| Min span size | 2×1 or 1×2 |
| Max span size | 16×16 (256 tiles) |
| Max image upload | 10MB |
| Max source dimensions | 4096×4096 |
| Tile slice size | 512×512 px |
| Same-owner required | Yes (all tiles) |
| Bonding curve discount | None (per-tile pricing) |

## Acceptance Criteria

1. Owner can drag-select a rectangle of owned tiles and upload a spanning image via `SpanImageModal`
2. After batch-claiming tiles that form a rectangle, a "Create Image Span" option appears in the success state
3. Server validates rectangle geometry, ownership, and size constraints before accepting
4. Full image is uploaded to Filebase/IPFS and stored on the block group
5. Image is sliced into individual tile-sized pieces, each uploaded to Filebase/IPFS
6. Each tile's `image_url` is updated with its slice's IPFS URL (works independently on OpenSea)
7. Canvas renders the full combined image as a single rectangle for groups where all tiles share the same owner
8. When ownership diverges (tile sold/transferred), canvas falls back to individual slice rendering — no errors
9. NFT metadata for tiles in a group includes a `Block Group` trait with the group UUID
10. x402 agents can create spans programmatically via the API endpoints
11. Owner can dissolve a span via DELETE endpoint (tiles keep their slice images)
12. Creating a new span on tiles already in a span removes them from the old group
