import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getTile, TOTAL_TILES, updateTileMetadata } from '@/lib/db';
import { buildTileTokenMetadata, getSiteUrl } from '@/lib/openseaMetadata';

// Contract ABI verification (task #490 req #5):
// MillionBotHomepage.sol ABI confirmed to include:
//   - setBaseMetadataURI(string) — owner sets base URI to https://tiles.bot/api/tiles/
//   - tokenURI(uint256) — returns {baseMetadataURI}{tokenId}/metadata
// Verified via: artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json

function parseTileId(id) {
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return null;
  }
  return tileId;
}

function normalizeAddress(address) {
  return typeof address === 'string' ? address.trim().toLowerCase() : '';
}

function buildExpectedMessage(tileId, timestamp) {
  return `tiles.bot:metadata:${tileId}:${timestamp}`;
}

// GET /api/tiles/:id/metadata — ERC-721 tokenURI endpoint (public, no auth)
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseTileId(id);

  if (tileId === null) {
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
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    },
  });
}

// PUT /api/tiles/:id/metadata — owner-only metadata update via EIP-191 personal_sign
export async function PUT(request, { params }) {
  const { id } = await params;
  const tileId = parseTileId(id);

  if (tileId === null) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const signature = request.headers.get('X-Wallet-Signature');
  const message = request.headers.get('X-Wallet-Message');
  const walletAddress = request.headers.get('X-Wallet-Address');

  if (!signature || !message || !walletAddress) {
    return NextResponse.json(
      { error: 'Auth required (X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature)' },
      { status: 401 }
    );
  }

  const msgParts = message.split(':');
  if (msgParts.length !== 4 || msgParts[0] !== 'tiles.bot' || msgParts[1] !== 'metadata') {
    return NextResponse.json({ error: 'Invalid message format' }, { status: 401 });
  }

  if (msgParts[2] !== String(tileId)) {
    return NextResponse.json({ error: 'Signature does not match tile ID' }, { status: 401 });
  }

  const timestamp = parseInt(msgParts[3], 10);
  const nowTs = Math.floor(Date.now() / 1000);
  if (isNaN(timestamp) || Math.abs(nowTs - timestamp) > 600) {
    return NextResponse.json({ error: 'Signature expired' }, { status: 401 });
  }

  const expectedMessage = buildExpectedMessage(tileId, timestamp);
  if (message !== expectedMessage) {
    return NextResponse.json({ error: 'Invalid message format' }, { status: 401 });
  }

  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature);
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  if (normalizeAddress(recoveredAddress) !== normalizeAddress(walletAddress)) {
    return NextResponse.json({ error: 'Signer does not match claimed wallet address' }, { status: 401 });
  }

  if (normalizeAddress(recoveredAddress) !== normalizeAddress(tile.owner)) {
    return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
  }

  const updated = updateTileMetadata(tileId, body);
  return NextResponse.json({ ok: true, tile: updated });
}
