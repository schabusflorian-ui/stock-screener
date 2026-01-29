// frontend/src/components/PriceChart.js
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, Calendar } from './icons';
import { pricesAPI } from '../services/api';
import { useAskAI, createChartExtractor } from '../hooks';
import './PriceChart.css';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '5y', label: '5Y' },
  { key: 'max', label: 'MAX' }
];

// Available overlay options - use ETF symbols which have current price data
const OVERLAY_OPTIONS = [
  { key: 'sma50', label: 'SMA 50', color: '#7C3AED', type: 'indicator' },
  { key: 'sma200', label: 'SMA 200', color: '#D97706', type: 'indicator' },
  { key: 'spy', label: 'S&P 500 (SPY)', color: '#7C3AED', type: 'index', symbol: 'SPY' },
  { key: 'qqq', label: 'NASDAQ (QQQ)', color: '#0891B2', type: 'index', symbol: 'QQQ' },
  { key: 'dia', label: 'Dow Jones (DIA)', color: '#D97706', type: 'index', symbol: 'DIA' },
  { key: 'alpha', label: 'Alpha vs SPY', color: '#7C3AED', type: 'alpha' }
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
  const [indexData, setIndexData] = useState({ spy: null, qqq: null, dia: null });
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Overlay toggles - SMA50 and SMA200 default on, indices off
  const [overlays, setOverlays] = useState({
    sma50: true,
    sma200: true,
    spy: false,
    qqq: false,
    dia: false,
    alpha: false
  });

  // View mode: 'price' (absolute) or 'returns' (percentage returns with alpha)
  const [viewMode, setViewMode] = useState('price');

  // Ask AI context menu for chart
  const askAIProps = useAskAI(createChartExtractor(() => {
    // Extract current chart context
    const prices = data?.prices || [];
    const currentPrice = prices.length > 0
      ? (prices[prices.length - 1]?.adjusted_close || prices[prices.length - 1]?.close)
      : null;
    const startPrice = prices.length > 0
      ? (prices[0]?.adjusted_close || prices[0]?.close)
      : null;
    const change = startPrice && currentPrice
      ? ((currentPrice - startPrice) / startPrice) * 100
      : 0;

    return {
      symbol,
      metric: 'price',
      value: currentPrice,
      period,
      trend: change >= 0 ? 'up' : 'down',
      changePercent: change
    };
  }));

  const toggleOverlay = (key) => {
    if (key === 'alpha') {
      // Toggle alpha mode - switches to returns view
      const newAlphaState = !overlays.alpha;
      setOverlays(prev => ({ ...prev, alpha: newAlphaState }));
      setViewMode(newAlphaState ? 'returns' : 'price');
    } else {
      setOverlays(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

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

        // Fetch ETF data for overlays (SPY, QQQ, DIA have current price data)
        const indexSymbols = [
          { key: 'spy', symbol: 'SPY', label: 'S&P 500' },
          { key: 'qqq', symbol: 'QQQ', label: 'NASDAQ' },
          { key: 'dia', symbol: 'DIA', label: 'Dow Jones' }
        ];

        const indexPromises = indexSymbols.map(async (idx) => {
          try {
            // Use pricesAPI.get() which fetches from daily_prices table (current data)
            const res = await pricesAPI.get(idx.symbol, { period });
            // Response structure: { success: true, data: { prices: [...] } }
            const prices = res.data?.data?.prices;
            if (res.data.success && prices && prices.length > 0) {
              // Price data may come in descending order, ensure it's ascending (oldest first)
              const sortedData = [...prices].sort((a, b) =>
                new Date(a.date) - new Date(b.date)
              );
              return { key: idx.key, data: sortedData };
            }
          } catch (e) {
            console.log(`No ${idx.label} data available`);
          }
          return { key: idx.key, data: null };
        });

        const indexResults = await Promise.all(indexPromises);
        const newIndexData = {};
        indexResults.forEach(r => {
          newIndexData[r.key] = r.data;
        });
        setIndexData(newIndexData);
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

  // Create maps of index prices by date for overlays (normalized to stock's starting price)
  const createIndexMap = (idxData) => {
    const map = new Map();
    if (idxData && idxData.length > 0) {
      const idxStartPrice = idxData[0]?.adjusted_close || idxData[0]?.close;
      for (const p of idxData) {
        const idxPrice = p.adjusted_close || p.close;
        // Rebase index to stock's starting price for visual comparison
        const normalized = startPrice * (idxPrice / idxStartPrice);
        map.set(p.date, normalized);
      }
    }
    return map;
  };

  const spyByDate = createIndexMap(indexData.spy);
  const qqqByDate = createIndexMap(indexData.qqq);
  const diaByDate = createIndexMap(indexData.dia);

  // Calculate cumulative returns for alpha view
  const spyStartPrice = indexData.spy?.[0]?.adjusted_close || indexData.spy?.[0]?.close;

  const chartData = prices.map((p, i) => {
    const stockPrice = p.adjusted_close || p.close;
    const stockReturn = ((stockPrice - startPrice) / startPrice) * 100;

    // Get SPY return for same date
    const spyPrice = indexData.spy?.find(s => s.date === p.date);
    const spyReturn = spyPrice && spyStartPrice
      ? (((spyPrice.adjusted_close || spyPrice.close) - spyStartPrice) / spyStartPrice) * 100
      : null;

    // Alpha = Stock Return - SPY Return
    const alpha = spyReturn !== null ? stockReturn - spyReturn : null;

    return {
      ...p,
      price: stockPrice,
      sma50: sma50[i],
      sma200: sma200[i],
      spy: spyByDate.get(p.date) || null,
      qqq: qqqByDate.get(p.date) || null,
      dia: diaByDate.get(p.date) || null,
      stockReturn,
      spyReturn,
      alpha
    };
  });

  // Calculate current alpha for display
  const currentAlpha = chartData.length > 0 ? chartData[chartData.length - 1].alpha : null;

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
          {currentAlpha !== null && (
            <span className={`price-chart-alpha ${currentAlpha >= 0 ? 'outperform' : 'underperform'}`}>
              α {currentAlpha >= 0 ? '+' : ''}{currentAlpha.toFixed(1)}%
            </span>
          )}
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

      {/* Overlay toggles */}
      <div className="price-overlay-toggles">
        <span className="overlay-label">Overlays:</span>
        {OVERLAY_OPTIONS.map(opt => {
          const isDisabled = (opt.key === 'sma50' && sma50.length === 0) ||
                            (opt.key === 'sma200' && sma200.length === 0) ||
                            (opt.key === 'spy' && !indexData.spy) ||
                            (opt.key === 'qqq' && !indexData.qqq) ||
                            (opt.key === 'dia' && !indexData.dia) ||
                            (opt.key === 'alpha' && !indexData.spy);
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

      {/* Chart - switches between price view and returns/alpha view */}
      <div className="price-chart-wrapper">
        {/* Transparent overlay for Ask AI context menu - captures right-clicks on Mac */}
        <div className="chart-ask-ai-overlay" {...askAIProps} />
        <ResponsiveContainer width="100%" height={350}>
          {viewMode === 'returns' ? (
            /* Alpha/Returns Chart */
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="alphaPositiveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="alphaNegativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D97706" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#D97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date) => {
                  const d = new Date(date);
                  return d.toLocaleDateString('en-US', { month: 'short' });
                }}
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                dy={8}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="price-tooltip">
                      <div className="price-tooltip-date">{formatDate(d.date)}</div>
                      <div className="price-tooltip-row">
                        <span>{symbol} Return:</span>
                        <span className={d.stockReturn >= 0 ? 'positive' : 'negative'}>
                          {d.stockReturn >= 0 ? '+' : ''}{d.stockReturn?.toFixed(2)}%
                        </span>
                      </div>
                      <div className="price-tooltip-row">
                        <span>S&P 500 Return:</span>
                        <span className={d.spyReturn >= 0 ? 'positive' : 'negative'}>
                          {d.spyReturn >= 0 ? '+' : ''}{d.spyReturn?.toFixed(2)}%
                        </span>
                      </div>
                      <div className="price-tooltip-row highlight">
                        <span>Alpha:</span>
                        <span className={d.alpha >= 0 ? 'alpha-positive' : 'alpha-negative'}>
                          {d.alpha >= 0 ? '+' : ''}{d.alpha?.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="#CBD5E1" strokeDasharray="0" />

              {/* Alpha filled area */}
              <Area
                type="monotone"
                dataKey="alpha"
                stroke={currentAlpha >= 0 ? '#7C3AED' : '#D97706'}
                strokeWidth={2}
                fill={currentAlpha >= 0 ? 'url(#alphaPositiveGradient)' : 'url(#alphaNegativeGradient)'}
                name="Alpha"
              />

              {/* Stock return line */}
              <Line
                type="monotone"
                dataKey="stockReturn"
                stroke={isPositive ? '#059669' : '#DC2626'}
                strokeWidth={2}
                dot={false}
                name={symbol}
              />

              {/* SPY return line */}
              <Line
                type="monotone"
                dataKey="spyReturn"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                name="S&P 500"
              />
            </ComposedChart>
          ) : (
            /* Standard Price Chart */
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date) => {
                  const d = new Date(date);
                  return d.toLocaleDateString('en-US', { month: 'short' });
                }}
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                dy={8}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(val) => `$${val.toFixed(0)}`}
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Price line */}
              <Line
                type="monotone"
                dataKey="price"
                stroke="#2563EB"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: '#2563EB', strokeWidth: 2, stroke: '#FFFFFF' }}
              />

              {/* SMA 50 */}
              {sma50.length > 0 && overlays.sma50 && (
                <Line
                  type="monotone"
                  dataKey="sma50"
                  stroke="#7C3AED"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="SMA 50"
                />
              )}

              {/* SMA 200 */}
              {sma200.length > 0 && overlays.sma200 && (
                <Line
                  type="monotone"
                  dataKey="sma200"
                  stroke="#D97706"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="SMA 200"
                />
              )}

              {/* S&P 500 Index */}
              {indexData.spy && overlays.spy && (
                <Line
                  type="monotone"
                  dataKey="spy"
                  stroke="#7C3AED"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="S&P 500"
                />
              )}

              {/* NASDAQ (QQQ) Index */}
              {indexData.qqq && overlays.qqq && (
                <Line
                  type="monotone"
                  dataKey="qqq"
                  stroke="#0891B2"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="NASDAQ"
                />
              )}

              {/* Dow Jones (DIA) Index */}
              {indexData.dia && overlays.dia && (
                <Line
                  type="monotone"
                  dataKey="dia"
                  stroke="#D97706"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Dow Jones"
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend - simplified since toggles are above */}
      <div className="price-chart-legend">
        <div className="legend-item">
          <span className="legend-line price-line" style={{ background: isPositive ? '#059669' : '#DC2626' }}></span>
          <span>{symbol}</span>
        </div>
        {sma50.length > 0 && overlays.sma50 && (
          <div className="legend-item">
            <span className="legend-line sma50-line"></span>
            <span>SMA 50</span>
          </div>
        )}
        {sma200.length > 0 && overlays.sma200 && (
          <div className="legend-item">
            <span className="legend-line sma200-line"></span>
            <span>SMA 200</span>
          </div>
        )}
        {indexData.spy && overlays.spy && (
          <div className="legend-item">
            <span className="legend-line spy-line"></span>
            <span>S&P 500 (rebased)</span>
          </div>
        )}
        {indexData.qqq && overlays.qqq && (
          <div className="legend-item">
            <span className="legend-line qqq-line"></span>
            <span>NASDAQ (rebased)</span>
          </div>
        )}
        {indexData.dia && overlays.dia && (
          <div className="legend-item">
            <span className="legend-line dia-line"></span>
            <span>Dow Jones (rebased)</span>
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

PriceChart.propTypes = {
  symbol: PropTypes.string.isRequired
};

export default PriceChart;
