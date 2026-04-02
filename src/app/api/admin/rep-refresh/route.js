import { NextResponse } from 'next/server';
import { refreshAllRepScores } from '@/lib/db';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * POST /api/admin/rep-refresh
 * Recomputes and persists rep scores for all claimed tiles.
 * Requires ADMIN_SECRET header (or open if not configured).
 */
export async function POST(request) {
  if (ADMIN_SECRET) {
    const auth = request.headers.get('x-admin-secret');
    if (auth !== ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = refreshAllRepScores();
  return NextResponse.json({ ok: true, ...result });
}
