import { NextResponse } from 'next/server';
import { TOTAL_TILES } from '@/lib/db';
import { assertSupportedChain, resolveRequestedChainId, verifyOwnershipOnChain } from '@/lib/chain-api';

/**
 * GET /api/tiles/:id/check-owner?wallet=...&chain=base|casper
 * Defaults to Base for backward compatibility.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ error: 'wallet query param required' }, { status: 400 });
  }

  const chainId = resolveRequestedChainId(request);
  let chain;
  try {
    chain = assertSupportedChain(chainId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const result = await verifyOwnershipOnChain(chain.id, tileId, wallet);
    return NextResponse.json({
      isOwner: result.isOwner,
      onChainOwner: result.onChainOwner,
      chain: chain.id,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // ownerOf/owner lookup reverts for unminted tiles, or Casper dict lookup may be absent.
    return NextResponse.json({ isOwner: false, chain: chain.id }, { status: 200 });
  }
}
