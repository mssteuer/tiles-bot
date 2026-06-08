const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
}

function assertContains(source, pattern, label) {
  assert.match(source, pattern, label);
}

function run() {
  const claimModal = read('../src/components/ClaimModal.js');
  const batchClaimModal = read('../src/components/BatchClaimModal.js');
  const header = read('../src/components/Header.js');
  const casperWallet = read('../src/lib/casper-wallet.js');
  const providers = read('../src/components/Providers.js');
  const filterBar = read('../src/components/FilterBar.js');
  const grid = read('../src/components/grid/Grid.js');
  const tooltip = read('../src/components/grid/TileTooltip.js');
  const aboutTab = read('../src/components/tile-panel/AboutTab.js');

  for (const [name, source] of [
    ['ClaimModal', claimModal],
    ['BatchClaimModal', batchClaimModal],
  ]) {
    assertContains(source, /selectedChain/, `${name} tracks the selected chain`);
    assertContains(source, /Choose your chain/, `${name} renders chain selector step`);
    assertContains(source, /Base[\s\S]*USDC/, `${name} shows Base USDC option`);
    assertContains(source, /Casper[\s\S]*CSPR/, `${name} shows Casper CSPR option`);
    assertContains(source, /chain:\s*selectedChain/, `${name} registers with selected chain`);
    assertContains(source, /basescan\.org/, `${name} links Base transactions to Basescan`);
    assertContains(source, /cspr\.live/, `${name} links Casper deploys to cspr.live`);
    assertContains(source, /grid IS the marketplace/, `${name} explains Casper has no marketplace`);
  }

  assertContains(claimModal, /Connect your Base wallet/, 'ClaimModal has Base-specific wallet prompt');
  assertContains(claimModal, /Connect your Casper wallet/, 'ClaimModal has Casper-specific wallet prompt');
  assertContains(claimModal, /hasBaseAddress = isConnected && isAddress\(address \|\| ''\)/, 'ClaimModal requires a valid EVM account before Base actions');
  assertContains(claimModal, /MetaMask did not return a valid Base account/, 'ClaimModal normalizes undefined Base wallet address errors');
  assertContains(batchClaimModal, /Connect your Base wallet/, 'BatchClaimModal has Base-specific wallet prompt');
  assertContains(batchClaimModal, /Connect your Casper wallet/, 'BatchClaimModal has Casper-specific wallet prompt');
  assertContains(batchClaimModal, /hasBaseAddress = isConnected && isAddress\(address \|\| ''\)/, 'BatchClaimModal requires a valid EVM account before Base actions');
  assertContains(batchClaimModal, /MetaMask did not return a valid Base account/, 'BatchClaimModal normalizes undefined Base wallet address errors');
  assertContains(header, /Base Wallet/, 'Header labels the EVM wallet button as Base Wallet');
  assertContains(header, /Casper Wallet/, 'Header labels the Casper wallet button');
  assertContains(casperWallet, /contentMode:\s*CONTENT_MODE\.IFRAME/, 'CSPR.click uses iframe mode, not deprecated popup mode');
  assertContains(casperWallet, /chainName:\s*IS_TESTNET \? 'casper-test' : 'casper'/, 'CSPR.click uses the configured Casper network');
  assertContains(providers, /ClickUI[\s\S]*rootAppElement="body"/, 'Providers mount CSPR.click modal UI with the Next app root');
  assertContains(header, /Base claimed/, 'Header stats bar shows Base claimed count');
  assertContains(header, /Casper claimed/, 'Header stats bar shows Casper claimed count');
  assertContains(filterBar, /All chains/, 'FilterBar renders all-chain filter');
  assertContains(filterBar, /onChainFilterChange/, 'FilterBar emits chain filter changes');
  assertContains(grid, /chainVisual\.borderColor/, 'Grid uses chain visual color for tile borders');
  assertContains(tooltip, /chainVisual\.label/, 'Tile tooltip shows chain label');
  assertContains(aboutTab, /buildChainExplorerLinks/, 'About tab builds chain-specific explorer links');
  assertContains(aboutTab, /formatAddressForChain/, 'About tab formats addresses by chain');

  console.log('chain selection UI source tests: ok');
}

run();
