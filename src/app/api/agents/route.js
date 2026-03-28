import { NextResponse } from 'next/server';
import { getClaimedTiles } from '@/lib/db';

/**
 * GET /api/agents
 * Returns all claimed tiles as a browsable agent directory.
 * Query params:
 *   ?category=coding|trading|research|social|infrastructure|other
 *   ?q=search term (name or description)
 *   ?status=online|offline
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'all';
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const statusFilter = searchParams.get('status') || '';

  let tiles = getClaimedTiles({ category: category === 'all' ? null : category });

  // Apply search filter (server-side for SSR; client also filters)
  if (q) {
    tiles = tiles.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.xHandle && t.xHandle.toLowerCase().includes(q))
    );
  }

  // Apply status filter
  if (statusFilter === 'online') {
    tiles = tiles.filter(t => t.status === 'online');
  }

  // Category counts for the filter UI
  const allTiles = getClaimedTiles();
  const categoryCounts = allTiles.reduce((acc, t) => {
    const cat = t.category || 'uncategorized';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    agents: tiles.map(t => ({
      id: t.id,
      name: t.name,
      avatar: t.avatar,
      description: t.description,
      category: t.category || 'uncategorized',
      status: t.status,
      url: t.url,
      xHandle: t.xHandle,
      owner: t.owner,
      claimedAt: t.claimedAt,
      imageUrl: t.imageUrl,
      githubVerified: t.githubVerified,
      xVerified: t.xVerified,
    })),
    total: tiles.length,
    categoryCounts,
  });
}
