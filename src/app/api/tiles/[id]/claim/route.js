import { NextResponse } from 'next/server';
import { withX402 } from 'x402-next';
import {
  claimTile,
  getClaimedCount,
  getCurrentPrice,
  getNextAvailableTileId,
  getRecentlyClaimed,
  getTopHolders,
  setTileTxHash,
  unclaimTile,
  TOTAL_TILES,
  logEvent,
} from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

// Treasury address that receives USDC payments (set in env or default to placeholder)
const PAY_TO_ADDRESS = process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000';

// Network: 'base' for mainnet, 'base-sepolia' for testnet
const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia';

// Public-facing site URL — used to construct the x402 resource URL so agents see
// https://tiles.bot/... instead of https://localhost:8084/... (nginx reverse proxy)
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://tiles.bot').replace(/\/$/, '');
const RECEIPT_TIMEOUT_MS = 30_000;

function getContractChainName() {
  // CONTRACT_CHAIN is preferred; falls back to x402 network
  return process.env.CONTRACT_CHAIN || process.env.X402_NETWORK || 'base-sepolia';
}

async function getContractChain() {
  const chainName = getContractChainName();
  const chains = await import('viem/chains');
  const chain = chains[chainName];
  if (!chain) {
    throw new Error(`[claim] Unsupported contract chain: ${chainName}`);
  }
  return chain;
}

function isAlreadyClaimedError(message) {
  return (
    message.includes('already claimed') ||
    message.includes('AlreadyClaimed') ||
    message.includes('ERC721: token already minted')
  );
}

function isReceiptTimeoutError(error) {
  const message = error?.message || '';
  return message.includes('timed out') || message.includes('timeout');
}

/**
 * Pre-flight check: server wallet must have USDC balance + allowance before calling claim().
 * Throws with error.code = 'SERVER_WALLET_NOT_READY' and error.meta if not ready.
 */
async function checkServerWalletClaimReadiness(publicClient, contractAddress, account, tileId) {
  const { getContract, parseAbi } = await import('viem');

  const READINESS_ABI = parseAbi([
    'function usdc() view returns (address)',
    'function currentPrice() view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
  ]);

  const contract = getContract({
    address: contractAddress,
    abi: READINESS_ABI,
    client: publicClient,
  });

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

  if (balance < requiredAmount || allowance < requiredAmount) {
    const reasons = [];
    if (balance < requiredAmount) reasons.push(`insufficient USDC balance (${balance} < ${requiredAmount})`);
    if (allowance < requiredAmount) reasons.push(`missing USDC approval (${allowance} < ${requiredAmount})`);

    const error = new Error(
      `[claim] Server wallet not ready for on-chain claim of tile #${tileId}: ${reasons.join('; ')}. ` +
      `SERVER_WALLET_PRIVATE_KEY wallet must hold USDC and approve ${contractAddress} before claim().`
    );
    error.code = 'SERVER_WALLET_NOT_READY';
    error.meta = {
      usdcAddress,
      contractAddress,
      wallet: account.address,
      requiredAmount: requiredAmount.toString(),
      allowance: allowance.toString(),
      balance: balance.toString(),
    };
    throw error;
  }
}

/**
 * Call the on-chain claim() function using the server wallet.
 * Returns the confirmed tx hash, or null if SERVER_WALLET_PRIVATE_KEY is not configured.
 * Waits for receipt confirmation within RECEIPT_TIMEOUT_MS.
 */
async function callOnChainClaim(tileId) {
  if (!process.env.SERVER_WALLET_PRIVATE_KEY) {
    console.warn(
      '[claim] SERVER_WALLET_PRIVATE_KEY not set — skipping on-chain contract call. ' +
      'Set this env var to enable full end-to-end minting.'
    );
    return null;
  }

  const { createWalletClient, createPublicClient, http, parseAbi } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');

  const CLAIM_ABI = parseAbi(['function claim(uint256 tokenId) external']);
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.warn('[claim] NEXT_PUBLIC_CONTRACT_ADDRESS not set — skipping on-chain call.');
    return null;
  }

  const chain = await getContractChain();
  const account = privateKeyToAccount(process.env.SERVER_WALLET_PRIVATE_KEY);
  const transport = http();

  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  // Pre-flight: verify server wallet has USDC balance + allowance
  await checkServerWalletClaimReadiness(publicClient, contractAddress, account, tileId);

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: CLAIM_ABI,
    functionName: 'claim',
    args: [BigInt(tileId)],
  });

  // Wait for on-chain confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: RECEIPT_TIMEOUT_MS,
  });
  if (receipt.status !== 'success') {
    throw new Error(`[claim] Transaction failed on-chain: ${txHash}`);
  }

  return txHash;
}

async function claimHandler(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 400 });
  }

  const price = getCurrentPrice();

  // Insert tile into DB first (idempotency check)
  const tile = claimTile(tileId, body.wallet, price);
  if (!tile) {
    return NextResponse.json({ error: 'Tile already claimed or invalid' }, { status: 409 });
  }

  // Call the smart contract to actually mint the NFT on-chain.
  // If this fails, roll back the DB claim so the tile can be re-claimed.
  let txHash = null;
  try {
    txHash = await callOnChainClaim(tileId);
  } catch (err) {
    const msg = err?.message || '';
    const isAlreadyClaimed =
      msg.includes('already claimed') ||
      msg.includes('AlreadyClaimed') ||
      msg.includes('ERC721: token already minted');
    const isExplicitRevert = msg.includes('revert');

    // Only roll back the DB row when the contract call clearly failed before minting.
    // Network/RPC timeouts can happen after broadcast, and deleting the DB record in
    // those cases would desync the app from on-chain ownership state.
    if (isAlreadyClaimed || isExplicitRevert) {
      unclaimTile(tileId);
    }

    if (isAlreadyClaimed) {
      console.error(`[claim] Contract reports tile #${tileId} already claimed:`, msg);
      return NextResponse.json(
        { error: 'Tile already claimed on-chain', detail: msg },
        { status: 409 }
      );
    }

    if (isExplicitRevert) {
      console.error(`[claim] Contract revert before mint for tile #${tileId}:`, msg);
      return NextResponse.json(
        { error: 'On-chain claim transaction reverted', detail: msg },
        { status: 500 }
      );
    }

    // For ambiguous errors (RPC/network/timeout), keep the DB row intact to avoid
    // wiping a claim that may already have been broadcast or confirmed on-chain.
    console.error(`[claim] Ambiguous on-chain claim error for tile #${tileId}:`, err);
    return NextResponse.json(
      { error: 'On-chain claim status uncertain', detail: msg },
      { status: 502 }
    );
  }

  // Persist txHash into DB
  if (txHash) {
    setTileTxHash(tileId, txHash);
    tile.txHash = txHash;
  }

  // Persist event to events_log
  logEvent('claimed', tileId, tile.owner, { tileName: tile.name || `Tile #${tileId}`, tileAvatar: tile.avatar || null });

  // Broadcast real-time update to all connected SSE clients
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

  return NextResponse.json({ tile, pricePaid: price, txHash }, { status: 201 });
}

// Wrap with x402 payment verification using dynamic pricing from bonding curve.
export const POST = withX402(
  claimHandler,
  PAY_TO_ADDRESS,
  async (request) => {
    const usdPrice = getCurrentPrice();
    const priceUsd = `$${usdPrice.toFixed(2)}`;
    // Build the canonical resource URL using SITE_URL so agents see https://tiles.bot/...
    // instead of https://localhost:8084/... (which is the internal nginx upstream address)
    const pathname = request.nextUrl.pathname;
    const resource = `${SITE_URL}${pathname}`;
    return {
      price: priceUsd,
      network: X402_NETWORK,
      config: {
        description: `Claim a MillionBotHomepage tile (bonding curve price: ${priceUsd} USDC)`,
        resource,
      },
    };
  }
);
