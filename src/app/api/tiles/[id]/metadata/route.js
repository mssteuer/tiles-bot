import { NextResponse } from 'next/server';
import { getTile, TOTAL_TILES } from '@/lib/db';
import { buildTileTokenMetadata } from '@/lib/openseaMetadata';

function getSiteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'tiles.bot';
  return `${forwardedProto}://${forwardedHost}`;
}

export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);

  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  const metadata = buildTileTokenMetadata({
    siteUrl: getSiteUrl(request),
    contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    tileId,
    tile,
  });

  return NextResponse.json(metadata, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}

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

  const { updateTileMetadata } = await import('@/lib/db');
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated = updateTileMetadata(tileId, body);
  return NextResponse.json(updated);
}
