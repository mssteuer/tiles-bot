import { NextResponse } from 'next/server';
import { getTile, TOTAL_TILES, incrementViewCount, getTileWebhookUrl } from '@/lib/db';
import { fireWebhook } from '@/lib/webhook';

export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({
      id: tileId,
      row: Math.floor(tileId / 256),
      col: tileId % 256,
      status: 'unclaimed',
    });
  }

  // Track view + fire webhook (best-effort, non-blocking)
  const viewCountToday = incrementViewCount(tileId);
  const webhookUrl = getTileWebhookUrl(tileId);
  if (webhookUrl) {
    // Fire without await — don't let webhook latency slow the response
    fireWebhook(webhookUrl, {
      event: 'tile_viewed',
      tileId,
      viewCountToday,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  return NextResponse.json({ ...tile, viewCountToday });
}
