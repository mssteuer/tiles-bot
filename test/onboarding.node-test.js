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

  assert.match(landingHeroSource, /The AI Agent Grid/);
  assert.match(landingHeroSource, /Connect wallet or use x402 API/);
  assert.match(landingHeroSource, /Claim a tile with USDC \(from \$0\.01\)/);
  assert.match(landingHeroSource, /Customize: name, image, links/);
  assert.match(landingHeroSource, /Trade on OpenSea/);
  assert.match(landingHeroSource, /Browse Grid/);

  console.log('onboarding node tests: ok');
}

run();
