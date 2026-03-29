import { NextResponse } from 'next/server';
import { addNote, getNotes, deleteNote, getTile, getTileWebhookUrl } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';
import { logEvent } from '@/lib/db';
import { fireWebhook } from '@/lib/webhook';

export async function GET(req, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const notes = getNotes(tileId, Math.min(limit, 100), offset);

  // Enrich with author tile info
  const enriched = notes.map(n => {
    const authorTileData = n.author_tile ? getTile(n.author_tile) : null;
    return {
      id: n.id,
      tileId: n.tile_id,
      author: n.author,
      authorTile: n.author_tile,
      authorName: authorTileData?.name || null,
      authorAvatar: authorTileData?.avatar || null,
      authorImage: authorTileData?.imageUrl || authorTileData?.image_url || null,
      body: n.body,
      createdAt: n.created_at,
    };
  });
  return NextResponse.json({ notes: enriched });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  const body = await req.json();
  const { author, authorTile, text } = body;
  if (!author || !text?.trim()) {
    return NextResponse.json({ error: 'author and text required' }, { status: 400 });
  }
  const noteId = addNote(tileId, author, text.trim(), authorTile || null);
  logEvent('note_added', tileId, author, { noteId, authorTile });
  broadcast({ type: 'note_added', tileId, noteId, author, authorTile });

  // Fire webhook to tile owner (best-effort, non-blocking)
  const webhookUrl = getTileWebhookUrl(tileId);
  if (webhookUrl) {
    const tileData = getTile(tileId);
    const authorTileData = authorTile ? getTile(authorTile) : null;
    fireWebhook(webhookUrl, {
      event: 'note_added',
      tileId,
      tileName: tileData?.name || `Tile #${tileId}`,
      note: { id: noteId, author, authorTile: authorTile || null, body: text.trim() },
      from: authorTileData ? { id: authorTile, name: authorTileData.name, avatar: authorTileData.avatar } : null,
    });
  }

  return NextResponse.json({ ok: true, noteId });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const url = new URL(req.url);
  const noteId = parseInt(url.searchParams.get('noteId'), 10);
  const wallet = url.searchParams.get('wallet');
  if (!noteId || !wallet) {
    return NextResponse.json({ error: 'noteId and wallet required' }, { status: 400 });
  }
  deleteNote(noteId, wallet);
  return NextResponse.json({ ok: true });
}
