import React from 'react';
import PropTypes from 'prop-types';
import { TrendingUp, TrendingDown, AlertTriangle, Minus, Activity } from 'lucide-react';
import './RegimeIndicator.css';

const REGIME_CONFIG = {
  BULL: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: TrendingUp, label: 'Bull Market' },
  BEAR: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: TrendingDown, label: 'Bear Market' },
  SIDEWAYS: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: Minus, label: 'Sideways' },
  HIGH_VOL: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: AlertTriangle, label: 'High Volatility' },
  CRISIS: { color: '#dc2626', bg: 'rgba(220,38,38,0.15)', icon: AlertTriangle, label: 'Crisis' },
};

export function RegimeIndicator({ regime, compact = false, showDetails = true }) {
  const config = REGIME_CONFIG[regime?.regime] || REGIME_CONFIG.SIDEWAYS;
  const Icon = config.icon;

  if (!regime) {
    return (
      <div className="regime-indicator regime-indicator--loading">
        <Activity className="animate-pulse" size={20} />
        <span>Loading regime...</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="regime-indicator regime-indicator--compact" 
           style={{ '--regime-color': config.color, '--regime-bg': config.bg }}>
        <Icon size={16} />
        <span className="regime-label">{config.label}</span>
        {regime.confidence && <span className="regime-confidence">{Math.round(regime.confidence * 100)}%</span>}
      </div>
    );
  }

  return (
    <div className="regime-indicator" style={{ '--regime-color': config.color, '--regime-bg': config.bg }}>
      <div className="regime-header">
        <div className="regime-icon"><Icon size={24} /></div>
        <div className="regime-info">
          <h4 className="regime-title">{config.label}</h4>
          <p className="regime-description">{regime.description || 'Current market classification'}</p>
        </div>
        {regime.confidence && (
          <div className="regime-confidence-badge">{Math.round(regime.confidence * 100)}% confidence</div>
        )}
      </div>
      
      {showDetails && (
        <div className="regime-details">
          <div className="regime-metric">
            <span className="metric-label">VIX</span>
            <span className="metric-value" style={{ color: regime.vix > 30 ? '#ef4444' : regime.vix > 25 ? '#f59e0b' : '#10b981' }}>
              {regime.vix?.toFixed(1) || 'N/A'}
            </span>
          </div>
          <div className="regime-metric">
            <span className="metric-label">Breadth</span>
            <span className="metric-value">{regime.breadth?.toFixed(0) || 'N/A'}%</span>
          </div>
          <div className="regime-metric">
            <span className="metric-label">Trend</span>
            <span className="metric-value" style={{ color: regime.trendStrength > 0 ? '#10b981' : regime.trendStrength < 0 ? '#ef4444' : '#6b7280' }}>
              {regime.trendStrength ? (regime.trendStrength > 0 ? '+' : '') + (regime.trendStrength * 100).toFixed(1) + '%' : 'N/A'}
            </span>
          </div>
        </div>
      )}

      {regime.timestamp && (
        <div className="regime-footer">Updated: {new Date(regime.timestamp).toLocaleString()}</div>
      )}
    </div>
  );
}

RegimeIndicator.propTypes = {
  regime: PropTypes.shape({
    regime: PropTypes.string,
    confidence: PropTypes.number,
    description: PropTypes.string,
    vix: PropTypes.number,
    breadth: PropTypes.number,
    trendStrength: PropTypes.number,
    timestamp: PropTypes.string,
  }),
  compact: PropTypes.bool,
  showDetails: PropTypes.bool,
};

export default RegimeIndicator;
