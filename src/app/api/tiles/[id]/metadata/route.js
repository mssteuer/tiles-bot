import { NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import { getTile, TOTAL_TILES, updateTileWebhook, logEvent } from '@/lib/db';
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

    // Verify signature (EOA + ERC-1271 smart wallet support)
    const { verifyWalletSignature } = await import('@/lib/verify-wallet-sig');
    const sigValid = await verifyWalletSignature(walletMsg, walletSig, walletAddress);
    if (!sigValid) {
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

  // Handle webhookUrl separately (stored in its own column, not in metadata JSON)
  if (body.webhookUrl !== undefined) {
    const webhookUrl = body.webhookUrl || null;
    // Basic URL validation — must be https:// or null (clear)
    if (webhookUrl !== null && !webhookUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'webhookUrl must be an https:// URL or empty string to clear' }, { status: 400 });
    }
    updateTileWebhook(tileId, webhookUrl);
  }

  // Strip webhookUrl from body before passing to updateTileMetadata (it's a separate column)
  const { webhookUrl: _wh, ...metadataFields } = body;
  const updated = Object.keys(metadataFields).length > 0 ? updateTileMetadata(tileId, metadataFields) : getTile(tileId);

  // Log metadata update event (only if actual fields were changed, skip webhook-only updates)
  if (Object.keys(metadataFields).length > 0) {
    const existingTile = getTile(tileId);
    logEvent('metadata_updated', tileId, existingTile?.owner || null, {
      tileName: updated?.name || existingTile?.name || `Tile #${tileId}`,
      fields: Object.keys(metadataFields),
    });
  }

  return NextResponse.json({ ok: true, tile: updated });
}
