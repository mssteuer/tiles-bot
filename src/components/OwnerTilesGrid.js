'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { isUnnamedTile } from '@/lib/tileUtils';

function categoryPillStyle(color) {
  return {
    background: `${color}22`,
    border: `1px solid ${color}44`,
    color,
  };
}

const catColors = {
  coding: '#3b82f6',
  trading: '#f59e0b',
  research: '#8b5cf6',
  social: '#06b6d4',
  infrastructure: '#64748b',
  other: '#94a3b8',
  uncategorized: '#374151',
};

export default function OwnerTilesGrid({ initialTiles }) {
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const unnamed = initialTiles.filter(isUnnamedTile).length;
    return {
      all: initialTiles.length,
      unnamed,
      named: initialTiles.length - unnamed,
    };
  }, [initialTiles]);

  const tiles = useMemo(() => {
    if (filter === 'unnamed') return initialTiles.filter(isUnnamedTile);
    if (filter === 'named') return initialTiles.filter(tile => !isUnnamedTile(tile));
    return initialTiles;
  }, [initialTiles, filter]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[16px] font-bold text-text-dim">ALL TILES ({tiles.length})</h2>
        <div className="flex flex-wrap gap-2 text-[12px]">
          {[
            { id: 'all', label: `All (${counts.all})` },
            { id: 'unnamed', label: `Unnamed (${counts.unnamed})` },
            { id: 'named', label: `Named (${counts.named})` },
          ].map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`rounded-full border px-3 py-1 transition ${filter === option.id ? 'border-accent-blue bg-accent-blue/10 text-accent-blue' : 'border-border-dim bg-surface-alt text-text-light hover:border-border-bright'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {tiles.map(tile => {
          const pillColor = catColors[tile.category] || '#94a3b8';
          const unnamed = isUnnamedTile(tile);
          return (
            <Link key={tile.id} href={`/tiles/${tile.id}`} className="no-underline">
              <div className={`cursor-pointer rounded-xl border p-4 transition-colors ${tile.status === 'online' ? 'border-accent-green/30' : 'border-border-dim'} bg-surface-alt hover:border-border-bright`}>
                <div className="mb-2 flex items-center gap-2.5">
                  {tile.imageUrl ? (
                    <img src={tile.imageUrl} alt={tile.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[20px]">{tile.avatar || '🤖'}</div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate whitespace-nowrap text-[13px] font-bold text-text">{tile.name || `Tile #${tile.id}`}</div>
                    <div className="text-[11px] text-text-dim">#{tile.id}</div>
                  </div>
                </div>
                {tile.description && (
                  <p className="mb-2 overflow-hidden text-[11px] leading-[1.4] text-text-light [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{tile.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-[10px] px-2 py-0.5 text-[10px] ${unnamed ? 'bg-amber-400/10 text-amber-300' : 'bg-accent-green/10 text-accent-green'}`}>
                    {unnamed ? 'unnamed' : 'named'}
                  </span>
                  {tile.category && tile.category !== 'uncategorized' && (
                    <span className="rounded-[10px] px-2 py-0.5 text-[10px]" style={categoryPillStyle(pillColor)}>{tile.category}</span>
                  )}
                  {tile.status === 'online' && <span className="text-[10px] text-accent-green">● online</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
