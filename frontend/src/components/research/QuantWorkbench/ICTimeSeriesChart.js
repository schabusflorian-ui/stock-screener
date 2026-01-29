// frontend/src/components/research/QuantWorkbench/ICTimeSeriesChart.js
// Rolling IC Time Series Visualization - Shows factor IC stability over time

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';
import { Loader, TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw } from '../../icons';

// Market regime periods for shading
const REGIME_PERIODS = [
  { start: '2020-02-01', end: '2020-04-30', label: 'COVID Crash', type: 'crisis' },
  { start: '2022-01-01', end: '2022-10-31', label: 'Rate Hikes', type: 'bearish' },
  { start: '2018-10-01', end: '2018-12-31', label: 'Q4 2018 Selloff', type: 'crisis' },
  { start: '2015-08-01', end: '2016-02-29', label: 'China/Oil Crisis', type: 'bearish' },
];

export default function ICTimeSeriesChart({
  factorId,
  formula,
  horizon = 21,
  showRegimes = true,
  showConfidenceBands = false,
  height = 300
}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch IC history data
  const fetchICHistory = async () => {
    if (!factorId && !formula) return;

    setLoading(true);
    setError(null);

    try {
      let response;

      if (factorId) {
        // Fetch from stored IC history
        response = await fetch(`/api/factors/user/${factorId}/ic-history?limit=120`);
      } else if (formula) {
        // Calculate historical IC on the fly
        response = await fetch('/api/factors/ic-history-calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formula,
            horizon,
            monthsBack: 60 // 5 years
          })
        });
      }

      if (!response.ok) {
        throw new Error('Failed to fetch IC history');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load IC history');
      }

      // Transform data for charting
      const chartData = (result.data || []).map(point => ({
        date: point.calculation_date || point.date,
        ic: point[`ic_${horizon}d`] || point.ic || point.ic_21d || 0,
        tstat: point[`tstat_${horizon}d`] || point.tstat || point.tstat_21d || 0,
        universeSize: point.universe_size || point.universeSize || 0,
        // Rolling mean for trend detection
        rollingMean: null // Will be calculated below
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      // Calculate rolling mean (12-month)
      const windowSize = 12;
      for (let i = 0; i < chartData.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = chartData.slice(start, i + 1);
        const mean = window.reduce((sum, d) => sum + d.ic, 0) / window.length;
        chartData[i].rollingMean = mean;

        // Calculate confidence bands (IC ± 2 std)
        if (showConfidenceBands && window.length >= 3) {
          const variance = window.reduce((sum, d) => sum + Math.pow(d.ic - mean, 2), 0) / window.length;
          const std = Math.sqrt(variance);
          chartData[i].upperBand = mean + 2 * std;
          chartData[i].lowerBand = mean - 2 * std;
        }
      }

      setData(chartData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount and when factor changes
  useEffect(() => {
    fetchICHistory();
  }, [factorId, formula, horizon]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const ics = data.map(d => d.ic).filter(v => v !== null && !isNaN(v));
    if (ics.length === 0) return null;

    const mean = ics.reduce((a, b) => a + b, 0) / ics.length;
    const variance = ics.reduce((sum, ic) => sum + Math.pow(ic - mean, 2), 0) / ics.length;
    const std = Math.sqrt(variance);
    const hitRate = ics.filter(ic => ic > 0).length / ics.length;

    // Calculate trend (last 12 months slope)
    const recent = data.slice(-12);
    let trend = 0;
    if (recent.length >= 2) {
      const n = recent.length;
      const xMean = (n - 1) / 2;
      const yMean = recent.reduce((sum, d) => sum + d.ic, 0) / n;
      let num = 0, den = 0;
      recent.forEach((d, i) => {
        num += (i - xMean) * (d.ic - yMean);
        den += Math.pow(i - xMean, 2);
      });
      trend = den > 0 ? num / den : 0;
    }

    // Decay detection
    const firstHalf = ics.slice(0, Math.floor(ics.length / 2));
    const secondHalf = ics.slice(Math.floor(ics.length / 2));
    const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const decay = firstMean > 0 ? (secondMean - firstMean) / firstMean : 0;

    return {
      mean,
      std,
      hitRate,
      trend,
      decay,
      current: ics[ics.length - 1],
      min: Math.min(...ics),
      max: Math.max(...ics),
      count: ics.length
    };
  }, [data]);

  // Get trend indicator
  const getTrendIndicator = () => {
    if (!stats) return null;
    if (stats.trend > 0.002) return { icon: TrendingUp, color: 'var(--positive)', label: 'Improving' };
    if (stats.trend < -0.002) return { icon: TrendingDown, color: 'var(--negative)', label: 'Declining' };
    return { icon: Minus, color: 'var(--text-secondary)', label: 'Stable' };
  };

  const trendIndicator = getTrendIndicator();

  // Format date for X-axis
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const point = payload[0]?.payload;
    if (!point) return null;

    return (
      <div className="ic-chart-tooltip">
        <div className="tooltip-date">{formatDate(point.date)}</div>
        <div className="tooltip-value">
          <span>IC: </span>
          <span className={point.ic > 0 ? 'positive' : 'negative'}>
            {(point.ic * 100).toFixed(2)}%
          </span>
        </div>
        {point.tstat && (
          <div className="tooltip-row">
            <span>T-stat: </span>
            <span>{point.tstat.toFixed(2)}</span>
          </div>
        )}
        {point.rollingMean && (
          <div className="tooltip-row">
            <span>12m Mean: </span>
            <span>{(point.rollingMean * 100).toFixed(2)}%</span>
          </div>
        )}
        {point.universeSize > 0 && (
          <div className="tooltip-row">
            <span>Universe: </span>
            <span>{point.universeSize.toLocaleString()} stocks</span>
          </div>
        )}
      </div>
    );
  };

  // Render regime shading areas
  const renderRegimeAreas = () => {
    if (!showRegimes || data.length === 0) return null;

    const dataDateRange = {
      start: new Date(data[0].date),
      end: new Date(data[data.length - 1].date)
    };

    return REGIME_PERIODS.filter(regime => {
      const regimeStart = new Date(regime.start);
      const regimeEnd = new Date(regime.end);
      return regimeStart <= dataDateRange.end && regimeEnd >= dataDateRange.start;
    }).map((regime, idx) => (
      <ReferenceArea
        key={idx}
        x1={regime.start}
        x2={regime.end}
        fill={regime.type === 'crisis' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.1)'}
        fillOpacity={1}
        label={{
          value: regime.label,
          position: 'insideTop',
          fill: 'var(--text-tertiary)',
          fontSize: 10
        }}
      />
    ));
  };

  if (loading) {
    return (
      <div className="ic-time-series-loading">
        <Loader size={24} className="spin" />
        <span>Loading IC history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ic-time-series-error">
        <AlertTriangle size={20} />
        <span>{error}</span>
        <button onClick={fetchICHistory} className="retry-btn">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="ic-time-series-empty">
        <TrendingUp size={32} />
        <p>No IC history available</p>
        <p className="empty-hint">Run IC analysis to start tracking performance over time</p>
      </div>
    );
  }

  return (
    <div className="ic-time-series-chart">
      {/* Header with stats */}
      <div className="chart-header">
        <div className="header-title">
          <h4>IC Over Time ({horizon}-day horizon)</h4>
          {lastUpdated && (
            <span className="last-updated">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button onClick={fetchICHistory} className="refresh-btn" title="Refresh data">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Summary stats bar */}
      {stats && (
        <div className="ic-stats-bar">
          <div className="stat-item">
            <span className="stat-label">Current IC</span>
            <span className={`stat-value ${stats.current > 0 ? 'positive' : 'negative'}`}>
              {(stats.current * 100).toFixed(2)}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg IC</span>
            <span className={`stat-value ${stats.mean > 0 ? 'positive' : ''}`}>
              {(stats.mean * 100).toFixed(2)}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Hit Rate</span>
            <span className={`stat-value ${stats.hitRate > 0.55 ? 'positive' : ''}`}>
              {(stats.hitRate * 100).toFixed(0)}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Trend</span>
            <span className="stat-value" style={{ color: trendIndicator?.color }}>
              {trendIndicator && <trendIndicator.icon size={14} />}
              {trendIndicator?.label}
            </span>
          </div>
          {stats.decay < -0.3 && (
            <div className="stat-item decay-warning">
              <AlertTriangle size={14} />
              <span>IC declining {Math.abs(stats.decay * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}

      {/* Chart controls */}
      <div className="chart-controls">
        <label className="control-checkbox">
          <input
            type="checkbox"
            checked={showRegimes}
            onChange={(e) => {/* Would need to lift state up */}}
          />
          <span>Show regime shading</span>
        </label>
        <label className="control-checkbox">
          <input
            type="checkbox"
            checked={showConfidenceBands}
            onChange={(e) => {/* Would need to lift state up */}}
          />
          <span>Show confidence bands</span>
        </label>
      </div>

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="icGradientPositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="icGradientNegative" x1="0" y1="1" x2="0" y2="0">
              <stop offset="5%" stopColor="var(--negative)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--negative)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            interval="preserveStartEnd"
            minTickGap={50}
          />

          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            width={55}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Reference lines */}
          <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1} />
          <ReferenceLine
            y={0.02}
            stroke="var(--positive)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />
          <ReferenceLine
            y={-0.02}
            stroke="var(--positive)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />

          {/* Regime shading */}
          {renderRegimeAreas()}

          {/* Confidence bands */}
          {showConfidenceBands && (
            <Area
              type="monotone"
              dataKey="upperBand"
              stroke="none"
              fill="var(--color-primary)"
              fillOpacity={0.1}
            />
          )}
          {showConfidenceBands && (
            <Area
              type="monotone"
              dataKey="lowerBand"
              stroke="none"
              fill="var(--color-primary)"
              fillOpacity={0.1}
            />
          )}

          {/* Rolling mean line */}
          <Area
            type="monotone"
            dataKey="rollingMean"
            stroke="var(--warning)"
            strokeWidth={2}
            strokeDasharray="5 5"
            fill="none"
            name="12m Rolling Mean"
          />

          {/* Main IC area */}
          <Area
            type="monotone"
            dataKey="ic"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#icGradientPositive)"
            activeDot={{ r: 4, fill: 'var(--color-primary)' }}
            name="IC"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-line primary"></span>
          <span>IC (Information Coefficient)</span>
        </div>
        <div className="legend-item">
          <span className="legend-line dashed"></span>
          <span>12-month Rolling Mean</span>
        </div>
        <div className="legend-item">
          <span className="legend-line reference"></span>
          <span>±2% (Strong signal threshold)</span>
        </div>
        {showRegimes && (
          <div className="legend-item">
            <span className="legend-shade"></span>
            <span>Crisis/Bear periods</span>
          </div>
        )}
      </div>
    </div>
  );
}
