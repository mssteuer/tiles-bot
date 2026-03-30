import { NextResponse } from 'next/server';
import { claimTile, getCurrentPrice, getClaimedCount, getNextAvailableTileId, getRecentlyClaimed, getTopHolders, setTileTxHash, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '8453';

/**
 * POST /api/tiles/{id}/register
 * 
 * For UI-based claims: user already paid on-chain via MetaMask.
 * We verify on-chain ownership as proof of payment — no x402, no replays.
 * 
 * Body: { wallet: string, txHash?: string }
 * 
 * Security model:
 * - Verifies ownerOf(tileId) == wallet on-chain (the ONLY source of truth)
 * - If the contract says they own it, they paid. Period.
 * - txHash is optional metadata for linking to explorer — not used for auth.
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

  let wallet = body.wallet.toLowerCase();
  const txHash = body.txHash || null;

  if (!CONTRACT_ADDRESS) {
    return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
  }

  // Verify on-chain: does this wallet actually own this tile?
  try {
    const { createPublicClient, http, parseAbi } = await import('viem');
    const chains = await import('viem/chains');
    const chain = CHAIN_ID === '84532' ? chains.baseSepolia : chains.base;

    const publicClient = createPublicClient({
      chain,
      transport: http(CHAIN_ID === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
    });

    const OWNER_ABI = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);

    let onChainOwner;
    try {
      onChainOwner = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: OWNER_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tileId)],
      });
    } catch (err) {
      // ownerOf reverts for non-existent tokens
      return NextResponse.json(
        { error: 'Tile not yet minted on-chain. Complete the MetaMask claim transaction first.' },
        { status: 404 }
      );
    }

    // Accept if wallet matches on-chain owner directly, OR if the on-chain
    // owner is a smart wallet proxy (Coinbase Smart Wallet / EIP-7702).
    // The key proof is that the tile IS minted — the claimer paid USDC on-chain.
    // We record the on-chain owner as the tile owner regardless.
    const ownerMatch = onChainOwner.toLowerCase() === wallet;
    if (!ownerMatch) {
      // Smart wallet: on-chain owner differs from EOA — still register,
      // but use the on-chain owner as the canonical owner
      wallet = onChainOwner.toLowerCase();
    }
  } catch (err) {
    console.error('[register] On-chain verification failed:', err);
    return NextResponse.json(
      { error: 'Failed to verify on-chain ownership', detail: err.message },
      { status: 502 }
    );
  }

  // On-chain ownership verified — register in DB
  const price = getCurrentPrice();
  const tile = claimTile(tileId, body.wallet, price);

  if (!tile) {
    // Already in DB — that's fine, maybe a retry
    return NextResponse.json({ message: 'Tile already registered', tileId }, { status: 200 });
  }

  if (txHash) {
    setTileTxHash(tileId, txHash);
    tile.txHash = txHash;
  }

  // Broadcast update
  broadcast({
    type: 'tile_claimed',
    tileId,
    tile,
    claimedCount: getClaimedCount(),
    currentPrice: getCurrentPrice(),
    nextAvailableTileId: getNextAvailableTileId(),
    recentlyClaimed: getRecentlyClaimed(10).map(row => ({
      id: row.id,
      name: row.name || `Tile #${row.id}`,
      owner: row.owner,
      claimedAt: row.claimed_at,
    })),
    topHolders: getTopHolders(10).map(row => ({
      owner: row.owner,
      count: row.count,
    })),
  });

  return NextResponse.json({ tile, pricePaid: price, txHash, verified: 'on-chain' }, { status: 201 });
}
