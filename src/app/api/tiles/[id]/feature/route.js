import { NextResponse } from 'next/server';
import { createFeaturedSpot, isTileFeatured } from '@/lib/db';
import { verifyWalletSignature } from '@/lib/verify-wallet-sig';

const SPOTLIGHT_PRICE_USDC = 5; // $5 USDC per 24h

/**
 * POST /api/tiles/:id/feature
 * Body: { wallet, signature, message, durationHours? }
 *
 * NOTE: This endpoint records the spotlight purchase in the DB.
 * In a full production flow, on-chain USDC transfer verification would happen here.
 * For now, we verify wallet ownership via signature and proceed (demo/soft-launch mode).
 */
export async function POST(request, { params }) {
  try {
    const tileId = Number(params.id);
    if (!Number.isInteger(tileId) || tileId < 0 || tileId > 65535) {
      return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
    }

    const body = await request.json();
    const { wallet, signature, message, durationHours = 24 } = body;

    if (!wallet || !signature || !message) {
      return NextResponse.json({ error: 'wallet, signature, and message are required' }, { status: 400 });
    }

    if (![24, 48, 72].includes(Number(durationHours))) {
      return NextResponse.json({ error: 'durationHours must be 24, 48, or 72' }, { status: 400 });
    }

    // Verify wallet signature
    const isValid = await verifyWalletSignature(message, signature, wallet);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid wallet signature' }, { status: 401 });
    }

    // Check if already featured
    if (isTileFeatured(tileId)) {
      return NextResponse.json({ error: 'This tile already has an active spotlight' }, { status: 409 });
    }

    const paidAmount = SPOTLIGHT_PRICE_USDC * (durationHours / 24);
    const spot = createFeaturedSpot({ tileId, owner: wallet, durationHours: Number(durationHours), paidAmount });

    return NextResponse.json({ ok: true, spotlight: spot, paidAmount });
  } catch (err) {
    console.error('[feature] POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
