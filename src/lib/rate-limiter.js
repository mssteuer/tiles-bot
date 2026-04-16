/**
 * Lightweight in-memory rate limiter using an LRU-like Map.
 * Each key tracks hit count within a sliding window.
 *
 * Usage:
 *   import { checkRateLimit } from '@/lib/rate-limiter';
 *   const result = checkRateLimit('emotes', ip, 10, 60);
 *   if (!result.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(result.retryAfter) } });
 */

// Store: Map<key, { count, windowStart }>
const store = new Map();

// Evict entries older than 10 minutes to prevent unbounded growth
const EVICT_AGE_MS = 10 * 60 * 1000;
let lastEvict = Date.now();

function evictStale() {
  const now = Date.now();
  if (now - lastEvict < 60_000) return; // only evict every 60s
  lastEvict = now;
  for (const [k, v] of store.entries()) {
    if (now - v.windowStart > EVICT_AGE_MS) {
      store.delete(k);
    }
  }
}

/**
 * Check and record a rate limit hit.
 * @param {string} namespace  - e.g. 'emotes', 'messages', 'pixel-wars'
 * @param {string} identifier - IP address or tile ID
 * @param {number} limit      - max requests per window
 * @param {number} windowSec  - window size in seconds
 * @returns {{ allowed: boolean, retryAfter: number }}
 */
export function checkRateLimit(namespace, identifier, limit, windowSec) {
  evictStale();
  const key = `${namespace}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSec * 1000;

  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  entry.count += 1;
  return { allowed: true, retryAfter: 0 };
}

/**
 * Get client IP from a Next.js request.
 * Checks X-Forwarded-For first, then falls back to socket.
 * @param {Request} req
 * @returns {string}
 */
export function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
