# Task #462 — Image Upload API Design Spec

## Goal
Allow tile owners to upload a PNG, JPG, or WebP avatar image for their tile. The image is stored server-side, auto-cropped to 256×256, and served via the API. The tile grid renders it instead of the emoji fallback.

## API Endpoint
```
POST /api/tiles/:id/image
Content-Type: multipart/form-data
Authorization: wallet signature in header (X-Wallet-Signature: <sig>, X-Wallet-Address: <addr>)

Form field: image (file)
Max size: 2MB
Accepted MIME types: image/png, image/jpeg, image/webp
```

**Response (success):**
```json
{ "ok": true, "image_url": "/api/tiles/12345/image" }
```

**Response (error):**
```json
{ "ok": false, "error": "File too large. Max 2MB." }
```

**GET /api/tiles/:id/image**
Returns the raw image bytes with appropriate Content-Type header. 404 if no image set.

## Authorization
- Tile must be claimed
- Request must include `X-Wallet-Address` header and `X-Wallet-Signature` signing the message `"tiles.bot:image-upload:{tileId}:{timestamp}"` where timestamp is within 5 minutes
- Validate using ethers `verifyMessage` — signer must match `owner` in DB

## Image Processing
- Use the `sharp` npm package for resizing/cropping
- Resize and center-crop to exactly 256×256 pixels
- Output: PNG regardless of input format (consistent format for canvas rendering)
- Store in: `data/images/{tileId}.png` (gitignored directory)

## Database
- Add `image_url` TEXT column to `tiles` table (nullable) via `ALTER TABLE tiles ADD COLUMN image_url TEXT` (guarded with IF NOT EXISTS check via `PRAGMA table_info`)
- On successful upload: `UPDATE tiles SET image_url = '/api/tiles/{id}/image' WHERE id = {id}`

## Frontend (Grid.js)
- In canvas tile renderer: if `tile.image_url` is set, draw the image using `drawImage()` instead of emoji text
- Cache loaded images in a Map keyed by tile ID to avoid re-fetching on every render frame
- On image load error: fall back to emoji rendering

## Files to Create/Modify
- `src/app/api/tiles/[id]/image/route.js` — new file (GET + POST handlers)
- `src/lib/db.js` — add `image_url` column migration + getter/setter
- `src/components/Grid.js` — image rendering in canvas tile draw loop
- `package.json` — add `sharp` dependency

## Acceptance Criteria
- [ ] `npm install sharp` succeeds
- [ ] `POST /api/tiles/1/image` with valid PNG returns `{ ok: true, image_url: ... }`
- [ ] `GET /api/tiles/1/image` returns the image bytes (Content-Type: image/png)
- [ ] Tile with image_url shows image on canvas grid (not emoji)
- [ ] Invalid file type returns 400 with error message
- [ ] File > 2MB returns 413
- [ ] Unauthorized upload (wrong wallet) returns 401
- [ ] `npm run build` passes

## Test
```bash
# Upload test image:
curl -X POST https://tiles.bot/api/tiles/1/image \
  -F "image=@test.png" \
  -H "X-Wallet-Address: 0xTEST" \
  -H "X-Wallet-Signature: 0xSIG"
# For dev/test: make signature validation optional when NODE_ENV=development
```
