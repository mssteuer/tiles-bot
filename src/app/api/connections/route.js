import { NextResponse } from 'next/server';
import { getAllConnections } from '@/lib/db';

/**
 * GET /api/connections
 * Returns all tile connections for rendering the neighbor network on the grid.
 * No auth required — connections are public.
 * Response: { connections: [{ fromId, toId, label }], count }
 */
export async function GET() {
  const connections = getAllConnections();
  return NextResponse.json(
    { connections, count: connections.length },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
