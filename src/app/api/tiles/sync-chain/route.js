import { NextResponse } from 'next/server';
import { claimTile, getCurrentPrice, getClaimedCount, getNextAvailableTileId, getRecentlyClaimed, getTopHolders, setTileTxHash, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';
import { logChainSyncError } from '@/lib/structured-logger';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '8453';

/**
 * POST /api/tiles/sync-chain
 * 
 * Scans on-chain Transfer events from our contract and registers
 * any tiles that exist on-chain but not in the DB.
 * 
 * Body: { wallet?: string } — optional filter to sync only one wallet's tiles
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const filterWallet = body.wallet?.toLowerCase() || null;

  if (!CONTRACT_ADDRESS) {
    return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
  }

  try {
    const { createPublicClient, http, parseAbi } = await import('viem');
    const chains = await import('viem/chains');
    const chain = CHAIN_ID === '84532' ? chains.baseSepolia : chains.base;

    const publicClient = createPublicClient({
      chain,
      transport: http(CHAIN_ID === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
    });

    // Get total minted from contract
    const TOTAL_ABI = parseAbi(['function totalMinted() view returns (uint256)']);
    let totalMinted;
    try {
      totalMinted = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: TOTAL_ABI,
        functionName: 'totalMinted',
      });
    } catch {
      totalMinted = 0n;
    }

    // Get all Transfer (mint) events from creation block
    const TRANSFER_EVENT = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);

    // Base RPC limits getLogs to 10,000 block range — scan in chunks from recent blocks
    const currentBlock = await publicClient.getBlockNumber();
    const CHUNK_SIZE = 9999n;
    // Contract deployed very recently — scan last 50k blocks (~1 day on Base at 2s/block)
    const startBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;

    const logs = [];
    for (let from = startBlock; from <= currentBlock; from += CHUNK_SIZE + 1n) {
      const to = from + CHUNK_SIZE > currentBlock ? currentBlock : from + CHUNK_SIZE;
      const chunk = await publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: TRANSFER_EVENT[0],
        args: { from: '0x0000000000000000000000000000000000000000' },
        fromBlock: from,
        toBlock: to,
      });
      logs.push(...chunk);
    }

    const registered = [];
    const skipped = [];
    const alreadyInDb = [];

    for (const log of logs) {
      const tileId = Number(log.args.tokenId);
      const owner = log.args.to;

      if (filterWallet && owner.toLowerCase() !== filterWallet) {
        continue;
      }

      const price = getCurrentPrice();
      const tile = claimTile(tileId, owner, price);

      if (!tile) {
        alreadyInDb.push(tileId);
        continue;
      }

      const txHash = log.transactionHash;
      if (txHash) {
        setTileTxHash(tileId, txHash);
        tile.txHash = txHash;
      }

      registered.push(tile);
    }

    // Broadcast if we registered anything
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
      onChainTotal: Number(totalMinted),
      logsFound: logs.length,
      newlyRegistered: registered.length,
      alreadyInDb: alreadyInDb.length,
      filteredByWallet: filterWallet || 'all',
      registeredTileIds: registered.map(t => t.id),
    }, { status: 200 });

  } catch (err) {
    console.error('[sync-chain] Error:', err);
    logChainSyncError({
      errorMessage: err.message || String(err),
      detail: err.stack ? err.stack.split('\n')[1]?.trim() : null,
      context: 'sync-chain',
    });
    return NextResponse.json(
      { error: 'Chain sync failed', detail: err.message },
      { status: 502 }
    );
  }
}
