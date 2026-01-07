// frontend/src/components/portfolio/PerformanceChart.js
// Line chart showing portfolio value over time with benchmark comparison

import React, { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { indicesAPI } from '../../services/api';
import './PerformanceChart.css';

const PERIOD_OPTIONS = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: 'all', label: 'ALL' }
];

// Overlay toggle options for index comparison
const OVERLAY_OPTIONS = [
  { key: 'spy', label: 'S&P 500', color: '#94a3b8', type: 'index', symbol: '^GSPC' },
  { key: 'qqq', label: 'NASDAQ', color: '#06b6d4', type: 'index', symbol: '^IXIC' },
  { key: 'dia', label: 'Dow Jones', color: '#f97316', type: 'index', symbol: '^DJI' },
  { key: 'alpha', label: 'Alpha', color: '#8b5cf6', type: 'alpha' }
];

function PerformanceChart({
  data = [],
  period = '1y',
  onPeriodChange,
  showBenchmark = true,
  initialShowAlpha = false,
  height = 350,
  portfolioName = 'Portfolio'
}) {
  // Index data state
  const [indexData, setIndexData] = useState({ spy: null, qqq: null, dia: null });

  // Overlay toggles - SPY default on (as benchmark), others off
  const [overlays, setOverlays] = useState({
    spy: showBenchmark,
    qqq: false,
    dia: false,
    alpha: initialShowAlpha
  });

  // Fetch index data when period changes
  useEffect(() => {
    async function fetchIndexData() {
      if (!data || data.length === 0) return;

      const indexSymbols = [
        { key: 'spy', symbol: '^GSPC' },
        { key: 'qqq', symbol: '^IXIC' },
        { key: 'dia', symbol: '^DJI' }
      ];

      const indexPromises = indexSymbols.map(async (idx) => {
        try {
          const res = await indicesAPI.getPrices(idx.symbol, period);
          if (res.data.success && res.data.data && res.data.data.length > 0) {
            const sortedData = [...res.data.data].reverse();
            return { key: idx.key, data: sortedData };
          }
        } catch (e) {
          console.log(`No ${idx.key} data available`);
        }
        return { key: idx.key, data: null };
      });

      const results = await Promise.all(indexPromises);
      const newIndexData = {};
      results.forEach(r => { newIndexData[r.key] = r.data; });
      setIndexData(newIndexData);
    }

    fetchIndexData();
  }, [period, data]);

  const toggleOverlay = (key) => {
    setOverlays(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Process data for chart with index overlays
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Calculate percentage returns from start
    const startValue = data[0].value;

    // Get start prices for indices
    const spyStart = indexData.spy?.[0]?.adjusted_close || indexData.spy?.[0]?.close;
    const qqqStart = indexData.qqq?.[0]?.adjusted_close || indexData.qqq?.[0]?.close;
    const diaStart = indexData.dia?.[0]?.adjusted_close || indexData.dia?.[0]?.close;

    // Create date maps for index lookups
    const createIndexMap = (idxData) => {
      const map = new Map();
      if (idxData) {
        idxData.forEach(p => {
          map.set(p.date, p.adjusted_close || p.close);
        });
      }
      return map;
    };

    const spyMap = createIndexMap(indexData.spy);
    const qqqMap = createIndexMap(indexData.qqq);
    const diaMap = createIndexMap(indexData.dia);

    return data.map((item) => {
      const portfolioReturn = ((item.value - startValue) / startValue) * 100;

      // Get index returns
      const spyPrice = spyMap.get(item.date);
      const spyReturn = spyPrice && spyStart ? ((spyPrice - spyStart) / spyStart) * 100 : null;

      const qqqPrice = qqqMap.get(item.date);
      const qqqReturn = qqqPrice && qqqStart ? ((qqqPrice - qqqStart) / qqqStart) * 100 : null;

      const diaPrice = diaMap.get(item.date);
      const diaReturn = diaPrice && diaStart ? ((diaPrice - diaStart) / diaStart) * 100 : null;

      // Alpha = Portfolio Return - S&P 500 Return
      const alpha = spyReturn !== null ? portfolioReturn - spyReturn : null;

      return {
        date: item.date,
        value: item.value,
        portfolioReturn,
        spyReturn,
        qqqReturn,
        diaReturn,
        alpha,
        volume: item.volume
      };
    });
  }, [data, indexData]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (chartData.length < 2) return null;

    const lastPoint = chartData[chartData.length - 1];
    const firstPoint = chartData[0];

    return {
      totalReturn: lastPoint.portfolioReturn,
      spyReturn: lastPoint.spyReturn,
      alpha: lastPoint.alpha,
      currentValue: lastPoint.value,
      startValue: firstPoint.value,
      high: Math.max(...chartData.map(d => d.portfolioReturn)),
      low: Math.min(...chartData.map(d => d.portfolioReturn))
    };
  }, [chartData]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    // Find alpha value from data point
    const dataPoint = payload[0]?.payload;
    const alpha = dataPoint?.alpha;

    return (
      <div className="performance-tooltip">
        <div className="tooltip-date">{formatDate(label)}</div>
        {payload.map((entry, index) => {
          // Skip alphaRange from tooltip display
          if (entry.dataKey === 'alphaRange') return null;
          return (
            <div key={index} className="tooltip-row" style={{ color: entry.color }}>
              <span className="tooltip-label">{entry.name}:</span>
              <span className="tooltip-value">
                {entry.dataKey === 'value'
                  ? formatCurrency(entry.value)
                  : `${entry.value >= 0 ? '+' : ''}${entry.value.toFixed(2)}%`}
              </span>
            </div>
          );
        })}
        {alpha !== null && alpha !== undefined && (
          <div className={`tooltip-row alpha-row ${alpha >= 0 ? 'outperform' : 'underperform'}`}>
            <span className="tooltip-label">Alpha:</span>
            <span className="tooltip-value">
              {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    );
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (!data || data.length === 0) {
    return (
      <div className="performance-chart empty">
        <div className="empty-state">
          <p>No performance data available</p>
          <span>Performance history will appear after daily snapshots are taken</span>
        </div>
      </div>
    );
  }

  return (
    <div className="performance-chart">
      {/* Period selector */}
      <div className="chart-header">
        <div className="chart-stats">
          {stats && (
            <>
              <div className="stat-item">
                <span className="stat-label">Return</span>
                <span className={`stat-value ${stats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(stats.totalReturn)}
                </span>
              </div>
              {stats.spyReturn !== null && (
                <div className="stat-item">
                  <span className="stat-label">S&P 500</span>
                  <span className={`stat-value ${stats.spyReturn >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(stats.spyReturn)}
                  </span>
                </div>
              )}
              {stats.alpha !== null && (
                <div className="stat-item alpha-stat">
                  <span className="stat-label">Alpha</span>
                  <span className={`stat-value ${stats.alpha >= 0 ? 'alpha-positive' : 'alpha-negative'}`}>
                    {formatPercent(stats.alpha)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="chart-controls">
          {onPeriodChange && (
            <div className="period-selector">
              {PERIOD_OPTIONS.map(option => (
                <button
                  key={option.value}
                  className={`period-btn ${period === option.value ? 'active' : ''}`}
                  onClick={() => onPeriodChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overlay toggles */}
      <div className="overlay-toggles">
        <span className="overlay-label">Compare:</span>
        {OVERLAY_OPTIONS.map(opt => {
          const isDisabled = (opt.type === 'index' && !indexData[opt.key]) ||
                            (opt.type === 'alpha' && !indexData.spy);
          return (
            <button
              key={opt.key}
              className={`overlay-toggle ${overlays[opt.key] ? 'active' : ''} ${isDisabled ? 'disabled' : ''} ${opt.type === 'alpha' ? 'alpha-toggle' : ''}`}
              onClick={() => !isDisabled && toggleOverlay(opt.key)}
              disabled={isDisabled}
              style={{ '--toggle-color': opt.color }}
            >
              <span className="overlay-indicator" style={{ backgroundColor: overlays[opt.key] ? opt.color : 'transparent' }} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="chart-container" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              {/* Gradient for positive alpha (outperformance) */}
              <linearGradient id="alphaPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
              </linearGradient>
              {/* Gradient for negative alpha (underperformance) */}
              <linearGradient id="alphaNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={(date) => {
                const d = new Date(date);
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              }}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />

            {/* Alpha filled area (when enabled) */}
            {overlays.alpha && indexData.spy && (
              <Area
                type="monotone"
                dataKey="alpha"
                stroke={stats?.alpha >= 0 ? '#8b5cf6' : '#f97316'}
                strokeWidth={1}
                fill={stats?.alpha >= 0 ? 'url(#alphaPositive)' : 'url(#alphaNegative)'}
                name="Alpha"
                legendType="none"
              />
            )}

            {/* S&P 500 line */}
            {overlays.spy && indexData.spy && (
              <Line
                type="monotone"
                dataKey="spyReturn"
                name="S&P 500"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}

            {/* NASDAQ line */}
            {overlays.qqq && indexData.qqq && (
              <Line
                type="monotone"
                dataKey="qqqReturn"
                name="NASDAQ"
                stroke="#06b6d4"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}

            {/* Dow Jones line */}
            {overlays.dia && indexData.dia && (
              <Line
                type="monotone"
                dataKey="diaReturn"
                name="Dow Jones"
                stroke="#f97316"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}

            {/* Portfolio line (always on top) */}
            <Line
              type="monotone"
              dataKey="portfolioReturn"
              name={portfolioName}
              stroke={stats?.totalReturn >= 0 ? '#10b981' : '#ef4444'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Value axis */}
      {stats && (
        <div className="chart-footer">
          <span className="footer-stat">
            Start: {formatCurrency(stats.startValue)}
          </span>
          <span className="footer-stat">
            Current: {formatCurrency(stats.currentValue)}
          </span>
          <span className="footer-stat">
            High: {formatPercent(stats.high)}
          </span>
          <span className="footer-stat">
            Low: {formatPercent(stats.low)}
          </span>
        </div>
      )}
    </div>
  );
}

export default PerformanceChart;
