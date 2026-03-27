import { NextResponse } from 'next/server';
import { withX402 } from 'x402-next';
import { claimTile, getCurrentPrice, TOTAL_TILES } from '@/lib/db';

// Treasury address that receives USDC payments (set in env or default to placeholder)
const PAY_TO_ADDRESS = process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000';

// Network: 'base' for mainnet, 'base-sepolia' for testnet
const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia';

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
  const tile = claimTile(tileId, body.wallet);
  if (!tile) {
    return NextResponse.json({ error: 'Tile already claimed or invalid' }, { status: 409 });
  }

  return NextResponse.json({ tile, pricePaid: price }, { status: 201 });
}

// Wrap with x402 payment verification using dynamic pricing from bonding curve.
// withX402 will:
//   1. If no X-PAYMENT header: return 402 with payment requirements (amount + recipient)
//   2. If X-PAYMENT header present: verify USDC payment via x402 facilitator
//   3. Only call claimHandler if payment is valid; settle payment after 200 response
//
// Price is fetched dynamically from getCurrentPrice() (exponential bonding curve:
// starts at $1 USDC, asymptotes toward $11,111 as all 65,536 tiles are claimed).
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
