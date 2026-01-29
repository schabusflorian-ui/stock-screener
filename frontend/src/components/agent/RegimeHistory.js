// frontend/src/components/agent/RegimeHistory.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Zap, AlertTriangle, Calendar } from '../icons';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Skeleton } from '../Skeleton';
import { RegimeIndicator } from './index';
import { attributionAPI } from '../../services/api';
import './RegimeHistory.css';

/**
 * Regime configuration
 */
const REGIME_CONFIG = {
  BULL: { color: '#059669', label: 'Bull', icon: TrendingUp },
  BEAR: { color: '#DC2626', label: 'Bear', icon: TrendingDown },
  SIDEWAYS: { color: '#7C3AED', label: 'Sideways', icon: Minus },
  HIGH_VOL: { color: '#D97706', label: 'High Vol', icon: Zap },
  CRISIS: { color: '#DC2626', label: 'Crisis', icon: AlertTriangle },
};

const PERIOD_OPTIONS = [
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' },
  { value: 180, label: '6 Months' },
  { value: 365, label: '1 Year' },
];

/**
 * RegimeHistory Component
 *
 * Displays historical market regime data with charts and statistics.
 */
function RegimeHistory({ className = '' }) {
  const [currentRegime, setCurrentRegime] = useState(null);
  const [history, setHistory] = useState([]);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [regimeRes, historyRes] = await Promise.all([
        attributionAPI.getRegime(),
        attributionAPI.getRegimeHistory(days),
      ]);

      if (regimeRes.data?.success) {
        setCurrentRegime(regimeRes.data.data);
      }
      if (historyRes.data?.success) {
        setHistory(historyRes.data.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load regime data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate regime statistics
  const regimeStats = React.useMemo(() => {
    if (!history.length) return {};

    const stats = {};
    for (const regime of Object.keys(REGIME_CONFIG)) {
      const count = history.filter(h => h.regime === regime).length;
      stats[regime] = {
        count,
        percentage: (count / history.length) * 100,
      };
    }
    return stats;
  }, [history]);

  // Prepare chart data
  const chartData = React.useMemo(() => {
    return history.map(h => ({
      date: h.date,
      regime: h.regime,
      confidence: h.confidence * 100,
      vix: h.vix || h.vix_level,
      breadth: h.breadth_pct || h.market_breadth,
      trend: (h.trend_strength || 0) * 100,
      regimeValue: Object.keys(REGIME_CONFIG).indexOf(h.regime) + 1,
    })).reverse(); // Oldest first for chart
  }, [history]);

  if (loading) {
    return (
      <div className={`regime-history ${className}`}>
        <Skeleton className="regime-history__skeleton-current" />
        <Skeleton className="regime-history__skeleton-chart" />
        <Skeleton className="regime-history__skeleton-stats" />
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="base" className={`regime-history regime-history--error ${className}`}>
        <div className="regime-history__error">{error}</div>
      </Card>
    );
  }

  return (
    <div className={`regime-history ${className}`}>
      {/* Current Regime */}
      {currentRegime && (
        <RegimeIndicator regime={currentRegime} />
      )}

      {/* Period Selector & Chart */}
      <Card variant="glass" className="regime-history__chart-card">
        <Card.Header>
          <Card.Title>
            <Calendar size={18} />
            Regime History
          </Card.Title>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="regime-history__period-select"
          >
            {PERIOD_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Card.Header>
        <Card.Content>
          {chartData.length > 0 ? (
            <div className="regime-history__chart">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      const config = REGIME_CONFIG[d.regime] || REGIME_CONFIG.SIDEWAYS;
                      return (
                        <div className="regime-history__tooltip">
                          <div className="regime-history__tooltip-date">
                            {new Date(d.date).toLocaleDateString()}
                          </div>
                          <div className="regime-history__tooltip-regime" style={{ color: config.color }}>
                            {config.label} ({d.confidence.toFixed(0)}% confidence)
                          </div>
                          {d.vix && (
                            <div className="regime-history__tooltip-metric">
                              VIX: {d.vix.toFixed(1)}
                            </div>
                          )}
                          {d.breadth && (
                            <div className="regime-history__tooltip-metric">
                              Breadth: {d.breadth.toFixed(0)}%
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={50} stroke="var(--text-tertiary)" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="confidence"
                    stroke="var(--brand-primary)"
                    strokeWidth={2}
                    fill="url(#confidenceGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="regime-history__empty">
              No historical data available
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Regime Distribution */}
      <Card variant="glass" className="regime-history__stats-card">
        <Card.Header>
          <Card.Title>Regime Distribution</Card.Title>
          <span className="regime-history__stats-period">Last {days} days</span>
        </Card.Header>
        <Card.Content>
          <div className="regime-history__distribution">
            {Object.entries(REGIME_CONFIG).map(([regime, config]) => {
              const stats = regimeStats[regime] || { count: 0, percentage: 0 };
              const Icon = config.icon;
              return (
                <div key={regime} className="regime-history__dist-item">
                  <div className="regime-history__dist-header">
                    <Icon size={16} style={{ color: config.color }} />
                    <span className="regime-history__dist-label">{config.label}</span>
                  </div>
                  <div className="regime-history__dist-bar">
                    <div
                      className="regime-history__dist-fill"
                      style={{
                        width: `${stats.percentage}%`,
                        backgroundColor: config.color,
                      }}
                    />
                  </div>
                  <div className="regime-history__dist-value">
                    {stats.count} days ({stats.percentage.toFixed(0)}%)
                  </div>
                </div>
              );
            })}
          </div>
        </Card.Content>
      </Card>

      {/* Recent Regime Changes */}
      <Card variant="glass" className="regime-history__changes-card">
        <Card.Header>
          <Card.Title>Recent Changes</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="regime-history__changes">
            {getRegimeChanges(history).slice(0, 5).map((change, idx) => {
              const fromConfig = REGIME_CONFIG[change.from] || REGIME_CONFIG.SIDEWAYS;
              const toConfig = REGIME_CONFIG[change.to] || REGIME_CONFIG.SIDEWAYS;
              return (
                <div key={idx} className="regime-history__change">
                  <span className="regime-history__change-date">
                    {new Date(change.date).toLocaleDateString()}
                  </span>
                  <div className="regime-history__change-arrow">
                    <Badge variant={fromConfig.label.toLowerCase() === 'bull' ? 'green' : fromConfig.label.toLowerCase() === 'bear' ? 'red' : 'gray'} size="sm">
                      {fromConfig.label}
                    </Badge>
                    <span>→</span>
                    <Badge variant={toConfig.label.toLowerCase() === 'bull' ? 'green' : toConfig.label.toLowerCase() === 'bear' ? 'red' : 'gray'} size="sm">
                      {toConfig.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {getRegimeChanges(history).length === 0 && (
              <div className="regime-history__no-changes">
                No regime changes in this period
              </div>
            )}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

/**
 * Helper to find regime transitions
 */
function getRegimeChanges(history) {
  const changes = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i].regime !== history[i - 1].regime) {
      changes.push({
        date: history[i].date,
        from: history[i - 1].regime,
        to: history[i].regime,
      });
    }
  }
  return changes;
}

RegimeHistory.propTypes = {
  className: PropTypes.string,
};

export default RegimeHistory;
