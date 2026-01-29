// frontend/src/components/agent/RiskLimitsSettings.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Save, RotateCcw, Shield, AlertTriangle, TrendingDown, DollarSign } from '../icons';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Skeleton } from '../Skeleton';
import { attributionAPI } from '../../services/api';
import './RiskLimitsSettings.css';

/**
 * Default risk limits
 */
const DEFAULT_LIMITS = {
  max_position_size: 0.10,
  max_sector_exposure: 0.30,
  max_correlation: 0.70,
  max_drawdown: 0.20,
  min_cash_reserve: 0.05,
  vix_scaling_enabled: true,
  vix_scale_threshold: 25,
  regime_scaling_enabled: true,
  kelly_fraction_cap: 0.25,
  use_half_kelly: true,
};

/**
 * RiskLimitsSettings Component
 *
 * Allows users to configure risk management parameters for their portfolio,
 * including position sizing limits, sector exposure, and volatility adjustments.
 */
function RiskLimitsSettings({ portfolioId, onSave, className = '' }) {
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [originalLimits, setOriginalLimits] = useState(DEFAULT_LIMITS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (portfolioId) {
      fetchLimits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  useEffect(() => {
    // Check if limits have changed from original
    const changed = JSON.stringify(limits) !== JSON.stringify(originalLimits);
    setHasChanges(changed);
  }, [limits, originalLimits]);

  const fetchLimits = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await attributionAPI.getRiskLimits(portfolioId);
      if (response.data?.success) {
        const fetchedLimits = {
          ...DEFAULT_LIMITS,
          ...response.data.data,
          vix_scaling_enabled: Boolean(response.data.data.vix_scaling_enabled),
          regime_scaling_enabled: Boolean(response.data.data.regime_scaling_enabled),
          use_half_kelly: Boolean(response.data.data.use_half_kelly),
        };
        setLimits(fetchedLimits);
        setOriginalLimits(fetchedLimits);
      }
    } catch (err) {
      setError(err.message || 'Failed to load risk limits');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setLimits(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await attributionAPI.updateRiskLimits(portfolioId, limits);
      if (response.data?.success) {
        setOriginalLimits(limits);
        onSave?.(limits);
      } else {
        setError(response.data?.error || 'Failed to save');
      }
    } catch (err) {
      setError(err.message || 'Failed to save risk limits');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setLimits(DEFAULT_LIMITS);
  };

  const handleRevert = () => {
    setLimits(originalLimits);
  };

  if (loading) {
    return (
      <Card variant="glass" className={`risk-limits-settings ${className}`}>
        <Skeleton className="risk-limits-settings__skeleton" />
      </Card>
    );
  }

  return (
    <Card variant="glass" className={`risk-limits-settings ${className}`}>
      <Card.Header>
        <Card.Title>
          <Shield size={20} />
          Risk Management Settings
        </Card.Title>
        <Card.Description>
          Configure position sizing and risk parameters for AI-assisted trading
        </Card.Description>
      </Card.Header>

      <Card.Content>
        <div className="risk-limits-settings__sections">
          {/* Position Limits */}
          <div className="risk-limits-settings__section">
            <h4 className="risk-limits-settings__section-title">
              <DollarSign size={16} />
              Position Limits
            </h4>

            <div className="risk-limits-settings__field">
              <label>
                <span>Max Position Size</span>
                <span className="risk-limits-settings__field-hint">
                  Maximum % of portfolio per position
                </span>
              </label>
              <div className="risk-limits-settings__slider-group">
                <input
                  type="range"
                  min="0.01"
                  max="0.25"
                  step="0.01"
                  value={limits.max_position_size}
                  onChange={(e) => handleChange('max_position_size', parseFloat(e.target.value))}
                />
                <span className="risk-limits-settings__value">
                  {(limits.max_position_size * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="risk-limits-settings__field">
              <label>
                <span>Max Sector Exposure</span>
                <span className="risk-limits-settings__field-hint">
                  Maximum % of portfolio in one sector
                </span>
              </label>
              <div className="risk-limits-settings__slider-group">
                <input
                  type="range"
                  min="0.10"
                  max="0.50"
                  step="0.05"
                  value={limits.max_sector_exposure}
                  onChange={(e) => handleChange('max_sector_exposure', parseFloat(e.target.value))}
                />
                <span className="risk-limits-settings__value">
                  {(limits.max_sector_exposure * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="risk-limits-settings__field">
              <label>
                <span>Minimum Cash Reserve</span>
                <span className="risk-limits-settings__field-hint">
                  Always keep this % in cash
                </span>
              </label>
              <div className="risk-limits-settings__slider-group">
                <input
                  type="range"
                  min="0"
                  max="0.20"
                  step="0.01"
                  value={limits.min_cash_reserve}
                  onChange={(e) => handleChange('min_cash_reserve', parseFloat(e.target.value))}
                />
                <span className="risk-limits-settings__value">
                  {(limits.min_cash_reserve * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Risk Controls */}
          <div className="risk-limits-settings__section">
            <h4 className="risk-limits-settings__section-title">
              <TrendingDown size={16} />
              Risk Controls
            </h4>

            <div className="risk-limits-settings__field">
              <label>
                <span>Max Drawdown Pause</span>
                <span className="risk-limits-settings__field-hint">
                  Pause new positions when drawdown exceeds this
                </span>
              </label>
              <div className="risk-limits-settings__slider-group">
                <input
                  type="range"
                  min="0.05"
                  max="0.30"
                  step="0.01"
                  value={limits.max_drawdown}
                  onChange={(e) => handleChange('max_drawdown', parseFloat(e.target.value))}
                />
                <span className="risk-limits-settings__value">
                  {(limits.max_drawdown * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="risk-limits-settings__field">
              <label>
                <span>Max Correlation</span>
                <span className="risk-limits-settings__field-hint">
                  Avoid adding highly correlated positions
                </span>
              </label>
              <div className="risk-limits-settings__slider-group">
                <input
                  type="range"
                  min="0.40"
                  max="0.90"
                  step="0.05"
                  value={limits.max_correlation}
                  onChange={(e) => handleChange('max_correlation', parseFloat(e.target.value))}
                />
                <span className="risk-limits-settings__value">
                  {(limits.max_correlation * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Volatility Adjustments */}
          <div className="risk-limits-settings__section">
            <h4 className="risk-limits-settings__section-title">
              <AlertTriangle size={16} />
              Volatility Adjustments
            </h4>

            <div className="risk-limits-settings__field risk-limits-settings__field--toggle">
              <label>
                <span>VIX-Based Scaling</span>
                <span className="risk-limits-settings__field-hint">
                  Reduce position sizes when VIX is elevated
                </span>
              </label>
              <input
                type="checkbox"
                checked={limits.vix_scaling_enabled}
                onChange={(e) => handleChange('vix_scaling_enabled', e.target.checked)}
              />
            </div>

            {limits.vix_scaling_enabled && (
              <div className="risk-limits-settings__field">
                <label>
                  <span>VIX Scale Threshold</span>
                  <span className="risk-limits-settings__field-hint">
                    Start reducing positions above this VIX level
                  </span>
                </label>
                <div className="risk-limits-settings__slider-group">
                  <input
                    type="range"
                    min="15"
                    max="35"
                    step="1"
                    value={limits.vix_scale_threshold}
                    onChange={(e) => handleChange('vix_scale_threshold', parseInt(e.target.value))}
                  />
                  <span className="risk-limits-settings__value">
                    {limits.vix_scale_threshold}
                  </span>
                </div>
              </div>
            )}

            <div className="risk-limits-settings__field risk-limits-settings__field--toggle">
              <label>
                <span>Regime-Based Scaling</span>
                <span className="risk-limits-settings__field-hint">
                  Adjust sizing based on market regime
                </span>
              </label>
              <input
                type="checkbox"
                checked={limits.regime_scaling_enabled}
                onChange={(e) => handleChange('regime_scaling_enabled', e.target.checked)}
              />
            </div>
          </div>

          {/* Position Sizing */}
          <div className="risk-limits-settings__section">
            <h4 className="risk-limits-settings__section-title">
              Kelly Criterion Settings
            </h4>

            <div className="risk-limits-settings__field">
              <label>
                <span>Kelly Fraction Cap</span>
                <span className="risk-limits-settings__field-hint">
                  Maximum position size from Kelly calculation
                </span>
              </label>
              <div className="risk-limits-settings__slider-group">
                <input
                  type="range"
                  min="0.10"
                  max="0.50"
                  step="0.05"
                  value={limits.kelly_fraction_cap}
                  onChange={(e) => handleChange('kelly_fraction_cap', parseFloat(e.target.value))}
                />
                <span className="risk-limits-settings__value">
                  {(limits.kelly_fraction_cap * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="risk-limits-settings__field risk-limits-settings__field--toggle">
              <label>
                <span>Use Half Kelly</span>
                <span className="risk-limits-settings__field-hint">
                  More conservative sizing (recommended)
                </span>
              </label>
              <input
                type="checkbox"
                checked={limits.use_half_kelly}
                onChange={(e) => handleChange('use_half_kelly', e.target.checked)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="risk-limits-settings__error">
            {error}
          </div>
        )}
      </Card.Content>

      <Card.Footer>
        <div className="risk-limits-settings__actions">
          <div className="risk-limits-settings__actions-left">
            <Button variant="ghost" onClick={handleReset} icon={RotateCcw}>
              Reset to Defaults
            </Button>
            {hasChanges && (
              <Button variant="ghost" onClick={handleRevert}>
                Revert Changes
              </Button>
            )}
          </div>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
            icon={Save}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </Card.Footer>
    </Card>
  );
}

RiskLimitsSettings.propTypes = {
  portfolioId: PropTypes.number.isRequired,
  onSave: PropTypes.func,
  className: PropTypes.string,
};

export default RiskLimitsSettings;
