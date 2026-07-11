const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const helperPath = path.join(ROOT, 'src/lib/rate-limiter.js');

function loadHelper() {
  const source = fs.readFileSync(helperPath, 'utf8');
  const transformed = source.replace(/export\s+function\s+/g, 'function ');
  // eslint-disable-next-line no-new-func
  return new Function(`${transformed}\nreturn { checkRateLimit, getClientIp };`)();
}

function withMockedNow(nowMs, fn) {
  const originalNow = Date.now;
  Date.now = () => nowMs;
  try {
    return fn((nextNowMs) => {
      nowMs = nextNowMs;
    });
  } finally {
    Date.now = originalNow;
  }
}

function requestWithHeaders(headers) {
  return { headers: new Headers(headers) };
}

function run() {
  withMockedNow(Date.parse('2026-07-11T12:00:00Z'), (setNow) => {
    const { checkRateLimit } = loadHelper();

    assert.deepEqual(checkRateLimit('emotes', '203.0.113.10', 2, 60), {
      allowed: true,
      retryAfter: 0,
    });
    assert.deepEqual(checkRateLimit('emotes', '203.0.113.10', 2, 60), {
      allowed: true,
      retryAfter: 0,
    });

    const blocked = checkRateLimit('emotes', '203.0.113.10', 2, 60);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfter, 60);

    assert.equal(
      checkRateLimit('messages', '203.0.113.10', 2, 60).allowed,
      true,
      'separate namespaces do not share buckets'
    );
    assert.equal(
      checkRateLimit('emotes', '198.51.100.5', 2, 60).allowed,
      true,
      'separate identifiers do not share buckets'
    );

    setNow(Date.parse('2026-07-11T12:00:59.100Z'));
    assert.equal(
      checkRateLimit('emotes', '203.0.113.10', 2, 60).retryAfter,
      1,
      'retryAfter never drops below one second while blocked'
    );

    setNow(Date.parse('2026-07-11T12:01:00Z'));
    assert.deepEqual(checkRateLimit('emotes', '203.0.113.10', 2, 60), {
      allowed: true,
      retryAfter: 0,
    });
  });

  const { getClientIp } = loadHelper();
  assert.equal(
    getClientIp(requestWithHeaders({
      'x-real-ip': ' 198.51.100.9 ',
      'x-forwarded-for': '10.0.0.1, 203.0.113.88',
    })),
    '198.51.100.9',
    'x-real-ip wins because nginx overwrites it'
  );
  assert.equal(
    getClientIp(requestWithHeaders({
      'x-forwarded-for': '198.51.100.1, 10.0.0.2, 203.0.113.44',
    })),
    '203.0.113.44',
    'rightmost x-forwarded-for entry is the trusted nginx-appended client IP'
  );
  assert.equal(getClientIp(requestWithHeaders({})), 'unknown');

  console.log('rate limiter tests: ok');
}

run();
