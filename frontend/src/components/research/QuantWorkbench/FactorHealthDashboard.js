// frontend/src/components/research/QuantWorkbench/FactorHealthDashboard.js
// Factor Performance Dashboard - Monitor factor health with traffic light indicators

import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle, AlertTriangle, XCircle, TrendingUp, TrendingDown,
  Minus, RefreshCw, Loader, Activity, Clock
} from '../../icons';

// Standard factors to always show
const STANDARD_FACTORS = [
  { id: 'value', name: 'Value', formula: '1 / pe_ratio' },
  { id: 'momentum', name: 'Momentum', formula: 'momentum_12m' },
  { id: 'quality', name: 'Quality', formula: 'roe * (1 - debt_to_equity)' },
  { id: 'growth', name: 'Growth', formula: 'earnings_growth_yoy' },
  { id: 'size', name: 'Size (Small Cap)', formula: '-1 * log(market_cap)' },
  { id: 'volatility', name: 'Low Volatility', formula: '-1 * volatility_252d' }
];

// IC thresholds for traffic light
const IC_THRESHOLDS = {
  STRONG: 0.03,
  MODERATE: 0.01,
  WEAK: 0
};

export default function FactorHealthDashboard({ onFactorSelect }) {
  const [factors, setFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch factor health data
  const fetchFactorHealth = async () => {
    setRefreshing(true);
    setError(null);

    try {
      // Fetch user factors
      const userFactorsRes = await fetch('/api/factors/user');
      const userFactorsData = await userFactorsRes.json();

      // Combine standard and user factors
      const allFactors = [
        ...STANDARD_FACTORS.map(f => ({ ...f, type: 'standard' })),
        ...(userFactorsData.success ? userFactorsData.data.map(f => ({ ...f, type: 'custom' })) : [])
      ];

      // Fetch IC stats for each factor (with caching)
      const factorsWithStats = await Promise.all(
        allFactors.map(async (factor) => {
          try {
            // For user factors with stored stats, use those
            if (factor.type === 'custom' && factor.ic_stats) {
              return {
                ...factor,
                ic21d: factor.ic_stats?.['21'] || factor.ic_stats?.ic_21d || 0,
                tstat: factor.ic_tstat || 0,
                icIR: factor.ic_ir || 0,
                trend: calculateTrend(factor),
                status: getFactorStatus(factor.ic_stats?.['21'] || 0, factor.ic_tstat || 0)
              };
            }

            // For standard factors or factors without stats, fetch fresh
            const response = await fetch('/api/factors/ic-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                formula: factor.formula,
                horizons: [21]
              })
            });

            const data = await response.json();

            if (data.success && data.data?.ic) {
              const ic21d = data.data.ic.icByHorizon?.[21] || 0;
              const tstat = data.data.ic.tstat || 0;

              return {
                ...factor,
                ic21d,
                tstat,
                icIR: data.data.ic.icIR || 0,
                trend: 'stable', // Would need historical data to calculate
                status: getFactorStatus(ic21d, tstat)
              };
            }

            return {
              ...factor,
              ic21d: null,
              tstat: null,
              icIR: null,
              trend: 'unknown',
              status: 'unknown'
            };
          } catch (err) {
            console.warn(`Failed to fetch IC for ${factor.name}:`, err);
            return {
              ...factor,
              ic21d: null,
              tstat: null,
              icIR: null,
              trend: 'unknown',
              status: 'error'
            };
          }
        })
      );

      setFactors(factorsWithStats);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Calculate trend based on historical IC
  const calculateTrend = (factor) => {
    // This would use historical IC data if available
    // For now, return stable as placeholder
    return 'stable';
  };

  // Get factor status based on IC and t-stat
  const getFactorStatus = (ic, tstat) => {
    const absIC = Math.abs(ic || 0);
    const absTstat = Math.abs(tstat || 0);

    if (absIC >= IC_THRESHOLDS.STRONG && absTstat >= 2) {
      return 'healthy';
    } else if (absIC >= IC_THRESHOLDS.MODERATE && absTstat >= 1.5) {
      return 'caution';
    } else if (absIC > 0) {
      return 'weak';
    }
    return 'unknown';
  };

  // Get status indicator
  const getStatusIndicator = (status) => {
    switch (status) {
      case 'healthy':
        return { Icon: CheckCircle, color: 'var(--positive)', label: 'Healthy' };
      case 'caution':
        return { Icon: AlertTriangle, color: 'var(--warning)', label: 'Caution' };
      case 'weak':
        return { Icon: XCircle, color: 'var(--negative)', label: 'Weak' };
      case 'error':
        return { Icon: XCircle, color: 'var(--text-tertiary)', label: 'Error' };
      default:
        return { Icon: Minus, color: 'var(--text-tertiary)', label: 'Unknown' };
    }
  };

  // Get trend indicator
  const getTrendIndicator = (trend) => {
    switch (trend) {
      case 'improving':
        return { Icon: TrendingUp, color: 'var(--positive)', label: 'Improving' };
      case 'declining':
        return { Icon: TrendingDown, color: 'var(--negative)', label: 'Declining' };
      case 'stable':
        return { Icon: Minus, color: 'var(--text-secondary)', label: 'Stable' };
      default:
        return { Icon: Minus, color: 'var(--text-tertiary)', label: '-' };
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchFactorHealth();
  }, []);

  // Summary stats
  const summary = useMemo(() => {
    const healthyCount = factors.filter(f => f.status === 'healthy').length;
    const cautionCount = factors.filter(f => f.status === 'caution').length;
    const weakCount = factors.filter(f => f.status === 'weak').length;
    const customCount = factors.filter(f => f.type === 'custom').length;

    return {
      total: factors.length,
      healthy: healthyCount,
      caution: cautionCount,
      weak: weakCount,
      custom: customCount
    };
  }, [factors]);

  if (loading && factors.length === 0) {
    return (
      <div className="factor-health-loading">
        <Loader size={24} className="spin" />
        <span>Loading factor health...</span>
      </div>
    );
  }

  return (
    <div className="factor-health-dashboard">
      {/* Header */}
      <div className="health-header">
        <div className="header-content">
          <Activity size={20} />
          <h3>Factor Health Monitor</h3>
          {lastUpdated && (
            <span className="last-updated">
              <Clock size={14} />
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          className="refresh-btn"
          onClick={fetchFactorHealth}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="health-summary">
        <div className="summary-card total">
          <span className="card-value">{summary.total}</span>
          <span className="card-label">Total Factors</span>
        </div>
        <div className="summary-card healthy">
          <CheckCircle size={16} />
          <span className="card-value">{summary.healthy}</span>
          <span className="card-label">Healthy</span>
        </div>
        <div className="summary-card caution">
          <AlertTriangle size={16} />
          <span className="card-value">{summary.caution}</span>
          <span className="card-label">Caution</span>
        </div>
        <div className="summary-card weak">
          <XCircle size={16} />
          <span className="card-value">{summary.weak}</span>
          <span className="card-label">Weak</span>
        </div>
      </div>

      {error && (
        <div className="health-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Factor Table */}
      <div className="health-table-container">
        <table className="health-table">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Type</th>
              <th>IC (21d)</th>
              <th>T-Stat</th>
              <th>Trend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {factors.map((factor) => {
              const status = getStatusIndicator(factor.status);
              const trend = getTrendIndicator(factor.trend);

              return (
                <tr
                  key={factor.id}
                  className={`factor-row ${factor.status}`}
                  onClick={() => onFactorSelect && onFactorSelect(factor)}
                >
                  <td className="factor-name">
                    <span className="name">{factor.name}</span>
                    {factor.decay && (
                      <span className="decay-badge">
                        <AlertTriangle size={12} />
                        Decay
                      </span>
                    )}
                  </td>
                  <td className="factor-type">
                    <span className={`type-badge ${factor.type}`}>
                      {factor.type === 'standard' ? 'Standard' : 'Custom'}
                    </span>
                  </td>
                  <td className={`ic-value ${factor.ic21d > 0 ? 'positive' : factor.ic21d < 0 ? 'negative' : ''}`}>
                    {factor.ic21d !== null
                      ? `${(factor.ic21d * 100).toFixed(2)}%`
                      : '-'
                    }
                  </td>
                  <td className={`tstat-value ${Math.abs(factor.tstat || 0) >= 2 ? 'significant' : ''}`}>
                    {factor.tstat !== null
                      ? factor.tstat.toFixed(2)
                      : '-'
                    }
                  </td>
                  <td className="trend-value">
                    <trend.Icon size={16} style={{ color: trend.color }} />
                    <span style={{ color: trend.color }}>{trend.label}</span>
                  </td>
                  <td className="status-value">
                    <div className="status-indicator" style={{ color: status.color }}>
                      <status.Icon size={16} />
                      <span>{status.label}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="health-legend">
        <div className="legend-item">
          <CheckCircle size={14} style={{ color: 'var(--positive)' }} />
          <span>Healthy: IC &gt; 3%, T-stat &gt; 2</span>
        </div>
        <div className="legend-item">
          <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
          <span>Caution: IC 1-3%, T-stat 1.5-2</span>
        </div>
        <div className="legend-item">
          <XCircle size={14} style={{ color: 'var(--negative)' }} />
          <span>Weak: IC &lt; 1% or T-stat &lt; 1.5</span>
        </div>
      </div>
    </div>
  );
}
