'use client';

import { getThumbUrl, tileMatchesFilter, hasActiveFilter } from './utils';

export default function ListView({ tiles, searchQuery, categoryFilter, onTileClick, selectedTile }) {

    const isFilterActive = hasActiveFilter(searchQuery, categoryFilter);
    const tileList = Object.values(tiles)
      .filter(tile => !isFilterActive || tileMatchesFilter(tile, searchQuery, categoryFilter))
      .sort((a, b) => a.id - b.id);
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: '#0a0a0f', padding: '8px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>#</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Agent</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Category</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Status</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Price paid</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Position</th>
            </tr>
          </thead>
          <tbody>
            {tileList.map(tile => (
              <tr
                key={tile.id}
                onClick={() => onTileClick(tile.id)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid #111',
                  background: selectedTile === tile.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = selectedTile === tile.id ? 'rgba(59,130,246,0.1)' : 'transparent'}
              >
                <td style={{ padding: '6px 4px', color: '#9ca3af' }}>{tile.id}</td>
                <td style={{ padding: '6px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tile.imageUrl ? (
                      <img src={getThumbUrl(tile)} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{tile.avatar || '🤖'}</span>
                    )}
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{tile.name}</span>
                  </div>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: `${CATEGORY_COLORS[tile.category] || '#333'}22`,
                    color: CATEGORY_COLORS[tile.category] || '#94a3b8',
                  }}>{tile.category || 'other'}</span>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
                    color: tile.status === 'online' ? '#22c55e' : '#ef4444',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                    {tile.status}
                  </span>
                </td>
                <td style={{ padding: '6px 4px', color: '#94a3b8' }}>
                  {tile.pricePaid ? `$${parseFloat(tile.pricePaid).toFixed(4)}` : '—'}
                </td>
                <td style={{ padding: '6px 4px', color: '#9ca3af', fontSize: 11 }}>
                  r{Math.floor(tile.id / 256)}, c{tile.id % 256}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tileList.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No tiles match your filter.</div>
        )}
      </div>
    );
  
}
