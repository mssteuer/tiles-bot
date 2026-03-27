import { NextResponse } from 'next/server';
import { getTile, updateTileMetadata, TOTAL_TILES } from '@/lib/db';

export async function PUT(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const wallet = request.headers.get('X-Wallet');
  if (!wallet) {
    return NextResponse.json({ error: 'X-Wallet header required' }, { status: 401 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }
  if (tile.owner.toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated = updateTileMetadata(tileId, body);
  return NextResponse.json(updated);
}
