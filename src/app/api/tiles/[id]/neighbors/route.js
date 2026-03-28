import { NextResponse } from 'next/server';
import { getTile, getNeighbors, TOTAL_TILES } from '@/lib/db';

/**
 * GET /api/tiles/:id/neighbors
 * Returns all neighbors for a tile, enriched with tile metadata.
 * No auth required.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  const neighbors = getNeighbors(tileId);

  // Enrich with tile details
  const enriched = neighbors.map(n => {
    const neighborTile = getTile(n.neighborId);
    return {
      tileId: n.neighborId,
      label: n.label,
      createdAt: n.createdAt,
      name: neighborTile?.name || null,
      avatar: neighborTile?.avatar || null,
      color: neighborTile?.color || null,
      imageUrl: neighborTile?.image_url || null,
      status: neighborTile?.status || 'offline',
      lastHeartbeat: neighborTile?.lastHeartbeat || null,
    };
  });

  return NextResponse.json({ tileId, neighbors: enriched, count: enriched.length });
}
