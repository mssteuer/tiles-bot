import { NextResponse } from 'next/server';
import { getTile, updateTileMetadata, TOTAL_TILES, logEvent } from '@/lib/db';
import { verifyWalletSignature } from '@/lib/verify-wallet-sig';

/**
 * POST /api/tiles/batch-update
 *
 * Update metadata on multiple tiles owned by the same wallet in a single request.
 * Useful for owners with many tiles (e.g., 248 tiles) who want to rebrand without
 * calling PUT /api/tiles/:id/metadata for every single tile.
 *
 * Auth: EIP-191 wallet signature (same scheme as single-tile PUT /metadata).
 * Message format: tiles.bot:batch-update:{sorted_tile_ids_csv}:{timestamp}
 *
 * Body: {
 *   wallet: "0x...",
 *   tileIds: [1, 2, 3, ...],        // which tiles to update
 *   metadata: {                      // fields to apply to all tiles
 *     name?: string,                 // if omitted, each tile keeps its name
 *     avatar?: string,
 *     description?: string,
 *     category?: string,
 *     color?: string,
 *     url?: string,
 *     xHandle?: string,
 *     imageUrl?: string,
 *   },
 *   signature: "0x...",             // sign the message below
 *   message: "tiles.bot:batch-update:{sorted_ids}:{ts}", // message that was signed
 * }
 *
 * Response: { ok: true, updated: number, skipped: number, errors: [] }
 *
 * Limits:
 * - Max 1,000 tiles per request
 * - All tileIds must be owned by the signing wallet
 * - timestamp in signed message must be within 10 minutes
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { wallet, tileIds, metadata, signature, message } = body;

  // Basic validation
  if (!wallet || !Array.isArray(tileIds) || !tileIds.length || !metadata || !signature || !message) {
    return NextResponse.json(
      { error: 'wallet, tileIds[], metadata, signature, and message are required' },
      { status: 400 }
    );
  }

  if (tileIds.length > 1000) {
    return NextResponse.json({ error: 'Max 1,000 tiles per batch update' }, { status: 400 });
  }

  // Validate tile IDs
  const validIds = tileIds.filter(id => {
    const n = Number(id);
    return Number.isInteger(n) && n >= 0 && n < TOTAL_TILES;
  });
  if (validIds.length !== tileIds.length) {
    return NextResponse.json({ error: 'One or more invalid tile IDs' }, { status: 400 });
  }

  // Validate message format: tiles.bot:batch-update:{sorted_ids_csv}:{timestamp}
  const msgParts = message.split(':');
  if (msgParts[0] !== 'tiles.bot' || msgParts[1] !== 'batch-update') {
    return NextResponse.json({ error: 'Invalid message format. Expected: tiles.bot:batch-update:{ids}:{ts}' }, { status: 401 });
  }

  // Verify timestamp (within 10 minutes)
  const msgTs = parseInt(msgParts[msgParts.length - 1], 10);
  const nowTs = Math.floor(Date.now() / 1000);
  if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
    return NextResponse.json({ error: 'Signature expired (>10 min)' }, { status: 401 });
  }

  // Verify the signed message includes the exact tile IDs (prevent adding extra tiles)
  const sortedIdsInMsg = msgParts[2];
  const expectedIds = [...validIds].map(Number).sort((a, b) => a - b).join(',');
  if (sortedIdsInMsg !== expectedIds) {
    return NextResponse.json({ error: 'Signed tile IDs do not match request tile IDs' }, { status: 401 });
  }

  // Verify wallet signature (EOA + ERC-1271 smart wallet support)
  const sigValid = await verifyWalletSignature(message, signature, wallet).catch(() => false);
  if (!sigValid) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  // Only allow known metadata fields
  const ALLOWED = ['name', 'avatar', 'description', 'category', 'color', 'url', 'xHandle', 'imageUrl'];
  const filteredMeta = {};
  for (const key of ALLOWED) {
    if (metadata[key] !== undefined) filteredMeta[key] = metadata[key];
  }
  if (Object.keys(filteredMeta).length === 0) {
    return NextResponse.json({ error: 'No valid metadata fields provided' }, { status: 400 });
  }

  // Apply updates — verify ownership tile by tile
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const tileId of validIds) {
    const tile = getTile(Number(tileId));
    if (!tile) {
      skipped++;
      continue;
    }
    if (tile.owner?.toLowerCase() !== wallet.toLowerCase()) {
      errors.push({ tileId, error: 'Not tile owner' });
      continue;
    }

    try {
      updateTileMetadata(Number(tileId), filteredMeta);
      updated++;
    } catch (err) {
      errors.push({ tileId, error: String(err.message || err) });
    }
  }

  // Log a single batch event
  if (updated > 0) {
    logEvent('batch_metadata_updated', null, wallet, {
      count: updated,
      fields: Object.keys(filteredMeta),
    });
  }

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    errors: errors.length ? errors : undefined,
  });
}
