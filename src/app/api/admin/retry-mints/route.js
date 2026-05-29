import { NextResponse } from 'next/server';
import { getPendingMintTilesLimit, setTileTxHash } from '@/lib/db';
import { assertSupportedChain } from '@/lib/chain-api';
import { logMintFailure } from '@/lib/structured-logger';

const RECEIPT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 50;

async function mintBaseTileOnChain(tileId, chain) {
  if (!process.env.SERVER_WALLET_PRIVATE_KEY) {
    const error = 'SERVER_WALLET_PRIVATE_KEY not set';
    console.warn(`[retry-mints] Tile ${tileId}: ${error}; stopping Base retry batch until wallet is configured.`);
    logMintFailure({ tileId, errorMessage: error });
    return { tileId, chain: chain.id, success: false, error };
  }

  if (!chain.nftContract) {
    const error = 'Base NFT contract not configured';
    console.warn(`[retry-mints] Tile ${tileId}: ${error}; stopping Base retry batch until contract is configured.`);
    logMintFailure({ tileId, errorMessage: error });
    return { tileId, chain: chain.id, success: false, error };
  }

  try {
    console.log(`[retry-mints] Minting tile ${tileId} on ${chain.id} (${chain.nftContract})`);
    const { createWalletClient, createPublicClient, http, parseAbi } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { base, baseSepolia } = await import('viem/chains');

    const viemChain = String(process.env.NEXT_PUBLIC_CHAIN_ID || '') === '84532' ? baseSepolia : base;
    const account = privateKeyToAccount(process.env.SERVER_WALLET_PRIVATE_KEY);
    const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl || undefined) });
    const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl || undefined) });

    const CLAIM_ABI = parseAbi(['function claim(uint256 tokenId) external']);
    const txHash = await walletClient.writeContract({
      address: chain.nftContract,
      abi: CLAIM_ABI,
      functionName: 'claim',
      args: [BigInt(tileId)],
    });
    console.log(`[retry-mints] Tile ${tileId}: submitted ${txHash}; waiting for receipt.`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: RECEIPT_TIMEOUT_MS,
    });

    if (receipt.status !== 'success') {
      const errMsg = `Transaction reverted: ${txHash}`;
      console.warn(`[retry-mints] Tile ${tileId}: ${errMsg}`);
      logMintFailure({ tileId, txHash, errorMessage: errMsg });
      return { tileId, chain: chain.id, success: false, txHash, error: errMsg };
    }

    setTileTxHash(tileId, txHash);
    console.log(`[retry-mints] Tile ${tileId}: minted successfully in ${txHash}.`);
    return { tileId, chain: chain.id, success: true, txHash };
  } catch (err) {
    const msg = err?.message || String(err);
    if (
      msg.includes('AlreadyClaimed') ||
      msg.includes('already claimed') ||
      msg.includes('ERC721: token already minted')
    ) {
      setTileTxHash(tileId, 'on-chain-desync-recovered');
      console.warn(`[retry-mints] Tile ${tileId}: already minted on-chain; marked DB as recovered.`);
      return {
        tileId,
        chain: chain.id,
        success: true,
        txHash: 'on-chain-desync-recovered',
        note: 'Was already minted on-chain — DB synced.',
      };
    }

    console.warn(`[retry-mints] Tile ${tileId}: mint failed on ${chain.id}: ${msg}`);
    logMintFailure({ tileId, errorMessage: msg });
    return { tileId, chain: chain.id, success: false, error: msg };
  }
}

async function mintTileOnCorrectChain(tile) {
  const chain = assertSupportedChain(tile.chain || 'base');
  if (chain.id === 'base') return mintBaseTileOnChain(tile.id, chain);

  const error = 'Automated Casper retry minting is not available; Casper deploys must be signed by the tile owner wallet.';
  console.warn(`[retry-mints] Tile ${tile.id}: ${error}`);
  logMintFailure({ tileId: tile.id, wallet: tile.owner, errorMessage: error });
  return { tileId: tile.id, chain: chain.id, success: false, error };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(parseInt(body?.limit || DEFAULT_LIMIT, 10), 100);
  const requestedChain = body?.chain ? String(body.chain).toLowerCase() : null;

  try {
    let pendingTiles = getPendingMintTilesLimit(limit);
    if (requestedChain) {
      assertSupportedChain(requestedChain);
      pendingTiles = pendingTiles.filter(tile => (tile.chain || 'base') === requestedChain);
    }
    console.log(`[retry-mints] Found ${pendingTiles.length} pending mint(s)${requestedChain ? ` for ${requestedChain}` : ''}; limit=${limit}.`);

    if (pendingTiles.length === 0) {
      console.log(`[retry-mints] No pending mints${requestedChain ? ` for ${requestedChain}` : ''}.`);
      return NextResponse.json({
        processed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
        message: requestedChain
          ? `No pending ${requestedChain} mints found.`
          : 'No pending mints found — all tiles are fully on-chain.',
      });
    }

    const results = [];
    let succeeded = 0;
    let failed = 0;

    for (const tile of pendingTiles) {
      console.log(`[retry-mints] Processing tile ${tile.id} on ${tile.chain || 'base'} owned by ${tile.owner || 'unknown wallet'}.`);
      const result = await mintTileOnCorrectChain(tile);
      results.push(result);

      if (result.success) {
        succeeded++;
        console.log(`[retry-mints] Tile ${tile.id}: success (${succeeded} succeeded / ${results.length} processed).`);
      } else {
        failed++;
        console.warn(`[retry-mints] Tile ${tile.id}: failed (${failed} failed / ${results.length} processed): ${result.error || 'unknown error'}`);
        const isWalletIssue =
          result.error?.includes('SERVER_WALLET_PRIVATE_KEY') ||
          result.error?.includes('insufficient') ||
          result.error?.includes('balance') ||
          result.error?.includes('allowance');

        if (isWalletIssue) {
          console.warn(`[retry-mints] Wallet/config issue detected after tile ${tile.id}; stopping batch to avoid repeated failures.`);
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log(`[retry-mints] Retry complete: ${succeeded}/${results.length} succeeded, ${failed} failed.`);

    return NextResponse.json({
      processed: results.length,
      succeeded,
      failed,
      results,
      message: `Retry complete: ${succeeded}/${results.length} tiles minted on-chain.`,
    });
  } catch (err) {
    console.warn(`[retry-mints] Route failed: ${err?.message || String(err)}`);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
