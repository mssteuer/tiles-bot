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
    x402Version: 2,
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

// — Decode the x402 X-PAYMENT header into the structured paymentPayload object.
// Per the x402 standard the header is base64-encoded JSON of the signed payload
// ({ x402Version, resource, accepted, payload }). The CSPR.cloud facilitator's
// /verify and /settle endpoints expect that decoded object under `paymentPayload`.
function decodePaymentPayload(paymentHeader) {
  try {
    return JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function fetchFacilitator(endpoint, paymentPayload, paymentRequirements) {
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
        // CSPR.cloud authenticates via a bare `Authorization: <token>` header.
        // (X-API-Key returns 401 "authorization is not provided".)
        ...(apiKey ? { Authorization: apiKey } : {}),
      },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
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

  const paymentPayload = decodePaymentPayload(paymentHeader);
  if (!paymentPayload) {
    return { valid: false, error: 'Malformed x-payment header (expected base64-encoded JSON)' };
  }

  try {
    const { configured, response: resp } = await fetchFacilitator(
      'verify',
      paymentPayload,
      paymentRequirements
    );
    if (!configured) {
      return { valid: false, error: 'Casper facilitator URL not configured' };
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { valid: false, error: `Facilitator verify failed: HTTP ${resp.status} ${body}` };
    }

    const data = await resp.json();
    // CSPR.cloud returns { isValid, payer?, invalidReason?, invalidMessage? }
    return {
      valid: !!data.isValid,
      error: data.isValid ? null : (data.invalidMessage || data.invalidReason || null),
    };
  } catch (err) {
    return { valid: false, error: facilitatorErrorMessage('verify', err) };
  }
}

// — Settle payment via Casper facilitator REST API
async function settleCasperPayment(paymentHeader, paymentRequirements) {
  if (!paymentHeader) {
    return { settled: false, error: 'Missing x-payment header' };
  }

  const paymentPayload = decodePaymentPayload(paymentHeader);
  if (!paymentPayload) {
    return { settled: false, error: 'Malformed x-payment header (expected base64-encoded JSON)' };
  }

  try {
    const { configured, response: resp } = await fetchFacilitator(
      'settle',
      paymentPayload,
      paymentRequirements
    );
    if (!configured) {
      return { settled: false, error: 'Casper facilitator URL not configured' };
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { settled: false, error: `Facilitator settle failed: HTTP ${resp.status} ${body}` };
    }

    const data = await resp.json();
    // CSPR.cloud returns { success, transaction?, network?, payer?, errorReason?, errorMessage? }
    return {
      settled: !!data.success,
      txHash: data.transaction || null,
      error: data.success ? null : (data.errorMessage || data.errorReason || null),
    };
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
