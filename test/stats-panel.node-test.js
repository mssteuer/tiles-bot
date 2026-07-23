const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STATS_PANEL_SOURCE = path.join(ROOT, 'src/components/StatsPanel.js');
const { formatChainPrice } = require(path.join(ROOT, 'src/lib/header-wallet-formatting.js'));

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

assert.equal(formatChainPrice(0.0106, 'base'), '$0.0106');
assert.equal(formatChainPrice(1.234, 'base'), '$1.23');
assert.equal(formatChainPrice(1234.56, 'base'), '$1,234.56');
assert.equal(formatChainPrice(null, 'base'), '—');

assert.equal(formatChainPrice(0.012345, 'casper'), '0.0123 CSPR');
assert.equal(formatChainPrice(12.3, 'casper'), '12.30 CSPR');
assert.equal(formatChainPrice(1234.56, 'casper'), '1,235 CSPR');
assert.equal(formatChainPrice(null, 'casper'), '—');
assert.equal(formatChainPrice('not-a-number', 'casper'), '—');

const statsPanel = read('src/components/StatsPanel.js');

assert.match(statsPanel, /Base:/, 'StatsPanel renders a Base row');
assert.match(statsPanel, /Casper:/, 'StatsPanel renders a Casper row');
assert.match(statsPanel, /perChain\.base\.claimed/, 'Base row must source claimed count from perChain.base.claimed');
assert.match(statsPanel, /perChain\.casper\.claimed/, 'Casper row must source claimed count from perChain.casper.claimed');
assert.match(statsPanel, /formatChainPrice\(perChain\.base\.currentPrice, 'base'\)/, 'Base row must use Base/USDC price formatting');
assert.match(statsPanel, /formatChainPrice\(perChain\.casper\.currentPrice, 'casper'\)/, 'Casper row must use Casper/CSPR price formatting');
assert.match(statsPanel, /hasRenderableNumber\(perChain\.casper\.currentPrice\)[\s\S]*price unavailable/, 'Null Casper price must render an explicit unavailable state');
assert.doesNotMatch(statsPanel, /formatChainPrice\(perChain\.casper\.currentPrice, 'base'\)/, 'Casper price must never be formatted as Base/USDC');
assert.doesNotMatch(statsPanel, /formatUsd\(perChain\.casper\.currentPrice\)/, 'Casper price must not use legacy USD-only formatting');

assert.match(statsPanel, /hasMixedChainRevenue/, 'StatsPanel must detect mixed-chain revenue before rendering totals');
assert.match(statsPanel, /Revenue shown per chain to avoid mixing USDC and CSPR totals\./, 'StatsPanel must explain per-chain revenue split when both chains are present');
assert.match(statsPanel, /renderRevenue\(perChain\.base\.totalRevenue, 'base'\)/, 'Base revenue must be formatted independently');
assert.match(statsPanel, /renderRevenue\(perChain\.casper\.totalRevenue, 'casper'\)/, 'Casper revenue must be formatted independently');
assert.doesNotMatch(statsPanel, /totalRevenue\s*\+|estimatedSoldOutRevenue[\s\S]{0,80}perChain\.casper/, 'StatsPanel must not sum or blend mixed USDC/CSPR revenue');

console.log('stats panel source tests: ok');
