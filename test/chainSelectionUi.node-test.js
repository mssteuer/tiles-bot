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
  const walletMenu = read('../src/components/WalletMenu.js');
  const useWalletSession = read('../src/lib/useWalletSession.js');
  const sessionChain = read('../src/lib/sessionChain.js');
  const casperWallet = read('../src/lib/casper-wallet.js');
  const providers = read('../src/components/Providers.js');
  const filterBar = read('../src/components/FilterBar.js');
  const grid = read('../src/components/grid/Grid.js');
  const tooltip = read('../src/components/grid/TileTooltip.js');
  const aboutTab = read('../src/components/tile-panel/AboutTab.js');
  const activityFeed = read('../src/components/ActivityFeed.js');
  const wagmiConfig = read('../src/lib/wagmi.js');
  const registerRoute = read('../src/app/api/tiles/[id]/register/route.js');

  // — Single-chain session model (acceptance criteria: never two addresses shown)
  for (const [name, source] of [
    ['ClaimModal', claimModal],
    ['BatchClaimModal', batchClaimModal],
  ]) {
    assertContains(source, /selectedChain/, `${name} tracks the selected chain`);
    assertContains(source, /useWalletSession/, `${name} uses the single-chain wallet session hook`);
    assert.doesNotMatch(source, /renderChainSelector/, `${name} no longer offers a dual chain-choice step (single-chain session)`);
    assertContains(source, /grid IS the marketplace/, `${name} explains Casper has no marketplace`);
    assertContains(source, /Choose your chain/, `${name} renders chain selector step`);
    assertContains(source, /Base[\s\S]*USDC/, `${name} shows Base USDC option`);
    assertContains(source, /Casper[\s\S]*CSPR/, `${name} shows Casper CSPR option`);
    assertContains(source, /chain:\s*selectedChain/, `${name} registers with selected chain`);
    assertContains(source, /basescan\.org/, `${name} links Base transactions to Basescan`);
    assertContains(source, /cspr\.live/, `${name} links Casper deploys to cspr.live`);
    assertContains(source, /CSPR\.market/, `${name} links Casper NFTs to CSPR.market, not OpenSea narrative text`);
  }

  assertContains(claimModal, /Connect your wallet/, 'ClaimModal prompts to connect via the single wallet menu when logged out');
  assertContains(claimModal, /hasBaseAddress = isConnected && isAddress\(address \|\| ''\)/, 'ClaimModal requires a valid EVM account before Base actions');
  assertContains(claimModal, /MetaMask did not return a valid Base account/, 'ClaimModal normalizes undefined Base wallet address errors');
  assertContains(claimModal, /async function registerBaseClaim/, 'ClaimModal treats Base registration as a required step');
  assertContains(claimModal, /res\.status === 202/, 'ClaimModal retries transient on-chain registration propagation');
  assertContains(claimModal, /throw new Error\(data\.error \|\| data\.detail/, 'ClaimModal surfaces failed registration instead of showing false success');
  assertContains(batchClaimModal, /Connect your wallet/, 'BatchClaimModal prompts to connect via the single wallet menu when logged out');
  assertContains(batchClaimModal, /hasBaseAddress = isConnected && isAddress\(address \|\| ''\)/, 'BatchClaimModal requires a valid EVM account before Base actions');
  assertContains(batchClaimModal, /MetaMask did not return a valid Base account/, 'BatchClaimModal normalizes undefined Base wallet address errors');

  // — Header renders ONE wallet menu, not two separate chain buttons
  assertContains(header, /WalletMenu/, 'Header renders the unified single-chain WalletMenu');
  assert.doesNotMatch(header, /CasperWalletButton/, 'Header no longer renders a separate Casper wallet button');
  assert.doesNotMatch(header, /ConnectKitButton/, 'Header no longer renders a separate Base wallet button');
  assertContains(header, /Base claimed/, 'Header stats bar shows Base claimed count');
  assertContains(header, /Casper claimed/, 'Header stats bar shows Casper claimed count');

  // — WalletMenu: single address dropdown with logout / switch / explorer
  assertContains(walletMenu, /Connect Wallet/, 'WalletMenu offers a single connect entry point');
  assertContains(walletMenu, /Connect on Base/, 'WalletMenu offers Base at connect time');
  assertContains(walletMenu, /Connect on Casper/, 'WalletMenu offers Casper at connect time');
  assertContains(walletMenu, /Log out/, 'WalletMenu dropdown offers log out');
  assertContains(walletMenu, /Switch account/, 'WalletMenu dropdown offers switch account');
  assertContains(walletMenu, /View on/, 'WalletMenu dropdown offers a block explorer link');
  assertContains(walletMenu, /api\/chains/, 'WalletMenu resolves explorer URL via chains.js-backed API, not hardcoded');
  assert.doesNotMatch(walletMenu, /https?:\/\/[^"'`]*basescan\.org|https?:\/\/[^"'`]*cspr\.live/, 'WalletMenu does not hardcode explorer URLs');

  // — Session enforcement logic
  assertContains(useWalletSession, /resolveActiveChain/, 'useWalletSession resolves a single active chain');
  assertContains(useWalletSession, /chainToDisconnect/, 'useWalletSession disconnects the losing chain when both connect');
  assertContains(useWalletSession, /localStorage/, 'useWalletSession persists the active chain across reloads');
  assertContains(sessionChain, /function resolveActiveChain/, 'sessionChain exports pure resolution logic');

  assertContains(casperWallet, /contentMode:\s*CONTENT_MODE\.IFRAME/, 'CSPR.click uses iframe mode, not deprecated popup mode');
  assertContains(casperWallet, /chainName:\s*IS_TESTNET \? 'casper-test' : 'casper'/, 'CSPR.click uses the configured Casper network');
  assertContains(providers, /ClickUI[\s\S]*rootAppElement="body"/, 'Providers mount CSPR.click modal UI with the Next app root');
  assertContains(filterBar, /All chains/, 'FilterBar renders all-chain filter');
  assertContains(filterBar, /onChainFilterChange/, 'FilterBar emits chain filter changes');
  assertContains(grid, /chainVisual\.borderColor/, 'Grid uses chain visual color for tile borders');
  assertContains(tooltip, /chainVisual\.label/, 'Tile tooltip shows chain label');
  assertContains(aboutTab, /buildChainExplorerLinks/, 'About tab builds chain-specific explorer links');
  assertContains(aboutTab, /formatAddressForChain/, 'About tab formats addresses by chain');
  assert.doesNotMatch(activityFeed, /`\/tile-images\/thumb\/\$\{evt\.tileId\}\.webp`/, 'ActivityFeed does not request missing fallback thumbnails');
  assertContains(activityFeed, /src=\{evt\.tileImageUrl\}/, 'ActivityFeed renders image only when the event supplies an image URL');
  assertContains(wagmiConfig, /mainnet/, 'wagmi config includes Ethereum mainnet for ConnectKit ENS lookups');
  assertContains(wagmiConfig, /ethereum\.publicnode\.com/, 'wagmi config overrides ConnectKit ENS mainnet RPC away from eth.merkle.io');
  assertContains(registerRoute, /\{ status: 202 \}/, 'Register route returns 202 for transient unminted ownership verification');
  assert.doesNotMatch(registerRoute, /isUnmintedTokenError\(err\) \? 404/, 'Register route no longer maps transient propagation to browser-noisy 404');

  console.log('chain selection UI source tests: ok');
}

run();
