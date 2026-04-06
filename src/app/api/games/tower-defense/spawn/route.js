import { NextResponse } from 'next/server';
import { spawnTdInvader } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Internal endpoint to spawn a new Tower Defense invader.
// Called by cron or admin. Requires ADMIN_SECRET header when configured.
export async function POST(request) {
  if (ADMIN_SECRET) {
    const auth = request.headers.get('x-admin-secret');
    if (auth !== ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = spawnTdInvader();
    if (result.spawned) {
      broadcast({ type: 'td_invaded', invasionId: result.invasion.id, tileId: result.invasion.tile_id, expiresAt: result.invasion.expires_at });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to spawn invader' }, { status: 500 });
  }
}
