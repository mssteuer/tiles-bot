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
  verifyOwnershipOnChain,
} from '@/lib/chain-api';
import { broadcast } from '@/lib/sse-broadcast';
import { logMintFailure, logRegisterVerificationFailure } from '@/lib/structured-logger';

function recentClaimsPayload() {
  return getRecentlyClaimed(10).map(row => ({
    id: row.id,
    name: row.name || `Tile #${row.id}`,
    owner: row.owner,
    claimedAt: row.claimed_at,
    chain: row.chain || 'base',
  }));
}

function topHoldersPayload() {
  return getTopHolders(10).map(row => ({ owner: row.owner, count: row.count }));
}

async function priceForRegistration(chainId) {
  try {
    return (await getChainCurrentPrice(chainId)).currentPrice;
  } catch {
    return getCurrentPriceByChain(chainId);
  }
}

function isUnmintedTokenError(err) {
  const message = [
    err?.message,
    err?.shortMessage,
    err?.details,
    err?.cause?.message,
    err?.cause?.shortMessage,
    err?.cause?.details,
    err?.data?.errorName,
  ].filter(Boolean).join('\n');

  return /not minted|ownerOf|does not exist|nonexistent token|ERC721NonexistentToken|ERC721: invalid token ID|invalid token id/i.test(message);
}

/**
 * POST /api/tiles/{id}/register
 *
 * Body: { wallet: string, txHash?: string, chain?: 'base' | 'casper' }
 * Defaults to Base for backward compatibility.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 400 });
  }

  const chainId = resolveRequestedChainId(request, body);
  let chain;
  try {
    chain = assertSupportedChain(chainId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const txHash = body.txHash || body.deployHash || null;
  let canonicalOwner = body.wallet;

  try {
    const verification = await verifyOwnershipOnChain(chain.id, tileId, body.wallet);

    if (!verification.isOwner) {
      if (chain.id === 'base' && verification.onChainOwner) {
        // Coinbase Smart Wallet / EIP-7702 path: requester EOA differs from ownerOf().
        canonicalOwner = verification.canonicalOwner;
      } else {
        logMintFailure({
          tileId,
          wallet: body.wallet,
          txHash,
          errorMessage: `Wallet does not own tile on ${chain.id}`,
        });
        return NextResponse.json(
          { error: `Wallet does not own this tile on ${chain.name}` },
          { status: 403 }
        );
      }
    } else {
      canonicalOwner = verification.canonicalOwner || body.wallet;
    }
  } catch (err) {
    const isUnminted = isUnmintedTokenError(err);
    if (!isUnminted) console.error('[register] On-chain verification failed:', err);
    logRegisterVerificationFailure({
      tileId,
      wallet: body?.wallet || 'unknown',
      txHash,
      errorMessage: err.message || String(err),
    });

    if (isUnminted) {
      return NextResponse.json(
        {
          error: 'Tile ownership is not visible on-chain yet',
          message: 'Mint transaction may still be propagating. Retry registration shortly.',
          detail: err.message,
          chain: chain.id,
          retryAfterMs: 3000,
        },
        { status: 202 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to verify on-chain ownership', detail: err.message, chain: chain.id },
      { status: 502 }
    );
  }

  const price = await priceForRegistration(chain.id);
  const tile = claimTile(tileId, canonicalOwner, price, chain.id, chain.nftContract);

  if (!tile) {
    return NextResponse.json({ message: 'Tile already registered', tileId, chain: chain.id }, { status: 200 });
  }

  tile.chainContract = chain.nftContract;
  if (txHash) {
    setTileTxHash(tileId, txHash);
    tile.txHash = txHash;
  }

  broadcast({
    type: 'tile_claimed',
    tileId,
    chain: chain.id,
    tile,
    claimedCount: getClaimedCount(),
    // Legacy homepage stats still treat `currentPrice` as Base/USDC; chain-specific prices come from /api/stats perChain.
    currentPrice: await priceForRegistration('base'),
    nextAvailableTileId: getNextAvailableTileId(),
    recentlyClaimed: recentClaimsPayload(),
    topHolders: topHoldersPayload(),
  });

  return NextResponse.json({
    tile,
    chain: chain.id,
    pricePaid: price,
    txHash,
    verified: 'on-chain',
  }, { status: 201 });
}
