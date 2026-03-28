import { NextResponse } from 'next/server';
import { getRecentActivity } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/activity
 * Returns recent tile activity events for the activity feed.
 */
export async function GET() {
  const rows = getRecentActivity(50);

  const events = rows.map(row => ({
    type: 'claimed',
    tileId: row.id,
    tileName: row.name || `Tile #${row.id}`,
    tileAvatar: row.avatar || null,
    owner: row.owner,
    status: row.status,
    timestamp: row.claimed_at,
  }));

  return NextResponse.json({ events }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
