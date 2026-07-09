const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const helperPath = path.join(ROOT, 'src/lib/activityFreshness.js');

function loadHelper() {
  const source = fs.readFileSync(helperPath, 'utf8');
  const transformed = source
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+function\s+/g, 'function ');
  // eslint-disable-next-line no-new-func
  return new Function(`${transformed}\nreturn { STALE_ACTIVITY_AFTER_MS, getActivityFeedState };`)();
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function run() {
  const { STALE_ACTIVITY_AFTER_MS, getActivityFeedState } = loadHelper();
  assert.equal(STALE_ACTIVITY_AFTER_MS, 3 * 24 * 60 * 60 * 1000, 'activity goes stale after three days');

  const now = Date.parse('2026-07-09T12:00:00Z');
  const fresh = getActivityFeedState([
    { tileId: 1, timestamp: '2026-07-09T11:45:00Z' },
    { tileId: 2, timestamp: '2026-07-05T09:00:00Z' },
  ], now);
  assert.equal(fresh.state, 'fresh');
  assert.equal(fresh.isStale, false);
  assert.equal(fresh.newestEventAt, '2026-07-09T11:45:00.000Z');
  assert.equal(fresh.newestEventAgeDays, 0);
  assert.match(fresh.message, /Latest grid activity is fresh/i);

  const stale = getActivityFeedState([
    { tileId: 3, timestamp: '2026-06-08T19:00:00Z' },
  ], now);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.isStale, true);
  assert.equal(stale.newestEventAt, '2026-06-08T19:00:00.000Z');
  assert.equal(stale.newestEventAgeDays, 30);
  assert.match(stale.message, /No recent activity/i);
  assert.match(stale.message, /quiet/i);
  assert.doesNotMatch(stale.message, /unavailable|failed|error/i, 'stale copy is not failure copy');

  const empty = getActivityFeedState([], now);
  assert.equal(empty.state, 'empty');
  assert.equal(empty.isStale, false);
  assert.equal(empty.newestEventAt, null);
  assert.match(empty.message, /No activity yet/i);
  assert.doesNotMatch(empty.message, /unavailable|failed|error/i, 'empty copy is not failure copy');

  const activityRoute = read('src/app/api/activity/route.js');
  const activitiesRoute = read('src/app/api/activities/route.js');
  const activityFeed = read('src/components/ActivityFeed.js');
  assert.match(activityRoute, /getActivityFeedState/, '/api/activity includes freshness metadata');
  assert.match(activitiesRoute, /getActivityFeedState/, '/api/activities includes freshness metadata');
  assert.match(activityFeed, /getActivityFeedState/, 'homepage ActivityFeed computes quiet/stale UI state');
  assert.match(activityFeed, /No recent activity/, 'ActivityFeed distinguishes stale quiet grid copy');
  assert.match(activityFeed, /Feed unavailable/, 'ActivityFeed distinguishes endpoint failure copy');

  console.log('activity freshness tests: ok');
}

run();
