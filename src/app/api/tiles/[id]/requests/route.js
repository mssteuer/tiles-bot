import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  getTile,
  createConnectionRequest,
  getPendingRequestsForTile,
  connectionExists,
  TOTAL_TILES,
} from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

/**
 * GET /api/tiles/:id/requests
 * Returns all pending incoming connection requests for a tile.
 * No auth required — pending requests are visible (so the tile panel can show them).
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

  const requests = getPendingRequestsForTile(tileId);
  return NextResponse.json({ tileId, requests, count: requests.length });
}

/**
 * POST /api/tiles/:id/requests
 * Send a connection request TO this tile FROM another tile you own.
 * Body: { fromTileId: number }
 * Auth: EIP-191 signature of "tiles.bot:connect:{fromTileId}:{toTileId}:{timestamp}"
 * Headers: X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const toTileId = parseInt(id, 10);
  if (isNaN(toTileId) || toTileId < 0 || toTileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const toTile = getTile(toTileId);
  if (!toTile) {
    return NextResponse.json({ error: 'Target tile not claimed' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fromTileId = parseInt(body.fromTileId, 10);
  if (isNaN(fromTileId) || fromTileId < 0 || fromTileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid fromTileId' }, { status: 400 });
  }
  if (fromTileId === toTileId) {
    return NextResponse.json({ error: 'Cannot send a request to yourself' }, { status: 400 });
  }

  const fromTile = getTile(fromTileId);
  if (!fromTile) {
    return NextResponse.json({ error: 'From tile not claimed' }, { status: 404 });
  }

  // Already connected?
  if (connectionExists(fromTileId, toTileId)) {
    return NextResponse.json({ error: 'Tiles are already connected' }, { status: 409 });
  }

  // Wallet auth — verify the sender owns the FROM tile
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSig = request.headers.get('X-Wallet-Signature');
  const walletMsg = request.headers.get('X-Wallet-Message');

  if (!walletAddress || !walletSig || !walletMsg) {
    return NextResponse.json(
      { error: 'Auth required (X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature)' },
      { status: 401 }
    );
  }

  // Message format: tiles.bot:connect:{fromTileId}:{toTileId}:{timestamp}
  const msgParts = walletMsg.split(':');
  if (
    msgParts.length !== 5 ||
    msgParts[0] !== 'tiles.bot' ||
    msgParts[1] !== 'connect' ||
    msgParts[2] !== String(fromTileId) ||
    msgParts[3] !== String(toTileId)
  ) {
    return NextResponse.json({ error: 'Invalid auth message format' }, { status: 401 });
  }

  const msgTs = parseInt(msgParts[4], 10);
  const nowTs = Math.floor(Date.now() / 1000);
  if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
    return NextResponse.json({ error: 'Auth signature expired (10-minute window)' }, { status: 401 });
  }

  // Verify signature (EOA + ERC-1271 smart wallet support)
  const { verifyWalletSignature, verifyTileOwnership } = await import('@/lib/verify-wallet-sig');
  const sigValid = await verifyWalletSignature(walletMsg, walletSig, walletAddress);
  if (!sigValid) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  // Verify the signer owns the FROM tile (on-chain)
  const isFromOwner = await verifyTileOwnership(body.fromTileId, walletAddress);
  if (!isFromOwner) {
    return NextResponse.json({ error: 'Not the owner of the from tile' }, { status: 403 });
  }

  try {
    const req = createConnectionRequest(fromTileId, toTileId);
    broadcast({ type: 'connection_request', fromTileId, toTileId, requestId: req.id });
    return NextResponse.json({
      ok: true,
      request: req,
      message: `Connection request sent from tile #${fromTileId} to tile #${toTileId}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
