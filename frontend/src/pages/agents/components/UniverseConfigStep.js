// frontend/src/pages/agents/components/UniverseConfigStep.js
// Universe Configuration Component for stock filtering

import React, { useState } from 'react';
import {
  Globe,
  Building2,
  Filter,
  TrendingUp,
  DollarSign,
  Layers,
  Check,
  X
} from '../../../components/icons';

// Sector options
const SECTORS = [
  { id: 'Technology', label: 'Technology', color: '#2563EB' },
  { id: 'Healthcare', label: 'Healthcare', color: '#059669' },
  { id: 'Financials', label: 'Financials', color: '#D97706' },
  { id: 'Consumer Discretionary', label: 'Consumer Disc.', color: '#7C3AED' },
  { id: 'Consumer Staples', label: 'Consumer Staples', color: '#7C3AED' },
  { id: 'Industrials', label: 'Industrials', color: '#94A3B8' },
  { id: 'Energy', label: 'Energy', color: '#DC2626' },
  { id: 'Utilities', label: 'Utilities', color: '#0891B2' },
  { id: 'Materials', label: 'Materials', color: '#059669' },
  { id: 'Real Estate', label: 'Real Estate', color: '#D97706' },
  { id: 'Communication Services', label: 'Communication', color: '#7C3AED' }
];

// Market cap presets (excludes 'all' from multi-select options)
const MARKET_CAP_PRESETS = [
  { id: 'mega', label: 'Mega Cap', min: 200e9, max: null, description: '>$200B' },
  { id: 'large', label: 'Large Cap', min: 10e9, max: 200e9, description: '$10B-$200B' },
  { id: 'mid', label: 'Mid Cap', min: 2e9, max: 10e9, description: '$2B-$10B' },
  { id: 'small', label: 'Small Cap', min: 300e6, max: 2e9, description: '$300M-$2B' },
  { id: 'micro', label: 'Micro Cap', min: 50e6, max: 300e6, description: '$50M-$300M' }
];

// Helper to compute merged market cap range from selected presets
const computeMergedRange = (selectedPresetIds) => {
  if (selectedPresetIds.length === 0) {
    return { min: 50e6, max: null }; // Default: all caps
  }

  const selectedPresets = MARKET_CAP_PRESETS.filter(p => selectedPresetIds.includes(p.id));

  // Min is the lowest min of all selected
  const min = Math.min(...selectedPresets.map(p => p.min));

  // Max is the highest max (null means no limit, so if any is null, result is null)
  const maxValues = selectedPresets.map(p => p.max);
  const max = maxValues.includes(null) ? null : Math.max(...maxValues);

  return { min, max };
};

function UniverseConfigStep({ config, onChange, onConfigChange }) {
  const [activeTab, setActiveTab] = useState('marketCap');

  // Support both prop naming conventions
  const handleChange = onChange || onConfigChange;

  // Track selected market cap presets for multi-select
  const selectedCapPresets = config.selectedCapPresets || [];

  const updateConfig = (field, value) => {
    if (handleChange) {
      handleChange({ ...config, [field]: value });
    }
  };

  const toggleSector = (sectorId, type) => {
    const field = type === 'include' ? 'sectors' : 'excludedSectors';
    const current = config[field] || [];
    const updated = current.includes(sectorId)
      ? current.filter(s => s !== sectorId)
      : [...current, sectorId];
    updateConfig(field, updated);
  };

  const handleMarketCapPreset = (preset) => {
    // Multi-select: toggle the preset in selectedCapPresets
    const currentSelected = config.selectedCapPresets || [];
    let newSelected;

    if (currentSelected.includes(preset.id)) {
      // Remove if already selected
      newSelected = currentSelected.filter(id => id !== preset.id);
    } else {
      // Add to selection
      newSelected = [...currentSelected, preset.id];
    }

    // Compute merged range from selected presets
    const { min, max } = computeMergedRange(newSelected);

    if (handleChange) {
      handleChange({
        ...config,
        selectedCapPresets: newSelected,
        minMarketCap: min,
        maxMarketCap: max
      });
    }
  };

  const selectAllCaps = () => {
    // Convenience button to select all caps (clear selection = all)
    if (handleChange) {
      handleChange({
        ...config,
        selectedCapPresets: [],
        minMarketCap: 50e6,
        maxMarketCap: null
      });
    }
  };

  return (
    <div className="universe-config-step">
      {/* Header */}
      <div className="universe-header">
        <Globe size={24} />
        <div className="header-text">
          <h3>Universe Configuration</h3>
          <p>Define which stocks the strategy will consider</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="universe-tabs">
        <button
          className={`tab-btn ${activeTab === 'marketCap' ? 'active' : ''}`}
          onClick={() => setActiveTab('marketCap')}
        >
          <DollarSign size={16} />
          Market Cap
        </button>
        <button
          className={`tab-btn ${activeTab === 'sectors' ? 'active' : ''}`}
          onClick={() => setActiveTab('sectors')}
        >
          <Building2 size={16} />
          Sectors
        </button>
        <button
          className={`tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
          onClick={() => setActiveTab('filters')}
        >
          <Filter size={16} />
          Quality Filters
        </button>
      </div>

      {/* Market Cap Tab */}
      {activeTab === 'marketCap' && (
        <div className="tab-content">
          <div className="cap-presets">
            <h4>Select Market Cap Ranges</h4>
            <p className="section-desc">Select one or more to combine ranges</p>
            <div className="preset-buttons multi-select">
              {MARKET_CAP_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className={`cap-preset-btn checkbox-style ${
                    selectedCapPresets.includes(preset.id) ? 'active' : ''
                  }`}
                  onClick={() => handleMarketCapPreset(preset)}
                >
                  <span className="preset-checkbox">
                    {selectedCapPresets.includes(preset.id) && <Check size={12} />}
                  </span>
                  <span className="preset-label">{preset.label}</span>
                  <span className="preset-desc">{preset.description}</span>
                </button>
              ))}
              <button
                className={`cap-preset-btn all-caps ${selectedCapPresets.length === 0 ? 'active' : ''}`}
                onClick={selectAllCaps}
              >
                <span className="preset-label">All Caps</span>
                <span className="preset-desc">&gt;$50M</span>
              </button>
            </div>
          </div>

          <div className="cap-custom">
            <h4>Custom Range</h4>
            <div className="cap-inputs">
              <div className="cap-input-group">
                <label>Minimum Market Cap</label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    value={(config.minMarketCap || 0) / 1e9}
                    onChange={(e) => updateConfig('minMarketCap', parseFloat(e.target.value || 0) * 1e9)}
                    step="0.1"
                  />
                  <span className="suffix">B</span>
                </div>
              </div>
              <div className="cap-input-group">
                <label>Maximum Market Cap</label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    value={config.maxMarketCap ? config.maxMarketCap / 1e9 : ''}
                    onChange={(e) => updateConfig('maxMarketCap', e.target.value ? parseFloat(e.target.value) * 1e9 : null)}
                    placeholder="No limit"
                    step="0.1"
                  />
                  <span className="suffix">B</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sectors Tab */}
      {activeTab === 'sectors' && (
        <div className="tab-content">
          <div className="sectors-section">
            <h4>Include Sectors (leave empty for all)</h4>
            <div className="sector-chips">
              {SECTORS.map(sector => {
                const isIncluded = (config.sectors || []).includes(sector.id);
                const isExcluded = (config.excludedSectors || []).includes(sector.id);
                return (
                  <button
                    key={sector.id}
                    className={`sector-chip ${isIncluded ? 'included' : ''} ${isExcluded ? 'excluded' : ''}`}
                    onClick={() => toggleSector(sector.id, 'include')}
                    disabled={isExcluded}
                    style={{ '--sector-color': sector.color }}
                  >
                    {isIncluded && <Check size={14} />}
                    {sector.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sectors-section">
            <h4>Exclude Sectors</h4>
            <div className="sector-chips">
              {SECTORS.map(sector => {
                const isIncluded = (config.sectors || []).includes(sector.id);
                const isExcluded = (config.excludedSectors || []).includes(sector.id);
                return (
                  <button
                    key={sector.id}
                    className={`sector-chip exclude-mode ${isExcluded ? 'excluded' : ''}`}
                    onClick={() => toggleSector(sector.id, 'exclude')}
                    disabled={isIncluded}
                    style={{ '--sector-color': sector.color }}
                  >
                    {isExcluded && <X size={14} />}
                    {sector.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quality Filters Tab */}
      {activeTab === 'filters' && (
        <div className="tab-content">
          <div className="filter-section">
            <h4>Stock Quality Filters</h4>

            <div className="filter-row">
              <div className="filter-label">
                <TrendingUp size={16} />
                <div>
                  <span className="label-text">Minimum Average Volume</span>
                  <span className="label-desc">Filter out illiquid stocks</span>
                </div>
              </div>
              <div className="filter-control">
                <input
                  type="number"
                  value={(config.minAvgVolume || 0) / 1000}
                  onChange={(e) => updateConfig('minAvgVolume', parseFloat(e.target.value || 0) * 1000)}
                  step="100"
                />
                <span className="unit">K shares</span>
              </div>
            </div>

            <div className="filter-row">
              <div className="filter-label">
                <DollarSign size={16} />
                <div>
                  <span className="label-text">Minimum Stock Price</span>
                  <span className="label-desc">Exclude penny stocks</span>
                </div>
              </div>
              <div className="filter-control">
                <input
                  type="number"
                  value={config.minPrice || 0}
                  onChange={(e) => updateConfig('minPrice', parseFloat(e.target.value || 0))}
                  step="1"
                />
                <span className="unit">$</span>
              </div>
            </div>

            <div className="filter-toggles">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={config.excludePennyStocks !== false}
                  onChange={(e) => updateConfig('excludePennyStocks', e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-text">Exclude Penny Stocks</span>
                  <span className="toggle-desc">Stocks under $5</span>
                </span>
              </label>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={config.excludeADRs !== false}
                  onChange={(e) => updateConfig('excludeADRs', e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-text">Exclude ADRs</span>
                  <span className="toggle-desc">American Depositary Receipts</span>
                </span>
              </label>
            </div>
          </div>

          {/* Custom Symbols */}
          <div className="filter-section">
            <h4>Custom Symbol List (Optional)</h4>
            <p className="section-desc">
              Restrict to specific symbols (comma-separated)
            </p>
            <textarea
              className="symbols-input"
              placeholder="AAPL, MSFT, GOOGL, META..."
              value={(config.customSymbols || []).join(', ')}
              onChange={(e) => {
                const symbols = e.target.value
                  .split(',')
                  .map(s => s.trim().toUpperCase())
                  .filter(s => s.length > 0);
                updateConfig('customSymbols', symbols);
              }}
              rows={3}
            />
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="universe-summary">
        <Layers size={16} />
        <span>
          Universe: {config.maxMarketCap ? `$${(config.minMarketCap / 1e9).toFixed(1)}B - $${(config.maxMarketCap / 1e9).toFixed(1)}B` : `>$${(config.minMarketCap / 1e9).toFixed(1)}B`}
          {(config.sectors || []).length > 0 && ` | ${config.sectors.length} sectors`}
          {(config.excludedSectors || []).length > 0 && ` | Excluding ${config.excludedSectors.length} sectors`}
          {config.minPrice > 0 && ` | Price >$${config.minPrice}`}
        </span>
      </div>
    </div>
  );
}

export default UniverseConfigStep;
export { SECTORS, MARKET_CAP_PRESETS };
