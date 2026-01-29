// frontend/src/components/alerts/MarketContextCard.jsx
// Displays current market regime and context for alerts

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Activity, AlertTriangle, Minus } from '../icons';
import { alertsAPI } from '../../services/api';
import './MarketContextCard.css';

const REGIME_CONFIG = {
  BULL: {
    label: 'Bull Market',
    description: 'Strong uptrend with low volatility',
    icon: TrendingUp,
    color: 'bull',
    advice: 'Value signals are more significant (rare opportunities). Price drops may be idiosyncratic.'
  },
  BEAR: {
    label: 'Bear Market',
    description: 'Downtrend with elevated uncertainty',
    icon: TrendingDown,
    color: 'bear',
    advice: 'Price alerts less urgent (downtrend expected). Warnings more important. Insider buying is contrarian.'
  },
  SIDEWAYS: {
    label: 'Sideways Market',
    description: 'Range-bound with mixed signals',
    icon: Minus,
    color: 'sideways',
    advice: 'Standard alert thresholds apply. Watch for breakout signals.'
  },
  HIGH_VOL: {
    label: 'High Volatility',
    description: 'Elevated volatility regardless of direction',
    icon: Activity,
    color: 'volatile',
    advice: 'Technical signals may be noisy. Focus on fundamental quality.'
  },
  CRISIS: {
    label: 'Market Stress',
    description: 'Extreme fear and selling pressure',
    icon: AlertTriangle,
    color: 'crisis',
    advice: 'Most alerts suppressed (everything oversold). Insider buying is highly significant.'
  }
};

export default function MarketContextCard({ compact = false }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadContext = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await alertsAPI.getMarketContext();
      if (response.data?.success) {
        setContext(response.data.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load market context');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  if (loading) {
    return (
      <div className={`market-context-card ${compact ? 'compact' : ''} loading`}>
        <Activity className="spinning" size={16} />
        <span>Loading market context...</span>
      </div>
    );
  }

  if (error || !context) {
    return null; // Fail silently for market context
  }

  const regime = context.regime || 'SIDEWAYS';
  const config = REGIME_CONFIG[regime] || REGIME_CONFIG.SIDEWAYS;
  const IconComponent = config.icon;

  if (compact) {
    return (
      <div className={`market-context-card compact ${config.color}`}>
        <IconComponent size={14} />
        <span className="regime-label">{config.label}</span>
        {context.vix && (
          <span className="vix-value">VIX: {context.vix.toFixed(0)}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`market-context-card ${config.color}`}>
      <div className="context-header">
        <div className="regime-indicator">
          <IconComponent size={20} />
          <div className="regime-info">
            <span className="regime-label">{config.label}</span>
            <span className="regime-description">{config.description}</span>
          </div>
        </div>

        {context.vix && (
          <div className="vix-display">
            <span className="vix-label">VIX</span>
            <span className={`vix-value ${context.vix > 30 ? 'high' : context.vix > 20 ? 'elevated' : 'normal'}`}>
              {context.vix.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {(context.sp500Change1w != null || context.sp500Change1m != null || context.breadthRatio != null) && (
        <div className="context-metrics">
          {context.sp500Change1w != null && (
            <div className="metric">
              <span className="metric-label">S&P 500 (1W)</span>
              <span className={`metric-value ${context.sp500Change1w >= 0 ? 'positive' : 'negative'}`}>
                {context.sp500Change1w >= 0 ? '+' : ''}{context.sp500Change1w?.toFixed(1)}%
              </span>
            </div>
          )}
          {context.sp500Change1m != null && (
            <div className="metric">
              <span className="metric-label">S&P 500 (1M)</span>
              <span className={`metric-value ${context.sp500Change1m >= 0 ? 'positive' : 'negative'}`}>
                {context.sp500Change1m >= 0 ? '+' : ''}{context.sp500Change1m?.toFixed(1)}%
              </span>
            </div>
          )}
          {context.breadthRatio != null && (
            <div className="metric">
              <span className="metric-label">Market Breadth</span>
              <span className={`metric-value ${context.breadthRatio > 0.5 ? 'positive' : 'negative'}`}>
                {(context.breadthRatio * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      )}

      <div className="context-advice">
        <span className="advice-label">Alert Implications:</span>
        <p className="advice-text">{config.advice}</p>
      </div>

      {context.detectedAt && (
        <div className="context-footer">
          <span className="detected-at">
            Detected {new Date(context.detectedAt).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>
  );
}
