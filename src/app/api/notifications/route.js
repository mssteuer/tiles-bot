import { NextResponse } from 'next/server';
import { getTilesByOwner, getPendingRequestsForTile } from '@/lib/db';

/**
 * GET /api/notifications?wallet=0x...
 * Returns all pending notifications for tiles owned by this wallet.
 * Currently: pending connection requests.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  const tiles = getTilesByOwner(wallet.toLowerCase());
  const notifications = [];

  for (const tile of tiles) {
    const requests = getPendingRequestsForTile(tile.id);
    for (const req of requests) {
      notifications.push({
        id: `req-${req.id}`,
        type: 'connection_request',
        tileId: tile.id,
        tileName: tile.name || `Tile #${tile.id}`,
        tileAvatar: tile.avatar || null,
        fromTile: req.fromTile,
        createdAt: req.createdAt,
      });
    }
  }

  // Sort newest first
  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return NextResponse.json({ notifications, count: notifications.length });
}
