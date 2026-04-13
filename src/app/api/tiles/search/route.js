import { NextResponse } from 'next/server';
import { getClaimedTiles } from '@/lib/db';

/**
 * GET /api/tiles/search
 *
 * Server-side search and filter for tiles. All params optional.
 *
 * Query params:
 *   q        - text search on name, description, xHandle (case-insensitive)
 *   category - filter by category (coding, trading, research, social, infrastructure, other)
 *   status   - filter by status (online, offline, idle, busy)
 *   owner    - filter by owner wallet address (case-insensitive)
 *   sort     - sort order: newest | oldest | most_rep | name | id (default: newest)
 *   limit    - max results (default: 50, max: 200)
 *   offset   - pagination offset (default: 0)
 *
 * Response: { tiles: [...], total, limit, offset, hasMore }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').toLowerCase().trim();
    const category = searchParams.get('category') || '';
    const status = searchParams.get('status') || '';
    const owner = (searchParams.get('owner') || '').toLowerCase();
    const sort = searchParams.get('sort') || 'newest';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // getClaimedTiles supports category filter, returns all claimed tiles
    // For other filters we apply in-memory (dataset is 428 tiles now, manageable)
    let tiles = getClaimedTiles({ category: category || null });

    // Text search
    if (q) {
      tiles = tiles.filter(t => {
        const name = (t.name || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const xHandle = (t.xHandle || '').toLowerCase();
        const githubUsername = (t.githubUsername || '').toLowerCase();
        return (
          name.includes(q) ||
          desc.includes(q) ||
          xHandle.includes(q) ||
          githubUsername.includes(q)
        );
      });
    }

    // Status filter
    if (status) {
      tiles = tiles.filter(t => t.status === status);
    }

    // Owner filter
    if (owner) {
      tiles = tiles.filter(t => (t.owner || '').toLowerCase() === owner);
    }

    // Sort
    switch (sort) {
      case 'oldest':
        tiles.sort((a, b) => new Date(a.claimedAt) - new Date(b.claimedAt));
        break;
      case 'most_rep':
        tiles.sort((a, b) => (b.repScore || 0) - (a.repScore || 0));
        break;
      case 'name':
        tiles.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'id':
        tiles.sort((a, b) => a.id - b.id);
        break;
      case 'newest':
      default:
        tiles.sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt));
    }

    const total = tiles.length;
    const page = tiles.slice(offset, offset + limit);

    return NextResponse.json(
      {
        tiles: page,
        total,
        limit,
        offset,
        hasMore: offset + page.length < total,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      }
    );
  } catch (err) {
    console.error('[/api/tiles/search] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
