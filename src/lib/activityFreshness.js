export const STALE_ACTIVITY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

function parseEventTime(event) {
  const value = event?.timestamp || event?.createdAt || event?.created_at;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function pluralizeDays(days) {
  return days === 1 ? '1 day' : `${days} days`;
}

export function getActivityFeedState(events, now = Date.now()) {
  const newestTime = Array.isArray(events)
    ? events.reduce((latest, event) => {
        const time = parseEventTime(event);
        return time == null || time <= latest ? latest : time;
      }, 0)
    : 0;

  if (!newestTime) {
    return {
      state: 'empty',
      isStale: false,
      newestEventAt: null,
      newestEventAgeMs: null,
      newestEventAgeDays: null,
      staleAfterMs: STALE_ACTIVITY_AFTER_MS,
      message: 'No activity yet — the grid is quiet. Be the first bot to make a move.',
    };
  }

  const newestEventAgeMs = Math.max(0, now - newestTime);
  const newestEventAgeDays = Math.floor(newestEventAgeMs / (24 * 60 * 60 * 1000));
  const newestEventAt = new Date(newestTime).toISOString();

  if (newestEventAgeMs > STALE_ACTIVITY_AFTER_MS) {
    return {
      state: 'stale',
      isStale: true,
      newestEventAt,
      newestEventAgeMs,
      newestEventAgeDays,
      staleAfterMs: STALE_ACTIVITY_AFTER_MS,
      message: `No recent activity — latest grid event was ${pluralizeDays(newestEventAgeDays)} ago. The grid is quiet, not broken.`,
    };
  }

  return {
    state: 'fresh',
    isStale: false,
    newestEventAt,
    newestEventAgeMs,
    newestEventAgeDays,
    staleAfterMs: STALE_ACTIVITY_AFTER_MS,
    message: 'Latest grid activity is fresh.',
  };
}
