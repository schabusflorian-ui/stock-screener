// frontend/src/components/agent/RecommendationPerformance.js
// Displays IC by signal type, hit rate by regime, and optimal weights

import { useState, useEffect } from 'react';
import {
  BarChart3,
  Activity,
  RefreshCw,
  Info,
  Scale,
  Target,
  AlertCircle
} from 'lucide-react';
import { recommendationsAPI } from '../../services/api';
import './RecommendationPerformance.css';

// Signal type labels for display
const SIGNAL_LABELS = {
  technical: 'Technical',
  sentiment: 'Sentiment',
  insider: 'Insider',
  fundamental: 'Fundamental',
  alternative: 'Alternative',
  valuation: 'Valuation',
  filing_13f: '13F Activity',
  earnings: 'Earnings'
};

// Regime labels
const REGIME_LABELS = {
  BULL: 'Bull Market',
  BEAR: 'Bear Market',
  SIDEWAYS: 'Sideways',
  HIGH_VOL: 'High Volatility',
  CRISIS: 'Crisis',
  ALL: 'All Regimes'
};

function RecommendationPerformance() {
  const [period, setPeriod] = useState('90d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [signalData, setSignalData] = useState(null);
  const [regimeData, setRegimeData] = useState(null);
  const [weightComparison, setWeightComparison] = useState(null);

  const periods = [
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: '1y', label: '1 Year' },
    { value: 'all', label: 'All Time' }
  ];

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [perfRes, signalRes, regimeRes, weightRes] = await Promise.all([
        recommendationsAPI.getPerformance(period).catch(() => ({ data: null })),
        recommendationsAPI.getBySignal(period).catch(() => ({ data: null })),
        recommendationsAPI.getByRegime(period).catch(() => ({ data: null })),
        recommendationsAPI.getWeightComparison('ALL').catch(() => ({ data: null }))
      ]);

      setPerformance(perfRes.data);
      setSignalData(signalRes.data);
      setRegimeData(regimeRes.data);
      setWeightComparison(weightRes.data);
    } catch (err) {
      console.error('Error loading performance data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value, decimals = 1) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(decimals)}%`;
  };

  const formatIC = (ic) => {
    if (ic === null || ic === undefined) return '-';
    return ic.toFixed(3);
  };

  const getICColor = (ic) => {
    if (ic === null || ic === undefined) return 'neutral';
    if (ic > 0.1) return 'strong-positive';
    if (ic > 0.05) return 'positive';
    if (ic > 0) return 'slight-positive';
    if (ic > -0.05) return 'slight-negative';
    if (ic > -0.1) return 'negative';
    return 'strong-negative';
  };

  const getICWidth = (ic) => {
    if (ic === null || ic === undefined) return 0;
    // Scale IC to bar width (IC typically ranges from -0.3 to +0.3)
    const absIC = Math.abs(ic);
    return Math.min(absIC * 300, 100); // 0.33 IC = 100% width
  };

  if (loading) {
    return (
      <div className="recommendation-performance loading">
        <div className="loading-spinner">
          <RefreshCw size={24} className="spinning" />
          <span>Loading performance data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recommendation-performance error">
        <AlertCircle size={24} />
        <p>Error loading data: {error}</p>
        <button className="btn btn-secondary" onClick={loadData}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const hasData = performance?.totalRecommendations > 0;

  return (
    <div className="recommendation-performance">
      {/* Header */}
      <div className="perf-header">
        <div className="perf-title">
          <BarChart3 size={20} />
          <h3>Signal Performance</h3>
          <span className="info-tooltip">
            <Info size={14} />
            <span className="tooltip-text">
              Information Coefficient (IC) measures how well each signal predicts future returns.
              Higher IC = better predictive power.
            </span>
          </span>
        </div>
        <div className="period-selector">
          {periods.map(p => (
            <button
              key={p.value}
              className={`period-btn ${period === p.value ? 'active' : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="no-data-message">
          <Activity size={32} />
          <h4>No Recommendation Data Yet</h4>
          <p>
            Performance metrics will appear here once the AI trading system generates
            recommendations and enough time passes to measure outcomes.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="perf-summary">
            <div className="summary-stat">
              <span className="stat-label">Total Recommendations</span>
              <span className="stat-value">{performance?.totalRecommendations || 0}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Hit Rate</span>
              <span className={`stat-value ${(performance?.hitRate || 0) > 0.5 ? 'positive' : 'negative'}`}>
                {formatPercent(performance?.hitRate)}
              </span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Avg Return (21d)</span>
              <span className={`stat-value ${(performance?.avgReturn || 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(performance?.avgReturn)}
              </span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Avg Alpha (21d)</span>
              <span className={`stat-value ${(performance?.avgAlpha || 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(performance?.avgAlpha)}
              </span>
            </div>
          </div>

          {/* IC by Signal Type */}
          <div className="perf-section">
            <h4>
              <Target size={16} />
              Information Coefficient by Signal
            </h4>
            <div className="ic-chart">
              {signalData?.signals && Object.entries(signalData.signals).map(([signal, data]) => (
                <div key={signal} className="ic-row">
                  <span className="ic-label">{SIGNAL_LABELS[signal] || signal}</span>
                  <div className="ic-bar-container">
                    <div
                      className={`ic-bar ${data.ic >= 0 ? 'positive' : 'negative'}`}
                      style={{
                        width: `${getICWidth(data.ic)}%`,
                        marginLeft: data.ic < 0 ? 'auto' : '50%',
                        marginRight: data.ic >= 0 ? 'auto' : '50%',
                        transform: data.ic < 0 ? 'translateX(-100%)' : 'none'
                      }}
                    />
                    <div className="ic-center-line" />
                  </div>
                  <span className={`ic-value ${getICColor(data.ic)}`}>
                    {formatIC(data.ic)}
                  </span>
                  <span className="ic-samples">n={data.sampleSize || 0}</span>
                </div>
              ))}
            </div>
            <div className="ic-legend">
              <span className="legend-item negative">Negative IC (contrarian signal)</span>
              <span className="legend-item neutral">Zero IC (no predictive value)</span>
              <span className="legend-item positive">Positive IC (predictive)</span>
            </div>
          </div>

          {/* Performance by Regime */}
          <div className="perf-section">
            <h4>
              <Activity size={16} />
              Performance by Market Regime
            </h4>
            <div className="regime-table">
              <div className="regime-header">
                <span>Regime</span>
                <span>Recommendations</span>
                <span>Hit Rate</span>
                <span>Avg Return</span>
                <span>Alpha</span>
              </div>
              {regimeData?.regimes && Object.entries(regimeData.regimes).map(([regime, data]) => (
                <div key={regime} className="regime-row">
                  <span className={`regime-name regime-${regime.toLowerCase()}`}>
                    {REGIME_LABELS[regime] || regime}
                  </span>
                  <span className="regime-count">{data.count || 0}</span>
                  <span className={`regime-hitrate ${(data.hitRate || 0) > 0.5 ? 'positive' : 'negative'}`}>
                    {formatPercent(data.hitRate)}
                  </span>
                  <span className={`regime-return ${(data.avgReturn || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(data.avgReturn)}
                  </span>
                  <span className={`regime-alpha ${(data.alpha || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(data.alpha)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Weight Comparison */}
          {weightComparison?.comparison && (
            <div className="perf-section">
              <h4>
                <Scale size={16} />
                Signal Weights: Base vs Optimized
              </h4>
              <div className="weight-comparison">
                {Object.entries(weightComparison.comparison).map(([signal, data]) => (
                  <div key={signal} className="weight-row">
                    <span className="weight-label">{SIGNAL_LABELS[signal] || signal}</span>
                    <div className="weight-bars">
                      <div className="weight-bar-group">
                        <div
                          className="weight-bar base"
                          style={{ width: `${(data.base || 0) * 100}%` }}
                        />
                        <span className="weight-value">{formatPercent(data.base)}</span>
                      </div>
                      <div className="weight-bar-group">
                        <div
                          className="weight-bar optimized"
                          style={{ width: `${(data.optimized || 0) * 100}%` }}
                        />
                        <span className="weight-value">{formatPercent(data.optimized)}</span>
                      </div>
                    </div>
                    <span className={`weight-change ${parseFloat(data.percentChange) >= 0 ? 'positive' : 'negative'}`}>
                      {data.percentChange}
                    </span>
                  </div>
                ))}
              </div>
              <div className="weight-legend">
                <span className="legend-item base">Base Weight</span>
                <span className="legend-item optimized">IC-Optimized Weight</span>
              </div>
              {weightComparison.avgIC && (
                <div className="avg-ic-note">
                  Average IC across signals: <strong>{formatIC(weightComparison.avgIC)}</strong>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RecommendationPerformance;
