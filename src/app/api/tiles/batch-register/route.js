import { NextResponse } from 'next/server';
import {
  claimTile,
  getClaimedCount,
  getCurrentPriceByChain,
  getNextAvailableTileId,
  getRecentlyClaimed,
  getTopHolders,
  setTileTxHash,
  TOTAL_TILES,
} from '@/lib/db';
import {
  assertSupportedChain,
  getChainCurrentPrice,
  resolveRequestedChainId,
  verifyBatchMintTransaction,
} from '@/lib/chain-api';
import { broadcast } from '@/lib/sse-broadcast';

function validTileIds(values) {
  return [...new Set((values || [])
    .map(id => Number(id))
    .filter(n => Number.isInteger(n) && n >= 0 && n < TOTAL_TILES))];
}

function recentClaimsPayload() {
  return getRecentlyClaimed(10).map(row => ({
    id: row.id,
    name: row.name || `Tile #${row.id}`,
    owner: row.owner,
    claimedAt: row.claimed_at,
    chain: row.chain || 'base',
  }));
}

async function priceForRegistration(chainId) {
  try {
    return (await getChainCurrentPrice(chainId)).currentPrice;
  } catch {
    return getCurrentPriceByChain(chainId);
  }
}

/**
 * POST /api/tiles/batch-register
 *
 * Body: { wallet: string, tileIds: number[], txHash?: string, deployHash?: string, chain?: 'base' | 'casper' }
 * Defaults to Base for backward compatibility.
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.wallet || !body?.tileIds?.length || !(body?.txHash || body?.deployHash)) {
    return NextResponse.json(
      { error: 'wallet, tileIds[], and txHash/deployHash required' },
      { status: 400 }
    );
  }

  const chainId = resolveRequestedChainId(request, body);
  let chain;
  try {
    chain = assertSupportedChain(chainId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const wallet = body.wallet;
  const txHash = body.txHash || body.deployHash;
  const tileIds = validTileIds(body.tileIds);
  if (!tileIds.length) {
    return NextResponse.json({ error: 'No valid tile IDs' }, { status: 400 });
  }

  try {
    const verification = await verifyBatchMintTransaction({
      chainId: chain.id,
      tileIds,
      wallet,
      txHash,
    });
    const mintedTileIds = new Set(verification.verifiedTileIds);
    if (mintedTileIds.size === 0) {
      return NextResponse.json({ error: `No tile mints verified on ${chain.name}` }, { status: 400 });
    }

    const registered = [];
    const skipped = [];

    for (const tileId of tileIds) {
      if (!mintedTileIds.has(tileId)) {
        skipped.push({ tileId, reason: `not verified in ${chain.id} transaction/deploy` });
        continue;
      }

      const price = await priceForRegistration(chain.id);
      const tile = claimTile(tileId, wallet, price, chain.id, chain.nftContract);
      if (!tile) {
        skipped.push({ tileId, reason: 'already registered' });
        continue;
      }

      tile.chainContract = chain.nftContract;
      setTileTxHash(tileId, txHash);
      tile.txHash = txHash;
      registered.push(tile);
    }

    if (registered.length > 0) {
      broadcast({
        type: 'tile_claimed',
        tileId: registered[0].id,
        chain: chain.id,
        tile: registered[0],
        claimedCount: getClaimedCount(),
        currentPrice: await priceForRegistration('base'),
        nextAvailableTileId: getNextAvailableTileId(),
        recentlyClaimed: recentClaimsPayload(),
        topHolders: getTopHolders(10).map(row => ({ owner: row.owner, count: row.count })),
      });
    }

    return NextResponse.json({
      ok: true,
      chain: chain.id,
      registered: registered.length,
      skipped: skipped.length,
      tiles: registered,
      skippedDetails: skipped,
    }, { status: 201 });
  } catch (err) {
    console.error('[batch-register] Verification failed:', err);
    return NextResponse.json(
      { error: 'Failed to verify transaction', detail: err.message, chain: chain.id },
      { status: 502 }
    );
  }
}
