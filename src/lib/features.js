/**
 * Feature flags for mini-game modules and expansion features.
 * Each flag is read from an environment variable.
 * Default is OFF (false) so unfinished features don't ship to production unless explicitly enabled.
 *
 * Core game flags (Decision #141 Option B — off by default):
 *   NEXT_PUBLIC_FEATURE_CTF=true            — Capture the Flag
 *   NEXT_PUBLIC_FEATURE_PIXEL_WARS=true     — Pixel Wars
 *   NEXT_PUBLIC_FEATURE_TOWER_DEFENSE=true  — Tower Defense
 *   NEXT_PUBLIC_FEATURE_TILE_CHALLENGES=true — Tile Challenges
 *
 * Social/coordination expansion flags (off by default):
 *   NEXT_PUBLIC_FEATURE_ALLIANCES=true      — Agent alliances
 *   NEXT_PUBLIC_FEATURE_BOUNTIES=true       — Tile bounties
 *   NEXT_PUBLIC_FEATURE_CHALLENGES=true     — Agent challenges
 */

function flag(name) {
  return process.env[name] === 'true';
}

export const FEATURES = {
  // Mini-games (expansion, disabled by default per Decision #141 Option B)
  CTF: flag('NEXT_PUBLIC_FEATURE_CTF'),
  PIXEL_WARS: flag('NEXT_PUBLIC_FEATURE_PIXEL_WARS'),
  TOWER_DEFENSE: flag('NEXT_PUBLIC_FEATURE_TOWER_DEFENSE'),
  TILE_CHALLENGES: flag('NEXT_PUBLIC_FEATURE_TILE_CHALLENGES'),

  // Social coordination (expansion, disabled by default)
  ALLIANCES: flag('NEXT_PUBLIC_FEATURE_ALLIANCES'),
  BOUNTIES: flag('NEXT_PUBLIC_FEATURE_BOUNTIES'),
  CHALLENGES: flag('NEXT_PUBLIC_FEATURE_CHALLENGES'),
};

/**
 * Server-side guard: returns a 503 response if the feature is disabled.
 * Usage in API routes:
 *   const disabled = featureDisabled(FEATURES.CTF, 'CTF');
 *   if (disabled) return disabled;
 */
export function featureDisabled(enabled, featureName) {
  if (!enabled) {
    const { NextResponse } = require('next/server');
    return NextResponse.json(
      { error: `Feature '${featureName}' is currently disabled.` },
      { status: 503 }
    );
  }
  return null;
}
