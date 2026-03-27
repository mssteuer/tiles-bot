import { NextResponse } from 'next/server';
import { withX402 } from 'x402-next';
import { claimTile, getCurrentPrice, setTileTxHash, TOTAL_TILES, unclaimTile } from '@/lib/db';

// Treasury address that receives USDC payments (set in env or default to placeholder)
const PAY_TO_ADDRESS = process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000';

// Network: 'base' for mainnet, 'base-sepolia' for testnet
const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia';

/**
 * Call the on-chain claim() function using the server wallet.
 * Returns the tx hash, or null if SERVER_WALLET_PRIVATE_KEY is not configured.
 * Throws if the contract call fails (e.g. tile already claimed on-chain → 409).
 */
function getContractChainName() {
  // CONTRACT_CHAIN is preferred because x402 payment settlement network and contract deployment
  // chain are related in this project today, but they are conceptually separate concerns.
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

/**
 * Call the on-chain claim() function using the server wallet.
 * Returns the confirmed tx hash, or null if SERVER_WALLET_PRIVATE_KEY is not configured.
 * Throws if the contract call fails.
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

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  });

  const publicClient = createPublicClient({
    chain,
    transport,
  });

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: CLAIM_ABI,
    functionName: 'claim',
    args: [BigInt(tileId)],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
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
    const rolledBack = unclaimTile(tileId);

    // Only explicit ownership/minted signals map to 409.
    // Generic Solidity reverts stay 500 so non-double-claim contract failures are not mislabeled.
    if (isAlreadyClaimedError(msg)) {
      console.error(`[claim] Contract reports tile #${tileId} already claimed:`, msg);
      return NextResponse.json(
        {
          error: 'Tile already claimed on-chain',
          detail: msg,
          rolledBack,
        },
        { status: 409 }
      );
    }

    console.error(`[claim] On-chain claim failed for tile #${tileId}:`, err);
    return NextResponse.json(
      {
        error: 'On-chain claim transaction failed',
        detail: msg,
        rolledBack,
      },
      { status: 500 }
    );
  }

  // Persist txHash into DB when available.
  if (txHash) {
    const updated = setTileTxHash(tileId, txHash);
    if (!updated) {
      console.error(`[claim] Failed to persist tx hash for tile #${tileId}`);
    }
    tile.txHash = txHash;
  }

  return NextResponse.json({ tile, pricePaid: price, txHash }, { status: 201 });
}

// Wrap with x402 payment verification using dynamic pricing from bonding curve.
// withX402 will:
//   1. If no X-PAYMENT header: return 402 with payment requirements (amount + recipient)
//   2. If X-PAYMENT header present: verify USDC payment via x402 facilitator
//   3. Only call claimHandler if payment is valid; settle payment after 200 response
//
// Price is fetched dynamically from getCurrentPrice() (exponential bonding curve:
// starts at ~$0.01 USDC, asymptotes toward $111 as all 65,536 tiles are claimed).
export const POST = withX402(
  claimHandler,
  PAY_TO_ADDRESS,
  async () => {
    const usdPrice = getCurrentPrice();
    // Format as USD string with 2 decimal places (x402 accepts "$1.23" format)
    const priceUsd = `$${usdPrice.toFixed(2)}`;
    return {
      price: priceUsd,
      network: X402_NETWORK,
      config: {
        description: `Claim a MillionBotHomepage tile (bonding curve price: ${priceUsd} USDC)`,
      },
    };
  }
);
