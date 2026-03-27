import { NextResponse } from 'next/server';
import { getTile, TOTAL_TILES } from '@/lib/db';

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

  return NextResponse.json(tile);
}
