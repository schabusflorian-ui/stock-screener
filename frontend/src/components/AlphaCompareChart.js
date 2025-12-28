// frontend/src/components/AlphaCompareChart.js
import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
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
import { Activity, RefreshCcw } from 'lucide-react';
import { indicesAPI } from '../services/api';
import './AlphaCompareChart.css';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' }
];

const COMPANY_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#06b6d4'];

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="alpha-compare-tooltip">
      <div className="tooltip-date">{formatDate(label)}</div>
      {payload.map((entry, idx) => (
        <div key={idx} className="tooltip-row" style={{ color: entry.color }}>
          <span className="tooltip-symbol">{entry.name}:</span>
          <span className={`tooltip-value ${entry.value >= 0 ? 'positive' : 'negative'}`}>
            {formatPercent(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export function AlphaCompareChart({ symbols = [], height = 350, showControls = true }) {
  const [data, setData] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataMode, setDataMode] = useState('alpha'); // 'alpha' or 'daily'

  const fetchData = useCallback(async () => {
    if (!symbols || symbols.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch alpha timeseries for all symbols in parallel
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await indicesAPI.getAlphaTimeseries(symbol, period);
            if (res.data.success && res.data.data) {
              return { symbol, data: res.data.data };
            }
          } catch (err) {
            console.error(`Error fetching alpha for ${symbol}:`, err);
          }
          return { symbol, data: null };
        })
      );

      // Build combined data structure
      const dateMap = new Map();
      const newSummaries = {};

      results.forEach(({ symbol, data: symbolData }) => {
        if (!symbolData || !symbolData.timeseries) return;

        newSummaries[symbol] = symbolData.summary;

        symbolData.timeseries.forEach((point) => {
          if (!dateMap.has(point.date)) {
            dateMap.set(point.date, { date: point.date });
          }
          const entry = dateMap.get(point.date);
          entry[symbol] = point.alpha;
          entry[`${symbol}_daily`] = point.dailyAlpha;
        });
      });

      // Convert to array and sort by date
      const combinedData = Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      setData(combinedData);
      setSummaries(newSummaries);
    } catch (err) {
      console.error('Error fetching alpha comparison data:', err);
      setError('Failed to load alpha data');
    } finally {
      setLoading(false);
    }
  }, [symbols, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!symbols || symbols.length === 0) {
    return (
      <div className="alpha-compare-empty">
        <Activity size={24} />
        <span>Select companies to compare alpha</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="alpha-compare-loading">
        <Activity size={24} className="spin" />
        <span>Loading alpha data...</span>
      </div>
    );
  }

  if (error || data.length === 0) {
    return (
      <div className="alpha-compare-error">
        <span>{error || 'No alpha data available'}</span>
      </div>
    );
  }

  return (
    <div className="alpha-compare-container">
      {/* Summary Cards */}
      <div className="alpha-compare-summaries">
        {symbols.map((symbol, idx) => {
          const summary = summaries[symbol];
          if (!summary) return null;
          return (
            <div
              key={symbol}
              className={`alpha-summary-card ${summary.currentAlpha >= 0 ? 'outperform' : 'underperform'}`}
              style={{ borderColor: COMPANY_COLORS[idx % COMPANY_COLORS.length] }}
            >
              <span className="summary-symbol" style={{ color: COMPANY_COLORS[idx % COMPANY_COLORS.length] }}>
                {symbol}
              </span>
              <span className="summary-value">{formatPercent(summary.currentAlpha)}</span>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      {showControls && (
        <div className="alpha-compare-controls">
          <div className="mode-toggle">
            <button
              className={dataMode === 'alpha' ? 'active' : ''}
              onClick={() => setDataMode('alpha')}
            >
              Cumulative
            </button>
            <button
              className={dataMode === 'daily' ? 'active' : ''}
              onClick={() => setDataMode('daily')}
            >
              Daily
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

          <button className="refresh-btn" onClick={fetchData} title="Refresh">
            <RefreshCcw size={14} />
          </button>
        </div>
      )}

      {/* Chart */}
      <div className="alpha-compare-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
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
            {symbols.map((symbol, idx) => (
              <Line
                key={symbol}
                type="monotone"
                dataKey={dataMode === 'alpha' ? symbol : `${symbol}_daily`}
                name={symbol}
                stroke={COMPANY_COLORS[idx % COMPANY_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="alpha-compare-footer">
        <span>Alpha = Stock Return - S&P 500 Return (cumulative from period start)</span>
      </div>
    </div>
  );
}

AlphaCompareChart.propTypes = {
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  height: PropTypes.number,
  showControls: PropTypes.bool
};

export default AlphaCompareChart;
