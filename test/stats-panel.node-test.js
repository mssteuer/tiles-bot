const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function run() {
  const source = read('src/components/StatsPanel.js');

  assert.match(source, /perChain\.base\.currentPrice/, 'StatsPanel reads the Base per-chain current price');
  assert.match(source, /perChain\.base\.claimed/, 'StatsPanel renders the Base claimed count');
  assert.match(source, /perChain\.casper\.currentPrice/, 'StatsPanel reads the Casper per-chain current price');
  assert.match(source, /perChain\.casper\.claimed/, 'StatsPanel renders the Casper claimed count');

  assert.match(source, /function formatCasperPrice\(value\)/, 'StatsPanel has an explicit Casper price formatter');
  assert.match(source, /return 'unavailable'/, 'Null Casper price renders as unavailable instead of an ambiguous ellipsis');
  assert.match(source, /formatCasperPrice\(perChain\.casper\.currentPrice\)/, 'Casper current price uses the unavailable-aware formatter');
  assert.doesNotMatch(
    source,
    /formatCspr\(perChain\.casper\.currentPrice\)\}\s*CSPR/,
    'Casper null currentPrice must not render as an apparent numeric CSPR price',
  );

  assert.match(source, /Revenue by chain:/, 'StatsPanel labels per-chain revenue separately');
  assert.match(source, /perChain\.base\.totalRevenue[\s\S]*USDC/, 'Base revenue stays labeled as USDC');
  assert.match(source, /perChain\.casper\.totalRevenue[\s\S]*CSPR/, 'Casper revenue stays labeled as CSPR');
  assert.match(source, /Est\. Base sellout:/, 'Legacy sellout estimate is explicitly Base-scoped in multi-chain mode');
  assert.doesNotMatch(source, /totalRevenue\s*\+\s*perChain|perChain[\s\S]{0,80}\+\s*perChain/, 'StatsPanel must not add mixed-chain revenues together');

  console.log('stats panel source tests: ok');
}

run();
