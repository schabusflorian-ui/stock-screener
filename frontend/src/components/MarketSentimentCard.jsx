import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Activity, TrendingUp, TrendingDown, RefreshCw, AlertTriangle } from 'lucide-react';
import { sentimentAPI } from '../services/api';
import './MarketSentimentCard.css';

const FEAR_GREED_LABELS = {
  extreme_fear: { color: '#EF4444', label: 'Extreme Fear' },
  fear: { color: '#F87171', label: 'Fear' },
  neutral: { color: '#94A3B8', label: 'Neutral' },
  greed: { color: '#34D399', label: 'Greed' },
  extreme_greed: { color: '#10B981', label: 'Extreme Greed' },
};

const VIX_LABELS = {
  extreme_fear: { color: '#EF4444', label: 'Extreme Fear' },
  fear: { color: '#F87171', label: 'High Volatility' },
  caution: { color: '#FBBF24', label: 'Elevated' },
  neutral: { color: '#94A3B8', label: 'Normal' },
  complacency: { color: '#10B981', label: 'Low Volatility' },
};

function MarketSentimentCardComponent({ onRefresh, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sentimentAPI.getMarket(refresh);
      setData(response.data);
    } catch (err) {
      console.error('Error loading market sentiment:', err);
      setError('Failed to load market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    await loadData(true);
    if (onRefresh) onRefresh();
  }, [loadData, onRefresh]);

  if (loading && !data) {
    return (
      <div className={`market-sentiment-card ${compact ? 'compact' : ''}`}>
        <div className="market-loading">
          <RefreshCw className="spin" size={20} />
          <span>Loading market sentiment...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`market-sentiment-card ${compact ? 'compact' : ''}`}>
        <div className="market-error">
          <AlertTriangle size={20} />
          <span>{error}</span>
          <button onClick={handleRefresh} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  const cnn = data?.cnn || {};
  const vix = data?.vix || {};
  const overall = data?.overall || {};

  // Memoize config lookups and calculations to avoid recalculating on every render
  const fearGreedConfig = useMemo(
    () => FEAR_GREED_LABELS[cnn.label] || FEAR_GREED_LABELS.neutral,
    [cnn.label]
  );

  const vixConfig = useMemo(
    () => VIX_LABELS[vix.label] || VIX_LABELS.neutral,
    [vix.label]
  );

  // Calculate gauge angle (0-100 maps to -90 to 90 degrees)
  const gaugeAngle = useMemo(
    () => cnn.value != null ? (cnn.value / 100) * 180 - 90 : 0,
    [cnn.value]
  );

  if (compact) {
    return (
      <div className="market-sentiment-card compact">
        <div className="compact-row">
          <div className="compact-item">
            <span className="compact-label">Fear & Greed</span>
            <span className="compact-value" style={{ color: fearGreedConfig.color }}>
              {cnn.value ?? '--'}
            </span>
            <span className="compact-status" style={{ color: fearGreedConfig.color }}>
              {fearGreedConfig.label}
            </span>
          </div>
          <div className="compact-divider" />
          <div className="compact-item">
            <span className="compact-label">VIX</span>
            <span className="compact-value" style={{ color: vixConfig.color }}>
              {vix.value ?? '--'}
            </span>
            <span className="compact-status">
              {vix.changePercent != null && (
                <span className={vix.change >= 0 ? 'up' : 'down'}>
                  {vix.change >= 0 ? '+' : ''}{vix.changePercent}%
                </span>
              )}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            className="compact-refresh"
            disabled={loading}
            title="Refresh market data"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="market-sentiment-card">
      <div className="market-header">
        <div className="market-title">
          <Activity size={18} />
          <h3>Market Sentiment</h3>
        </div>
        <button
          onClick={handleRefresh}
          className="refresh-btn"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="market-grid">
        {/* Fear & Greed Gauge */}
        <div className="gauge-container">
          <div className="gauge-title">CNN Fear & Greed Index</div>
          <div className="gauge">
            <svg viewBox="0 0 200 120" className="gauge-svg">
              {/* Background arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="var(--border-default)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              {/* Gradient arc segments */}
              <defs>
                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="25%" stopColor="#F87171" />
                  <stop offset="50%" stopColor="#94A3B8" />
                  <stop offset="75%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#10B981" />
                </linearGradient>
              </defs>
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="url(#gaugeGradient)"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.3"
              />
              {/* Needle */}
              {cnn.value != null && (
                <g transform={`rotate(${gaugeAngle}, 100, 100)`}>
                  <line
                    x1="100"
                    y1="100"
                    x2="100"
                    y2="35"
                    stroke={fearGreedConfig.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="100" cy="100" r="8" fill={fearGreedConfig.color} />
                </g>
              )}
            </svg>
            <div className="gauge-value" style={{ color: fearGreedConfig.color }}>
              {cnn.value ?? '--'}
            </div>
            <div className="gauge-label" style={{ color: fearGreedConfig.color }}>
              {fearGreedConfig.label}
            </div>
            {cnn.change != null && (
              <div className={`gauge-change ${cnn.change >= 0 ? 'up' : 'down'}`}>
                {cnn.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {cnn.change >= 0 ? '+' : ''}{cnn.change} from yesterday
              </div>
            )}
          </div>
        </div>

        {/* VIX Panel */}
        <div className="vix-container">
          <div className="vix-title">VIX (Volatility Index)</div>
          <div className="vix-value" style={{ color: vixConfig.color }}>
            {vix.value ?? '--'}
          </div>
          <div className="vix-label">{vixConfig.label}</div>
          {vix.change != null && (
            <div className={`vix-change ${vix.change >= 0 ? 'up' : 'down'}`}>
              {vix.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {vix.change >= 0 ? '+' : ''}{vix.change} ({vix.changePercent}%)
            </div>
          )}
          {vix.high5d != null && vix.low5d != null && (
            <div className="vix-range">
              <span>5d Range:</span>
              <span className="range-values">{vix.low5d} - {vix.high5d}</span>
            </div>
          )}
        </div>
      </div>

      {/* Overall Market Sentiment */}
      {overall.sentiment != null && (
        <div className="overall-sentiment">
          <div className="overall-label">Overall Market Sentiment</div>
          <div className="overall-bar">
            <div
              className="overall-fill"
              style={{
                width: `${(overall.sentiment + 1) * 50}%`,
                backgroundColor: overall.sentiment > 0.1
                  ? '#10B981'
                  : overall.sentiment < -0.1
                    ? '#EF4444'
                    : '#94A3B8'
              }}
            />
            <div
              className="overall-indicator"
              style={{ left: `${(overall.sentiment + 1) * 50}%` }}
            />
          </div>
          <div className="overall-labels">
            <span>Fear</span>
            <span className="overall-value">
              {overall.label?.replace('_', ' ').toUpperCase()}
            </span>
            <span>Greed</span>
          </div>
        </div>
      )}

      {/* Components breakdown */}
      {cnn.components && Object.keys(cnn.components).length > 0 && (
        <div className="components-section">
          <div className="components-title">Index Components</div>
          <div className="components-grid">
            {Object.entries(cnn.components).map(([name, comp]) => {
              const compConfig = FEAR_GREED_LABELS[comp.label] || FEAR_GREED_LABELS.neutral;
              return (
                <div key={name} className="component-item">
                  <span className="component-name">{name}</span>
                  <span className="component-value" style={{ color: compConfig.color }}>
                    {comp.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data?.timestamp && (
        <div className="market-timestamp">
          Last updated: {new Date(data.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// Wrap with memo for performance - prevents re-renders when parent changes
export const MarketSentimentCard = memo(MarketSentimentCardComponent);

export default MarketSentimentCard;
