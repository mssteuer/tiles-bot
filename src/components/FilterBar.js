'use client';

import { useState } from 'react';

const categories = ['All', 'Coding', 'Trading', 'Research', 'Social', 'Infra'];
const chains = [
  { id: 'all', label: 'All chains', dot: 'bg-text-muted' },
  { id: 'base', label: 'Base', dot: 'bg-blue-400' },
  { id: 'casper', label: 'Casper', dot: 'bg-red-400' },
];

export default function FilterBar({ onFilterChange, onSearchChange, onChainFilterChange, onZoomIn, onZoomOut, onZoomReset, viewMode, onViewModeChange }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeChain, setActiveChain] = useState('all');
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

  const handleChain = (chain) => {
    setActiveChain(chain);
    if (onChainFilterChange) onChainFilterChange(chain);
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

      <div className="filter-pills" aria-label="Chain filter">
        {chains.map((chain) => (
          <button
            key={chain.id}
            onClick={() => handleChain(chain.id)}
            className={`pill inline-flex items-center gap-1.5${activeChain === chain.id ? ' active' : ''}`}
            title={`Show ${chain.label}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${chain.dot}`} />
            {chain.label}
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
