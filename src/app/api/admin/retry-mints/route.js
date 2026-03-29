/**
 * POST /api/admin/retry-mints
 *
 * Re-attempts on-chain minting for all tiles that have no tx_hash.
 * These are tiles where:
 *   - USDC payment was collected (price_paid > 0)
 *   - DB row exists (tile is claimed)
 *   - But callOnChainClaim() failed (server wallet was unfunded at claim time)
 *
 * Requires SERVER_WALLET_PRIVATE_KEY to be set AND the wallet to have:
 *   - Sufficient USDC balance (at least currentPrice per tile)
 *   - USDC allowance >= currentPrice for the MillionBotHomepage contract
 *
 * Body (optional): { "limit": 5 }  — process at most N tiles per call (default: 50)
 *
 * Returns: { processed, succeeded, failed, results: [...] }
 */

import { NextResponse } from 'next/server';
import { getPendingMintTilesLimit, setTileTxHash } from '@/lib/db';

const RECEIPT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 50;

/**
 * Attempt to mint a single tile on-chain.
 * Returns { tileId, success, txHash?, error? }
 */
async function mintTileOnChain(tileId) {
  if (!process.env.SERVER_WALLET_PRIVATE_KEY) {
    return { tileId, success: false, error: 'SERVER_WALLET_PRIVATE_KEY not set' };
  }

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!contractAddress) {
    return { tileId, success: false, error: 'NEXT_PUBLIC_CONTRACT_ADDRESS not set' };
  }

  try {
    const { createWalletClient, createPublicClient, http, parseAbi } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { base } = await import('viem/chains');

    const account = privateKeyToAccount(process.env.SERVER_WALLET_PRIVATE_KEY);
    const walletClient = createWalletClient({ account, chain: base, transport: http() });
    const publicClient = createPublicClient({ chain: base, transport: http() });

    const CLAIM_ABI = parseAbi(['function claim(uint256 tokenId) external']);

    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: CLAIM_ABI,
      functionName: 'claim',
      args: [BigInt(tileId)],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: RECEIPT_TIMEOUT_MS,
    });

    if (receipt.status !== 'success') {
      return { tileId, success: false, txHash, error: `Transaction reverted: ${txHash}` };
    }

    // Update the DB record with the confirmed tx_hash
    setTileTxHash(tileId, txHash);

    return { tileId, success: true, txHash };
  } catch (err) {
    const msg = err?.message || String(err);

    // If contract says already minted — update DB as minted (desync recovery)
    if (
      msg.includes('AlreadyClaimed') ||
      msg.includes('already claimed') ||
      msg.includes('ERC721: token already minted')
    ) {
      setTileTxHash(tileId, 'on-chain-desync-recovered');
      return {
        tileId,
        success: true,
        txHash: 'on-chain-desync-recovered',
        note: 'Was already minted on-chain — DB synced.',
      };
    }

    return { tileId, success: false, error: msg };
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(parseInt(body?.limit || DEFAULT_LIMIT, 10), 100);

  try {
    const pendingTiles = getPendingMintTilesLimit(limit);

    if (pendingTiles.length === 0) {
      return NextResponse.json({
        processed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
        message: 'No pending mints found — all tiles are fully on-chain.',
      });
    }

    console.log(`[retry-mints] Processing ${pendingTiles.length} pending mints...`);

    const results = [];
    let succeeded = 0;
    let failed = 0;

    for (const tile of pendingTiles) {
      console.log(`[retry-mints] Attempting tile #${tile.id}...`);
      const result = await mintTileOnChain(tile.id);
      results.push(result);

      if (result.success) {
        succeeded++;
        console.log(`[retry-mints] ✅ Tile #${tile.id} minted: ${result.txHash}`);
      } else {
        failed++;
        console.warn(`[retry-mints] ❌ Tile #${tile.id} failed: ${result.error}`);

        // If server wallet isn't ready, stop trying — all subsequent tiles will fail too
        const isWalletIssue =
          result.error?.includes('SERVER_WALLET_PRIVATE_KEY') ||
          result.error?.includes('insufficient') ||
          result.error?.includes('balance') ||
          result.error?.includes('allowance');

        if (isWalletIssue) {
          console.warn('[retry-mints] Wallet not ready — stopping batch.');
          break;
        }
      }

      // Small delay between transactions to avoid nonce collisions
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return NextResponse.json({
      processed: results.length,
      succeeded,
      failed,
      results,
      message: `Retry complete: ${succeeded}/${results.length} tiles minted on-chain.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
