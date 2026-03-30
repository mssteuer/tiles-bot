'use client';

import { getThumbUrl } from './utils';

export default function TileTooltip({ tile, hoveredTile }) {
  const isOnline = tile.status === 'online';

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border-dim bg-surface-dark/90 px-4 py-2 text-[13px] backdrop-blur-[8px]">
      {tile.imageUrl ? (
        <img src={getThumbUrl(tile)} alt="" className="h-5 w-5 rounded-[3px] object-cover" />
      ) : (
        <span>{tile.avatar}</span>
      )}
      <strong>{tile.name}</strong>
      <span className="text-text-gray">#{hoveredTile}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-accent-green' : 'bg-accent-red'}`} />
    </div>
  );
}
