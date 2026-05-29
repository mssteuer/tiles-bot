// — Casper x402 handler
// Builds PaymentRequirements for x402 402 responses on the Casper chain,
// and provides facilitator HTTP client for verify/settle.
//
// Unlike Base (which uses x402-next middleware), Casper uses a lightweight
// direct handler calling the Casper x402 facilitator REST API.

// — wCSPR EIP-712 domain info (required by facilitator for transfer_with_authorization)
const WCSPR_DOMAIN = {
  name: 'WrappedCSPR',
  version: '1.0.0',
  symbol: 'wCSPR',
  decimals: 9,
};

// — Convert CSPR (human-readable) to motes (raw, 9 decimals)
function csprToMotes(cspr) {
  if (typeof cspr !== 'number' || !Number.isFinite(cspr)) {
    throw new Error(`CSPR price must be a finite number, got: ${cspr}`);
  }
  if (cspr < 0) {
    throw new Error(`CSPR price must be non-negative, got: ${cspr}`);
  }

  // Round to the nearest mote; prices come from the on-chain bonding curve.
  const motes = Math.round(cspr * 1_000_000_000);
  return String(motes);
}

// — Build x402 PaymentRequirements for Casper
function buildCasperPaymentRequirements({ tileId, priceInMotes, chainConfig, resource }) {
  return {
    scheme: 'exact',
    network: chainConfig.caip2,
    payTo: chainConfig.treasury,
    maxAmountRequired: String(priceInMotes),
    asset: chainConfig.paymentToken,
    resource,
    description: `Claim tile #${tileId} on tiles.bot`,
    extra: {
      name: WCSPR_DOMAIN.name,
      version: WCSPR_DOMAIN.version,
      symbol: WCSPR_DOMAIN.symbol,
      decimals: WCSPR_DOMAIN.decimals,
    },
  };
}

// — Build on-chain claim instructions returned after payment verification
function buildCasperClaimInstructions({ tileId, priceInMotes, chainConfig, siteUrl }) {
  return {
    step1_approve: {
      description: 'Approve wCSPR spending (skip if already approved)',
      contract: chainConfig.paymentToken,
      entryPoint: 'approve',
      args: {
        spender: chainConfig.nftContract,
        amount: String(priceInMotes),
      },
    },
    step2_claim: {
      description: 'Mint the tile NFT to your wallet',
      contract: chainConfig.nftContract,
      entryPoint: 'claim',
      args: { token_id: tileId },
      note: 'For multiple tiles use: batch_claim(token_ids)',
    },
    step3_register: {
      description: 'Register the minted tile in the tiles.bot database',
      endpoint: `${siteUrl}/api/tiles/${tileId}/register`,
      method: 'POST',
      body: { wallet: '<your-casper-public-key>', chain: 'casper' },
      note: 'This verifies on-chain ownership and adds your tile to the grid.',
    },
  };
}

// — Facilitator config
function getFacilitatorUrl() {
  const url = process.env.CHAIN_CASPER_X402_FACILITATOR;
  return url ? url.replace(/\/$/, '') : '';
}

function getFacilitatorApiKey() {
  return process.env.CASPER_FACILITATOR_API_KEY || '';
}

// — Verify payment via Casper facilitator REST API
async function verifyCasperPayment(paymentHeader, paymentRequirements) {
  if (!paymentHeader) {
    return { valid: false, error: 'Missing x-payment header' };
  }

  const facilitatorUrl = getFacilitatorUrl();
  if (!facilitatorUrl) {
    return { valid: false, error: 'Casper facilitator URL not configured' };
  }

  const apiKey = getFacilitatorApiKey();

  try {
    const resp = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      body: JSON.stringify({
        payment: paymentHeader,
        paymentRequirements,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { valid: false, error: `Facilitator verify failed: HTTP ${resp.status} ${body}` };
    }

    const data = await resp.json();
    return { valid: !!data.valid, error: data.error || null };
  } catch (err) {
    return { valid: false, error: `Facilitator verify error: ${err.message}` };
  }
}

// — Settle payment via Casper facilitator REST API
async function settleCasperPayment(paymentHeader, paymentRequirements) {
  if (!paymentHeader) {
    return { settled: false, error: 'Missing x-payment header' };
  }

  const facilitatorUrl = getFacilitatorUrl();
  if (!facilitatorUrl) {
    return { settled: false, error: 'Casper facilitator URL not configured' };
  }

  const apiKey = getFacilitatorApiKey();

  try {
    const resp = await fetch(`${facilitatorUrl}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      body: JSON.stringify({
        payment: paymentHeader,
        paymentRequirements,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { settled: false, error: `Facilitator settle failed: HTTP ${resp.status} ${body}` };
    }

    const data = await resp.json();
    return { settled: !!data.settled, txHash: data.txHash || null, error: data.error || null };
  } catch (err) {
    return { settled: false, error: `Facilitator settle error: ${err.message}` };
  }
}

module.exports = {
  csprToMotes,
  buildCasperPaymentRequirements,
  buildCasperClaimInstructions,
  verifyCasperPayment,
  settleCasperPayment,
  WCSPR_DOMAIN,
};
