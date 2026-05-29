/**
 * Tests for Casper x402 handler — PaymentRequirements builder + facilitator client
 * Task #1721
 *
 * Tests the module at src/lib/casper-x402.js which:
 *   1. Builds Casper-specific PaymentRequirements for the 402 response
 *   2. Calls the Casper x402 facilitator REST API for verify/settle
 *   3. Returns Casper-specific on-chain claim instructions after payment
 *
 * Run: node test/casper-x402-handler.node-test.js
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// — Setup: chain env vars (must be set before importing modules)
process.env.CHAIN_BASE_NFT_CONTRACT = '0xB2915C42329edFfC26037eed300D620C302b5791';
process.env.CHAIN_BASE_PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
process.env.CHAIN_BASE_RPC_URL = 'https://mainnet.base.org';
process.env.CHAIN_BASE_EXPLORER = 'https://basescan.org';
process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402-facilitator.base.org';
process.env.CHAIN_CASPER_NFT_CONTRACT = 'hash-abc123def456';
process.env.CHAIN_CASPER_PAYMENT_TOKEN = 'hash-wcspr789';
process.env.CHAIN_CASPER_TREASURY = '0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f';
process.env.CHAIN_CASPER_RPC_URL = 'https://node.testnet.casper.network/rpc';
process.env.CHAIN_CASPER_EXPLORER = 'https://testnet.cspr.live';
process.env.CHAIN_CASPER_X402_FACILITATOR = 'https://x402-facilitator.cspr.cloud';
process.env.DEFAULT_CHAIN = 'base';
process.env.CASPER_FACILITATOR_API_KEY = 'test-api-key-12345';

let casperX402;
let chains;

describe('casper-x402: buildCasperPaymentRequirements', () => {
  before(async () => {
    chains = require('../src/lib/chains');
    casperX402 = require('../src/lib/casper-x402');
  });

  it('exports buildCasperPaymentRequirements function', () => {
    assert.equal(typeof casperX402.buildCasperPaymentRequirements, 'function');
  });

  it('builds correct PaymentRequirements shape', () => {
    const casperConfig = chains.getChain('casper');
    const result = casperX402.buildCasperPaymentRequirements({
      tileId: 42,
      priceInMotes: '10000000',
      chainConfig: casperConfig,
      resource: 'https://tiles.bot/api/tiles/42/claim',
    });

    // x402 standard fields
    assert.equal(result.scheme, 'exact');
    assert.equal(result.network, 'casper:casper');
    assert.equal(result.payTo, casperConfig.treasury);
    assert.equal(result.maxAmountRequired, '10000000');
    assert.equal(result.resource, 'https://tiles.bot/api/tiles/42/claim');

    // Asset = wCSPR contract hash
    assert.equal(result.asset, casperConfig.paymentToken);

    // Description
    assert.ok(result.description.includes('42'));
    assert.ok(result.description.includes('tiles.bot'));

    // Extra: EIP-712 domain info for facilitator
    assert.ok(result.extra, 'extra field must exist');
    assert.equal(result.extra.name, 'WrappedCSPR');
    assert.equal(result.extra.symbol, 'wCSPR');
    assert.equal(result.extra.decimals, 9);
    assert.equal(result.extra.version, '1');
  });

  it('payTo is a valid Casper public key', () => {
    const casperConfig = chains.getChain('casper');
    const result = casperX402.buildCasperPaymentRequirements({
      tileId: 0,
      priceInMotes: '1000000000',
      chainConfig: casperConfig,
      resource: 'https://tiles.bot/api/tiles/0/claim',
    });

    assert.ok(
      /^(01|02)[0-9a-fA-F]{64}$/.test(result.payTo),
      `payTo must be valid Casper public key, got: ${result.payTo}`
    );
  });

  it('asset starts with hash- (wCSPR contract)', () => {
    const casperConfig = chains.getChain('casper');
    const result = casperX402.buildCasperPaymentRequirements({
      tileId: 1,
      priceInMotes: '5000000',
      chainConfig: casperConfig,
      resource: 'https://tiles.bot/api/tiles/1/claim',
    });

    assert.ok(
      result.asset.startsWith('hash-'),
      `asset should be a Casper contract hash, got: ${result.asset}`
    );
  });

  it('maxAmountRequired is a string (big number safe)', () => {
    const casperConfig = chains.getChain('casper');
    const result = casperX402.buildCasperPaymentRequirements({
      tileId: 100,
      priceInMotes: '999999999999',
      chainConfig: casperConfig,
      resource: 'https://tiles.bot/api/tiles/100/claim',
    });

    assert.equal(typeof result.maxAmountRequired, 'string');
    assert.equal(result.maxAmountRequired, '999999999999');
  });
});

describe('casper-x402: buildCasperClaimInstructions', () => {
  before(async () => {
    chains = require('../src/lib/chains');
    casperX402 = require('../src/lib/casper-x402');
  });

  it('exports buildCasperClaimInstructions function', () => {
    assert.equal(typeof casperX402.buildCasperClaimInstructions, 'function');
  });

  it('returns Casper-specific on-chain instructions', () => {
    const casperConfig = chains.getChain('casper');
    const result = casperX402.buildCasperClaimInstructions({
      tileId: 42,
      priceInMotes: '10000000',
      chainConfig: casperConfig,
      siteUrl: 'https://tiles.bot',
    });

    // Step 1: approve wCSPR
    assert.ok(result.step1_approve);
    assert.equal(result.step1_approve.contract, casperConfig.paymentToken);
    assert.equal(result.step1_approve.entryPoint, 'approve');
    assert.equal(result.step1_approve.args.spender, casperConfig.nftContract);

    // Step 2: claim NFT
    assert.ok(result.step2_claim);
    assert.equal(result.step2_claim.contract, casperConfig.nftContract);
    assert.equal(result.step2_claim.entryPoint, 'claim');
    assert.equal(result.step2_claim.args.token_id, 42);

    // Step 3: register
    assert.ok(result.step3_register);
    assert.equal(result.step3_register.method, 'POST');
    assert.ok(result.step3_register.endpoint.includes('/api/tiles/42/register'));
    assert.equal(result.step3_register.body.chain, 'casper');
  });
});

describe('casper-x402: verifyCasperPayment', () => {
  before(async () => {
    casperX402 = require('../src/lib/casper-x402');
  });

  it('exports verifyCasperPayment function', () => {
    assert.equal(typeof casperX402.verifyCasperPayment, 'function');
  });

  it('sends correct request to facilitator /verify', async () => {
    const originalFetch = global.fetch;
    let captured;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const paymentRequirements = { network: 'casper:casper', maxAmountRequired: '10000000' };

    try {
      const result = await casperX402.verifyCasperPayment(
        'signed-payment-header',
        paymentRequirements
      );

      assert.equal(result.valid, true);
      assert.equal(captured.url, 'https://x402-facilitator.cspr.cloud/verify');
      assert.equal(captured.options.method, 'POST');
      assert.ok(captured.options.signal instanceof AbortSignal);
      assert.equal(captured.options.headers['Content-Type'], 'application/json');
      assert.equal(captured.options.headers['X-API-Key'], 'test-api-key-12345');
      assert.deepEqual(JSON.parse(captured.options.body), {
        payment: 'signed-payment-header',
        paymentRequirements,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns error for empty payment header', async () => {
    const result = await casperX402.verifyCasperPayment(
      '',  // empty payment header
      { network: 'casper:casper', maxAmountRequired: '10000000' }
    );

    assert.equal(result.valid, false);
    assert.ok(result.error, 'Should return an error message for empty payment');
  });

  it('returns a timeout error when facilitator verify is aborted', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      options.signal.dispatchEvent(new Event('abort'));
      throw new DOMException('The operation was aborted', 'AbortError');
    };

    try {
      const result = await casperX402.verifyCasperPayment(
        'signed-payment-header',
        { network: 'casper:casper', maxAmountRequired: '10000000' }
      );

      assert.equal(result.valid, false);
      assert.match(result.error, /timed out after 10000ms/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('casper-x402: settleCasperPayment', () => {
  before(async () => {
    casperX402 = require('../src/lib/casper-x402');
  });

  it('exports settleCasperPayment function', () => {
    assert.equal(typeof casperX402.settleCasperPayment, 'function');
  });

  it('returns error for empty payment header', async () => {
    const result = await casperX402.settleCasperPayment(
      '',  // empty payment header
      { network: 'casper:casper', maxAmountRequired: '10000000' }
    );

    assert.equal(result.settled, false);
    assert.ok(result.error, 'Should return an error for empty payment');
  });

  it('sends correct request to facilitator /settle', async () => {
    const originalFetch = global.fetch;
    let captured;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ settled: true, txHash: 'abc123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const paymentRequirements = { network: 'casper:casper', maxAmountRequired: '10000000' };

    try {
      const result = await casperX402.settleCasperPayment(
        'signed-payment-header',
        paymentRequirements
      );

      assert.equal(result.settled, true);
      assert.equal(result.txHash, 'abc123');
      assert.equal(captured.url, 'https://x402-facilitator.cspr.cloud/settle');
      assert.equal(captured.options.method, 'POST');
      assert.ok(captured.options.signal instanceof AbortSignal);
      assert.equal(captured.options.headers['Content-Type'], 'application/json');
      assert.equal(captured.options.headers['X-API-Key'], 'test-api-key-12345');
      assert.deepEqual(JSON.parse(captured.options.body), {
        payment: 'signed-payment-header',
        paymentRequirements,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('casper-x402: cspr-to-motes conversion', () => {
  before(async () => {
    casperX402 = require('../src/lib/casper-x402');
  });

  it('exports csprToMotes function', () => {
    assert.equal(typeof casperX402.csprToMotes, 'function');
  });

  it('converts 1 CSPR to 1_000_000_000 motes', () => {
    assert.equal(casperX402.csprToMotes(1), '1000000000');
  });

  it('converts 0.01 CSPR to 10_000_000 motes', () => {
    assert.equal(casperX402.csprToMotes(0.01), '10000000');
  });

  it('converts 111.11 CSPR correctly', () => {
    assert.equal(casperX402.csprToMotes(111.11), '111110000000');
  });

  it('handles tiny amounts (base price)', () => {
    // Base bonding curve price: 0.01
    const motes = casperX402.csprToMotes(0.01);
    assert.equal(motes, '10000000');
  });

  it('rejects non-finite prices before building facilitator amounts', () => {
    assert.throws(() => casperX402.csprToMotes(Infinity), /finite/);
    assert.throws(() => casperX402.csprToMotes(NaN), /finite/);
  });
});
