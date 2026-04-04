'use client';

import { useState, useEffect, useCallback } from 'react';

const ROTATION_INTERVAL = 4000; // 4s per slide

function TileCard({ item, onClick }) {
  const { tile, endsAt } = item;
  const expires = new Date(endsAt);
  const hoursLeft = Math.max(0, Math.round((expires - Date.now()) / 3600000));

  return (
    <button
      className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-alt p-4 text-center transition-all hover:border-accent-blue hover:shadow-lg hover:shadow-accent-blue/10 focus:outline-none focus:ring-2 focus:ring-accent-blue"
      onClick={onClick}
      title={`View ${tile.name || `Tile #${tile.id}`}`}
    >
      {/* Avatar */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-xl text-3xl flex-shrink-0 ring-2 ring-accent-blue/30 transition-all group-hover:ring-accent-blue"
        style={{ background: tile.color ? `${tile.color}22` : '#1a1a2e', border: `2px solid ${tile.color || '#3b82f6'}33` }}
      >
        {tile.image_url
          ? <img src={tile.image_url} alt={tile.name || ''} className="h-full w-full rounded-xl object-cover" />
          : <span>{tile.avatar || '🤖'}</span>}
      </div>

      {/* Name + category */}
      <div>
        <p className="text-sm font-bold text-text-main truncate max-w-[140px]">{tile.name || `Tile #${tile.id}`}</p>
        {tile.category && (
          <span className="text-[10px] text-text-dim capitalize">{tile.category}</span>
        )}
      </div>

      {/* Description */}
      {tile.description && (
        <p className="text-[11px] text-text-dim line-clamp-2 max-w-[140px]">{tile.description}</p>
      )}

      {/* Status + expiry */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${tile.status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
        <span className="text-[10px] text-text-dim">{hoursLeft}h left</span>
      </div>

      {/* Spotlight badge */}
      <span className="mt-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
        ⭐ Spotlight
      </span>
    </button>
  );
}

/**
 * FeaturedSpotlight — rotating carousel of tiles that purchased spotlight placement.
 * Shown near the top of the homepage when ≥1 active spotlights exist.
 */
export default function FeaturedSpotlight({ onTileSelect }) {
  const [featured, setFeatured] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchFeatured = useCallback(async () => {
    try {
      const res = await fetch('/api/featured');
      if (!res.ok) return;
      const data = await res.json();
      setFeatured(data.featured || []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatured();
    // Refresh every 5 minutes
    const interval = setInterval(fetchFeatured, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFeatured]);

  // Rotate active card
  useEffect(() => {
    if (featured.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIdx(i => (i + 1) % featured.length);
    }, ROTATION_INTERVAL);
    return () => clearInterval(timer);
  }, [featured.length]);

  if (loading || featured.length === 0) return null;

  // Show up to 5 cards at a time (desktop), fewer on mobile
  const visibleCount = Math.min(featured.length, 5);
  const startIdx = featured.length <= 5 ? 0 : activeIdx % featured.length;
  const visible = [];
  for (let i = 0; i < visibleCount; i++) {
    visible.push(featured[(startIdx + i) % featured.length]);
  }

  return (
    <section className="border-b border-border bg-gradient-to-r from-[#0d0d2b] to-[#0a0a1f] px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-sm">⭐</span>
          <h2 className="text-sm font-semibold text-text-main">Featured Agents</h2>
          <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] text-yellow-400 font-medium">
            {featured.length} spotlight{featured.length !== 1 ? 's' : ''}
          </span>
        </div>
        {featured.length > visibleCount && (
          <div className="flex items-center gap-1">
            {featured.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeIdx % featured.length ? 'w-4 bg-accent-blue' : 'w-1.5 bg-gray-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {visible.map((item) => (
          <div key={item.featuredId} className="flex-shrink-0">
            <TileCard
              item={item}
              onClick={() => onTileSelect?.(item.tileId)}
            />
          </div>
        ))}
        {/* CTA: buy spotlight */}
        <div className="flex flex-shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt/50 p-4 text-center w-[164px]">
          <span className="text-2xl mb-2">✨</span>
          <p className="text-xs font-semibold text-text-main mb-1">Get Spotlighted</p>
          <p className="text-[10px] text-text-dim mb-3">$5 USDC / 24h<br />High-visibility placement</p>
          <a
            href="#spotlight-info"
            className="rounded-lg bg-yellow-500/20 px-3 py-1 text-[11px] font-semibold text-yellow-400 hover:bg-yellow-500/30 transition-colors"
            onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('open-spotlight-info')); }}
          >
            Learn More
          </a>
        </div>
      </div>
    </section>
  );
}
