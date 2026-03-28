import { NextResponse } from 'next/server';
import { claimTile, getCurrentPrice, getClaimedCount, getNextAvailableTileId, getRecentlyClaimed, getTopHolders, setTileTxHash, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '8453';

/**
 * POST /api/tiles/batch-register
 * 
 * Register multiple tiles from a single confirmed batchClaim tx.
 * Verifies the tx receipt once (not per-tile ownerOf which has RPC lag).
 * 
 * Body: { wallet: string, tileIds: number[], txHash: string }
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.wallet || !body?.tileIds?.length || !body?.txHash) {
    return NextResponse.json(
      { error: 'wallet, tileIds[], and txHash required' },
      { status: 400 }
    );
  }

  const wallet = body.wallet;
  const txHash = body.txHash;
  const tileIds = body.tileIds.filter(id => {
    const n = Number(id);
    return !isNaN(n) && n >= 0 && n < TOTAL_TILES;
  });

  if (!tileIds.length) {
    return NextResponse.json({ error: 'No valid tile IDs' }, { status: 400 });
  }

  if (!CONTRACT_ADDRESS) {
    return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
  }

  // Verify the tx receipt — confirms the transaction was mined and succeeded
  try {
    const { createPublicClient, http, decodeEventLog, parseAbi } = await import('viem');
    const chains = await import('viem/chains');
    const chain = CHAIN_ID === '84532' ? chains.baseSepolia : chains.base;

    const publicClient = createPublicClient({
      chain,
      transport: http(CHAIN_ID === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
    });

    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction reverted on-chain' }, { status: 400 });
    }

    // Verify the tx was sent to our contract
    if (receipt.to?.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Transaction not directed at tile contract' }, { status: 400 });
    }

    // Verify the sender matches the claimed wallet
    if (receipt.from?.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'Transaction sender does not match wallet' },
        { status: 403 }
      );
    }

    // Extract Transfer events to confirm which tiles were actually minted
    const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
    const mintedTileIds = new Set();
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === 'Transfer' && decoded.args.from === '0x0000000000000000000000000000000000000000') {
          mintedTileIds.add(Number(decoded.args.tokenId));
        }
      } catch {
        // Not a Transfer event — skip
      }
    }

    // Register only tiles that were actually minted in this tx
    const registered = [];
    const skipped = [];

    for (const tileId of tileIds) {
      if (!mintedTileIds.has(tileId)) {
        skipped.push({ tileId, reason: 'not in tx Transfer events' });
        continue;
      }

      const price = getCurrentPrice();
      const tile = claimTile(tileId, wallet, price);

      if (!tile) {
        skipped.push({ tileId, reason: 'already registered' });
        continue;
      }

      setTileTxHash(tileId, txHash);
      tile.txHash = txHash;
      registered.push(tile);
    }

    // Broadcast a single update with final stats
    if (registered.length > 0) {
      broadcast({
        type: 'tile_claimed',
        tileId: registered[0].id,
        tile: registered[0],
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
    }

    return NextResponse.json({
      ok: true,
      registered: registered.length,
      skipped: skipped.length,
      tiles: registered,
      skippedDetails: skipped,
    }, { status: 201 });

  } catch (err) {
    console.error('[batch-register] Verification failed:', err);
    return NextResponse.json(
      { error: 'Failed to verify transaction', detail: err.message },
      { status: 502 }
    );
  }
}
