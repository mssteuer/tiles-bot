import { getTilesByOwner, getClaimedCount } from '@/lib/db';
import { NextResponse } from 'next/server';

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CASPER_PUBLIC_KEY_RE = /^(01|02)[0-9a-fA-F]{64}$/;
const CASPER_ACCOUNT_HASH_RE = /^account-hash-[0-9a-fA-F]{64}$/;

function isSupportedOwnerAddress(address) {
  return (
    EVM_ADDRESS_RE.test(address) ||
    CASPER_PUBLIC_KEY_RE.test(address) ||
    CASPER_ACCOUNT_HASH_RE.test(address)
  );
}

export async function GET(request, { params }) {
  try {
    const { address } = await params;
    
    if (!address || !isSupportedOwnerAddress(address)) {
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
