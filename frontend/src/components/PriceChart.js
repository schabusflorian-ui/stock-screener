// frontend/src/components/PriceChart.js
import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, Calendar } from 'lucide-react';
import { pricesAPI } from '../services/api';
import './PriceChart.css';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '5y', label: '5Y' },
  { key: 'max', label: 'MAX' }
];

const formatPrice = (value) => {
  if (value === null || value === undefined) return '-';
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatVolume = (value) => {
  if (!value) return '-';
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toString();
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="price-tooltip">
      <div className="price-tooltip-date">{formatDate(data.date)}</div>
      <div className="price-tooltip-row">
        <span>Open:</span>
        <span>{formatPrice(data.open)}</span>
      </div>
      <div className="price-tooltip-row">
        <span>High:</span>
        <span>{formatPrice(data.high)}</span>
      </div>
      <div className="price-tooltip-row">
        <span>Low:</span>
        <span>{formatPrice(data.low)}</span>
      </div>
      <div className="price-tooltip-row highlight">
        <span>Close:</span>
        <span>{formatPrice(data.close)}</span>
      </div>
      <div className="price-tooltip-row">
        <span>Volume:</span>
        <span>{formatVolume(data.volume)}</span>
      </div>
    </div>
  );
};

export function PriceChart({ symbol }) {
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchPrices() {
      if (!symbol) return;

      setLoading(true);
      setError(null);

      try {
        const [pricesRes, metricsRes] = await Promise.all([
          pricesAPI.get(symbol, { period }),
          pricesAPI.getMetrics(symbol)
        ]);

        if (pricesRes.data.success) {
          setData(pricesRes.data.data);
        } else {
          setError('No price data available');
        }

        if (metricsRes.data.success) {
          setMetrics(metricsRes.data.data);
        }
      } catch (err) {
        console.error('Error fetching prices:', err);
        setError('Failed to load price data');
      } finally {
        setLoading(false);
      }
    }

    fetchPrices();
  }, [symbol, period]);

  if (loading) {
    return (
      <div className="price-chart-container">
        <div className="price-chart-loading">Loading price data...</div>
      </div>
    );
  }

  if (error || !data || !data.prices || data.prices.length === 0) {
    return (
      <div className="price-chart-container">
        <div className="price-chart-empty">
          <Activity size={48} />
          <p>{error || 'No price data available for this stock'}</p>
          <span className="price-chart-empty-hint">
            Price data is being imported. Check back later.
          </span>
        </div>
      </div>
    );
  }

  const prices = data.prices;
  const currentPrice = prices[prices.length - 1]?.adjusted_close || prices[prices.length - 1]?.close;
  const startPrice = prices[0]?.adjusted_close || prices[0]?.close;
  const periodChange = startPrice ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
  const isPositive = periodChange >= 0;

  // Calculate SMA lines
  const calculateSMA = (data, period) => {
    return data.map((item, index) => {
      if (index < period - 1) return null;
      const slice = data.slice(index - period + 1, index + 1);
      const sum = slice.reduce((acc, d) => acc + (d.adjusted_close || d.close), 0);
      return sum / period;
    });
  };

  const sma50 = prices.length >= 50 ? calculateSMA(prices, 50) : [];
  const sma200 = prices.length >= 200 ? calculateSMA(prices, 200) : [];

  const chartData = prices.map((p, i) => ({
    ...p,
    price: p.adjusted_close || p.close,
    sma50: sma50[i],
    sma200: sma200[i]
  }));

  return (
    <div className="price-chart-container">
      {/* Header with current price and metrics */}
      <div className="price-chart-header">
        <div className="price-chart-current">
          <span className="price-chart-price">{formatPrice(currentPrice)}</span>
          <span className={`price-chart-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {formatPercent(periodChange)}
            <span className="price-chart-period-label">({period.toUpperCase()})</span>
          </span>
        </div>

        {/* Period selector */}
        <div className="price-chart-periods">
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`price-period-btn ${period === p.key ? 'active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key metrics row */}
      {metrics && (
        <div className="price-metrics-row">
          <div className="price-metric">
            <span className="price-metric-label">52W High</span>
            <span className="price-metric-value">{formatPrice(metrics.high_52w)}</span>
          </div>
          <div className="price-metric">
            <span className="price-metric-label">52W Low</span>
            <span className="price-metric-value">{formatPrice(metrics.low_52w)}</span>
          </div>
          <div className="price-metric">
            <span className="price-metric-label">SMA 50</span>
            <span className="price-metric-value">{formatPrice(metrics.sma_50)}</span>
          </div>
          <div className="price-metric">
            <span className="price-metric-label">SMA 200</span>
            <span className="price-metric-value">{formatPrice(metrics.sma_200)}</span>
          </div>
          <div className="price-metric">
            <span className="price-metric-label">RSI (14)</span>
            <span className={`price-metric-value ${
              metrics.rsi_14 < 30 ? 'oversold' : metrics.rsi_14 > 70 ? 'overbought' : ''
            }`}>
              {metrics.rsi_14?.toFixed(1) || '-'}
            </span>
          </div>
          <div className="price-metric">
            <span className="price-metric-label">YTD</span>
            <span className={`price-metric-value ${metrics.change_ytd >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(metrics.change_ytd)}
            </span>
          </div>
        </div>
      )}

      {/* Price chart */}
      <div className="price-chart-wrapper">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              tickFormatter={(val) => `$${val.toFixed(0)}`}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Price line */}
            <Line
              type="monotone"
              dataKey="price"
              stroke={isPositive ? '#10b981' : '#ef4444'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />

            {/* SMA 50 */}
            {sma50.length > 0 && (
              <Line
                type="monotone"
                dataKey="sma50"
                stroke="#6366f1"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="SMA 50"
              />
            )}

            {/* SMA 200 */}
            {sma200.length > 0 && (
              <Line
                type="monotone"
                dataKey="sma200"
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="SMA 200"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="price-chart-legend">
        <div className="legend-item">
          <span className="legend-line price-line"></span>
          <span>Price</span>
        </div>
        {sma50.length > 0 && (
          <div className="legend-item">
            <span className="legend-line sma50-line"></span>
            <span>SMA 50</span>
          </div>
        )}
        {sma200.length > 0 && (
          <div className="legend-item">
            <span className="legend-line sma200-line"></span>
            <span>SMA 200</span>
          </div>
        )}
      </div>

      {/* Data info */}
      <div className="price-chart-info">
        <Calendar size={14} />
        <span>
          {data.count} data points from {formatDate(prices[0]?.date)} to {formatDate(prices[prices.length - 1]?.date)}
        </span>
      </div>
    </div>
  );
}

export default PriceChart;
