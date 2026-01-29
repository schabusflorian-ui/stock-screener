// frontend/src/components/agent/HedgeSuggestionsPanel.js
// Display hedge analysis during high-risk regimes (educational purposes only)

import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  TrendingDown,
  Activity,
  RefreshCw,
  Check,
  Info,
  DollarSign,
  IconButton
} from '../icons';
import { hedgeAPI } from '../../services/api';
import ComplianceDisclaimer from '../ui/ComplianceDisclaimer';
import './HedgeSuggestionsPanel.css';

// Hedge type icons and colors
const HEDGE_TYPES = {
  index_put: { label: 'Index Put', icon: TrendingDown, color: 'blue', colorScheme: 'analytics' },
  vix_call: { label: 'VIX Call', icon: Activity, color: 'purple', colorScheme: 'ai' },
  sector_hedge: { label: 'Sector Hedge', icon: Shield, color: 'orange', colorScheme: 'risk' },
  raise_cash: { label: 'Raise Cash', icon: DollarSign, color: 'green', colorScheme: 'growth' }
};

function HedgeSuggestionsPanel({ portfolioId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);

  useEffect(() => {
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await hedgeAPI.getSuggestions(portfolioId);
      setData(res.data);
    } catch (err) {
      console.error('Error loading hedge suggestions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatPercent = (value, decimals = 1) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(decimals)}%`;
  };

  const getRegimeBadge = (regime) => {
    const regimeMap = {
      HIGH_VOL: { label: 'High Volatility', class: 'high-vol' },
      CRISIS: { label: 'Crisis', class: 'crisis' },
      BULL: { label: 'Bull Market', class: 'bull' },
      BEAR: { label: 'Bear Market', class: 'bear' },
      SIDEWAYS: { label: 'Sideways', class: 'sideways' }
    };
    const r = regimeMap[regime] || { label: regime, class: 'unknown' };
    return <span className={`regime-badge ${r.class}`}>{r.label}</span>;
  };

  if (loading) {
    return (
      <div className="hedge-suggestions loading">
        <RefreshCw size={24} className="spinning" />
        <span>Analyzing portfolio risk...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hedge-suggestions error">
        <AlertTriangle size={24} />
        <p>Error loading suggestions: {error}</p>
        <button className="btn btn-secondary" onClick={loadSuggestions}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const { hedgesNeeded, regime, portfolioBeta, currentVaR, suggestions, analysis } = data || {};

  return (
    <div className="hedge-suggestions">
      {/* Header with Regime Alert */}
      <div className="hedge-header">
        <div className="header-title">
          <Shield size={20} />
          <h3>Hedge Suggestions</h3>
        </div>
        {regime && getRegimeBadge(regime)}
      </div>

      {/* Risk Alert Banner */}
      {hedgesNeeded ? (
        <div className="risk-alert warning">
          <AlertTriangle size={20} />
          <div className="alert-content">
            <strong>Elevated Market Risk Indicators Detected</strong>
            <p>
              Current market regime ({regime?.replace('_', ' ')}) analysis indicates potential
              hedging scenarios for your consideration (educational analysis only).
            </p>
          </div>
        </div>
      ) : (
        <div className="risk-alert normal">
          <Check size={20} />
          <div className="alert-content">
            <strong>Low Risk Indicators</strong>
            <p>
              Current market conditions show stable risk metrics.
              Continue monitoring for regime changes.
            </p>
          </div>
        </div>
      )}

      {/* Portfolio Risk Metrics */}
      <div className="risk-metrics">
        <div className="metric-card">
          <span className="metric-label">Portfolio Beta</span>
          <span className="metric-value">{portfolioBeta?.toFixed(2) || '-'}</span>
          <span className="metric-desc">vs S&P 500</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">95% VaR</span>
          <span className="metric-value negative">{formatValue(currentVaR)}</span>
          <span className="metric-desc">Daily risk</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">VIX Level</span>
          <span className={`metric-value ${(analysis?.vixLevel || 0) > 25 ? 'warning' : ''}`}>
            {analysis?.vixLevel?.toFixed(1) || '-'}
          </span>
          <span className="metric-desc">Current</span>
        </div>
      </div>

      {/* Hedge Suggestions */}
      {hedgesNeeded && suggestions && suggestions.length > 0 ? (
        <div className="suggestions-section">
          <h4>Hedge Scenarios for Consideration</h4>
          <div className="suggestions-grid">
            {suggestions.map((suggestion, idx) => {
              const hedgeType = HEDGE_TYPES[suggestion.type] || HEDGE_TYPES.index_put;
              const IconComponent = hedgeType.icon;
              const isExpanded = expandedCard === idx;

              return (
                <div
                  key={idx}
                  className={`suggestion-card ${hedgeType.color} ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedCard(isExpanded ? null : idx)}
                >
                  <div className="card-header">
                    <IconButton
                      icon={IconComponent}
                      colorScheme={hedgeType.colorScheme}
                      size="small"
                      className="card-icon-btn"
                    />
                    <div className="card-title">
                      <h5>{hedgeType.label}</h5>
                      <span className="card-underlying">{suggestion.underlying}</span>
                    </div>
                    <div className="card-priority">
                      {suggestion.priority === 'high' && (
                        <span className="priority-badge high">High Priority</span>
                      )}
                    </div>
                  </div>

                  <div className="card-summary">
                    <div className="summary-item">
                      <span className="summary-label">Hedge Ratio</span>
                      <span className="summary-value">{formatPercent(suggestion.hedgeRatio)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Est. Cost</span>
                      <span className="summary-value">{formatValue(suggestion.estimatedCost)}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="card-details">
                      <p className="rationale">{suggestion.rationale}</p>

                      {suggestion.type === 'index_put' && (
                        <div className="option-details">
                          <div className="detail-row">
                            <span>Strike:</span>
                            <span>{suggestion.strike}</span>
                          </div>
                          <div className="detail-row">
                            <span>Expiry:</span>
                            <span>{suggestion.expiry}</span>
                          </div>
                          <div className="detail-row">
                            <span>Contracts:</span>
                            <span>{suggestion.contracts}</span>
                          </div>
                        </div>
                      )}

                      {suggestion.type === 'vix_call' && (
                        <div className="option-details">
                          <div className="detail-row">
                            <span>Strike:</span>
                            <span>{suggestion.strike}</span>
                          </div>
                          <div className="detail-row">
                            <span>Contracts:</span>
                            <span>{suggestion.contracts}</span>
                          </div>
                        </div>
                      )}

                      {suggestion.type === 'sector_hedge' && (
                        <div className="option-details">
                          <div className="detail-row">
                            <span>Sector:</span>
                            <span>{suggestion.sector}</span>
                          </div>
                          <div className="detail-row">
                            <span>Shares to Reduce:</span>
                            <span>{suggestion.sharesToReduce}</span>
                          </div>
                        </div>
                      )}

                      {suggestion.type === 'raise_cash' && (
                        <div className="option-details">
                          <div className="detail-row">
                            <span>Target Cash %:</span>
                            <span>{formatPercent(suggestion.targetCashPct)}</span>
                          </div>
                          <div className="detail-row">
                            <span>Amount to Raise:</span>
                            <span>{formatValue(suggestion.amountToRaise)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : hedgesNeeded ? (
        <div className="no-suggestions">
          <Info size={24} />
          <p>No specific hedge recommendations available at this time.</p>
        </div>
      ) : null}

      {/* Info Box */}
      <div className="info-box">
        <Info size={16} />
        <div>
          <strong>About Hedge Analysis</strong>
          <p>
            This analysis is based on your portfolio's beta exposure, current market volatility (VIX),
            and the detected market regime. Hedge scenarios are shown during HIGH_VOL or CRISIS conditions
            for educational purposes only. This is not investment advice - always consult with a qualified
            financial advisor before implementing any options strategies.
          </p>
        </div>
      </div>

      {/* Compliance Disclaimer */}
      <ComplianceDisclaimer variant="inline" type="analysis" />
    </div>
  );
}

export default HedgeSuggestionsPanel;
