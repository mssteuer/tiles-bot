import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { pixelWarsPaint, pixelWarsErase, getPixelWarsMap, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';
import { logEvent } from '@/lib/db';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/games/pixel-wars
 * Returns the active pixel-wars paint map: { [tileId]: { color, owner, ownerTile, expiresAt } }
 */
export async function GET() {
  const disabled = featureDisabled(FEATURES.PIXEL_WARS, 'Pixel Wars');
  if (disabled) return disabled;

  const paintMap = getPixelWarsMap();
  return NextResponse.json({ paints: paintMap, count: Object.keys(paintMap).length });
}

/**
 * POST /api/games/pixel-wars
 * Paint an unclaimed tile adjacent to your own tile.
 * Body: { ownerTileId: number, targetTileId: number, color: string, wallet: string }
 */
export async function POST(request) {
  const disabled = featureDisabled(FEATURES.PIXEL_WARS, 'Pixel Wars');
  if (disabled) return disabled;

  const ip = getClientIp(request);
  const rl = checkRateLimit('pixel-wars', ip, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ownerTileId, targetTileId, color, wallet } = body;

  if (ownerTileId == null || targetTileId == null || !color || !wallet) {
    return NextResponse.json(
      { error: 'ownerTileId, targetTileId, color, and wallet are required' },
      { status: 400 }
    );
  }

  const oId = parseInt(ownerTileId, 10);
  const tId = parseInt(targetTileId, 10);

  if (isNaN(oId) || oId < 0 || oId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid ownerTileId' }, { status: 400 });
  }
  if (isNaN(tId) || tId < 0 || tId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid targetTileId' }, { status: 400 });
  }
  if (oId === tId) {
    return NextResponse.json({ error: 'ownerTileId and targetTileId must differ' }, { status: 400 });
  }

  try {
    const result = pixelWarsPaint(oId, tId, color, wallet);

    logEvent('pixel_wars_paint', tId, wallet, { ownerTile: oId, color });
    broadcast({
      type: 'pixel_wars_paint',
      tileId: tId,
      ownerTile: oId,
      color,
      ownerName: result.ownerName,
      expiresAt: result.expiresAt,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = err.message.includes('Rate limit') ? 429 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}

/**
 * DELETE /api/games/pixel-wars
 * Erase a paint you placed.
 * Body: { targetTileId: number, wallet: string }
 */
export async function DELETE(request) {
  const disabled = featureDisabled(FEATURES.PIXEL_WARS, 'Pixel Wars');
  if (disabled) return disabled;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { targetTileId, wallet } = body;
  if (targetTileId == null || !wallet) {
    return NextResponse.json({ error: 'targetTileId and wallet are required' }, { status: 400 });
  }

  const tId = parseInt(targetTileId, 10);
  if (isNaN(tId) || tId < 0 || tId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid targetTileId' }, { status: 400 });
  }

  try {
    const result = pixelWarsErase(tId, wallet);
    broadcast({ type: 'pixel_wars_erase', tileId: tId });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
