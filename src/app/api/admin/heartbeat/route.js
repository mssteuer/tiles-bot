import { NextResponse } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * GET /api/admin/heartbeat
 * Simple health-check endpoint for monitoring and uptime checks.
 * Returns 200 with status, timestamp, and uptime info.
 */
export async function GET(request) {
  if (ADMIN_SECRET) {
    const auth = request.headers.get('x-admin-secret');
    if (auth !== ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.json({
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
