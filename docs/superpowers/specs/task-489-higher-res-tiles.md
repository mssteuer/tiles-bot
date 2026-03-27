# Task #489 — Higher-Resolution Tile Images

## Goal
Tiles should support high-res images (up to 2048×2048 upload), stored as 512×512, served at multiple sizes on demand.

## Image Upload — src/app/api/tiles/[id]/image/route.js
Change validation and processing:
- Accept: PNG, JPG, WebP, GIF
- Max upload size: 10MB
- Use `sharp` to process:
  1. Resize to fit within 512×512 (preserving aspect ratio, padding to square with transparent/black bg)
  2. Save as PNG at `/data/images/{tileId}.png` (512×512)

## Image Serving — GET /api/tiles/[id]/image/route.js (new GET handler)
Serve the image with optional `?size=` query param:
- `?size=64` → resize to 64×64 (grid thumbnails)
- `?size=128` → 128×128
- `?size=256` → 256×256 (tile panel display)
- `?size=512` → 512×512 (full res, default, OpenSea)
- Cache-Control: public, max-age=86400
- If no image exists for tile: return a generated placeholder (emoji rendered to canvas, or a colored square with tile ID)

```js
export async function GET(req, { params }) {
  const { id } = params;
  const url = new URL(req.url);
  const size = parseInt(url.searchParams.get('size') || '512');
  const imgPath = path.join(process.cwd(), 'data/images', `${id}.png`);
  
  let buf;
  if (existsSync(imgPath)) {
    buf = await sharp(imgPath).resize(size, size, { fit: 'contain', background: '#1a1a2e' }).png().toBuffer();
  } else {
    // Generate placeholder: colored square with emoji or tile number
    buf = await generatePlaceholder(id, size);
  }
  return new Response(buf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
}
```

## Grid.js — Canvas Image Loading
When drawing tiles on the canvas, load images at `?size=64` (fast, small):
```js
const img = new Image();
img.src = `/api/tiles/${tileId}/image?size=64`;
img.onload = () => { tileImages[tileId] = img; requestRedraw(); };
```
Cache loaded images in a Map to avoid re-fetching.

## TilePanel.js — Full-Res Display
Show tile image at 256px:
```html
<img src={`/api/tiles/${tile.id}/image?size=256`} width="256" height="256" className="rounded-lg" />
```
"Download full-res" link: `/api/tiles/${tile.id}/image?size=512`

## DB Changes
- `image_url` column is no longer needed (image is always at `/api/tiles/:id/image`)
- Keep `image_url` column for backwards compatibility but stop using it

## Acceptance Criteria
- [ ] Upload a 1000×1000 JPG → stored as 512×512 PNG
- [ ] `GET /api/tiles/1/image?size=64` returns 64×64 PNG
- [ ] `GET /api/tiles/1/image?size=512` returns 512×512 PNG
- [ ] Tiles without images show a colored placeholder (not a broken image icon)
- [ ] Canvas grid loads tile images async, renders emoji/color until image loads
- [ ] TilePanel shows 256px image with download link
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot of grid with tile images visible, and tile panel with full-res image
