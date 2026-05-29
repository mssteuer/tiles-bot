// — Casper x402 handler
// Builds PaymentRequirements for x402 402 responses on the Casper chain,
// and provides facilitator HTTP client for verify/settle.
//
// Unlike Base (which uses x402-next middleware), Casper uses a lightweight
// direct handler calling the Casper x402 facilitator REST API.

// — wCSPR EIP-712 domain info (required by facilitator for transfer_with_authorization)
const WCSPR_DOMAIN = {
  name: 'WrappedCSPR',
  // CSPR.live shows the deployed wCSPR package at contract_version 1 and the
  // contract has no version named key; EIP-712 domains conventionally encode
  // that as the string "1". Override with CHAIN_CASPER_WCSPR_DOMAIN_VERSION
  // if a later deployed token advertises a different domain version.
  version: process.env.CHAIN_CASPER_WCSPR_DOMAIN_VERSION || '1',
  symbol: 'wCSPR',
  decimals: 9,
};

const FACILITATOR_TIMEOUT_MS = 10_000;

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
      version: chainConfig.wcsprDomainVersion || WCSPR_DOMAIN.version,
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

function facilitatorErrorMessage(action, err) {
  if (err.name === 'AbortError') {
    return `Facilitator ${action} timed out after ${FACILITATOR_TIMEOUT_MS}ms`;
  }
  return `Facilitator ${action} error: ${err.message}`;
}

async function fetchFacilitator(endpoint, payload) {
  const facilitatorUrl = getFacilitatorUrl();
  if (!facilitatorUrl) {
    return { configured: false, response: null };
  }

  const apiKey = getFacilitatorApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FACILITATOR_TIMEOUT_MS);

  try {
    const response = await fetch(`${facilitatorUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { configured: true, response };
  } finally {
    clearTimeout(timeout);
  }
}

// — Verify payment via Casper facilitator REST API
async function verifyCasperPayment(paymentHeader, paymentRequirements) {
  if (!paymentHeader) {
    return { valid: false, error: 'Missing x-payment header' };
  }

  try {
    const { configured, response: resp } = await fetchFacilitator('verify', {
      payment: paymentHeader,
      paymentRequirements,
    });
    if (!configured) {
      return { valid: false, error: 'Casper facilitator URL not configured' };
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { valid: false, error: `Facilitator verify failed: HTTP ${resp.status} ${body}` };
    }

    const data = await resp.json();
    return { valid: !!data.valid, error: data.error || null };
  } catch (err) {
    return { valid: false, error: facilitatorErrorMessage('verify', err) };
  }
}

// — Settle payment via Casper facilitator REST API
async function settleCasperPayment(paymentHeader, paymentRequirements) {
  if (!paymentHeader) {
    return { settled: false, error: 'Missing x-payment header' };
  }

  try {
    const { configured, response: resp } = await fetchFacilitator('settle', {
      payment: paymentHeader,
      paymentRequirements,
    });
    if (!configured) {
      return { settled: false, error: 'Casper facilitator URL not configured' };
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { settled: false, error: `Facilitator settle failed: HTTP ${resp.status} ${body}` };
    }

    const data = await resp.json();
    return { settled: !!data.settled, txHash: data.txHash || null, error: data.error || null };
  } catch (err) {
    return { settled: false, error: facilitatorErrorMessage('settle', err) };
  }
}

module.exports = {
  csprToMotes,
  buildCasperPaymentRequirements,
  buildCasperClaimInstructions,
  verifyCasperPayment,
  settleCasperPayment,
  WCSPR_DOMAIN,
  FACILITATOR_TIMEOUT_MS,
};
