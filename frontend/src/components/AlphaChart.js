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
import { TrendingUp, TrendingDown, Activity, RefreshCcw } from './icons';
import { indicesAPI } from '../services/api';
import { useAskAI, createChartExtractor } from '../hooks';
import './AlphaChart.css';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' },
  { key: '5y', label: '5Y' }
];

const ROLLING_WINDOWS = [
  { key: null, label: 'Cumulative' },
  { key: '30d', label: '30-Day' },
  { key: '60d', label: '60-Day' },
  { key: '90d', label: '90-Day' }
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

// Prism Design System chart configuration
const PRISM_CHART_CONFIG = {
  grid: {
    horizontal: '#F1F5F9',
    strokeDasharray: '0', // solid lines per Prism spec (style: 0)
  },
  axis: {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    textColor: '#94A3B8',
  },
  baseline: '#CBD5E1', // Zero/reference line - distinct from grid (FT-style)
  areaOpacity: { start: 0.15, end: 0 }, // Subtle gradient fill (FT-style)
  colors: {
    primary: '#2563EB',    // var(--chart-1) - Blue
    success: '#059669',    // var(--chart-2) - Green
    warning: '#D97706',    // var(--chart-3) - Orange
    danger: '#DC2626',     // var(--chart-4) - Red
  }
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
  const [rollingSummary, setRollingSummary] = useState(null);
  const [period, setPeriod] = useState('1y');
  const [rollingWindow, setRollingWindow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartMode, setChartMode] = useState('alpha'); // 'alpha', 'daily', 'rolling', 'comparison', 'all'

  const fetchData = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    setError(null);

    try {
      const res = await indicesAPI.getAlphaTimeseries(symbol, period, rollingWindow);

      if (res.data.success && res.data.data) {
        setData(res.data.data.timeseries);
        setSummary(res.data.data.summary);
        setRollingSummary(res.data.data.rollingSummary);
      } else {
        setError('No alpha data available');
      }
    } catch (err) {
      console.error('Error fetching alpha data:', err);
      setError('Failed to load alpha data');
    } finally {
      setLoading(false);
    }
  }, [symbol, period, rollingWindow]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Use rolling summary when in rolling mode, otherwise use cumulative summary
  const displaySummary = chartMode === 'rolling' && rollingSummary ? rollingSummary : summary;
  const isOutperforming = displaySummary?.currentAlpha > 0;

  // Ask AI right-click support - must be called before any early returns
  const askAIProps = useAskAI(createChartExtractor(() => ({
    symbol,
    metric: 'alpha',
    value: displaySummary?.currentAlpha,
    period,
    trend: isOutperforming ? 'outperformed' : 'underperformed'
  })));

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

  return (
    <div className="alpha-chart-container" {...askAIProps}>
      {/* Summary Header */}
      <div className="alpha-chart-header">
        <div className="alpha-summary">
          <div className={`alpha-current ${isOutperforming ? 'outperform' : 'underperform'}`}>
            <span className="alpha-icon">
              {isOutperforming ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </span>
            <span className="alpha-value">{formatPercent(displaySummary?.currentAlpha)}</span>
            <span className="alpha-label">{chartMode === 'rolling' ? `${rollingWindow} vs SPY` : 'vs SPY'}</span>
          </div>
          <div className="alpha-stats">
            <div className="alpha-stat">
              <span className="stat-label">Max</span>
              <span className={`stat-value ${displaySummary?.maxAlpha > 0 ? 'positive' : 'negative'}`}>
                {formatPercent(displaySummary?.maxAlpha)}
              </span>
            </div>
            <div className="alpha-stat">
              <span className="stat-label">Min</span>
              <span className={`stat-value ${displaySummary?.minAlpha > 0 ? 'positive' : 'negative'}`}>
                {formatPercent(displaySummary?.minAlpha)}
              </span>
            </div>
            <div className="alpha-stat">
              <span className="stat-label">Avg</span>
              <span className={`stat-value ${displaySummary?.avgAlpha > 0 ? 'positive' : 'negative'}`}>
                {formatPercent(displaySummary?.avgAlpha)}
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
                className={chartMode === 'rolling' ? 'active' : ''}
                onClick={() => {
                  setChartMode('rolling');
                  if (!rollingWindow) setRollingWindow('30d');
                }}
                title="Rolling window alpha"
              >
                Rolling
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

            {/* Rolling Window Selector */}
            {chartMode === 'rolling' && (
              <div className="rolling-selector">
                {ROLLING_WINDOWS.filter(w => w.key).map((w) => (
                  <button
                    key={w.key}
                    className={rollingWindow === w.key ? 'active' : ''}
                    onClick={() => setRollingWindow(w.key)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}

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
                  <stop offset="5%" stopColor={PRISM_CHART_CONFIG.colors.success} stopOpacity={PRISM_CHART_CONFIG.areaOpacity.start} />
                  <stop offset="95%" stopColor={PRISM_CHART_CONFIG.colors.success} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="alphaNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PRISM_CHART_CONFIG.colors.danger} stopOpacity={0} />
                  <stop offset="95%" stopColor={PRISM_CHART_CONFIG.colors.danger} stopOpacity={PRISM_CHART_CONFIG.areaOpacity.start} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray={PRISM_CHART_CONFIG.grid.strokeDasharray}
                stroke={PRISM_CHART_CONFIG.grid.horizontal}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke={PRISM_CHART_CONFIG.baseline} strokeDasharray="0" />
              <Area
                type="monotone"
                dataKey="alpha"
                stroke={PRISM_CHART_CONFIG.colors.primary}
                strokeWidth={2}
                fill="url(#alphaPositive)"
              />
            </AreaChart>
          ) : chartMode === 'rolling' ? (
            <AreaChart data={data.filter(d => d.rollingAlpha !== null)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rollingAlphaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PRISM_CHART_CONFIG.colors.warning} stopOpacity={PRISM_CHART_CONFIG.areaOpacity.start} />
                  <stop offset="95%" stopColor={PRISM_CHART_CONFIG.colors.warning} stopOpacity={PRISM_CHART_CONFIG.areaOpacity.end} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray={PRISM_CHART_CONFIG.grid.strokeDasharray}
                stroke={PRISM_CHART_CONFIG.grid.horizontal}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="alpha-tooltip">
                      <div className="alpha-tooltip-date">{formatDate(d.date)}</div>
                      <div className="alpha-tooltip-row stock">
                        <span>{rollingWindow} Stock:</span>
                        <span className={d.rollingStockReturn >= 0 ? 'positive' : 'negative'}>
                          {formatPercent(d.rollingStockReturn)}
                        </span>
                      </div>
                      <div className="alpha-tooltip-row benchmark">
                        <span>{rollingWindow} SPY:</span>
                        <span className={d.rollingBenchmarkReturn >= 0 ? 'positive' : 'negative'}>
                          {formatPercent(d.rollingBenchmarkReturn)}
                        </span>
                      </div>
                      <div className="alpha-tooltip-row alpha highlight">
                        <span>{rollingWindow} Alpha:</span>
                        <span className={d.rollingAlpha >= 0 ? 'outperform' : 'underperform'}>
                          {formatPercent(d.rollingAlpha)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke={PRISM_CHART_CONFIG.baseline} strokeDasharray="0" />
              <Area
                type="monotone"
                dataKey="rollingAlpha"
                stroke={PRISM_CHART_CONFIG.colors.warning}
                strokeWidth={2}
                fill="url(#rollingAlphaGradient)"
                name={`${rollingWindow} Rolling Alpha`}
              />
            </AreaChart>
          ) : chartMode === 'daily' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dailyAlphaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PRISM_CHART_CONFIG.colors.primary} stopOpacity={PRISM_CHART_CONFIG.areaOpacity.start} />
                  <stop offset="95%" stopColor={PRISM_CHART_CONFIG.colors.primary} stopOpacity={PRISM_CHART_CONFIG.areaOpacity.end} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray={PRISM_CHART_CONFIG.grid.strokeDasharray}
                stroke={PRISM_CHART_CONFIG.grid.horizontal}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip showDaily />} />
              <ReferenceLine y={0} stroke={PRISM_CHART_CONFIG.baseline} strokeDasharray="0" />
              <Area
                type="monotone"
                dataKey="dailyAlpha"
                stroke={PRISM_CHART_CONFIG.colors.primary}
                strokeWidth={1.5}
                fill="url(#dailyAlphaGradient)"
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray={PRISM_CHART_CONFIG.grid.strokeDasharray}
                stroke={PRISM_CHART_CONFIG.grid.horizontal}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: PRISM_CHART_CONFIG.axis.textColor, fontFamily: PRISM_CHART_CONFIG.axis.fontFamily }}
                tickLine={false}
                axisLine={{ stroke: PRISM_CHART_CONFIG.grid.horizontal }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke={PRISM_CHART_CONFIG.baseline} strokeDasharray="0" />
              <Line
                type="monotone"
                dataKey="stockReturn"
                name={symbol}
                stroke={PRISM_CHART_CONFIG.colors.primary}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="benchmarkReturn"
                name="SPY"
                stroke={PRISM_CHART_CONFIG.colors.warning}
                strokeWidth={2}
                dot={false}
              />
              {chartMode === 'all' && (
                <Line
                  type="monotone"
                  dataKey="alpha"
                  name="Alpha"
                  stroke={PRISM_CHART_CONFIG.colors.success}
                  strokeWidth={2}
                  strokeDasharray="4 4"
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
          {chartMode === 'rolling' && rollingWindow
            ? `Rolling ${rollingWindow} Alpha = Stock Return - SPY Return over trailing ${rollingWindow.replace('d', ' days')}`
            : chartMode === 'daily'
            ? 'Daily Alpha = Single day stock return - SPY return'
            : 'Alpha = Stock Return - SPY Return (cumulative from period start)'}
        </span>
        <span className="data-points">
          {chartMode === 'rolling'
            ? `${data.filter(d => d.rollingAlpha !== null).length} data points`
            : `${data.length} data points`}
        </span>
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
