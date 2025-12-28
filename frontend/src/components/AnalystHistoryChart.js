// frontend/src/components/AnalystHistoryChart.js
import { useState, useEffect } from 'react';
import {
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart
} from 'recharts';
import { TrendingUp, TrendingDown, Target, Users, Calendar, RefreshCcw, History } from 'lucide-react';
import { sentimentAPI } from '../services/api';
import './AnalystHistoryChart.css';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const formatPrice = (value) => {
  if (value === null || value === undefined) return '-';
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="analyst-history-tooltip">
      <div className="tooltip-date">{formatDate(data.date)}</div>
      <div className="tooltip-row">
        <span className="tooltip-label">Price:</span>
        <span className="tooltip-value">{formatPrice(data.price)}</span>
      </div>
      <div className="tooltip-row target">
        <span className="tooltip-label">Target Mean:</span>
        <span className="tooltip-value">{formatPrice(data.targetMean)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Target High:</span>
        <span className="tooltip-value">{formatPrice(data.targetHigh)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Target Low:</span>
        <span className="tooltip-value">{formatPrice(data.targetLow)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Upside:</span>
        <span className={`tooltip-value ${data.upsidePotential > 0 ? 'positive' : 'negative'}`}>
          {formatPercent(data.upsidePotential)}
        </span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Analysts:</span>
        <span className="tooltip-value">{data.numAnalysts}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Signal:</span>
        <span className={`tooltip-value signal-${data.signal?.replace('_', '-')}`}>
          {data.signal?.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
};

const RecommendationTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const total = (data.strongBuy || 0) + (data.buy || 0) + (data.hold || 0) +
                (data.sell || 0) + (data.strongSell || 0);

  return (
    <div className="analyst-history-tooltip">
      <div className="tooltip-date">{formatDate(data.date)}</div>
      <div className="tooltip-row">
        <span className="tooltip-label rec-strong-buy">Strong Buy:</span>
        <span className="tooltip-value">{data.strongBuy || 0}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label rec-buy">Buy:</span>
        <span className="tooltip-value">{data.buy || 0}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label rec-hold">Hold:</span>
        <span className="tooltip-value">{data.hold || 0}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label rec-sell">Sell:</span>
        <span className="tooltip-value">{data.sell || 0}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label rec-strong-sell">Strong Sell:</span>
        <span className="tooltip-value">{data.strongSell || 0}</span>
      </div>
      <div className="tooltip-row total">
        <span className="tooltip-label">Total Analysts:</span>
        <span className="tooltip-value">{total}</span>
      </div>
    </div>
  );
};

export function AnalystHistoryChart({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('price'); // 'price' or 'recommendations'

  useEffect(() => {
    async function fetchHistory() {
      if (!symbol) return;

      setLoading(true);
      setError(null);

      try {
        const res = await sentimentAPI.getAnalystHistory(symbol);
        if (res.data) {
          setData(res.data);
        } else {
          setError('No analyst history data available');
        }
      } catch (err) {
        console.error('Error fetching analyst history:', err);
        setError('Failed to load analyst history');
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [symbol]);

  if (loading) {
    return (
      <div className="analyst-history-container">
        <div className="analyst-history-loading">
          <RefreshCcw className="spin" size={20} />
          <span>Loading analyst history...</span>
        </div>
      </div>
    );
  }

  if (error || !data || data.dataPoints < 2) {
    return (
      <div className="analyst-history-container">
        <div className="analyst-history-empty">
          <History size={32} />
          <p>{error || 'Not enough historical data yet'}</p>
          <span className="analyst-history-hint">
            Historical data will accumulate as analyst estimates are updated over time.
          </span>
        </div>
      </div>
    );
  }

  // Prepare chart data - combine current + history, sorted chronologically
  const allData = data.current ? [data.current, ...data.history] : data.history;
  const chartData = allData
    .map(d => ({
      date: d.date,
      price: d.price,
      targetHigh: d.targetHigh,
      targetLow: d.targetLow,
      targetMean: d.targetMean,
      targetMedian: d.targetMedian,
      numAnalysts: d.numAnalysts,
      upsidePotential: d.upsidePotential,
      recommendationKey: d.recommendationKey,
      signal: d.signal,
      strongBuy: d.strongBuy,
      buy: d.buy,
      hold: d.hold,
      sell: d.sell,
      strongSell: d.strongSell,
      buyPercent: d.buyPercent,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const latestPrice = chartData[chartData.length - 1]?.price;
  const latestTarget = chartData[chartData.length - 1]?.targetMean;
  const currentUpside = latestTarget && latestPrice
    ? ((latestTarget - latestPrice) / latestPrice) * 100
    : null;

  // Calculate changes from previous data point
  const changes = data.changes;

  return (
    <div className="analyst-history-container">
      {/* Header */}
      <div className="analyst-history-header">
        <div className="history-title">
          <History size={16} />
          <span>Analyst Estimate History</span>
          <span className="data-points">{data.dataPoints} data points</span>
        </div>
        <div className="history-view-toggle">
          <button
            className={view === 'price' ? 'active' : ''}
            onClick={() => setView('price')}
          >
            <Target size={14} />
            Price Targets
          </button>
          <button
            className={view === 'recommendations' ? 'active' : ''}
            onClick={() => setView('recommendations')}
          >
            <Users size={14} />
            Recommendations
          </button>
        </div>
      </div>

      {/* Changes Summary */}
      {changes && (
        <div className="analyst-changes-summary">
          {changes.targetMeanChange !== null && (
            <div className={`change-item ${changes.targetMeanChange >= 0 ? 'positive' : 'negative'}`}>
              <span className="change-label">Target Change</span>
              <span className="change-value">
                {changes.targetMeanChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {formatPercent(changes.targetMeanChange)}
              </span>
            </div>
          )}
          {changes.numAnalystsChange !== null && changes.numAnalystsChange !== 0 && (
            <div className={`change-item ${changes.numAnalystsChange >= 0 ? 'positive' : 'negative'}`}>
              <span className="change-label">Analysts</span>
              <span className="change-value">
                {changes.numAnalystsChange > 0 ? '+' : ''}{changes.numAnalystsChange}
              </span>
            </div>
          )}
          {changes.buyPercentChange !== null && Math.abs(changes.buyPercentChange) > 1 && (
            <div className={`change-item ${changes.buyPercentChange >= 0 ? 'positive' : 'negative'}`}>
              <span className="change-label">Buy %</span>
              <span className="change-value">
                {changes.buyPercentChange > 0 ? '+' : ''}{changes.buyPercentChange.toFixed(1)}%
              </span>
            </div>
          )}
          {changes.signalChange && (
            <div className="change-item signal-change">
              <span className="change-label">Signal</span>
              <span className="change-value">
                <span className={`signal-${changes.signalChange.from?.replace('_', '-')}`}>
                  {changes.signalChange.from?.replace('_', ' ')}
                </span>
                <span className="arrow">→</span>
                <span className={`signal-${changes.signalChange.to?.replace('_', '-')}`}>
                  {changes.signalChange.to?.replace('_', ' ')}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Price Target Chart */}
      {view === 'price' && (
        <div className="analyst-history-chart">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-color)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(val) => `$${val.toFixed(0)}`}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-color)' }}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Target range area */}
              <Area
                type="monotone"
                dataKey="targetHigh"
                stroke="none"
                fill="var(--primary-color)"
                fillOpacity={0.1}
                name="Target High"
              />
              <Area
                type="monotone"
                dataKey="targetLow"
                stroke="none"
                fill="var(--bg-color)"
                fillOpacity={1}
                name="Target Low"
              />

              {/* Actual price line */}
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--text-primary)"
                strokeWidth={2}
                dot={false}
                name="Current Price"
              />

              {/* Target mean line */}
              <Line
                type="monotone"
                dataKey="targetMean"
                stroke="var(--primary-color)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--primary-color)' }}
                name="Target Mean"
              />

              {/* Target high dashed */}
              <Line
                type="monotone"
                dataKey="targetHigh"
                stroke="var(--success-color)"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Target High"
              />

              {/* Target low dashed */}
              <Line
                type="monotone"
                dataKey="targetLow"
                stroke="var(--danger-color)"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Target Low"
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="analyst-chart-legend">
            <div className="legend-item">
              <span className="legend-line price-line"></span>
              <span>Current Price</span>
            </div>
            <div className="legend-item">
              <span className="legend-line target-line"></span>
              <span>Target Mean</span>
            </div>
            <div className="legend-item">
              <span className="legend-line high-line"></span>
              <span>Target High</span>
            </div>
            <div className="legend-item">
              <span className="legend-line low-line"></span>
              <span>Target Low</span>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations Stacked Bar Chart */}
      {view === 'recommendations' && (
        <div className="analyst-history-chart">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-color)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-color)' }}
                width={40}
              />
              <Tooltip content={<RecommendationTooltip />} />

              <Bar dataKey="strongBuy" stackId="a" fill="#22c55e" name="Strong Buy" />
              <Bar dataKey="buy" stackId="a" fill="#86efac" name="Buy" />
              <Bar dataKey="hold" stackId="a" fill="#fbbf24" name="Hold" />
              <Bar dataKey="sell" stackId="a" fill="#fca5a5" name="Sell" />
              <Bar dataKey="strongSell" stackId="a" fill="#ef4444" name="Strong Sell" />
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="analyst-chart-legend recommendations">
            <div className="legend-item">
              <span className="legend-box strong-buy"></span>
              <span>Strong Buy</span>
            </div>
            <div className="legend-item">
              <span className="legend-box buy"></span>
              <span>Buy</span>
            </div>
            <div className="legend-item">
              <span className="legend-box hold"></span>
              <span>Hold</span>
            </div>
            <div className="legend-item">
              <span className="legend-box sell"></span>
              <span>Sell</span>
            </div>
            <div className="legend-item">
              <span className="legend-box strong-sell"></span>
              <span>Strong Sell</span>
            </div>
          </div>
        </div>
      )}

      {/* Current Summary */}
      <div className="analyst-history-summary">
        <div className="summary-item">
          <span className="summary-label">Current Price</span>
          <span className="summary-value">{formatPrice(latestPrice)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Target Mean</span>
          <span className="summary-value target">{formatPrice(latestTarget)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Upside</span>
          <span className={`summary-value ${currentUpside && currentUpside > 0 ? 'positive' : 'negative'}`}>
            {currentUpside !== null ? formatPercent(currentUpside) : '-'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Analysts</span>
          <span className="summary-value">{chartData[chartData.length - 1]?.numAnalysts || '-'}</span>
        </div>
      </div>

      {/* Data info */}
      <div className="analyst-history-info">
        <Calendar size={12} />
        <span>
          Data from {formatDate(chartData[0]?.date)} to {formatDate(chartData[chartData.length - 1]?.date)}
        </span>
      </div>
    </div>
  );
}

export default AnalystHistoryChart;
