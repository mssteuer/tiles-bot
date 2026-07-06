const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Set required env vars before importing the module
process.env.CHAIN_BASE_NFT_CONTRACT = '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E';
process.env.CHAIN_BASE_PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
process.env.CHAIN_BASE_RPC_URL = 'https://mainnet.base.org';
process.env.CHAIN_BASE_EXPLORER = 'https://basescan.org';
process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402-facilitator.base.org';
process.env.CHAIN_CASPER_NFT_CONTRACT = 'hash-placeholder';
process.env.CHAIN_CASPER_PAYMENT_TOKEN = 'hash-placeholder';
process.env.CHAIN_CASPER_TREASURY = '02placeholder';
process.env.CHAIN_CASPER_RPC_URL = 'https://node.mainnet.casper.network/rpc';
process.env.CHAIN_CASPER_EXPLORER = 'https://cspr.live';
process.env.CHAIN_CASPER_X402_FACILITATOR = 'https://x402-facilitator.cspr.cloud';
process.env.DEFAULT_CHAIN = 'base';

const { getChain, getChainByAddress, getSupportedChains, DEFAULT_CHAIN } = require('../src/lib/chains');

describe('getChain', () => {
  it('returns Base config for id "base"', () => {
    const chain = getChain('base');
    assert.equal(chain.id, 'base');
    assert.equal(chain.caip2, 'eip155:8453');
    assert.equal(chain.name, 'Base');
    assert.equal(chain.addressFormat, 'evm');
    assert.equal(chain.nftContract, '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E');
    assert.equal(chain.paymentToken, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    assert.equal(chain.treasury, '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f');
    assert.equal(chain.rpcUrl, 'https://mainnet.base.org');
    assert.equal(chain.explorer, 'https://basescan.org');
    assert.equal(chain.x402Facilitator, 'https://x402-facilitator.base.org');
  });

  it('returns Casper config for id "casper"', () => {
    const chain = getChain('casper');
    assert.equal(chain.id, 'casper');
    assert.equal(chain.caip2, 'casper:casper');
    assert.equal(chain.name, 'Casper');
    assert.equal(chain.addressFormat, 'casper');
    assert.equal(chain.nftContract, 'hash-placeholder');
    assert.equal(chain.rpcUrl, 'https://node.mainnet.casper.network/rpc');
  });

  it('throws for unknown chain id', () => {
    assert.throws(() => getChain('solana'), /Unknown chain: solana/);
  });
});

describe('getChainByAddress', () => {
  it('detects EVM address as Base', () => {
    const chain = getChainByAddress('0x67439832C52C92B5ba8DE28a202E72D09CCEB42f');
    assert.equal(chain.id, 'base');
  });

  it('detects Casper ed25519 address (01 prefix)', () => {
    const addr = '01' + 'a'.repeat(64);
    const chain = getChainByAddress(addr);
    assert.equal(chain.id, 'casper');
  });

  it('detects Casper secp256k1 address (02 prefix)', () => {
    const addr = '02' + 'b'.repeat(64);
    const chain = getChainByAddress(addr);
    assert.equal(chain.id, 'casper');
  });

  it('throws for invalid address', () => {
    assert.throws(() => getChainByAddress('not-an-address'), /Unrecognized address format/);
  });

  it('throws for EVM address with wrong length', () => {
    assert.throws(() => getChainByAddress('0x1234'), /Unrecognized address format/);
  });

  it('throws for Casper address with wrong prefix', () => {
    const addr = '03' + 'a'.repeat(64);
    assert.throws(() => getChainByAddress(addr), /Unrecognized address format/);
  });
});

describe('getSupportedChains', () => {
  it('returns array of all chains', () => {
    const chains = getSupportedChains();
    assert.equal(Array.isArray(chains), true);
    assert.equal(chains.length, 2);
    const ids = chains.map(c => c.id).sort();
    assert.deepEqual(ids, ['base', 'casper']);
  });
});

describe('DEFAULT_CHAIN', () => {
  it('resolves to base by default', () => {
    assert.equal(DEFAULT_CHAIN.id, 'base');
  });
});

describe('explorerTx', () => {
  it('builds Base explorer tx URL', () => {
    const chain = getChain('base');
    const url = chain.explorerTx('0xabc123');
    assert.equal(url, 'https://basescan.org/tx/0xabc123');
  });

  it('builds Casper explorer deploy URL', () => {
    const chain = getChain('casper');
    const url = chain.explorerTx('abc123');
    assert.equal(url, 'https://cspr.live/deploy/abc123');
  });
});

describe('marketplace', () => {
  it('Base marketplace links to OpenSea', () => {
    const chain = getChain('base');
    assert.equal(chain.marketplace('0xcontract', 42), 'https://opensea.io/assets/base/0xcontract/42');
  });

  it('Casper marketplace links to CSPR.market, never OpenSea', () => {
    const chain = getChain('casper');
    const url = chain.marketplace('hash-nft', 42);
    assert.equal(url, 'https://cspr.market/nft/hash-nft/42');
    assert.doesNotMatch(url, /opensea/i);
  });
});
