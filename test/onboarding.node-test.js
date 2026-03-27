const assert = require('node:assert/strict');
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

  console.log('onboarding node tests: ok');
}

run();
