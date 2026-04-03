import { NextResponse } from 'next/server';
import { paintPixelWarsTile, refreshPixelWarsChampionBadge, logEvent, TOTAL_TILES } from '@/lib/db';

export async function POST(req) {
  try {
    const body = await req.json();
    const wallet = body.wallet || req.headers.get('x-wallet') || req.headers.get('x-wallet-address');
    const tileId = Number(body.tileId);
    const sourceTileId = Number(body.sourceTileId);
    const color = body.color;

    if (!Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) return NextResponse.json({ error: 'Invalid tileId' }, { status: 400 });
    if (!Number.isInteger(sourceTileId) || sourceTileId < 0 || sourceTileId >= TOTAL_TILES) return NextResponse.json({ error: 'Invalid sourceTileId' }, { status: 400 });
    if (!wallet) return NextResponse.json({ error: 'Wallet is required' }, { status: 400 });

    const paint = paintPixelWarsTile({ tileId, sourceTileId, wallet, color });
    const champion = refreshPixelWarsChampionBadge();
    logEvent('pixel_wars_painted', tileId, wallet, {
      tileId,
      sourceTileId,
      color: paint.color,
      tileName: `Tile #${tileId}`,
      sourceTileName: paint.sourceTileName,
      summary: `[${paint.sourceTileName}] painted Pixel Wars tile #${tileId}`,
    });

    return NextResponse.json({ ok: true, paint, champion });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to paint tile' }, { status: 400 });
  }
}
