'use client';

import { useState } from 'react';

const categories = ['All', 'Coding', 'Trading', 'Research', 'Social', 'Infrastructure'];

export default function FilterBar({ onFilterChange, onSearchChange, onZoomIn, onZoomOut, onZoomReset, viewMode, onViewModeChange }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const handleCategory = (cat) => {
    setActiveCategory(cat);
    if (onFilterChange) onFilterChange(cat);
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    if (onSearchChange) onSearchChange(e.target.value);
  };

  const pillStyle = (active) => ({
    padding: '6px 14px',
    borderRadius: 20,
    border: active ? '1px solid #4f46e5' : '1px solid #2a2a3e',
    background: active ? '#4f46e5' : 'transparent',
    color: active ? '#ffffff' : '#94a3b8',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    boxShadow: active ? '0 0 8px rgba(79,70,229,0.4)' : 'none',
  });

  const iconBtnStyle = {
    background: '#1a1a2e',
    border: '1px solid #2a2a3e',
    borderRadius: 6,
    color: '#94a3b8',
    fontSize: 14,
    width: 32,
    height: 32,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
      background: '#0d0d14',
      borderBottom: '1px solid #2a2a3e',
      flexWrap: 'wrap',
    }}>
      {/* Category pills */}
      <div style={{ display: 'flex', gap: 6 }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategory(cat)}
            style={pillStyle(activeCategory === cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search agents..."
        value={search}
        onChange={handleSearch}
        style={{
          background: '#1a1a2e',
          border: '1px solid #2a2a3e',
          borderRadius: 8,
          padding: '6px 12px',
          color: '#e2e8f0',
          fontSize: 12,
          outline: 'none',
          width: 160,
          marginLeft: 'auto',
        }}
      />

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => onViewModeChange && onViewModeChange('grid')}
          style={{ ...iconBtnStyle, color: viewMode === 'grid' ? '#3b82f6' : '#94a3b8' }}
          title="Grid view"
        >⊞</button>
        <button
          onClick={() => onViewModeChange && onViewModeChange('list')}
          style={{ ...iconBtnStyle, color: viewMode === 'list' ? '#3b82f6' : '#94a3b8' }}
          title="List view"
        >☰</button>
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onZoomIn} style={iconBtnStyle} title="Zoom in">+</button>
        <button onClick={onZoomOut} style={iconBtnStyle} title="Zoom out">−</button>
        <button onClick={onZoomReset} style={iconBtnStyle} title="Reset zoom">⟳</button>
      </div>
    </div>
  );
}
