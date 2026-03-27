import { NextResponse } from 'next/server';
import { getTile, TOTAL_TILES, incrementViewCount, getTileWebhookUrl } from '@/lib/db';
import { fireWebhook } from '@/lib/webhook';
import { buildTileTokenMetadata, getSiteUrl } from '@/lib/openseaMetadata';

// GET /api/tiles/:id — ERC-721 tokenURI endpoint
// This is what the contract's tokenURI() points to.
// Returns OpenSea-compatible metadata JSON with name, description, image, attributes.
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);

  // Track view + fire webhook (best-effort, non-blocking)
  if (tile) {
    const viewCountToday = incrementViewCount(tileId);
    const webhookUrl = getTileWebhookUrl(tileId);
    if (webhookUrl) {
      fireWebhook(webhookUrl, {
        event: 'tile_viewed',
        tileId,
        viewCountToday,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  // Return ERC-721 metadata (same as /api/tiles/:id/metadata)
  const metadata = buildTileTokenMetadata({
    siteUrl: getSiteUrl(request),
    tileId,
    tile,
  });

  return NextResponse.json(metadata, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
    },
  });
}
