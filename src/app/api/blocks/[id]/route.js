import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getBlock, updateBlockMetadata } from '@/lib/db';

/**
 * GET /api/blocks/:id
 * Returns a single block record.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const blockId = parseInt(id, 10);
  if (isNaN(blockId)) {
    return NextResponse.json({ error: 'Invalid block ID' }, { status: 400 });
  }
  const block = getBlock(blockId);
  if (!block) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }
  return NextResponse.json(block);
}

/**
 * PUT /api/blocks/:id
 * Update block metadata (name, avatar, description, category, color, url, imageUrl).
 * Requires X-Wallet header matching block owner.
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  const blockId = parseInt(id, 10);
  if (isNaN(blockId)) {
    return NextResponse.json({ error: 'Invalid block ID' }, { status: 400 });
  }

  const block = getBlock(blockId);
  if (!block) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }

  const wallet = request.headers.get('X-Wallet');
  if (!wallet || wallet !== block.owner) {
    return NextResponse.json({ error: 'Unauthorized — must be block owner' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated = updateBlockMetadata(blockId, body);
  return NextResponse.json(updated);
}
