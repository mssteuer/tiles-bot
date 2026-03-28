import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  getTile,
  getConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  TOTAL_TILES,
  logEvent,
} from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

/**
 * POST /api/tiles/:id/requests/:requestId
 * Accept or reject a connection request.
 * Body: { action: 'accept' | 'reject' }
 * Auth: EIP-191 signature of "tiles.bot:connect:{toTileId}:{requestId}:{timestamp}"
 * The authenticated wallet must own the TO tile (the tile receiving the request).
 */
export async function POST(request, { params }) {
  const { id, requestId: reqIdStr } = await params;
  const tileId = parseInt(id, 10);
  const requestId = parseInt(reqIdStr, 10);

  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }
  if (isNaN(requestId)) {
    return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  const connReq = getConnectionRequest(requestId);
  if (!connReq) {
    return NextResponse.json({ error: 'Connection request not found' }, { status: 404 });
  }
  if (connReq.toTileId !== tileId) {
    return NextResponse.json({ error: 'Request does not belong to this tile' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !['accept', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'Body must include action: "accept" or "reject"' }, { status: 400 });
  }

  // Wallet auth — verify the caller owns the TO tile
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSig = request.headers.get('X-Wallet-Signature');
  const walletMsg = request.headers.get('X-Wallet-Message');

  if (!walletAddress || !walletSig || !walletMsg) {
    return NextResponse.json(
      { error: 'Auth required (X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature)' },
      { status: 401 }
    );
  }

  // Message format: tiles.bot:connect:{toTileId}:{requestId}:{timestamp}
  const msgParts = walletMsg.split(':');
  if (
    msgParts.length !== 5 ||
    msgParts[0] !== 'tiles.bot' ||
    msgParts[1] !== 'connect' ||
    msgParts[2] !== String(tileId) ||
    msgParts[3] !== String(requestId)
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

  // Ownership check: wallet must be on-chain owner of the tile
  const isOnChainOwner = await verifyTileOwnership(tileId, walletAddress);
  if (!isOnChainOwner) {
    return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
  }

  try {
    if (body.action === 'accept') {
      const result = acceptConnectionRequest(requestId, tileId);
      const fromTile = getTile(result.fromTileId);
      const toTile = getTile(result.toTileId);
      logEvent('connection_accepted', result.fromTileId, walletAddress, {
        tileName: fromTile?.name || `Tile #${result.fromTileId}`,
        toTileId: result.toTileId,
        toTileName: toTile?.name || `Tile #${result.toTileId}`,
      });
      broadcast({ type: 'connection_accepted', fromTileId: result.fromTileId, toTileId: result.toTileId });
      return NextResponse.json({
        ok: true,
        action: 'accepted',
        fromTileId: result.fromTileId,
        toTileId: result.toTileId,
        message: `Connection request accepted — tiles #${result.fromTileId} and #${result.toTileId} are now connected`,
      });
    } else {
      const result = rejectConnectionRequest(requestId, tileId);
      return NextResponse.json({
        ok: true,
        action: 'rejected',
        fromTileId: result.fromTileId,
        toTileId: result.toTileId,
        message: `Connection request rejected`,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
