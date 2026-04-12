/**
 * Feature flags for mini-game modules.
 * Each flag is read from an environment variable.
 * Default is OFF (false) so unfinished games don't ship to production unless explicitly enabled.
 *
 * Set the following env vars to "true" to enable a module:
 *   NEXT_PUBLIC_FEATURE_CTF=true          — Capture the Flag
 *   NEXT_PUBLIC_FEATURE_PIXEL_WARS=true   — Pixel Wars
 *   NEXT_PUBLIC_FEATURE_TOWER_DEFENSE=true — Tower Defense
 *   NEXT_PUBLIC_FEATURE_TILE_CHALLENGES=true — Tile Challenges
 */

function flag(name) {
  return process.env[name] === 'true';
}

export const FEATURES = {
  CTF: flag('NEXT_PUBLIC_FEATURE_CTF'),
  PIXEL_WARS: flag('NEXT_PUBLIC_FEATURE_PIXEL_WARS'),
  TOWER_DEFENSE: flag('NEXT_PUBLIC_FEATURE_TOWER_DEFENSE'),
  TILE_CHALLENGES: flag('NEXT_PUBLIC_FEATURE_TILE_CHALLENGES'),
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
