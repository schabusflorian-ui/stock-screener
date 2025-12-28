// frontend/src/components/portfolio/PerformanceChart.js
// Line chart showing portfolio value over time with benchmark comparison

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
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

function PerformanceChart({
  data = [],
  benchmarkData = [],
  period = '1y',
  onPeriodChange,
  showBenchmark = true,
  showVolume = false,
  height = 300,
  portfolioName = 'Portfolio',
  benchmarkName = 'S&P 500'
}) {
  // Process data for chart
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Create a map for benchmark values
    const benchmarkMap = new Map();
    if (benchmarkData && benchmarkData.length > 0) {
      benchmarkData.forEach(item => {
        benchmarkMap.set(item.date, item.value);
      });
    }

    // Calculate percentage returns from start
    const startValue = data[0].value;
    const startBenchmark = benchmarkData?.[0]?.value || 1;

    return data.map((item, index) => {
      const portfolioReturn = ((item.value - startValue) / startValue) * 100;
      const benchmarkValue = benchmarkMap.get(item.date) || benchmarkData?.[index]?.value;
      const benchmarkReturn = benchmarkValue
        ? ((benchmarkValue - startBenchmark) / startBenchmark) * 100
        : null;

      return {
        date: item.date,
        value: item.value,
        portfolioReturn,
        benchmarkReturn,
        volume: item.volume
      };
    });
  }, [data, benchmarkData]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (chartData.length < 2) return null;

    const lastPoint = chartData[chartData.length - 1];
    const firstPoint = chartData[0];

    return {
      totalReturn: lastPoint.portfolioReturn,
      benchmarkReturn: lastPoint.benchmarkReturn,
      alpha: lastPoint.benchmarkReturn !== null
        ? lastPoint.portfolioReturn - lastPoint.benchmarkReturn
        : null,
      currentValue: lastPoint.value,
      startValue: firstPoint.value,
      high: Math.max(...chartData.map(d => d.portfolioReturn)),
      low: Math.min(...chartData.map(d => d.portfolioReturn))
    };
  }, [chartData]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="performance-tooltip">
        <div className="tooltip-date">{formatDate(label)}</div>
        {payload.map((entry, index) => (
          <div key={index} className="tooltip-row" style={{ color: entry.color }}>
            <span className="tooltip-label">{entry.name}:</span>
            <span className="tooltip-value">
              {entry.dataKey === 'value'
                ? formatCurrency(entry.value)
                : `${entry.value >= 0 ? '+' : ''}${entry.value.toFixed(2)}%`}
            </span>
          </div>
        ))}
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
              {stats.benchmarkReturn !== null && (
                <div className="stat-item">
                  <span className="stat-label">{benchmarkName}</span>
                  <span className={`stat-value ${stats.benchmarkReturn >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(stats.benchmarkReturn)}
                  </span>
                </div>
              )}
              {stats.alpha !== null && (
                <div className="stat-item">
                  <span className="stat-label">Alpha</span>
                  <span className={`stat-value ${stats.alpha >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(stats.alpha)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

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

      {/* Chart */}
      <div className="chart-container" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={(date) => {
                const d = new Date(date);
                return d.toLocaleDateString('en-US', { month: 'short' });
              }}
              stroke="var(--text-tertiary)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`}
              stroke="var(--text-tertiary)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="3 3" />

            <Line
              type="monotone"
              dataKey="portfolioReturn"
              name={portfolioName}
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />

            {showBenchmark && benchmarkData.length > 0 && (
              <Line
                type="monotone"
                dataKey="benchmarkReturn"
                name={benchmarkName}
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            )}
          </LineChart>
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
