// frontend/src/pages/agents/components/RebalanceConfigStep.js
// Configuration step for Portfolio Rebalancing strategy

import React, { useState } from 'react';
import {
  PieChart,
  Calendar,
  Plus,
  X,
  Info,
  AlertCircle,
  Sliders
} from '../../../components/icons';
import AssetSearchInput from './AssetSearchInput';
import './BeginnerWizard.css';

const REBALANCE_FREQUENCY_OPTIONS = [
  { id: 'monthly', label: 'Monthly', description: 'Every month' },
  { id: 'quarterly', label: 'Quarterly', description: 'Every 3 months' }
];

const THRESHOLD_PRESETS = [
  { value: 0.03, label: '3%', description: 'Tight - frequent rebalancing' },
  { value: 0.05, label: '5%', description: 'Standard - recommended' },
  { value: 0.10, label: '10%', description: 'Relaxed - less trading' }
];

const PRESET_ALLOCATIONS = [
  {
    name: 'Simple 60/40',
    description: 'Classic balanced portfolio',
    assets: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market', allocation: 0.60 },
      { symbol: 'BND', name: 'Vanguard Total Bond', allocation: 0.40 }
    ]
  },
  {
    name: 'Three Fund',
    description: 'Diversified US, Intl, Bonds',
    assets: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market', allocation: 0.50 },
      { symbol: 'VXUS', name: 'Vanguard Total International', allocation: 0.30 },
      { symbol: 'BND', name: 'Vanguard Total Bond', allocation: 0.20 }
    ]
  },
  {
    name: 'All Weather',
    description: 'Stocks, Bonds, Gold, Real Estate',
    assets: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market', allocation: 0.30 },
      { symbol: 'BND', name: 'Vanguard Total Bond', allocation: 0.40 },
      { symbol: 'GLD', name: 'SPDR Gold Shares', allocation: 0.15 },
      { symbol: 'VNQ', name: 'Vanguard Real Estate', allocation: 0.15 }
    ]
  }
];

function RebalanceConfigStep({ config, onConfigChange }) {
  const [showSearch, setShowSearch] = useState(false);

  const updateConfig = (field, value) => {
    onConfigChange({ ...config, [field]: value });
  };

  const applyPreset = (preset) => {
    updateConfig('target_allocation', preset.assets);
  };

  const addAsset = (symbol, name) => {
    const currentAssets = config.target_allocation || [];
    if (currentAssets.find(a => a.symbol === symbol)) return;

    const newAssets = [
      ...currentAssets,
      { symbol, name, allocation: 0.10 }
    ];

    updateConfig('target_allocation', newAssets);
    setShowSearch(false);
  };

  const removeAsset = (symbol) => {
    const currentAssets = config.target_allocation || [];
    updateConfig('target_allocation', currentAssets.filter(a => a.symbol !== symbol));
  };

  const updateAllocation = (symbol, allocation) => {
    const currentAssets = config.target_allocation || [];
    const newAssets = currentAssets.map(a =>
      a.symbol === symbol ? { ...a, allocation: parseFloat(allocation) } : a
    );
    updateConfig('target_allocation', newAssets);
  };

  const totalAllocation = (config.target_allocation || [])
    .reduce((sum, a) => sum + (a.allocation || 0), 0);

  const selectedSymbols = (config.target_allocation || []).map(a => a.symbol);

  return (
    <div className="beginner-step">
      <div className="beginner-step__header">
        <h2>Configure Portfolio Rebalancing</h2>
        <p className="beginner-step__subtitle">
          Define your target asset allocation and when to rebalance.
          The strategy will buy and sell to maintain your targets.
        </p>
      </div>

      {/* Preset allocations */}
      <div className="config-section">
        <h3 className="config-section__title">Quick Presets</h3>
        <div className="allocation-presets">
          {PRESET_ALLOCATIONS.map(preset => (
            <button
              key={preset.name}
              type="button"
              className="allocation-preset"
              onClick={() => applyPreset(preset)}
            >
              <span className="preset-name">{preset.name}</span>
              <span className="preset-desc">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <PieChart size={18} />
          Target Allocation
        </h3>

        <div className="selected-assets rebalance-assets">
          {(config.target_allocation || []).map(asset => (
            <div key={asset.symbol} className="selected-asset">
              <div className="selected-asset__info">
                <span className="selected-asset__symbol">{asset.symbol}</span>
                <span className="selected-asset__name">{asset.name}</span>
              </div>
              <div className="selected-asset__allocation large">
                <input
                  type="range"
                  min="5"
                  max="80"
                  step="5"
                  value={Math.round((asset.allocation || 0) * 100)}
                  onChange={(e) => updateAllocation(asset.symbol, parseFloat(e.target.value) / 100)}
                />
                <span className="allocation-value">{Math.round((asset.allocation || 0) * 100)}%</span>
              </div>
              <button
                type="button"
                className="selected-asset__remove"
                onClick={() => removeAsset(asset.symbol)}
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {(config.target_allocation || []).length === 0 && (
            <div className="no-assets-message">
              <AlertCircle size={18} />
              <span>No assets selected. Choose a preset above or add assets manually.</span>
            </div>
          )}
        </div>

        {(config.target_allocation || []).length > 0 && (
          <div className={`allocation-total ${Math.abs(totalAllocation - 1) < 0.01 ? 'valid' : 'invalid'}`}>
            <span>Total allocation:</span>
            <strong>{Math.round(totalAllocation * 100)}%</strong>
            {Math.abs(totalAllocation - 1) >= 0.01 && (
              <span className="allocation-warning">Must equal 100%</span>
            )}
          </div>
        )}

        <div className="add-asset-section">
          {!showSearch ? (
            <button
              type="button"
              className="add-asset-btn"
              onClick={() => setShowSearch(true)}
            >
              <Plus size={18} />
              Add Asset
            </button>
          ) : (
            <AssetSearchInput
              onSelect={addAsset}
              selectedSymbols={selectedSymbols}
              onClose={() => setShowSearch(false)}
            />
          )}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Sliders size={18} />
          Rebalance Threshold
        </h3>

        <p className="config-section__desc">
          Rebalance when any asset drifts more than this amount from its target.
        </p>

        <div className="threshold-options">
          {THRESHOLD_PRESETS.map(preset => (
            <button
              key={preset.value}
              type="button"
              className={`threshold-option ${config.rebalance_threshold === preset.value ? 'selected' : ''}`}
              onClick={() => updateConfig('rebalance_threshold', preset.value)}
            >
              <span className="threshold-value">{preset.label}</span>
              <span className="threshold-desc">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Calendar size={18} />
          Review Frequency
        </h3>

        <div className="frequency-options">
          {REBALANCE_FREQUENCY_OPTIONS.map(freq => (
            <button
              key={freq.id}
              type="button"
              className={`frequency-option ${config.rebalance_frequency === freq.id ? 'selected' : ''}`}
              onClick={() => updateConfig('rebalance_frequency', freq.id)}
            >
              <span className="frequency-option__label">{freq.label}</span>
              <span className="frequency-option__desc">{freq.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="beginner-step__info-box">
        <Info size={18} />
        <div>
          <strong>How Rebalancing Works</strong>
          <p>
            When assets drift from their targets (e.g., stocks grow to 70% when target is 60%),
            the strategy sells the overweight assets and buys the underweight ones.
            This enforces "sell high, buy low" discipline.
          </p>
        </div>
      </div>
    </div>
  );
}

export default RebalanceConfigStep;
