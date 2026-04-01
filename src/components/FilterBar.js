'use client';

import { useState } from 'react';

const categories = ['All', 'Coding', 'Trading', 'Research', 'Social', 'Infra'];

export default function FilterBar({ onFilterChange, onSearchChange, onZoomIn, onZoomOut, onZoomReset, viewMode, onViewModeChange }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const handleCategory = (cat) => {
    const mapped = cat === 'Infra' ? 'Infrastructure' : cat;
    setActiveCategory(cat);
    if (onFilterChange) onFilterChange(mapped);
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    if (onSearchChange) onSearchChange(e.target.value);
  };

  return (
    <div className="filter-bar">
      {/* Category pills */}
      <div className="filter-pills">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategory(cat)}
            className={`pill${activeCategory === cat ? ' active' : ''}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="filter-spacer" />

      {/* Search */}
      <input
        type="text"
        placeholder="Search name, @handle, wallet..."
        value={search}
        onChange={handleSearch}
        className="search-input"
      />

      {/* View toggle */}
      <div className="icon-btn-group">
        <button
          onClick={() => onViewModeChange && onViewModeChange('grid')}
          className={`icon-btn${viewMode === 'grid' ? ' active' : ''}`}
          title="Grid view"
        >⊞</button>
        <button
          onClick={() => onViewModeChange && onViewModeChange('list')}
          className={`icon-btn${viewMode === 'list' ? ' active' : ''}`}
          title="List view"
        >☰</button>
      </div>

      {/* Zoom controls */}
      <div className="icon-btn-group">
        <button onClick={onZoomIn} className="icon-btn" title="Zoom in">+</button>
        <button onClick={onZoomOut} className="icon-btn" title="Zoom out">−</button>
        <button onClick={onZoomReset} className="icon-btn" title="Reset zoom">⟳</button>
      </div>
    </div>
  );
}
