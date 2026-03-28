import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getTile, addConnection, removeConnection, getNeighbors, connectionExists, TOTAL_TILES } from '@/lib/db';

/**
 * GET /api/tiles/:id/connect
 * Returns all neighbors for a tile.
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
      status: neighborTile?.status || 'offline',
      lastHeartbeat: neighborTile?.lastHeartbeat || null,
    };
  });

  return NextResponse.json({ tileId, neighbors: enriched, count: enriched.length });
}

/**
 * POST /api/tiles/:id/connect
 * Connect this tile to another tile. Requires wallet auth (tile owner only).
 * Body: { targetId: number, label?: string }
 * Headers: X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  // Wallet auth
  const authError = await verifyWalletAuth(request, tileId, tile);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { targetId, label } = body;
  const target = parseInt(targetId, 10);
  if (isNaN(target) || target < 0 || target >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });
  }
  if (target === tileId) {
    return NextResponse.json({ error: 'Cannot connect a tile to itself' }, { status: 400 });
  }

  const targetTile = getTile(target);
  if (!targetTile) {
    return NextResponse.json({ error: 'Target tile is not claimed' }, { status: 404 });
  }

  // Validate label
  const cleanLabel = label && typeof label === 'string' ? label.trim().slice(0, 50) : null;

  // Already connected?
  if (connectionExists(tileId, target)) {
    return NextResponse.json({ error: 'Connection already exists' }, { status: 409 });
  }

  try {
    addConnection(tileId, target, cleanLabel);
    return NextResponse.json({
      ok: true,
      from: tileId,
      to: target,
      label: cleanLabel,
      message: `Tile #${tileId} connected to tile #${target}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}

/**
 * DELETE /api/tiles/:id/connect
 * Disconnect from another tile. Requires wallet auth (either tile's owner).
 * Body: { targetId: number }
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  // Wallet auth
  const authError = await verifyWalletAuth(request, tileId, tile);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const { targetId } = body || {};
  const target = parseInt(targetId, 10);
  if (isNaN(target) || target < 0 || target >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 });
  }

  const removed = removeConnection(tileId, target);
  if (!removed) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, from: tileId, to: target, message: 'Connection removed' });
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function verifyWalletAuth(request, tileId, tile) {
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSig = request.headers.get('X-Wallet-Signature');
  const walletMsg = request.headers.get('X-Wallet-Message');

  if (!walletAddress || !walletSig || !walletMsg) {
    return NextResponse.json(
      { error: 'Auth required (X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature)' },
      { status: 401 }
    );
  }

  const msgParts = walletMsg.split(':');
  if (msgParts.length !== 4 || msgParts[0] !== 'tiles.bot' || msgParts[1] !== 'metadata' || msgParts[2] !== String(tileId)) {
    return NextResponse.json({ error: 'Invalid auth message format' }, { status: 401 });
  }
  const msgTs = parseInt(msgParts[3], 10);
  const nowTs = Math.floor(Date.now() / 1000);
  if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
    return NextResponse.json({ error: 'Auth signature expired (10-minute window)' }, { status: 401 });
  }

  const { verifyWalletSignature, verifyTileOwnership } = await import('@/lib/verify-wallet-sig');
  const sigValid = await verifyWalletSignature(walletMsg, walletSig, walletAddress);
  if (!sigValid) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }
  const isOnChainOwner = await verifyTileOwnership(tile.id, walletAddress);
  if (!isOnChainOwner) {
    return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
  }

  return null; // auth ok
}
