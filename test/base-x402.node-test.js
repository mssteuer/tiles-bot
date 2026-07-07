const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEDICATED_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const LEGACY_WALLET = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function runScript(script) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {},
  });
}

describe('base x402 settlement config', () => {
  it('prefers CHAIN_BASE_TREASURY as the dedicated Base settlement wallet', () => {
    const output = runScript(`
      const { resolveBaseX402Config } = require('./src/lib/base-x402');
      const cfg = resolveBaseX402Config({
        chainConfig: { caip2: 'eip155:8453', treasury: '${DEDICATED_WALLET}' },
        env: {},
      });
      process.stdout.write(JSON.stringify(cfg));
    `);

    const config = JSON.parse(output);
    assert.equal(config.payToAddress, DEDICATED_WALLET);
    assert.equal(config.network, 'base');
  });

  it('lets X402_PAY_TO_ADDRESS override CHAIN_BASE_TREASURY for legacy deployments', () => {
    const output = runScript(`
      const { resolveBaseX402Config } = require('./src/lib/base-x402');
      const cfg = resolveBaseX402Config({
        chainConfig: { caip2: 'eip155:8453', treasury: '${DEDICATED_WALLET}' },
        env: { X402_PAY_TO_ADDRESS: '${LEGACY_WALLET}', X402_NETWORK: 'base-sepolia' },
      });
      process.stdout.write(JSON.stringify(cfg));
    `);

    const config = JSON.parse(output);
    assert.equal(config.payToAddress, LEGACY_WALLET);
    assert.equal(config.network, 'base-sepolia');
  });

  it('rejects zero-address and malformed settlement wallets outside build placeholders', () => {
    const script = `
      const { resolveBaseX402Config } = require('./src/lib/base-x402');
      for (const treasury of ['${ZERO_ADDRESS}', 'not-an-address']) {
        try {
          resolveBaseX402Config({ chainConfig: { caip2: 'eip155:8453', treasury }, env: {} });
          process.stdout.write('UNEXPECTED_SUCCESS');
          process.exit(1);
        } catch (err) {
          if (!/dedicated Base x402 settlement wallet/.test(err.message)) throw err;
        }
      }
      process.stdout.write('EXPECTED_ERRORS');
    `;

    assert.equal(runScript(script), 'EXPECTED_ERRORS');
  });

  it('allows a temporary zero address only during Next production build', () => {
    const output = runScript(`
      const { resolveBaseX402Config } = require('./src/lib/base-x402');
      const cfg = resolveBaseX402Config({
        chainConfig: { caip2: 'eip155:8453', treasury: '${ZERO_ADDRESS}' },
        env: { NEXT_PHASE: 'phase-production-build' },
      });
      process.stdout.write(JSON.stringify(cfg));
    `);

    const config = JSON.parse(output);
    assert.equal(config.payToAddress, ZERO_ADDRESS);
    assert.equal(config.network, 'base');
    assert.equal(config.isBuildPlaceholder, true);
  });
});
