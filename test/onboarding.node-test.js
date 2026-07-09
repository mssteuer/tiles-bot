const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  STORAGE_KEY,
  shouldShowLandingHero,
  getDismissedState,
  setDismissedState,
} = require('../src/lib/onboarding');

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

function run() {
  assert.equal(shouldShowLandingHero({ selectedTile: null, onboardingDismissed: false }), true);
  assert.equal(shouldShowLandingHero({ selectedTile: 42, onboardingDismissed: false }), false);
  assert.equal(shouldShowLandingHero({ selectedTile: null, onboardingDismissed: true }), false);

  const storage = createStorage();
  assert.equal(getDismissedState(storage), false);

  setDismissedState(storage, true);
  assert.equal(storage.getItem(STORAGE_KEY), '1');
  assert.equal(getDismissedState(storage), true);

  setDismissedState(storage, false);
  assert.equal(storage.getItem(STORAGE_KEY), '0');
  assert.equal(getDismissedState(storage), false);

  assert.equal(getDismissedState(null), false);
  setDismissedState(null, true);

  const landingHeroSource = fs.readFileSync(
    path.join(__dirname, '../src/components/LandingHero.js'),
    'utf8'
  );
  const onboardingModalSource = fs.readFileSync(
    path.join(__dirname, '../src/components/OnboardingModal.js'),
    'utf8'
  );

  assert.match(landingHeroSource, /The Multi-Chain AI Agent Grid/);
  assert.match(landingHeroSource, /256×256 NFT tiles for AI agents on Base and Casper/);
  assert.match(landingHeroSource, /Claim once, show up everywhere/);
  assert.match(landingHeroSource, /Connect wallet \(Base or Casper\) or use x402 API/);
  assert.match(landingHeroSource, /Claim a tile/);
  assert.match(landingHeroSource, /0\.01 USDC on Base/);
  assert.match(landingHeroSource, /5 CSPR on Casper/);
  assert.match(landingHeroSource, /Customize: name, image, links/);
  assert.match(landingHeroSource, /Trade on OpenSea \(Base, after collection launch\)/);
  assert.match(landingHeroSource, /Browse Grid/);

  assert.match(onboardingModalSource, /x402 payments on Base or Casper/);
  assert.match(onboardingModalSource, /Base using ERC-721 and Casper using CEP-95\/96/);
  assert.match(onboardingModalSource, /0\.01 USDC on Base or 5 CSPR on Casper/);
  assert.match(onboardingModalSource, /Each chain has its own exponential curve/);
  assert.match(onboardingModalSource, /OpenSea after collection launch/);
  assert.doesNotMatch(onboardingModalSource, /Each tile is an ERC-721 NFT on Base\./);
  assert.doesNotMatch(onboardingModalSource, /Tiles start at \$0\.01 USDC\./);

  console.log('onboarding node tests: ok');
}

run();
