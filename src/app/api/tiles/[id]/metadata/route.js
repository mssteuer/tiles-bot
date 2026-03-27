import { NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import { getTile, TOTAL_TILES } from '@/lib/db';
import { buildTileTokenMetadata, getSiteUrl } from '@/lib/openseaMetadata';

// Contract ABI verification (task #490 req #5):
// MillionBotHomepage.sol ABI confirmed to include:
//   - setBaseMetadataURI(string) — owner sets base URI to https://tiles.bot/api/tiles/
//   - tokenURI(uint256) — returns {baseMetadataURI}{tokenId}/metadata
// Verified via: artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json

// GET /api/tiles/:id/metadata — ERC-721 tokenURI endpoint (public, no auth)
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
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
    },
  });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  // Check for wallet signature auth (new UI path)
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSig = request.headers.get('X-Wallet-Signature');
  const walletMsg = request.headers.get('X-Wallet-Message');

  if (walletAddress && walletSig && walletMsg) {
    // Verify ownership
    if (tile.owner.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
    }

    // Verify message format: tiles.bot:metadata:{tileId}:{timestamp}
    const msgParts = walletMsg.split(':');
    if (msgParts[0] !== 'tiles.bot' || msgParts[1] !== 'metadata' || msgParts[2] !== String(tileId)) {
      return NextResponse.json({ error: 'Invalid message format' }, { status: 401 });
    }

    // Check timestamp within 10 minutes (message uses 5-min window rounding)
    const msgTs = parseInt(msgParts[3], 10);
    const nowTs = Math.floor(Date.now() / 1000);
    if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 });
    }

    // Verify signature
    try {
      const valid = await verifyMessage({
        address: walletAddress,
        message: walletMsg,
        signature: walletSig,
      });
      if (!valid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }
  } else {
    // Legacy path: X-Wallet header (demo/seed flows)
    const wallet = request.headers.get('X-Wallet');
    if (!wallet) {
      return NextResponse.json({ error: 'Auth required (X-Wallet-Address/Signature/Message headers or X-Wallet)' }, { status: 401 });
    }
    if (tile.owner.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
    }
  }

  const { updateTileMetadata } = await import('@/lib/db');
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated = updateTileMetadata(tileId, body);
  return NextResponse.json({ ok: true, tile: updated });
}
