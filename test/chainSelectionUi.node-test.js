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
  assertContains(batchClaimModal, /Connect your Base wallet/, 'BatchClaimModal has Base-specific wallet prompt');
  assertContains(batchClaimModal, /Connect your Casper wallet/, 'BatchClaimModal has Casper-specific wallet prompt');
  assertContains(header, /Base Wallet/, 'Header labels the EVM wallet button as Base Wallet');
  assertContains(header, /Casper Wallet/, 'Header labels the Casper wallet button');

  console.log('chain selection UI source tests: ok');
}

run();
