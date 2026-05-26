const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

describe('chains.js startup validation', () => {
  it('throws when a required env var is missing', () => {
    // Spawn a child process that tries to require chains.js with partial env
    const script = `
      process.env.CHAIN_BASE_NFT_CONTRACT = '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E';
      process.env.CHAIN_BASE_RPC_URL = 'https://mainnet.base.org';
      process.env.CHAIN_BASE_EXPLORER = 'https://basescan.org';
      process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
      process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402-facilitator.base.org';
      // Deliberately NOT setting CHAIN_BASE_PAYMENT_TOKEN
      try {
        require('./src/lib/chains');
        process.exit(0); // should not reach here
      } catch (e) {
        if (/Missing env var: CHAIN_BASE_PAYMENT_TOKEN/.test(e.message)) {
          process.stdout.write('EXPECTED_ERROR');
          process.exit(0);
        }
        process.stderr.write(e.message);
        process.exit(1);
      }
    `;

    const projectRoot = path.resolve(__dirname, '..');
    const result = execFileSync('node', ['-e', script], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {} // clean environment — no CHAIN_* vars inherited
    });

    assert.equal(result, 'EXPECTED_ERROR');
  });

  it('throws when DEFAULT_CHAIN references unknown chain', () => {
    const script = `
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
      process.env.DEFAULT_CHAIN = 'polygon';
      try {
        require('./src/lib/chains');
        process.exit(0);
      } catch (e) {
        if (/DEFAULT_CHAIN "polygon" is not a registered chain/.test(e.message)) {
          process.stdout.write('EXPECTED_ERROR');
          process.exit(0);
        }
        process.stderr.write(e.message);
        process.exit(1);
      }
    `;

    const projectRoot = path.resolve(__dirname, '..');
    const result = execFileSync('node', ['-e', script], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {}
    });

    assert.equal(result, 'EXPECTED_ERROR');
  });
});
