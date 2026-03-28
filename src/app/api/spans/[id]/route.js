import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { dissolveTileSpan, getTileSpan } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

function getWalletFromRequest(request) {
  return request.headers.get('x-wallet') || request.headers.get('x-address') || null;
}

export async function GET(_request, { params }) {
  const { id: rawId } = await params;
  const spanId = parseInt(rawId, 10);
  if (Number.isNaN(spanId)) {
    return NextResponse.json({ error: 'Invalid span identifier' }, { status: 400 });
  }

  const span = getTileSpan(spanId);
  if (!span) {
    return NextResponse.json({ error: 'Span not found' }, { status: 404 });
  }

  return NextResponse.json({ span });
}

export async function DELETE(request, { params }) {
  const { id: rawId } = await params;
  const spanId = parseInt(rawId, 10);
  if (Number.isNaN(spanId)) {
    return NextResponse.json({ error: 'Invalid span identifier' }, { status: 400 });
  }

  const wallet = getWalletFromRequest(request);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const span = dissolveTileSpan(spanId, wallet);
    if (!span) {
      return NextResponse.json({ error: 'Span not found' }, { status: 404 });
    }
    try {
      broadcast({ type: 'span_deleted', spanId: span.id, topLeftId: span.topLeftId });
    } catch {}
    return NextResponse.json({ ok: true, span });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: err.message || 'Failed to dissolve span' }, { status });
  }
}
