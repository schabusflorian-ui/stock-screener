// frontend/src/pages/agents/components/LumpDCAConfigStep.js
// Configuration step for Lump Sum + DCA Hybrid strategy

import React, { useState } from 'react';
import {
  Layers,
  DollarSign,
  Calendar,
  Plus,
  X,
  Info,
  AlertCircle
} from '../../../components/icons';
import AssetSearchInput from './AssetSearchInput';
import './BeginnerWizard.css';

const DCA_FREQUENCY_OPTIONS = [
  { id: 'weekly', label: 'Weekly', description: 'Every week' },
  { id: 'biweekly', label: 'Bi-weekly', description: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly', description: 'Once a month' }
];

const DCA_PERIOD_OPTIONS = [
  { months: 3, label: '3 months', description: 'Quick deployment' },
  { months: 6, label: '6 months', description: 'Balanced approach' },
  { months: 12, label: '12 months', description: 'Conservative' }
];

const SPLIT_PRESETS = [
  { lump: 0.25, dca: 0.75, label: '25/75', description: 'Conservative' },
  { lump: 0.50, dca: 0.50, label: '50/50', description: 'Balanced' },
  { lump: 0.75, dca: 0.25, label: '75/25', description: 'Aggressive' }
];

function LumpDCAConfigStep({ config, onConfigChange }) {
  const [showSearch, setShowSearch] = useState(false);

  const updateConfig = (field, value) => {
    onConfigChange({ ...config, [field]: value });
  };

  const applySplitPreset = (preset) => {
    updateConfig('lump_sum_pct', preset.lump);
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

  // Calculate amounts
  const totalAmount = config.total_amount || 0;
  const lumpPct = config.lump_sum_pct || 0.50;
  const lumpAmount = totalAmount * lumpPct;
  const dcaAmount = totalAmount * (1 - lumpPct);
  const dcaMonths = config.dca_months || 6;
  const dcaFrequency = config.dca_frequency || 'monthly';

  // Calculate per-contribution amount
  let contributionCount = dcaMonths;
  if (dcaFrequency === 'weekly') contributionCount = dcaMonths * 4;
  if (dcaFrequency === 'biweekly') contributionCount = dcaMonths * 2;
  const perContribution = dcaAmount / contributionCount;

  return (
    <div className="beginner-step">
      <div className="beginner-step__header">
        <h2>Configure Lump Sum + DCA Hybrid</h2>
        <p className="beginner-step__subtitle">
          Invest a portion immediately and dollar-cost average the rest over time.
          Great for windfalls, bonuses, or inheritance.
        </p>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <DollarSign size={18} />
          Total Amount to Invest
        </h3>

        <div className="config-amount-input large">
          <span className="config-amount-prefix">$</span>
          <input
            type="number"
            value={config.total_amount || ''}
            onChange={(e) => updateConfig('total_amount', parseFloat(e.target.value) || 0)}
            placeholder="50000"
            min="1000"
            step="1000"
          />
        </div>

        <div className="config-amount-presets">
          {[10000, 25000, 50000, 100000].map(amount => (
            <button
              key={amount}
              type="button"
              className={`preset-btn ${config.total_amount === amount ? 'active' : ''}`}
              onClick={() => updateConfig('total_amount', amount)}
            >
              ${(amount / 1000).toFixed(0)}k
            </button>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Layers size={18} />
          Lump Sum / DCA Split
        </h3>

        <div className="split-presets">
          {SPLIT_PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              className={`split-preset ${config.lump_sum_pct === preset.lump ? 'selected' : ''}`}
              onClick={() => applySplitPreset(preset)}
            >
              <span className="split-preset__label">{preset.label}</span>
              <span className="split-preset__desc">{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="split-slider">
          <div className="split-slider__labels">
            <span>Lump Sum</span>
            <span>DCA</span>
          </div>
          <input
            type="range"
            min="10"
            max="90"
            step="5"
            value={(config.lump_sum_pct || 0.50) * 100}
            onChange={(e) => updateConfig('lump_sum_pct', parseFloat(e.target.value) / 100)}
          />
          <div className="split-slider__values">
            <span>{Math.round(lumpPct * 100)}%</span>
            <span>{Math.round((1 - lumpPct) * 100)}%</span>
          </div>
        </div>

        {totalAmount > 0 && (
          <div className="split-breakdown">
            <div className="split-breakdown__item lump">
              <span className="label">Invest Immediately</span>
              <span className="value">${lumpAmount.toLocaleString()}</span>
            </div>
            <div className="split-breakdown__divider">+</div>
            <div className="split-breakdown__item dca">
              <span className="label">DCA over {dcaMonths} months</span>
              <span className="value">${dcaAmount.toLocaleString()}</span>
              <span className="subvalue">(${Math.round(perContribution).toLocaleString()}/{dcaFrequency === 'monthly' ? 'mo' : dcaFrequency === 'biweekly' ? '2wk' : 'wk'})</span>
            </div>
          </div>
        )}
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Calendar size={18} />
          DCA Schedule
        </h3>

        <div className="schedule-grid">
          <div className="schedule-field">
            <label>DCA Period</label>
            <div className="period-options">
              {DCA_PERIOD_OPTIONS.map(period => (
                <button
                  key={period.months}
                  type="button"
                  className={`period-option ${config.dca_months === period.months ? 'selected' : ''}`}
                  onClick={() => updateConfig('dca_months', period.months)}
                >
                  <span>{period.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="schedule-field">
            <label>Frequency</label>
            <div className="frequency-options compact">
              {DCA_FREQUENCY_OPTIONS.map(freq => (
                <button
                  key={freq.id}
                  type="button"
                  className={`frequency-option ${config.dca_frequency === freq.id ? 'selected' : ''}`}
                  onClick={() => updateConfig('dca_frequency', freq.id)}
                >
                  <span>{freq.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
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
          <strong>Why This Strategy?</strong>
          <p>
            Studies show lump sum investing beats DCA ~66% of the time due to time in market.
            But DCA reduces regret if markets drop right after investing.
            The hybrid approach gives you the best of both worlds.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LumpDCAConfigStep;
