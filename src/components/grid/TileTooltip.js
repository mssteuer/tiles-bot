'use client';

import { getThumbUrl } from './utils';

export default function TileTooltip({ tile, hoveredTile }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border-dim bg-[rgba(10,10,15,0.9)] px-4 py-2 text-[13px] backdrop-blur-[8px]">
      {tile.imageUrl ? (
        <img src={getThumbUrl(tile)} alt="" style={{ width: 20, height: 20, borderRadius: 3, objectFit: 'cover' }} />
      ) : (
        <span>{tile.avatar}</span>
      )}
      <strong>{tile.name}</strong>
      <span className="text-text-gray">#{hoveredTile}</span>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tile.status === 'online' ? '#22c55e' : '#ef4444' }} />
    </div>
  );
}
