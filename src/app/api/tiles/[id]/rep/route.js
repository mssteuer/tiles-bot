import { NextResponse } from 'next/server';
import { computeRepScore, getTile, TOTAL_TILES } from '@/lib/db';

/**
 * GET /api/tiles/:id/rep
 * Returns the computed reputation score for a tile.
 *
 * Response: { tileId, repScore, breakdown: { heartbeat, connections, notes, actions, age, verified, profile } }
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not found' }, { status: 404 });
  }

  const repScore = computeRepScore(tileId);
  return NextResponse.json({ tileId, repScore });
}

/**
 * POST /api/tiles/:id/rep
 * Trigger a rep score refresh for a specific tile and persist it.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not found' }, { status: 404 });
  }

  const repScore = computeRepScore(tileId);
  return NextResponse.json({ tileId, repScore, refreshed: true });
}
