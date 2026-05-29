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
import { getSupportedChains } from '@/lib/chains';
import { broadcast } from '@/lib/sse-broadcast';
import { logChainSyncError } from '@/lib/structured-logger';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function parseTileIds(value) {
  const rawTileIds = Array.isArray(value) ? value : String(value || '').split(',');
  return rawTileIds
    .map(v => Number(String(v).trim()))
    .filter(n => Number.isInteger(n) && n >= 0 && n < TOTAL_TILES);
}

async function priceForRegistration(chainId) {
  try {
    return (await getChainCurrentPrice(chainId)).currentPrice;
  } catch {
    return getCurrentPriceByChain(chainId);
  }
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

async function syncBase({ wallet = null } = {}) {
  const chain = assertSupportedChain('base');
  const { createPublicClient, http, parseAbi } = await import('viem');
  const viemChains = await import('viem/chains');
  const viemChain = String(process.env.NEXT_PUBLIC_CHAIN_ID || '') === '84532' ? viemChains.baseSepolia : viemChains.base;
  const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl || undefined) });

  const TOTAL_ABI = parseAbi(['function totalMinted() view returns (uint256)']);
  const TRANSFER_EVENT = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
  const totalMinted = await publicClient.readContract({
    address: chain.nftContract,
    abi: TOTAL_ABI,
    functionName: 'totalMinted',
  }).catch(() => 0n);

  const currentBlock = await publicClient.getBlockNumber();
  const chunkSize = 9999n;
  const startBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;
  const logs = [];

  for (let from = startBlock; from <= currentBlock; from += chunkSize + 1n) {
    const to = from + chunkSize > currentBlock ? currentBlock : from + chunkSize;
    const chunk = await publicClient.getLogs({
      address: chain.nftContract,
      event: TRANSFER_EVENT[0],
      args: { from: ZERO_ADDRESS },
      fromBlock: from,
      toBlock: to,
    });
    logs.push(...chunk);
  }

  const registered = [];
  const alreadyInDb = [];
  for (const log of logs) {
    const tileId = Number(log.args.tokenId);
    const owner = log.args.to;
    if (wallet && owner.toLowerCase() !== wallet.toLowerCase()) continue;

    const price = await priceForRegistration(chain.id);
    const tile = claimTile(tileId, owner, price, chain.id, chain.nftContract);
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

  return {
    chain: 'base',
    onChainTotal: Number(totalMinted),
    logsFound: logs.length,
    newlyRegistered: registered.length,
    alreadyInDb: alreadyInDb.length,
    registeredTileIds: registered.map(t => t.id),
    skipped: [],
  };
}

async function syncCasper({ wallet = null, tileIds = [] } = {}) {
  assertSupportedChain('casper');
  const registered = [];
  const alreadyInDb = [];
  const skipped = [];

  if (!wallet || tileIds.length === 0) {
    const price = await priceForRegistration('casper');
    return {
      chain: 'casper',
      currentPrice: price,
      newlyRegistered: 0,
      alreadyInDb: 0,
      registeredTileIds: [],
      skipped: [],
      note: 'Casper historical event scanning is not exposed through RPC; provide wallet + tileIds to verify and register known mints.',
    };
  }

  for (const tileId of tileIds) {
    const verification = await verifyOwnershipOnChain('casper', tileId, wallet);
    if (!verification.isOwner) {
      skipped.push({ tileId, reason: 'wallet is not owner on Casper' });
      continue;
    }
    const price = await priceForRegistration('casper');
    const chain = assertSupportedChain('casper');
    const tile = claimTile(tileId, wallet, price, 'casper', chain.nftContract);
    if (!tile) {
      alreadyInDb.push(tileId);
      continue;
    }
    registered.push(tile);
  }

  return {
    chain: 'casper',
    newlyRegistered: registered.length,
    alreadyInDb: alreadyInDb.length,
    skipped,
    registeredTileIds: registered.map(t => t.id),
  };
}

async function performSync({ chainId, wallet, tileIds }) {
  const chainsToSync = chainId === 'all'
    ? getSupportedChains().map(c => c.id)
    : [chainId];

  const results = [];
  for (const id of chainsToSync) {
    assertSupportedChain(id);
    if (id === 'base') results.push(await syncBase({ wallet }));
    if (id === 'casper') results.push(await syncCasper({ wallet, tileIds }));
  }

  const totalRegistered = results.reduce((sum, r) => sum + (r.newlyRegistered || 0), 0);
  if (totalRegistered > 0) {
    broadcast({
      type: 'tile_claimed',
      chain: chainId,
      claimedCount: getClaimedCount(),
      // Legacy homepage stats still treat `currentPrice` as Base/USDC; chain-specific prices come from /api/stats perChain.
      currentPrice: await priceForRegistration('base'),
      nextAvailableTileId: getNextAvailableTileId(),
      recentlyClaimed: recentClaimsPayload(),
      topHolders: getTopHolders(10).map(row => ({ owner: row.owner, count: row.count })),
    });
  }

  return {
    ok: true,
    chains: results,
    newlyRegistered: totalRegistered,
    filteredByWallet: wallet || 'all',
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const rawChain = (url.searchParams.get('chain') || 'all').trim().toLowerCase();
  const chainId = rawChain === 'all' ? 'all' : rawChain;
  const wallet = url.searchParams.get('wallet') || null;
  const tileIds = parseTileIds(url.searchParams.get('tileIds'));

  try {
    return NextResponse.json(await performSync({ chainId, wallet, tileIds }), { status: 200 });
  } catch (err) {
    console.error('[sync-chain] Error:', err);
    logChainSyncError({
      errorMessage: err.message || String(err),
      detail: err.stack ? err.stack.split('\n')[1]?.trim() : null,
      context: 'sync-chain',
    });
    return NextResponse.json({ error: 'Chain sync failed', detail: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const chainId = resolveRequestedChainId(request, body);
  const wallet = body.wallet?.toLowerCase() || null;
  const tileIds = parseTileIds(body.tileIds);

  try {
    return NextResponse.json(await performSync({ chainId, wallet, tileIds }), { status: 200 });
  } catch (err) {
    console.error('[sync-chain] Error:', err);
    logChainSyncError({
      errorMessage: err.message || String(err),
      detail: err.stack ? err.stack.split('\n')[1]?.trim() : null,
      context: 'sync-chain',
    });
    return NextResponse.json({ error: 'Chain sync failed', detail: err.message }, { status: 502 });
  }
}
