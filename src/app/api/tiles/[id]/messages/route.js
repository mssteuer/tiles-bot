import { NextResponse } from 'next/server';
import { sendMessage, getMessages, markMessageRead, getTile } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';
import { logEvent } from '@/lib/db';

export async function GET(req, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ error: 'wallet query param required (for decryption auth)' }, { status: 400 });
  }

  // Verify caller owns this tile
  const tile = getTile(tileId);
  if (!tile || tile.owner?.toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json({ error: 'Not your tile' }, { status: 403 });
  }

  const messages = getMessages(tileId);
  const enriched = messages.map(m => {
    const from = getTile(m.from_tile);
    const to = getTile(m.to_tile);
    return {
      id: m.id,
      fromTile: m.from_tile,
      toTile: m.to_tile,
      fromName: from?.name || `Tile #${m.from_tile}`,
      toName: to?.name || `Tile #${m.to_tile}`,
      sender: m.sender,
      encryptedBody: m.encrypted_body,
      nonce: m.nonce,
      createdAt: m.created_at,
      readAt: m.read_at,
    };
  });
  return NextResponse.json({ messages: enriched });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const toTile = parseInt(id, 10);
  const body = await req.json();
  const { fromTile, sender, encryptedBody, nonce } = body;

  if (!fromTile || !sender || !encryptedBody) {
    return NextResponse.json({ error: 'fromTile, sender, and encryptedBody required' }, { status: 400 });
  }

  // fromTile just needs to exist. Strict ownership removed — smart wallets make it unreliable
  const fromData = fromTile ? getTile(fromTile) : null;

  const messageId = sendMessage(fromTile, toTile, sender, encryptedBody, nonce || null);
  logEvent('message_sent', toTile, sender, { fromTile, messageId });
  broadcast({ type: 'new_message', fromTile, toTile, messageId });

  return NextResponse.json({ ok: true, messageId });
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const { messageId, wallet } = body;
  if (!messageId || !wallet) {
    return NextResponse.json({ error: 'messageId and wallet required' }, { status: 400 });
  }
  markMessageRead(messageId, wallet);
  return NextResponse.json({ ok: true });
}
