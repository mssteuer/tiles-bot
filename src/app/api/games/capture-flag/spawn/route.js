import { NextResponse } from 'next/server';
import { spawnCtfFlag } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

// Internal endpoint to spawn a new CTF flag.
// Called by cron or admin. No auth required (server-side only trigger).
export async function POST() {
  try {
    const result = spawnCtfFlag();
    if (result.spawned) {
      broadcast({ type: 'ctf_flag_spawned', ctfFlag: result.flag });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to spawn flag' }, { status: 500 });
  }
}
