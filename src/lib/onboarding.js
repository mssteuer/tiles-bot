const STORAGE_KEY = 'tilesbot:onboarding-dismissed';

function shouldShowLandingHero({ selectedTile, onboardingDismissed }) {
  return selectedTile === null && onboardingDismissed !== true;
}

function getDismissedState(storageLike) {
  if (!storageLike || typeof storageLike.getItem !== 'function') return false;
  return storageLike.getItem(STORAGE_KEY) === '1';
}

function setDismissedState(storageLike, dismissed) {
  if (!storageLike || typeof storageLike.setItem !== 'function') return;
  storageLike.setItem(STORAGE_KEY, dismissed ? '1' : '0');
}

module.exports = {
  STORAGE_KEY,
  shouldShowLandingHero,
  getDismissedState,
  setDismissedState,
};
