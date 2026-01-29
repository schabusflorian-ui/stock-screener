// frontend/src/pages/agents/components/DCAConfigStep.js
// Configuration step for Dollar Cost Averaging strategy

import React, { useState } from 'react';
import {
  DollarSign,
  Calendar,
  Plus,
  X,
  Info,
  AlertCircle
} from '../../../components/icons';
import AssetSearchInput from './AssetSearchInput';
import './BeginnerWizard.css';

const FREQUENCY_OPTIONS = [
  { id: 'weekly', label: 'Weekly', description: 'Every week' },
  { id: 'biweekly', label: 'Bi-weekly', description: 'Every two weeks' },
  { id: 'monthly', label: 'Monthly', description: 'Once a month' }
];

function DCAConfigStep({ config, onConfigChange }) {
  const [showSearch, setShowSearch] = useState(false);

  const updateConfig = (field, value) => {
    onConfigChange({ ...config, [field]: value });
  };

  const addAsset = (symbol, name) => {
    const currentAssets = config.target_assets || [];
    if (currentAssets.find(a => a.symbol === symbol)) return;

    const newAssets = [
      ...currentAssets,
      { symbol, name, allocation: 0 }
    ];

    // Auto-distribute allocation equally
    const equalAllocation = 1 / newAssets.length;
    const distributedAssets = newAssets.map(a => ({
      ...a,
      allocation: equalAllocation
    }));

    updateConfig('target_assets', distributedAssets);
    setShowSearch(false);
  };

  const removeAsset = (symbol) => {
    const currentAssets = config.target_assets || [];
    const newAssets = currentAssets.filter(a => a.symbol !== symbol);

    // Redistribute allocation
    if (newAssets.length > 0) {
      const equalAllocation = 1 / newAssets.length;
      const distributedAssets = newAssets.map(a => ({
        ...a,
        allocation: equalAllocation
      }));
      updateConfig('target_assets', distributedAssets);
    } else {
      updateConfig('target_assets', []);
    }
  };

  const updateAllocation = (symbol, allocation) => {
    const currentAssets = config.target_assets || [];
    const newAssets = currentAssets.map(a =>
      a.symbol === symbol ? { ...a, allocation: parseFloat(allocation) } : a
    );
    updateConfig('target_assets', newAssets);
  };

  const totalAllocation = (config.target_assets || [])
    .reduce((sum, a) => sum + (a.allocation || 0), 0);

  const selectedSymbols = (config.target_assets || []).map(a => a.symbol);

  return (
    <div className="beginner-step">
      <div className="beginner-step__header">
        <h2>Configure Dollar Cost Averaging</h2>
        <p className="beginner-step__subtitle">
          Set your investment amount, frequency, and target assets.
        </p>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <DollarSign size={18} />
          Investment Amount
        </h3>

        <div className="config-amount-input">
          <span className="config-amount-prefix">$</span>
          <input
            type="number"
            value={config.amount || ''}
            onChange={(e) => updateConfig('amount', parseFloat(e.target.value) || 0)}
            placeholder="500"
            min="10"
            step="10"
          />
          <span className="config-amount-suffix">per contribution</span>
        </div>

        <div className="config-amount-presets">
          {[100, 250, 500, 1000, 2000].map(amount => (
            <button
              key={amount}
              type="button"
              className={`preset-btn ${config.amount === amount ? 'active' : ''}`}
              onClick={() => updateConfig('amount', amount)}
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Calendar size={18} />
          Frequency
        </h3>

        <div className="frequency-options">
          {FREQUENCY_OPTIONS.map(freq => (
            <button
              key={freq.id}
              type="button"
              className={`frequency-option ${config.frequency === freq.id ? 'selected' : ''}`}
              onClick={() => updateConfig('frequency', freq.id)}
            >
              <span className="frequency-option__label">{freq.label}</span>
              <span className="frequency-option__desc">{freq.description}</span>
            </button>
          ))}
        </div>

        {config.frequency === 'monthly' && (
          <div className="config-subfield">
            <label>Day of month</label>
            <select
              value={config.frequency_day || 1}
              onChange={(e) => updateConfig('frequency_day', parseInt(e.target.value))}
            >
              {[1, 5, 10, 15, 20, 25].map(day => (
                <option key={day} value={day}>
                  {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Plus size={18} />
          Target Assets
        </h3>

        <p className="config-section__desc">
          Select ETFs or stocks to invest in. Allocations should sum to 100%.
        </p>

        {/* Selected assets */}
        <div className="selected-assets">
          {(config.target_assets || []).map(asset => (
            <div key={asset.symbol} className="selected-asset">
              <div className="selected-asset__info">
                <span className="selected-asset__symbol">{asset.symbol}</span>
                <span className="selected-asset__name">{asset.name}</span>
              </div>
              <div className="selected-asset__allocation">
                <input
                  type="number"
                  value={Math.round((asset.allocation || 0) * 100)}
                  onChange={(e) => updateAllocation(asset.symbol, parseFloat(e.target.value) / 100)}
                  min="1"
                  max="100"
                  step="1"
                />
                <span>%</span>
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

          {(config.target_assets || []).length === 0 && (
            <div className="no-assets-message">
              <AlertCircle size={18} />
              <span>No assets selected. Add at least one ETF or stock below.</span>
            </div>
          )}
        </div>

        {/* Allocation total indicator */}
        {(config.target_assets || []).length > 0 && (
          <div className={`allocation-total ${Math.abs(totalAllocation - 1) < 0.01 ? 'valid' : 'invalid'}`}>
            <span>Total allocation:</span>
            <strong>{Math.round(totalAllocation * 100)}%</strong>
            {Math.abs(totalAllocation - 1) >= 0.01 && (
              <span className="allocation-warning">Must equal 100%</span>
            )}
          </div>
        )}

        {/* Add asset search */}
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

      <div className="beginner-step__info-box">
        <Info size={18} />
        <div>
          <strong>Popular DCA portfolios</strong>
          <p>
            <strong>Simple:</strong> 100% VTI (Total US Market)<br />
            <strong>Balanced:</strong> 60% VTI, 40% BND<br />
            <strong>Three-Fund:</strong> 60% VTI, 20% VXUS, 20% BND
          </p>
        </div>
      </div>
    </div>
  );
}

export default DCAConfigStep;
