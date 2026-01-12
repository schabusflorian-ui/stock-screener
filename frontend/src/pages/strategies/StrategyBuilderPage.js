// frontend/src/pages/strategies/StrategyBuilderPage.js
// Strategy Builder - User interface for creating and managing trading strategies

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { SkeletonPage } from '../../components/Skeleton';
import './StrategyBuilderPage.css';

const StrategyBuilderPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [activeTab, setActiveTab] = useState('single'); // 'single' or 'multi'
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);

  // Single Strategy Config
  const [config, setConfig] = useState({
    name: '',
    description: '',
    mode: 'single',

    // Universe
    universe_min_market_cap: 1000000000,
    universe_max_market_cap: null,
    universe_sectors: [],
    universe_excluded_sectors: [],

    // Signal Weights
    weight_technical: 20,
    weight_fundamental: 20,
    weight_sentiment: 15,
    weight_momentum: 15,
    weight_value: 15,
    weight_quality: 15,

    // Thresholds
    min_signal_score: 0.3,
    min_confidence: 0.6,

    // Risk Management
    max_position_size: 0.05,
    max_sector_concentration: 0.25,
    max_positions: 20,
    min_positions: 5,
    stop_loss_pct: 0.10,
    take_profit_pct: null,
    trailing_stop_pct: null,
    max_correlation: 0.7,
    tail_hedge_allocation: 0,

    // Holding Period
    min_holding_days: 1,
    target_holding_days: 30,
    max_holding_days: null,

    // Regime
    regime_overlay_enabled: false,
    regime_exposure_high_risk: 0.5,
    regime_exposure_elevated: 0.75,
    regime_exposure_normal: 1.0,

    // Rebalancing
    rebalance_frequency: 'weekly',
    rebalance_threshold: 0.05
  });

  // Multi-Strategy Config
  const [multiConfig, setMultiConfig] = useState({
    name: '',
    description: '',
    childStrategies: []
  });

  // Sectors list
  const sectors = [
    'Technology', 'Healthcare', 'Financials', 'Consumer Discretionary',
    'Consumer Staples', 'Industrials', 'Energy', 'Materials',
    'Utilities', 'Real Estate', 'Communication Services'
  ];

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load presets
        const presetsRes = await api.get('/strategies/presets');
        if (presetsRes.data.success) {
          setPresets(presetsRes.data.presets);
        }

        // Load existing strategies (for multi-strategy mode)
        const strategiesRes = await api.get('/strategies?active=true');
        if (strategiesRes.data.success) {
          setStrategies(strategiesRes.data.strategies.filter(s => s.mode === 'single'));
        }

        // If editing, load the strategy
        if (isEditing) {
          const strategyRes = await api.get(`/strategies/${id}`);
          if (strategyRes.data.success) {
            const strategy = strategyRes.data.strategy;
            if (strategy.mode === 'multi') {
              setActiveTab('multi');
              setMultiConfig({
                name: strategy.name,
                description: strategy.description,
                childStrategies: strategy.allocations.map(a => ({
                  strategyId: a.child_strategy_id,
                  name: a.child_name,
                  targetAllocation: a.target_allocation,
                  minAllocation: a.min_allocation,
                  maxAllocation: a.max_allocation
                }))
              });
            } else {
              setConfig(strategy);
            }
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setErrors(['Failed to load data']);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, isEditing]);

  // Apply preset
  const applyPreset = useCallback((presetName) => {
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      setConfig(prev => ({
        ...prev,
        ...preset.config,
        name: prev.name || `My ${presetName} Strategy`,
        description: preset.description
      }));
    }
  }, [presets]);

  // Update config field
  const updateConfig = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  // Normalize weights
  const normalizeWeights = () => {
    const weights = [
      'weight_technical', 'weight_fundamental', 'weight_sentiment',
      'weight_momentum', 'weight_value', 'weight_quality'
    ];
    const total = weights.reduce((sum, w) => sum + (config[w] || 0), 0);

    if (total > 0) {
      const newConfig = { ...config };
      for (const w of weights) {
        newConfig[w] = Math.round((config[w] / total) * 100);
      }
      setConfig(newConfig);
    }
  };

  // Calculate total weights
  const getTotalWeight = () => {
    return config.weight_technical + config.weight_fundamental +
           config.weight_sentiment + config.weight_momentum +
           config.weight_value + config.weight_quality;
  };

  // Multi-strategy: add child
  const addChildStrategy = (strategyId) => {
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) return;

    if (multiConfig.childStrategies.find(c => c.strategyId === strategyId)) {
      return; // Already added
    }

    const currentTotal = multiConfig.childStrategies.reduce((sum, c) => sum + c.targetAllocation, 0);
    const remaining = Math.max(0, 1 - currentTotal);
    const defaultAlloc = Math.min(remaining, 0.25);

    setMultiConfig(prev => ({
      ...prev,
      childStrategies: [
        ...prev.childStrategies,
        {
          strategyId,
          name: strategy.name,
          targetAllocation: defaultAlloc,
          minAllocation: 0,
          maxAllocation: 1
        }
      ]
    }));
  };

  // Multi-strategy: remove child
  const removeChildStrategy = (strategyId) => {
    setMultiConfig(prev => ({
      ...prev,
      childStrategies: prev.childStrategies.filter(c => c.strategyId !== strategyId)
    }));
  };

  // Multi-strategy: update allocation
  const updateChildAllocation = (strategyId, field, value) => {
    setMultiConfig(prev => ({
      ...prev,
      childStrategies: prev.childStrategies.map(c =>
        c.strategyId === strategyId ? { ...c, [field]: value } : c
      )
    }));
  };

  // Save strategy
  const handleSave = async () => {
    setErrors([]);
    setWarnings([]);
    setSaving(true);

    try {
      let response;

      if (activeTab === 'multi') {
        // Validate multi-strategy
        if (!multiConfig.name) {
          setErrors(['Name is required']);
          return;
        }
        if (multiConfig.childStrategies.length < 2) {
          setErrors(['Multi-strategy requires at least 2 child strategies']);
          return;
        }
        const totalAlloc = multiConfig.childStrategies.reduce((sum, c) => sum + c.targetAllocation, 0);
        if (Math.abs(totalAlloc - 1) > 0.01) {
          setErrors([`Allocations must sum to 100% (currently ${(totalAlloc * 100).toFixed(1)}%)`]);
          return;
        }

        response = await api.post('/strategies/multi', multiConfig);
      } else {
        // Validate single strategy
        if (!config.name) {
          setErrors(['Name is required']);
          return;
        }

        if (isEditing) {
          response = await api.put(`/strategies/${id}`, config);
        } else {
          response = await api.post('/strategies', config);
        }
      }

      if (response.data.success) {
        if (response.data.warnings) {
          setWarnings(response.data.warnings);
        }
        navigate('/strategies');
      } else {
        setErrors(response.data.errors || ['Failed to save strategy']);
      }
    } catch (error) {
      console.error('Error saving strategy:', error);
      setErrors([error.response?.data?.error || 'Failed to save strategy']);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="strategy-builder"><SkeletonPage tabs={2} content="cards" /></div>;
  }

  return (
    <div className="strategy-builder">
      <header className="strategy-header">
        <h1>{isEditing ? 'Edit Strategy' : 'Create Strategy'}</h1>
        <p>Configure your trading strategy parameters</p>
      </header>

      {/* Mode Tabs */}
      <div className="mode-tabs">
        <button
          className={`tab ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          Single Strategy
        </button>
        <button
          className={`tab ${activeTab === 'multi' ? 'active' : ''}`}
          onClick={() => setActiveTab('multi')}
        >
          Multi-Strategy
        </button>
      </div>

      {/* Errors and Warnings */}
      {errors.length > 0 && (
        <div className="error-box">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="warning-box">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {activeTab === 'single' ? (
        <div className="single-strategy-form">
          {/* Presets */}
          <section className="form-section">
            <h3>Start from a Preset (Optional)</h3>
            <div className="presets-grid">
              {presets.map(preset => (
                <button
                  key={preset.name}
                  className="preset-card"
                  onClick={() => applyPreset(preset.name)}
                >
                  <h4>{preset.name}</h4>
                  <p>{preset.description}</p>
                  <div className="preset-meta">
                    <span className={`risk-badge ${preset.riskProfile}`}>
                      {preset.riskProfile}
                    </span>
                    <span className="period-badge">{preset.holdingPeriod}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Basic Info */}
          <section className="form-section">
            <h3>Basic Information</h3>
            <div className="form-row">
              <label>
                Strategy Name *
                <input
                  type="text"
                  value={config.name}
                  onChange={e => updateConfig('name', e.target.value)}
                  placeholder="My Trading Strategy"
                />
              </label>
              <label>
                Description
                <textarea
                  value={config.description || ''}
                  onChange={e => updateConfig('description', e.target.value)}
                  placeholder="Describe your strategy..."
                />
              </label>
            </div>
          </section>

          {/* Signal Weights */}
          <section className="form-section">
            <h3>
              Signal Weights
              <span className={`weight-total ${getTotalWeight() === 100 ? 'valid' : 'invalid'}`}>
                Total: {getTotalWeight()}%
              </span>
              <button className="normalize-btn" onClick={normalizeWeights}>
                Normalize to 100%
              </button>
            </h3>
            <div className="weights-grid">
              {['technical', 'fundamental', 'sentiment', 'momentum', 'value', 'quality'].map(signal => (
                <label key={signal} className="weight-input">
                  <span>{signal.charAt(0).toUpperCase() + signal.slice(1)}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config[`weight_${signal}`]}
                    onChange={e => updateConfig(`weight_${signal}`, parseInt(e.target.value))}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={config[`weight_${signal}`]}
                    onChange={e => updateConfig(`weight_${signal}`, parseInt(e.target.value) || 0)}
                  />
                  <span>%</span>
                </label>
              ))}
            </div>
          </section>

          {/* Universe Selection */}
          <section className="form-section">
            <h3>Universe Selection</h3>
            <div className="form-row">
              <label>
                Min Market Cap ($B)
                <input
                  type="number"
                  value={(config.universe_min_market_cap || 0) / 1e9}
                  onChange={e => updateConfig('universe_min_market_cap', parseFloat(e.target.value) * 1e9)}
                  step="0.1"
                />
              </label>
              <label>
                Max Market Cap ($B) - Leave empty for no limit
                <input
                  type="number"
                  value={config.universe_max_market_cap ? config.universe_max_market_cap / 1e9 : ''}
                  onChange={e => updateConfig('universe_max_market_cap', e.target.value ? parseFloat(e.target.value) * 1e9 : null)}
                  step="0.1"
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Include Sectors (empty = all)
                <select
                  multiple
                  value={config.universe_sectors || []}
                  onChange={e => updateConfig('universe_sectors', Array.from(e.target.selectedOptions, o => o.value))}
                >
                  {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>
                Exclude Sectors
                <select
                  multiple
                  value={config.universe_excluded_sectors || []}
                  onChange={e => updateConfig('universe_excluded_sectors', Array.from(e.target.selectedOptions, o => o.value))}
                >
                  {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          </section>

          {/* Risk Management */}
          <section className="form-section">
            <h3>Risk Management</h3>
            <div className="form-grid">
              <label>
                Max Position Size (%)
                <input
                  type="number"
                  value={(config.max_position_size * 100).toFixed(1)}
                  onChange={e => updateConfig('max_position_size', parseFloat(e.target.value) / 100)}
                  min="1"
                  max="25"
                  step="0.5"
                />
              </label>
              <label>
                Max Sector Concentration (%)
                <input
                  type="number"
                  value={(config.max_sector_concentration * 100).toFixed(0)}
                  onChange={e => updateConfig('max_sector_concentration', parseFloat(e.target.value) / 100)}
                  min="10"
                  max="100"
                />
              </label>
              <label>
                Max Positions
                <input
                  type="number"
                  value={config.max_positions}
                  onChange={e => updateConfig('max_positions', parseInt(e.target.value))}
                  min="5"
                  max="100"
                />
              </label>
              <label>
                Min Positions
                <input
                  type="number"
                  value={config.min_positions}
                  onChange={e => updateConfig('min_positions', parseInt(e.target.value))}
                  min="1"
                  max={config.max_positions}
                />
              </label>
              <label>
                Stop Loss (%)
                <input
                  type="number"
                  value={(config.stop_loss_pct * 100).toFixed(0)}
                  onChange={e => updateConfig('stop_loss_pct', parseFloat(e.target.value) / 100)}
                  min="1"
                  max="50"
                />
              </label>
              <label>
                Take Profit (%) - Optional
                <input
                  type="number"
                  value={config.take_profit_pct ? (config.take_profit_pct * 100).toFixed(0) : ''}
                  onChange={e => updateConfig('take_profit_pct', e.target.value ? parseFloat(e.target.value) / 100 : null)}
                  min="5"
                  max="200"
                />
              </label>
              <label>
                Trailing Stop (%) - Optional
                <input
                  type="number"
                  value={config.trailing_stop_pct ? (config.trailing_stop_pct * 100).toFixed(0) : ''}
                  onChange={e => updateConfig('trailing_stop_pct', e.target.value ? parseFloat(e.target.value) / 100 : null)}
                  min="3"
                  max="30"
                />
              </label>
              <label>
                Tail Hedge Allocation (%)
                <input
                  type="number"
                  value={(config.tail_hedge_allocation * 100).toFixed(1)}
                  onChange={e => updateConfig('tail_hedge_allocation', parseFloat(e.target.value) / 100)}
                  min="0"
                  max="10"
                  step="0.5"
                />
              </label>
            </div>
          </section>

          {/* Holding Period */}
          <section className="form-section">
            <h3>Holding Period</h3>
            <div className="form-row">
              <label>
                Min Days
                <input
                  type="number"
                  value={config.min_holding_days}
                  onChange={e => updateConfig('min_holding_days', parseInt(e.target.value))}
                  min="1"
                />
              </label>
              <label>
                Target Days
                <input
                  type="number"
                  value={config.target_holding_days}
                  onChange={e => updateConfig('target_holding_days', parseInt(e.target.value))}
                  min="1"
                />
              </label>
              <label>
                Max Days (Optional)
                <input
                  type="number"
                  value={config.max_holding_days || ''}
                  onChange={e => updateConfig('max_holding_days', e.target.value ? parseInt(e.target.value) : null)}
                  min={config.target_holding_days}
                />
              </label>
            </div>
          </section>

          {/* Regime Overlay */}
          <section className="form-section">
            <h3>Market Regime Overlay</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.regime_overlay_enabled}
                onChange={e => updateConfig('regime_overlay_enabled', e.target.checked)}
              />
              Enable regime-based exposure adjustment
            </label>
            {config.regime_overlay_enabled && (
              <div className="form-row">
                <label>
                  High Risk Exposure (%)
                  <input
                    type="number"
                    value={(config.regime_exposure_high_risk * 100).toFixed(0)}
                    onChange={e => updateConfig('regime_exposure_high_risk', parseFloat(e.target.value) / 100)}
                    min="0"
                    max="100"
                  />
                </label>
                <label>
                  Elevated Risk Exposure (%)
                  <input
                    type="number"
                    value={(config.regime_exposure_elevated * 100).toFixed(0)}
                    onChange={e => updateConfig('regime_exposure_elevated', parseFloat(e.target.value) / 100)}
                    min="0"
                    max="100"
                  />
                </label>
                <label>
                  Normal Exposure (%)
                  <input
                    type="number"
                    value={(config.regime_exposure_normal * 100).toFixed(0)}
                    onChange={e => updateConfig('regime_exposure_normal', parseFloat(e.target.value) / 100)}
                    min="0"
                    max="100"
                  />
                </label>
              </div>
            )}
          </section>

          {/* Rebalancing */}
          <section className="form-section">
            <h3>Rebalancing</h3>
            <div className="form-row">
              <label>
                Frequency
                <select
                  value={config.rebalance_frequency}
                  onChange={e => updateConfig('rebalance_frequency', e.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label>
                Drift Threshold (%)
                <input
                  type="number"
                  value={(config.rebalance_threshold * 100).toFixed(0)}
                  onChange={e => updateConfig('rebalance_threshold', parseFloat(e.target.value) / 100)}
                  min="1"
                  max="20"
                />
              </label>
            </div>
          </section>
        </div>
      ) : (
        <div className="multi-strategy-form">
          {/* Basic Info */}
          <section className="form-section">
            <h3>Multi-Strategy Configuration</h3>
            <p className="section-description">
              Combine multiple single strategies. The AI Meta-Allocator will dynamically
              adjust allocations based on market conditions.
            </p>
            <div className="form-row">
              <label>
                Name *
                <input
                  type="text"
                  value={multiConfig.name}
                  onChange={e => setMultiConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Multi-Strategy Portfolio"
                />
              </label>
              <label>
                Description
                <textarea
                  value={multiConfig.description || ''}
                  onChange={e => setMultiConfig(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your multi-strategy approach..."
                />
              </label>
            </div>
          </section>

          {/* Add Strategies */}
          <section className="form-section">
            <h3>Add Child Strategies</h3>
            <div className="available-strategies">
              {strategies
                .filter(s => !multiConfig.childStrategies.find(c => c.strategyId === s.id))
                .map(strategy => (
                  <button
                    key={strategy.id}
                    className="add-strategy-btn"
                    onClick={() => addChildStrategy(strategy.id)}
                  >
                    + {strategy.name}
                  </button>
                ))}
            </div>
            {strategies.length === 0 && (
              <p className="no-strategies">
                No single strategies available. Create some single strategies first.
              </p>
            )}
          </section>

          {/* Selected Strategies */}
          {multiConfig.childStrategies.length > 0 && (
            <section className="form-section">
              <h3>
                Strategy Allocations
                <span className={`alloc-total ${Math.abs(multiConfig.childStrategies.reduce((sum, c) => sum + c.targetAllocation, 0) - 1) < 0.01 ? 'valid' : 'invalid'}`}>
                  Total: {(multiConfig.childStrategies.reduce((sum, c) => sum + c.targetAllocation, 0) * 100).toFixed(1)}%
                </span>
              </h3>
              <div className="allocation-list">
                {multiConfig.childStrategies.map(child => (
                  <div key={child.strategyId} className="allocation-item">
                    <div className="strategy-name">{child.name}</div>
                    <div className="allocation-inputs">
                      <label>
                        Target %
                        <input
                          type="number"
                          value={(child.targetAllocation * 100).toFixed(0)}
                          onChange={e => updateChildAllocation(child.strategyId, 'targetAllocation', parseFloat(e.target.value) / 100)}
                          min="0"
                          max="100"
                        />
                      </label>
                      <label>
                        Min %
                        <input
                          type="number"
                          value={(child.minAllocation * 100).toFixed(0)}
                          onChange={e => updateChildAllocation(child.strategyId, 'minAllocation', parseFloat(e.target.value) / 100)}
                          min="0"
                          max="100"
                        />
                      </label>
                      <label>
                        Max %
                        <input
                          type="number"
                          value={(child.maxAllocation * 100).toFixed(0)}
                          onChange={e => updateChildAllocation(child.strategyId, 'maxAllocation', parseFloat(e.target.value) / 100)}
                          min="0"
                          max="100"
                        />
                      </label>
                    </div>
                    <button
                      className="remove-btn"
                      onClick={() => removeChildStrategy(child.strategyId)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="form-actions">
        <button className="cancel-btn" onClick={() => navigate('/strategies')}>
          Cancel
        </button>
        <button
          className="save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : (isEditing ? 'Update Strategy' : 'Create Strategy')}
        </button>
      </div>
    </div>
  );
};

export default StrategyBuilderPage;
