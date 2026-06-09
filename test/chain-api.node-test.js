const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.CHAIN_BASE_NFT_CONTRACT = '0xafd1932bc7e6021df299e029e7dfa2b6324f4b8e';
process.env.CHAIN_BASE_PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
process.env.CHAIN_BASE_RPC_URL = 'https://base.example/rpc';
process.env.CHAIN_BASE_EXPLORER = 'https://basescan.org';
process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402.base.example';
process.env.CHAIN_CASPER_NFT_CONTRACT = 'hash-casper-nft';
process.env.CHAIN_CASPER_PAYMENT_TOKEN = 'hash-wcspr-token';
process.env.CHAIN_CASPER_TREASURY = '01' + 'a'.repeat(64);
process.env.CHAIN_CASPER_RPC_URL = 'https://casper.example/rpc';
process.env.CHAIN_CASPER_EXPLORER = 'https://cspr.live';
process.env.CHAIN_CASPER_X402_FACILITATOR = 'https://x402.casper.example';
process.env.DEFAULT_CHAIN = 'base';

const {
  resolveRequestedChainId,
  publicChainConfig,
  buildChainStatsPayload,
} = require('../src/lib/chain-api');

describe('chain-api request chain resolution', () => {
  it('defaults to Base when no chain selector is present', () => {
    assert.equal(resolveRequestedChainId(), 'base');
  });

  it('uses an explicit request body chain before query/header selectors', () => {
    const request = {
      nextUrl: new URL('https://tiles.bot/api/tiles/1/register?chain=base'),
      headers: new Headers({ 'x-chain': 'base' }),
    };
    assert.equal(resolveRequestedChainId(request, { chain: 'Casper' }), 'casper');
  });

  it('uses query or header selectors when body chain is absent', () => {
    const queryRequest = {
      nextUrl: new URL('https://tiles.bot/api/tiles/1/check-owner?chain=casper'),
      headers: new Headers(),
    };
    const headerRequest = {
      nextUrl: new URL('https://tiles.bot/api/tiles/1/check-owner'),
      headers: new Headers({ 'x-tiles-chain': 'casper' }),
    };
    assert.equal(resolveRequestedChainId(queryRequest), 'casper');
    assert.equal(resolveRequestedChainId(headerRequest), 'casper');
  });
});

describe('chain-api public payloads', () => {
  it('exposes public contract metadata; keeps Casper RPC (public node, needed client-side) but strips EVM RPC (may carry a secret key)', () => {
    const casper = publicChainConfig('casper', { currentPrice: 0.01, source: 'on-chain' });

    assert.equal(casper.id, 'casper');
    assert.equal(casper.caip2, 'casper:casper');
    assert.equal(casper.nftContract, 'hash-casper-nft');
    assert.equal(casper.paymentToken, 'hash-wcspr-token');
    assert.equal(casper.currentPrice, 0.01);
    assert.equal(casper.priceSource, 'on-chain');
    // Casper claim flow runs in the browser via CSPR.click, so the public node
    // RPC URL must be exposed.
    assert.equal(casper.rpcUrl, 'https://casper.example/rpc');

    // EVM (Base) RPC URLs can embed a provider API key — never expose them.
    const base = publicChainConfig('base', { currentPrice: 0.02, source: 'on-chain' });
    assert.equal(Object.prototype.hasOwnProperty.call(base, 'rpcUrl'), false);
  });

  it('fills missing per-chain DB stats with zeroes while preserving on-chain prices', () => {
    const payload = buildChainStatsPayload({
      base: { currentPrice: 0.02, source: 'on-chain' },
      casper: { currentPrice: 0.03, source: 'on-chain' },
    }, {
      base: { claimed: 2, totalRevenue: 0.02 },
    });

    assert.equal(payload.base.claimed, 2);
    assert.equal(payload.base.totalRevenue, 0.02);
    assert.equal(payload.base.currentPrice, 0.02);
    assert.equal(payload.casper.claimed, 0);
    assert.equal(payload.casper.totalRevenue, 0);
    assert.equal(payload.casper.currentPrice, 0.03);
  });
});
