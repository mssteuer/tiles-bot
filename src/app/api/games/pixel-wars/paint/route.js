import { NextResponse } from 'next/server';
import { paintPixelWarsTile, refreshPixelWarsChampionBadge, logEvent, TOTAL_TILES } from '@/lib/db';
import { verifyWalletSignature, verifyTileOwnership } from '@/lib/verify-wallet-sig';

function isValidPixelWarsColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export async function POST(req) {
  try {
    const body = await req.json();
    const wallet = body.wallet || req.headers.get('x-wallet') || req.headers.get('x-wallet-address');
    const walletSig = body.signature || req.headers.get('x-wallet-signature');
    const walletMsg = body.message || req.headers.get('x-wallet-message');
    const tileId = Number(body.tileId);
    const sourceTileId = Number(body.sourceTileId);
    const color = typeof body.color === 'string' ? body.color.trim() : '';

    if (!Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) return NextResponse.json({ error: 'Invalid tileId' }, { status: 400 });
    if (!Number.isInteger(sourceTileId) || sourceTileId < 0 || sourceTileId >= TOTAL_TILES) return NextResponse.json({ error: 'Invalid sourceTileId' }, { status: 400 });
    if (!wallet) return NextResponse.json({ error: 'Wallet is required' }, { status: 400 });
    if (!isValidPixelWarsColor(color)) return NextResponse.json({ error: 'Color must be a hex value like #FF5500' }, { status: 400 });
    if (!walletSig || !walletMsg) {
      return NextResponse.json({ error: 'Auth required (message + signature)' }, { status: 401 });
    }

    const msgParts = walletMsg.split(':');
    if (msgParts.length !== 5 || msgParts[0] !== 'tiles.bot' || msgParts[1] !== 'pixel-wars' || msgParts[2] !== String(sourceTileId) || msgParts[3] !== String(tileId)) {
      return NextResponse.json({ error: 'Invalid auth message format' }, { status: 401 });
    }
    const msgTs = parseInt(msgParts[4], 10);
    const nowTs = Math.floor(Date.now() / 1000);
    if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
      return NextResponse.json({ error: 'Auth signature expired (10-minute window)' }, { status: 401 });
    }

    const sigValid = await verifyWalletSignature(walletMsg, walletSig, wallet).catch(() => false);
    if (!sigValid) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }
    const isOwner = await verifyTileOwnership(sourceTileId, wallet);
    if (!isOwner) {
      return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
    }

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
