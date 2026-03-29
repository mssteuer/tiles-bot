import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { createTileSpan, getAllTileSpans } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

function getWalletFromRequest(request) {
  return request.headers.get('x-wallet') || request.headers.get('x-address') || null;
}

export async function GET() {
  const spans = getAllTileSpans({ includeNonReady: true });
  return NextResponse.json({ spans });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wallet = getWalletFromRequest(request) || body.wallet;
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required. Pass x-wallet header or wallet in JSON body.' }, { status: 401 });
  }

  const { topLeftId, width, height } = body;

  try {
    const span = createTileSpan({ topLeftId, width, height, owner: wallet });
    try {
      broadcast({ type: 'span_updated', spanId: span.id, topLeftId: span.topLeftId, status: span.status });
    } catch {}
    return NextResponse.json({ ok: true, span }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to create span' }, { status: 400 });
  }
}
