/**
 * GET /api/admin/pending-mints
 *
 * Returns all tiles that were claimed off-chain (revenue collected, USDC paid) but
 * never minted on-chain (tx_hash IS NULL). These are "stuck" tiles that need a
 * server wallet with USDC + contract approval to complete the on-chain mint.
 *
 * Also returns the server wallet address and a readiness check (balance + allowance).
 */

import { NextResponse } from 'next/server';
import { getPendingMintTiles } from '@/lib/db';

/**
 * Check server wallet readiness (balance + allowance) for on-chain minting.
 * Returns { ready, wallet, balance, allowance, requiredAmount, usdcAddress, error }
 */
async function checkWalletReadiness() {
  if (!process.env.SERVER_WALLET_PRIVATE_KEY) {
    return { ready: false, error: 'SERVER_WALLET_PRIVATE_KEY not set' };
  }
  if (!process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
    return { ready: false, error: 'NEXT_PUBLIC_CONTRACT_ADDRESS not set' };
  }

  let walletAddress = null;
  try {
    const { createPublicClient, http, parseAbi, getContract } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { base } = await import('viem/chains');

    const account = privateKeyToAccount(process.env.SERVER_WALLET_PRIVATE_KEY);
    walletAddress = account.address;
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    const publicClient = createPublicClient({ chain: base, transport: http() });

    const READINESS_ABI = parseAbi([
      'function usdc() view returns (address)',
      'function currentPrice() view returns (uint256)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function balanceOf(address account) view returns (uint256)',
    ]);

    const contract = getContract({ address: contractAddress, abi: READINESS_ABI, client: publicClient });
    const usdcAddress = await contract.read.usdc();
    const [requiredAmount, allowance, balance] = await Promise.all([
      contract.read.currentPrice(),
      publicClient.readContract({
        address: usdcAddress,
        abi: READINESS_ABI,
        functionName: 'allowance',
        args: [account.address, contractAddress],
      }),
      publicClient.readContract({
        address: usdcAddress,
        abi: READINESS_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      }),
    ]);

    return {
      ready: balance >= requiredAmount && allowance >= requiredAmount,
      wallet: account.address,
      usdcAddress,
      balance: balance.toString(),
      allowance: allowance.toString(),
      requiredAmountPerTile: requiredAmount.toString(),
      // Human-readable (USDC has 6 decimals)
      balanceUsdc: (Number(balance) / 1e6).toFixed(6),
      allowanceUsdc: (Number(allowance) / 1e6).toFixed(6),
      requiredPerTileUsdc: (Number(requiredAmount) / 1e6).toFixed(6),
    };
  } catch (err) {
    return { ready: false, wallet: walletAddress, error: err?.message || String(err) };
  }
}

export async function GET() {
  try {
    const pendingTiles = getPendingMintTiles();
    const totalRevenuePaid = pendingTiles.reduce((sum, t) => sum + (t.price_paid || 0), 0);

    // Check wallet readiness
    const walletStatus = await checkWalletReadiness();

    return NextResponse.json({
      pendingMints: pendingTiles.length,
      totalRevenuePaid: totalRevenuePaid.toFixed(6),
      tiles: pendingTiles,
      walletStatus,
      instructions: pendingTiles.length > 0
        ? `Fund wallet ${walletStatus.wallet || '(no key set)'} with USDC on Base and approve the MillionBotHomepage contract (${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}), then POST /api/admin/retry-mints to complete these ${pendingTiles.length} stuck mints.`
        : 'No pending mints — all tiles are fully minted on-chain.',
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
