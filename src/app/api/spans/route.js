import { NextResponse } from 'next/server';
import { createTileSpan, getAllTileSpans } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export async function GET() {
  return NextResponse.json({ spans: getAllTileSpans() });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { topLeftId, width, height, wallet } = body;
  if (!wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }

  try {
    const span = createTileSpan({ topLeftId, width, height, owner: wallet });
    try {
      broadcast({ type: 'span_updated', spanId: span.id, topLeftId: span.topLeftId });
    } catch {}
    return NextResponse.json({ ok: true, span }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to create span' }, { status: 400 });
  }
}
