// frontend/src/components/AlphaChart.js
import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, RefreshCcw } from 'lucide-react';
import { indicesAPI } from '../services/api';
import './AlphaChart.css';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' },
  { key: '5y', label: '5Y' }
];

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const CustomTooltip = ({ active, payload, label, showDaily }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;

  if (showDaily) {
    return (
      <div className="alpha-tooltip">
        <div className="alpha-tooltip-date">{formatDate(data.date)}</div>
        <div className="alpha-tooltip-row stock">
          <span>Daily Stock:</span>
          <span className={data.dailyStockReturn >= 0 ? 'positive' : 'negative'}>
            {formatPercent(data.dailyStockReturn)}
          </span>
        </div>
        <div className="alpha-tooltip-row benchmark">
          <span>Daily SPY:</span>
          <span className={data.dailyBenchmarkReturn >= 0 ? 'positive' : 'negative'}>
            {formatPercent(data.dailyBenchmarkReturn)}
          </span>
        </div>
        <div className="alpha-tooltip-row alpha highlight">
          <span>Daily Alpha:</span>
          <span className={data.dailyAlpha >= 0 ? 'outperform' : 'underperform'}>
            {formatPercent(data.dailyAlpha)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="alpha-tooltip">
      <div className="alpha-tooltip-date">{formatDate(data.date)}</div>
      <div className="alpha-tooltip-row stock">
        <span>Stock Return:</span>
        <span className={data.stockReturn >= 0 ? 'positive' : 'negative'}>
          {formatPercent(data.stockReturn)}
        </span>
      </div>
      <div className="alpha-tooltip-row benchmark">
        <span>SPY Return:</span>
        <span className={data.benchmarkReturn >= 0 ? 'positive' : 'negative'}>
          {formatPercent(data.benchmarkReturn)}
        </span>
      </div>
      <div className="alpha-tooltip-row alpha highlight">
        <span>Alpha:</span>
        <span className={data.alpha >= 0 ? 'outperform' : 'underperform'}>
          {formatPercent(data.alpha)}
        </span>
      </div>
    </div>
  );
};

export function AlphaChart({ symbol, height = 300, showControls = true }) {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartMode, setChartMode] = useState('alpha'); // 'alpha', 'daily', 'comparison', 'all'

  const fetchData = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    setError(null);

    try {
      const res = await indicesAPI.getAlphaTimeseries(symbol, period);

      if (res.data.success && res.data.data) {
        setData(res.data.data.timeseries);
        setSummary(res.data.data.summary);
      } else {
        setError('No alpha data available');
      }
    } catch (err) {
      console.error('Error fetching alpha data:', err);
      setError('Failed to load alpha data');
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="alpha-chart-loading">
        <Activity size={24} className="spin" />
        <span>Loading alpha data...</span>
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="alpha-chart-error">
        <TrendingDown size={24} />
        <span>{error || 'No alpha data available'}</span>
      </div>
    );
  }

  const isOutperforming = summary?.currentAlpha > 0;

  return (
    <div className="alpha-chart-container">
      {/* Summary Header */}
      <div className="alpha-chart-header">
        <div className="alpha-summary">
          <div className={`alpha-current ${isOutperforming ? 'outperform' : 'underperform'}`}>
            <span className="alpha-icon">
              {isOutperforming ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </span>
            <span className="alpha-value">{formatPercent(summary?.currentAlpha)}</span>
            <span className="alpha-label">vs SPY</span>
          </div>
          <div className="alpha-stats">
            <div className="alpha-stat">
              <span className="stat-label">Max</span>
              <span className={`stat-value ${summary?.maxAlpha > 0 ? 'positive' : 'negative'}`}>
                {formatPercent(summary?.maxAlpha)}
              </span>
            </div>
            <div className="alpha-stat">
              <span className="stat-label">Min</span>
              <span className={`stat-value ${summary?.minAlpha > 0 ? 'positive' : 'negative'}`}>
                {formatPercent(summary?.minAlpha)}
              </span>
            </div>
            <div className="alpha-stat">
              <span className="stat-label">Avg</span>
              <span className={`stat-value ${summary?.avgAlpha > 0 ? 'positive' : 'negative'}`}>
                {formatPercent(summary?.avgAlpha)}
              </span>
            </div>
          </div>
        </div>

        {showControls && (
          <div className="alpha-controls">
            <div className="chart-mode-toggle">
              <button
                className={chartMode === 'alpha' ? 'active' : ''}
                onClick={() => setChartMode('alpha')}
                title="Cumulative alpha from period start"
              >
                Cumulative
              </button>
              <button
                className={chartMode === 'daily' ? 'active' : ''}
                onClick={() => setChartMode('daily')}
                title="Daily alpha (single day outperformance)"
              >
                Daily
              </button>
              <button
                className={chartMode === 'comparison' ? 'active' : ''}
                onClick={() => setChartMode('comparison')}
                title="Stock vs SPY returns"
              >
                Compare
              </button>
              <button
                className={chartMode === 'all' ? 'active' : ''}
                onClick={() => setChartMode('all')}
                title="All metrics"
              >
                All
              </button>
            </div>

            <div className="period-selector">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  className={period === p.key ? 'active' : ''}
                  onClick={() => setPeriod(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button className="refresh-btn" onClick={fetchData} title="Refresh data">
              <RefreshCcw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="alpha-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'alpha' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="alphaPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="alphaNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--color-text-secondary)" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="alpha"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#alphaPositive)"
              />
            </AreaChart>
          ) : chartMode === 'daily' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dailyAlphaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip showDaily />} />
              <ReferenceLine y={0} stroke="var(--color-text-secondary)" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="dailyAlpha"
                stroke="#6366f1"
                strokeWidth={1.5}
                fill="url(#dailyAlphaGradient)"
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--color-text-secondary)" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="stockReturn"
                name={symbol}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="benchmarkReturn"
                name="SPY"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
              {chartMode === 'all' && (
                <Line
                  type="monotone"
                  dataKey="alpha"
                  name="Alpha"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="alpha-chart-footer">
        <span className="data-note">
          Alpha = Stock Return - SPY Return (cumulative from period start)
        </span>
        <span className="data-points">{data.length} data points</span>
      </div>
    </div>
  );
}

AlphaChart.propTypes = {
  symbol: PropTypes.string.isRequired,
  height: PropTypes.number,
  showControls: PropTypes.bool
};

export default AlphaChart;
