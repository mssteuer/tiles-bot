'use client';

import { CATEGORY_COLORS, getThumbUrl, tileMatchesFilter, hasActiveFilter } from './utils';

export default function ListView({ tiles, searchQuery, categoryFilter, onTileClick, selectedTile }) {
  const isFilterActive = hasActiveFilter(searchQuery, categoryFilter);
  const tileList = Object.values(tiles)
    .filter(tile => !isFilterActive || tileMatchesFilter(tile, searchQuery, categoryFilter))
    .sort((a, b) => a.id - b.id);

  return (
    <div className="flex-1 overflow-y-auto bg-bg px-4 py-2">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[1px] text-text-muted">
            <th className="border-b border-border-dim px-1 py-2">#</th>
            <th className="border-b border-border-dim px-1 py-2">Agent</th>
            <th className="border-b border-border-dim px-1 py-2">Category</th>
            <th className="border-b border-border-dim px-1 py-2">X / GitHub</th>
            <th className="border-b border-border-dim px-1 py-2">Status</th>
            <th className="border-b border-border-dim px-1 py-2">Price paid</th>
            <th className="border-b border-border-dim px-1 py-2">Position</th>
          </tr>
        </thead>
        <tbody>
          {tileList.map(tile => {
            const categoryColor = CATEGORY_COLORS[tile.category] || '#94a3b8';
            const isSelected = selectedTile === tile.id;
            const isOnline = tile.status === 'online';
            return (
              <tr
                key={tile.id}
                onClick={() => onTileClick(tile.id)}
                className={`cursor-pointer border-b border-black/70 transition-colors hover:bg-white/4 ${isSelected ? 'bg-accent-blue/10' : 'bg-transparent'}`}
              >
                <td className="px-1 py-1.5 text-text-muted">{tile.id}</td>
                <td className="px-1 py-1.5">
                  <div className="flex items-center gap-2">
                    {tile.imageUrl ? (
                      <img src={getThumbUrl(tile)} alt="" className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <span className="text-[18px] leading-none">{tile.avatar || '🤖'}</span>
                    )}
                    <span className="font-medium text-text">{tile.name}</span>
                  </div>
                </td>
                <td className="px-1 py-1.5">
                  <span
                    className="category-badge"
                    style={{ '--category-bg': `${categoryColor}22`, '--category-color': categoryColor }}
                  >
                    {tile.category || 'other'}
                  </span>
                </td>
                <td className="px-1 py-1.5 text-[12px] text-text-muted">
                  {tile.xHandle ? (
                    <span title={`@${tile.xHandle.replace(/^@/, '')}`}>𝕏 {tile.xHandle.replace(/^@/, '')}</span>
                  ) : tile.githubUsername ? (
                    <span title={tile.githubUsername}>⊙ {tile.githubUsername}</span>
                  ) : '—'}
                </td>
                <td className="px-1 py-1.5">
                  <span className={`inline-flex items-center gap-1 text-[12px] ${isOnline ? 'text-accent-green' : 'text-accent-red'}`}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                    {tile.status}
                  </span>
                </td>
                <td className="px-1 py-1.5 text-text-gray">
                  {tile.pricePaid ? `$${parseFloat(tile.pricePaid).toFixed(4)}` : '—'}
                </td>
                <td className="px-1 py-1.5 text-[11px] text-text-muted">
                  r{Math.floor(tile.id / 256)}, c{tile.id % 256}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tileList.length === 0 && (
        <div className="p-10 text-center text-text-muted">No tiles match your filter.</div>
      )}
    </div>
  );
}
