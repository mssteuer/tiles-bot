import { NextResponse } from 'next/server';
import { spawnCtfFlag } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Internal endpoint to spawn a new CTF flag.
// Called by cron or admin. Requires ADMIN_SECRET header when configured.
export async function POST(request) {
  if (ADMIN_SECRET) {
    const auth = request.headers.get('x-admin-secret');
    if (auth !== ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = spawnCtfFlag();
    if (result.error) {
      return NextResponse.json(result, { status: 500 });
    }
    if (result.spawned) {
      broadcast({ type: 'ctf_flag_spawned', ctfFlag: result.flag });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to spawn flag' }, { status: 500 });
  }
}
