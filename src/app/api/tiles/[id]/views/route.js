import { NextResponse } from 'next/server';
import { TOTAL_TILES, getTotalViewCount, getViewCountToday } from '@/lib/db';

/**
 * GET /api/tiles/:id/views
 *
 * Returns view statistics for a tile.
 *
 * Response:
 * {
 *   tileId: number,
 *   totalViews: number,   // all-time total
 *   todayViews: number,   // today's count (UTC)
 * }
 *
 * No auth required — public stats.
 * Cached for 60s to prevent hammering on panel open.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);

  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const totalViews = getTotalViewCount(tileId);
  const todayViews = getViewCountToday(tileId);

  return NextResponse.json(
    { tileId, totalViews, todayViews },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    }
  );
}
