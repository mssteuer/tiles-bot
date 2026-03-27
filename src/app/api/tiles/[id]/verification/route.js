import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getTile, setGithubVerification, clearGithubVerification, setXVerification, clearXVerification, TOTAL_TILES } from '@/lib/db';

/**
 * GET /api/tiles/:id/verification/challenge
 * Returns a challenge message for the tile owner to sign and post as proof.
 * The challenge is deterministic (tileId + owner address + "tiles.bot:verify:github" prefix).
 * No auth required — anyone can get the challenge for any tile.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  // Challenges are deterministic — tile ID + owner address prefix
  const githubChallenge = `tiles.bot:verify:github:${tileId}:${tile.owner.toLowerCase()}`;
  const xChallenge = `tiles.bot:verify:x:${tileId}:${tile.owner.toLowerCase()}`;

  return NextResponse.json({
    tileId,
    owner: tile.owner,
    github: {
      challenge: githubChallenge,
      instructions: [
        '1. Create a public GitHub Gist at https://gist.github.com',
        `2. Paste this exact string as the Gist content: ${githubChallenge}`,
        '3. Copy the Gist ID from the URL (e.g. https://gist.github.com/username/GIST_ID_HERE)',
        '4. POST /api/tiles/' + tileId + '/verification with {"type":"github","gistId":"GIST_ID","githubUsername":"YOUR_USERNAME"}',
      ],
    },
    x: {
      challenge: xChallenge,
      instructions: [
        '1. Post a public tweet containing this exact string:',
        xChallenge,
        '2. Copy the tweet URL (e.g. https://x.com/username/status/123456789)',
        '3. POST /api/tiles/' + tileId + '/verification with {"type":"x","tweetUrl":"TWEET_URL","xHandle":"YOUR_HANDLE"}',
      ],
    },
    // Keep top-level challenge for backwards compat
    challenge: githubChallenge,
    currentStatus: {
      githubVerified: tile.githubVerified,
      githubUsername: tile.githubUsername || null,
      xVerified: tile.xVerified,
      xHandleVerified: tile.xHandleVerified || null,
    },
  });
}

/**
 * POST /api/tiles/:id/verification
 * Verify a GitHub Gist containing the challenge string.
 * 
 * Body: { type: "github", gistId: "abc123", githubUsername: "myusername" }
 * Headers: X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature (EIP-191 auth)
 * 
 * Server fetches the Gist and checks it contains the expected challenge string.
 * On success: stores verified=true, githubUsername, gistId on the tile.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  // Verify wallet ownership (same EIP-191 auth as metadata update)
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSig = request.headers.get('X-Wallet-Signature');
  const walletMsg = request.headers.get('X-Wallet-Message');

  if (!walletAddress || !walletSig || !walletMsg) {
    return NextResponse.json(
      { error: 'Auth required (X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature headers)' },
      { status: 401 }
    );
  }

  // Validate message format: tiles.bot:metadata:{tileId}:{timestamp}
  const msgParts = walletMsg.split(':');
  if (msgParts.length !== 4 || msgParts[0] !== 'tiles.bot' || msgParts[1] !== 'metadata' || msgParts[2] !== String(tileId)) {
    return NextResponse.json({ error: 'Invalid auth message format' }, { status: 401 });
  }
  const msgTs = parseInt(msgParts[3], 10);
  const nowTs = Math.floor(Date.now() / 1000);
  if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
    return NextResponse.json({ error: 'Auth signature expired (10-minute window)' }, { status: 401 });
  }

  // Verify EIP-191 signature
  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyMessage(walletMsg, walletSig);
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Signer does not match claimed wallet address' }, { status: 401 });
  }
  if (recoveredAddress.toLowerCase() !== tile.owner.toLowerCase()) {
    return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
  }

  // Parse request body
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type } = body;

  if (type === 'github') {
    return handleGithubVerification(tileId, tile, body);
  }

  if (type === 'clear-github') {
    clearGithubVerification(tileId);
    return NextResponse.json({ ok: true, cleared: 'github', tileId });
  }

  if (type === 'x') {
    return handleXVerification(tileId, tile, body);
  }

  if (type === 'clear-x') {
    clearXVerification(tileId);
    return NextResponse.json({ ok: true, cleared: 'x', tileId });
  }

  return NextResponse.json({ error: 'Unknown verification type. Supported: "github", "clear-github", "x", "clear-x"' }, { status: 400 });
}

/**
 * Verify GitHub identity by checking a Gist contains the expected challenge string.
 */
async function handleGithubVerification(tileId, tile, body) {
  const { gistId, githubUsername } = body;

  if (!gistId || typeof gistId !== 'string' || !gistId.match(/^[a-zA-Z0-9]{20,40}$/)) {
    return NextResponse.json({ error: 'Invalid gistId format (must be a 20–40 char alphanumeric gist ID)' }, { status: 400 });
  }
  if (!githubUsername || typeof githubUsername !== 'string' || !githubUsername.match(/^[a-zA-Z0-9-]{1,39}$/)) {
    return NextResponse.json({ error: 'Invalid githubUsername format' }, { status: 400 });
  }

  // Expected challenge string
  const expectedChallenge = `tiles.bot:verify:github:${tileId}:${tile.owner.toLowerCase()}`;

  // Fetch the Gist from GitHub API (no auth required for public gists)
  let gistData;
  try {
    const gistRes = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'User-Agent': 'tiles-bot-verification/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (gistRes.status === 404) {
      return NextResponse.json({ error: 'Gist not found (must be public)' }, { status: 422 });
    }
    if (!gistRes.ok) {
      return NextResponse.json({ error: `GitHub API error: ${gistRes.status}` }, { status: 502 });
    }

    gistData = await gistRes.json();
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch gist: ${err.message}` }, { status: 502 });
  }

  // Verify gist owner matches claimed username
  const gistOwner = gistData.owner?.login?.toLowerCase();
  if (gistOwner !== githubUsername.toLowerCase()) {
    return NextResponse.json(
      { error: `Gist is owned by ${gistOwner}, not ${githubUsername}` },
      { status: 422 }
    );
  }

  // Check gist files for the challenge string
  const files = gistData.files || {};
  let found = false;
  for (const file of Object.values(files)) {
    const content = file.content || '';
    if (content.includes(expectedChallenge)) {
      found = true;
      break;
    }
  }

  if (!found) {
    return NextResponse.json(
      {
        error: 'Challenge string not found in gist',
        expected: expectedChallenge,
        gistId,
        hint: 'Create a public gist with the exact challenge string as the content',
      },
      { status: 422 }
    );
  }

  // Store verification
  setGithubVerification(tileId, githubUsername, gistId);

  return NextResponse.json({
    ok: true,
    tileId,
    verified: 'github',
    githubUsername,
    gistId,
    gistUrl: `https://gist.github.com/${githubUsername}/${gistId}`,
    message: `GitHub identity verified for tile #${tileId}. Verified as @${githubUsername}.`,
  });
}

/**
 * Verify X/Twitter identity via a public tweet containing the challenge string.
 * The tweet URL is provided by the owner. We fetch the tweet via nitter/oembed
 * fallback to check it contains the expected challenge.
 *
 * Flow:
 * 1. Owner tweets: "tiles.bot:verify:x:{tileId}:{ownerAddress}"
 * 2. Owner provides tweet URL + their X handle
 * 3. Server extracts tweet ID, fetches via Twitter oEmbed API (no auth required)
 * 4. Checks that tweet text contains the challenge string
 * 5. Checks that the tweet is from the claimed handle
 */
async function handleXVerification(tileId, tile, body) {
  const { tweetUrl, xHandle } = body;

  if (!xHandle || typeof xHandle !== 'string' || !xHandle.match(/^@?[a-zA-Z0-9_]{1,50}$/)) {
    return NextResponse.json({ error: 'Invalid xHandle format' }, { status: 400 });
  }

  if (!tweetUrl || typeof tweetUrl !== 'string') {
    return NextResponse.json({ error: 'tweetUrl is required' }, { status: 400 });
  }

  // Parse tweet ID from URL patterns:
  // https://x.com/username/status/1234567890
  // https://twitter.com/username/status/1234567890
  const tweetUrlMatch = tweetUrl.match(/(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)/i);
  if (!tweetUrlMatch) {
    return NextResponse.json({ error: 'Invalid tweet URL format. Expected: https://x.com/username/status/TWEET_ID' }, { status: 400 });
  }

  const tweetId = tweetUrlMatch[2];
  const cleanHandle = xHandle.startsWith('@') ? xHandle.slice(1).toLowerCase() : xHandle.toLowerCase();

  // Expected challenge string
  const expectedChallenge = `tiles.bot:verify:x:${tileId}:${tile.owner.toLowerCase()}`;

  // Fetch tweet via Twitter oEmbed API (no auth, public tweets only)
  let tweetText;
  let canonicalHandle;
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
    const oembedRes = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'tiles-bot-verification/1.0' },
    });

    if (oembedRes.status === 404) {
      return NextResponse.json({ error: 'Tweet not found (must be public)' }, { status: 422 });
    }
    if (!oembedRes.ok) {
      return NextResponse.json({ error: `Twitter oEmbed API error: ${oembedRes.status}` }, { status: 502 });
    }

    const oembedData = await oembedRes.json();
    canonicalHandle = oembedData.author_url?.split('/').filter(Boolean).pop()?.toLowerCase() || null;
    if (!canonicalHandle) {
      return NextResponse.json({ error: 'Could not determine tweet author from Twitter response' }, { status: 502 });
    }
    if (canonicalHandle !== cleanHandle) {
      return NextResponse.json(
        { error: `Tweet author does not match claimed handle (tweet is by @${canonicalHandle}, claimed @${cleanHandle})` },
        { status: 422 }
      );
    }

    // oEmbed returns HTML like: <p>some text</p>&mdash; @handle
    // Strip HTML tags to get raw text
    tweetText = (oembedData.html || '').replace(/<[^>]+>/g, ' ').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch tweet: ${err.message}` }, { status: 502 });
  }

  if (!tweetText.includes(expectedChallenge)) {
    return NextResponse.json(
      {
        error: 'Challenge string not found in tweet',
        expected: expectedChallenge,
        tweetId,
        hint: 'Post a public tweet containing the exact challenge string',
      },
      { status: 422 }
    );
  }

  // Store X verification using the canonical handle returned by Twitter
  setXVerification(tileId, canonicalHandle, tweetUrl);

  return NextResponse.json({
    ok: true,
    tileId,
    verified: 'x',
    xHandle: canonicalHandle,
    tweetUrl,
    tweetId,
    message: `X/Twitter identity verified for tile #${tileId}. Verified as @${canonicalHandle}.`,
  });
}
