// frontend/src/pages/agents/components/ValueAveragingConfigStep.js
// Configuration step for Value Averaging strategy

import React, { useState } from 'react';
import {
  TrendingUp,
  Target,
  Calendar,
  Plus,
  X,
  Info,
  AlertCircle
} from '../../../components/icons';
import AssetSearchInput from './AssetSearchInput';
import './BeginnerWizard.css';

const REVIEW_FREQUENCY_OPTIONS = [
  { id: 'monthly', label: 'Monthly', description: 'Adjust monthly' },
  { id: 'quarterly', label: 'Quarterly', description: 'Every 3 months' }
];

function ValueAveragingConfigStep({ config, onConfigChange }) {
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

  // Calculate expected portfolio value after 1 year
  const startingValue = config.target_portfolio_value || 50000;
  const growthRate = config.target_growth_rate || 0.10;
  const expectedValue = startingValue * (1 + growthRate);

  return (
    <div className="beginner-step">
      <div className="beginner-step__header">
        <h2>Configure Value Averaging</h2>
        <p className="beginner-step__subtitle">
          Set your target growth rate and contribution limits. The strategy will
          adjust your contributions to keep your portfolio on track.
        </p>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Target size={18} />
          Current Portfolio Value
        </h3>

        <div className="config-amount-input">
          <span className="config-amount-prefix">$</span>
          <input
            type="number"
            value={config.target_portfolio_value || ''}
            onChange={(e) => updateConfig('target_portfolio_value', parseFloat(e.target.value) || 0)}
            placeholder="50000"
            min="1000"
            step="1000"
          />
        </div>

        <p className="config-section__hint">
          Enter your current portfolio value. This will be used to calculate target growth.
        </p>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <TrendingUp size={18} />
          Target Annual Growth Rate
        </h3>

        <div className="growth-rate-slider">
          <input
            type="range"
            min="5"
            max="20"
            step="1"
            value={(config.target_growth_rate || 0.10) * 100}
            onChange={(e) => updateConfig('target_growth_rate', parseFloat(e.target.value) / 100)}
          />
          <div className="growth-rate-display">
            <span className="growth-rate-value">{((config.target_growth_rate || 0.10) * 100).toFixed(0)}%</span>
            <span className="growth-rate-label">per year</span>
          </div>
        </div>

        <div className="growth-projection">
          <div className="growth-projection__item">
            <span className="label">Starting value</span>
            <span className="value">${startingValue.toLocaleString()}</span>
          </div>
          <div className="growth-projection__arrow">→</div>
          <div className="growth-projection__item">
            <span className="label">Target (1 year)</span>
            <span className="value highlight">${Math.round(expectedValue).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Calendar size={18} />
          Review Frequency
        </h3>

        <div className="frequency-options">
          {REVIEW_FREQUENCY_OPTIONS.map(freq => (
            <button
              key={freq.id}
              type="button"
              className={`frequency-option ${config.review_frequency === freq.id ? 'selected' : ''}`}
              onClick={() => updateConfig('review_frequency', freq.id)}
            >
              <span className="frequency-option__label">{freq.label}</span>
              <span className="frequency-option__desc">{freq.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">Contribution Limits</h3>

        <div className="contribution-limits">
          <div className="limit-input">
            <label>Minimum</label>
            <div className="config-amount-input small">
              <span className="config-amount-prefix">$</span>
              <input
                type="number"
                value={config.min_contribution || ''}
                onChange={(e) => updateConfig('min_contribution', parseFloat(e.target.value) || 0)}
                placeholder="100"
                min="0"
              />
            </div>
          </div>
          <div className="limit-input">
            <label>Maximum</label>
            <div className="config-amount-input small">
              <span className="config-amount-prefix">$</span>
              <input
                type="number"
                value={config.max_contribution || ''}
                onChange={(e) => updateConfig('max_contribution', parseFloat(e.target.value) || 0)}
                placeholder="2000"
                min="0"
              />
            </div>
          </div>
        </div>

        <p className="config-section__hint">
          Set min/max to control how much you contribute each period, even if the
          algorithm suggests more or less.
        </p>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Plus size={18} />
          Target Assets
        </h3>

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
              <span>No assets selected. Add at least one ETF or stock.</span>
            </div>
          )}
        </div>

        {(config.target_assets || []).length > 0 && (
          <div className={`allocation-total ${Math.abs(totalAllocation - 1) < 0.01 ? 'valid' : 'invalid'}`}>
            <span>Total allocation:</span>
            <strong>{Math.round(totalAllocation * 100)}%</strong>
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

      <div className="beginner-step__info-box">
        <Info size={18} />
        <div>
          <strong>How Value Averaging Works</strong>
          <p>
            If your portfolio falls behind the growth target, you'll contribute more.
            If it's ahead, you'll contribute less (or even sell some). This buys more
            shares when prices are low and fewer when prices are high.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ValueAveragingConfigStep;
