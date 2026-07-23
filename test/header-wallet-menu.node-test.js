const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HEADER_SOURCE = path.join(ROOT, 'src/components/Header.js');
const WALLET_MENU_SOURCE = path.join(ROOT, 'src/components/WalletMenu.js');
const HELPERS = path.join(ROOT, 'src/lib/header-wallet-formatting.js');

const {
  formatChainPrice,
  buildWalletExplorerUrl,
  getWalletExplorerLabel,
} = require(HELPERS);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

assert.equal(formatChainPrice(0.0106, 'base'), '$0.0106');
assert.equal(formatChainPrice(1.234, 'base'), '$1.23');
assert.equal(formatChainPrice(1234.56, 'base'), '$1,234.56');
assert.equal(formatChainPrice(0.012345, 'casper'), '0.0123 CSPR');
assert.equal(formatChainPrice(12.3, 'casper'), '12.30 CSPR');
assert.equal(formatChainPrice(1234.56, 'casper'), '1,235 CSPR');
assert.equal(formatChainPrice(null, 'casper'), '—');
assert.equal(formatChainPrice(undefined, 'base'), '—');
assert.equal(formatChainPrice('not-a-number', 'casper'), '—');

assert.equal(
  buildWalletExplorerUrl(
    {
      chains: {
        base: { explorer: 'https://basescan.org', explorerAddressPattern: '/address/' },
      },
    },
    'base',
    '0xabc'
  ),
  'https://basescan.org/address/0xabc'
);
assert.equal(
  buildWalletExplorerUrl(
    {
      chains: {
        casper: { explorer: 'https://cspr.live', explorerAddressPattern: '/account/' },
      },
    },
    'casper',
    '01' + 'a'.repeat(64)
  ),
  'https://cspr.live/account/' + '01' + 'a'.repeat(64)
);
assert.equal(buildWalletExplorerUrl({ chains: { base: { explorer: 'https://basescan.org' } } }, 'base', '0xabc'), null);
assert.equal(buildWalletExplorerUrl({ chains: {} }, 'base', '0xabc'), null);
assert.equal(buildWalletExplorerUrl(null, 'base', '0xabc'), null);
assert.equal(buildWalletExplorerUrl({ chains: { base: { explorer: 'https://basescan.org', explorerAddressPattern: '/address/' } } }, 'base', ''), null);

assert.equal(getWalletExplorerLabel('casper'), 'cspr.live');
assert.equal(getWalletExplorerLabel('base'), 'BaseScan');
assert.equal(getWalletExplorerLabel('unknown'), 'block explorer');

const headerSource = read('src/components/Header.js');
assert.match(headerSource, /formatChainPrice\(perChain\.base\.currentPrice, 'base'\)/);
assert.match(headerSource, /formatChainPrice\(perChain\.casper\.currentPrice, 'casper'\)/);
assert.doesNotMatch(headerSource, /function formatChainPrice\(/, 'Header should import the tested helper instead of carrying an untested local copy');

const walletMenuSource = read('src/components/WalletMenu.js');
assert.match(walletMenuSource, /fetch\('\/api\/chains'\)/, 'WalletMenu must source explorer config from the public chains API');
assert.match(walletMenuSource, /buildWalletExplorerUrl\(/, 'WalletMenu should use the tested explorer URL helper');
assert.match(walletMenuSource, /getWalletExplorerLabel\(/, 'WalletMenu should use the tested explorer label helper');
assert.match(walletMenuSource, /Connect on Base/);
assert.match(walletMenuSource, /Connect on Casper/);
assert.match(walletMenuSource, /Switch account/);
assert.match(walletMenuSource, /Log out/);
assert.doesNotMatch(walletMenuSource, /https:\/\/(basescan\.org|cspr\.live)/, 'WalletMenu must not hardcode explorer hosts');

console.log('header wallet menu tests: ok');
