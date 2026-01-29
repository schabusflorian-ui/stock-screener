// frontend/src/pages/agents/components/RegimeConfigStep.js
// Regime configuration step for agent creation wizard

import React from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Brain,
  BarChart3,
  Info,
  Pause,
  Play
} from '../../../components/icons';

const REGIME_TYPES = [
  { id: 'CRISIS', label: 'Crisis', color: '#DC2626', icon: AlertTriangle, description: 'High volatility, significant drawdowns' },
  { id: 'HIGH_VOL', label: 'High Volatility', color: '#D97706', icon: TrendingDown, description: 'Elevated market uncertainty' },
  { id: 'NORMAL', label: 'Normal', color: '#059669', icon: Activity, description: 'Standard market conditions' },
  { id: 'LOW_VOL', label: 'Low Volatility', color: '#2563EB', icon: TrendingUp, description: 'Calm markets, steady growth' }
];

function RegimeConfigStep({ formData, updateField }) {
  const handleExposureChange = (regime, value) => {
    updateField('regime_exposures', {
      ...formData.regime_exposures,
      [regime]: parseFloat(value)
    });
  };

  return (
    <div className="regime-config-step">
      <div className="regime-header">
        <Activity size={24} />
        <div className="header-text">
          <h3>Regime-Based Risk Management</h3>
          <p>Adjust position sizing and strategy behavior based on detected market conditions.</p>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="regime-toggle-section">
        <div className="toggle-row main-toggle">
          <input
            type="checkbox"
            id="regime-enabled"
            checked={formData.regime_scaling_enabled}
            onChange={(e) => updateField('regime_scaling_enabled', e.target.checked)}
          />
          <label htmlFor="regime-enabled" className="toggle-label">
            <span className="toggle-text">Enable Regime Detection</span>
            <span className="toggle-desc">Automatically detect market conditions and adjust strategy</span>
          </label>
        </div>
      </div>

      {formData.regime_scaling_enabled && (
        <>
          {/* Detection Method */}
          <div className="detection-method-section">
            <h4>Detection Method</h4>
            <div className="method-options">
              <button
                type="button"
                className={`method-btn ${!formData.use_hmm_regime ? 'active' : ''}`}
                onClick={() => updateField('use_hmm_regime', false)}
              >
                <BarChart3 size={20} />
                <div className="method-info">
                  <span className="method-name">VIX-Based</span>
                  <span className="method-desc">Simple, interpretable rules using VIX levels</span>
                </div>
              </button>
              <button
                type="button"
                className={`method-btn ${formData.use_hmm_regime ? 'active' : ''}`}
                onClick={() => updateField('use_hmm_regime', true)}
              >
                <Brain size={20} />
                <div className="method-info">
                  <span className="method-name">HMM Model</span>
                  <span className="method-desc">ML-based Hidden Markov Model with transition probabilities</span>
                </div>
              </button>
            </div>
          </div>

          {/* VIX Settings (if VIX-based) */}
          {!formData.use_hmm_regime && (
            <div className="vix-settings">
              <h4>VIX Thresholds</h4>
              <div className="vix-input-row">
                <div className="vix-input-group">
                  <label>Crisis Threshold</label>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      value={formData.vix_crisis_threshold || 35}
                      onChange={(e) => updateField('vix_crisis_threshold', parseFloat(e.target.value))}
                      min={25}
                      max={50}
                    />
                    <span className="suffix">VIX</span>
                  </div>
                  <span className="input-hint">Above this = Crisis regime</span>
                </div>
                <div className="vix-input-group">
                  <label>High Vol Threshold</label>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      value={formData.vix_high_threshold || 25}
                      onChange={(e) => updateField('vix_high_threshold', parseFloat(e.target.value))}
                      min={18}
                      max={35}
                    />
                    <span className="suffix">VIX</span>
                  </div>
                  <span className="input-hint">Above this = High Vol regime</span>
                </div>
                <div className="vix-input-group">
                  <label>Low Vol Threshold</label>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      value={formData.vix_low_threshold || 15}
                      onChange={(e) => updateField('vix_low_threshold', parseFloat(e.target.value))}
                      min={10}
                      max={20}
                    />
                    <span className="suffix">VIX</span>
                  </div>
                  <span className="input-hint">Below this = Low Vol regime</span>
                </div>
              </div>
            </div>
          )}

          {/* Exposure Multipliers */}
          <div className="exposure-section">
            <h4>Position Size Multipliers</h4>
            <p className="section-desc">
              Adjust how much of your target position size to use in each regime.
            </p>

            <div className="exposure-grid">
              {REGIME_TYPES.map(regime => {
                const RegimeIcon = regime.icon;
                const exposure = formData.regime_exposures?.[regime.id] ??
                  (regime.id === 'CRISIS' ? 0.25 :
                   regime.id === 'HIGH_VOL' ? 0.5 :
                   regime.id === 'LOW_VOL' ? 1.0 : 0.75);

                return (
                  <div key={regime.id} className="exposure-card" style={{ '--regime-color': regime.color }}>
                    <div className="exposure-header">
                      <RegimeIcon size={20} style={{ color: regime.color }} />
                      <span className="regime-label">{regime.label}</span>
                    </div>
                    <p className="regime-desc">{regime.description}</p>
                    <div className="exposure-control">
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={exposure}
                        onChange={(e) => handleExposureChange(regime.id, e.target.value)}
                        style={{ '--slider-color': regime.color }}
                      />
                      <span className="exposure-value" style={{ color: regime.color }}>
                        {(exposure * 100).toFixed(0)}%
                      </span>
                    </div>
                    {exposure === 0 && (
                      <div className="paused-indicator">
                        <Pause size={12} />
                        <span>No new positions</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Crisis Behavior */}
          <div className="crisis-behavior-section">
            <h4>Crisis Behavior</h4>
            <div className="behavior-options">
              <div className="toggle-row">
                <input
                  type="checkbox"
                  id="pause-in-crisis"
                  checked={formData.pause_in_crisis}
                  onChange={(e) => updateField('pause_in_crisis', e.target.checked)}
                />
                <label htmlFor="pause-in-crisis" className="toggle-label">
                  <Pause size={16} />
                  <div>
                    <span className="toggle-text">Pause New Positions in Crisis</span>
                    <span className="toggle-desc">Don't open new positions when market is in crisis</span>
                  </div>
                </label>
              </div>

              <div className="toggle-row">
                <input
                  type="checkbox"
                  id="tighten-stops"
                  checked={formData.tighten_stops_in_crisis ?? true}
                  onChange={(e) => updateField('tighten_stops_in_crisis', e.target.checked)}
                />
                <label htmlFor="tighten-stops" className="toggle-label">
                  <AlertTriangle size={16} />
                  <div>
                    <span className="toggle-text">Tighten Stop Losses</span>
                    <span className="toggle-desc">Use tighter stops during high volatility</span>
                  </div>
                </label>
              </div>

              <div className="toggle-row">
                <input
                  type="checkbox"
                  id="defensive-signals"
                  checked={formData.prefer_defensive_in_crisis ?? true}
                  onChange={(e) => updateField('prefer_defensive_in_crisis', e.target.checked)}
                />
                <label htmlFor="defensive-signals" className="toggle-label">
                  <Play size={16} />
                  <div>
                    <span className="toggle-text">Prefer Defensive Signals</span>
                    <span className="toggle-desc">Weight value/quality signals higher during stress</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="regime-info-box">
            <Info size={16} />
            <div>
              <strong>How Regime Detection Works</strong>
              <p>
                {formData.use_hmm_regime
                  ? 'The HMM model uses historical returns, volatility, and market breadth to identify hidden market states. Transitions between regimes are probabilistic, reducing whipsaws.'
                  : 'VIX-based detection uses the CBOE Volatility Index as a direct measure of market fear. Higher VIX indicates higher expected volatility and triggers defensive behavior.'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default RegimeConfigStep;
