import { getTilesByOwner, getClaimedCount } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { address } = await params;
    
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const tiles = getTilesByOwner(address);
    
    // Stats
    const totalTiles = tiles.length;
    const namedTiles = tiles.filter(t => t.name && !t.name.startsWith('Tile #')).length;
    const onlineTiles = tiles.filter(t => t.status === 'online').length;
    const withImages = tiles.filter(t => t.imageUrl).length;
    const withDescriptions = tiles.filter(t => t.description).length;
    const categories = {};
    tiles.forEach(t => {
      const cat = t.category || 'uncategorized';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    return NextResponse.json({
      owner: address,
      tiles,
      stats: {
        totalTiles,
        namedTiles,
        namedPercent: totalTiles > 0 ? Math.round((namedTiles / totalTiles) * 100) : 0,
        onlineTiles,
        withImages,
        withDescriptions,
        categories,
      }
    });
  } catch (err) {
    console.error('Owner tiles error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
