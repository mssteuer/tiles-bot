import { NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import { getTile, updateTileMetadata, TOTAL_TILES } from '@/lib/db';

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

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated = updateTileMetadata(tileId, body);
  return NextResponse.json({ ok: true, tile: updated });
}
