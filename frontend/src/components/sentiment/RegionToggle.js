// frontend/src/components/sentiment/RegionToggle.js
// Region toggle for switching between US and EU sentiment sources

import React from 'react';
import { Globe } from '../icons';
import './RegionToggle.css';

const REGIONS = [
  { key: 'US', label: 'US', icon: '🇺🇸', description: 'US markets & sources' },
  { key: 'EU', label: 'EU', icon: '🇪🇺', description: 'European markets & sources' },
  { key: 'UK', label: 'UK', icon: '🇬🇧', description: 'UK markets & sources' },
];

function RegionToggle({ value = 'US', onChange, showGlobal = false, compact = false }) {
  const regions = showGlobal
    ? [...REGIONS, { key: 'global', label: 'All', icon: Globe, description: 'All regions' }]
    : REGIONS;

  if (compact) {
    return (
      <div className="region-toggle compact">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="region-select"
        >
          {regions.map(region => (
            <option key={region.key} value={region.key}>
              {typeof region.icon === 'string' ? region.icon : ''} {region.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="region-toggle">
      <div className="region-toggle-group">
        {regions.map(region => {
          const isActive = value === region.key;
          const IconComponent = typeof region.icon === 'function' ? region.icon : null;

          return (
            <button
              key={region.key}
              className={`region-btn ${isActive ? 'active' : ''}`}
              onClick={() => onChange(region.key)}
              title={region.description}
            >
              {IconComponent ? (
                <IconComponent size={14} />
              ) : (
                <span className="region-flag">{region.icon}</span>
              )}
              <span className="region-label">{region.label}</span>
            </button>
          );
        })}
      </div>
      <span className="region-hint">
        {value === 'US' && 'Reddit, StockTwits, Yahoo Finance'}
        {value === 'EU' && 'EU subreddits, Google News EU, Investing.com'}
        {value === 'UK' && 'UK subreddits, Yahoo UK, Google News UK'}
        {value === 'global' && 'All sources combined'}
      </span>
    </div>
  );
}

export default RegionToggle;
