// frontend/src/components/EarningsCalendar.js
import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { Calendar, TrendingUp, TrendingDown, Target, Award, Clock, RefreshCcw, DollarSign } from 'lucide-react';
import { earningsAPI } from '../services/api';
import './EarningsCalendar.css';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '-';
  return `$${value.toFixed(2)}`;
};

const formatLargeCurrency = (value) => {
  if (value === null || value === undefined) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const SurpriseTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="earnings-tooltip">
      <div className="tooltip-quarter">{data.quarter}</div>
      <div className="tooltip-row">
        <span className="tooltip-label">EPS Actual:</span>
        <span className="tooltip-value">{formatCurrency(data.epsActual)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">EPS Estimate:</span>
        <span className="tooltip-value">{formatCurrency(data.epsEstimate)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Surprise:</span>
        <span className={`tooltip-value ${data.beat ? 'positive' : 'negative'}`}>
          {formatPercent(data.surprisePercent)}
        </span>
      </div>
    </div>
  );
};

export function EarningsCalendar({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchEarnings() {
      if (!symbol) return;

      setLoading(true);
      setError(null);

      try {
        const res = await earningsAPI.get(symbol);
        if (res.data.success) {
          setData(res.data.data);
        } else {
          setError(res.data.error || 'Failed to load earnings data');
        }
      } catch (err) {
        console.error('Error fetching earnings:', err);
        setError('Failed to load earnings data');
      } finally {
        setLoading(false);
      }
    }

    fetchEarnings();
  }, [symbol]);

  if (loading) {
    return (
      <div className="earnings-calendar-container">
        <div className="earnings-loading">
          <RefreshCcw className="spin" size={20} />
          <span>Loading earnings data...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="earnings-calendar-container">
        <div className="earnings-empty">
          <Calendar size={32} />
          <p>{error || 'No earnings data available'}</p>
        </div>
      </div>
    );
  }

  const { nextEarnings, history, stats, dividend } = data;

  // Prepare chart data - show surprise percentage bars
  const chartData = (history || []).slice(0, 8).reverse().map((h, idx) => ({
    quarter: h.period || `Q${idx + 1}`,
    surprisePercent: h.surprisePercent || 0,
    epsActual: h.epsActual,
    epsEstimate: h.epsEstimate,
    beat: h.beat
  }));

  // Calculate days until next earnings
  const daysUntil = nextEarnings?.date
    ? Math.ceil((new Date(nextEarnings.date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="earnings-calendar-container">
      {/* Header */}
      <div className="earnings-header">
        <div className="earnings-title">
          <Calendar size={18} />
          <span>Earnings</span>
        </div>
      </div>

      {/* Next Earnings Card */}
      {nextEarnings && (
        <div className="next-earnings-card">
          <div className="next-earnings-header">
            <Clock size={16} />
            <span>Next Earnings</span>
            {nextEarnings.isEstimate && <span className="estimate-badge">Estimated</span>}
          </div>
          <div className="next-earnings-date">
            {formatDate(nextEarnings.date)}
            {daysUntil !== null && daysUntil >= 0 && (
              <span className={`days-badge ${daysUntil <= 7 ? 'soon' : ''}`}>
                {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
              </span>
            )}
          </div>

          <div className="next-earnings-estimates">
            <div className="estimate-item">
              <span className="estimate-label">EPS Est.</span>
              <span className="estimate-value">{formatCurrency(nextEarnings.epsEstimate)}</span>
              {nextEarnings.epsLow && nextEarnings.epsHigh && (
                <span className="estimate-range">
                  ({formatCurrency(nextEarnings.epsLow)} - {formatCurrency(nextEarnings.epsHigh)})
                </span>
              )}
            </div>
            <div className="estimate-item">
              <span className="estimate-label">Revenue Est.</span>
              <span className="estimate-value">{formatLargeCurrency(nextEarnings.revenueEstimate)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Beat Stats */}
      {stats && (
        <div className="earnings-stats">
          <div className="stat-item">
            <Award size={16} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Beat Rate</span>
              <span className={`stat-value ${stats.beatRate >= 75 ? 'positive' : stats.beatRate < 50 ? 'negative' : ''}`}>
                {stats.beatRate ? `${stats.beatRate.toFixed(0)}%` : '-'}
              </span>
            </div>
          </div>
          <div className="stat-item">
            <TrendingUp size={16} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Avg Surprise</span>
              <span className={`stat-value ${stats.avgSurprise > 0 ? 'positive' : 'negative'}`}>
                {stats.avgSurprise ? formatPercent(stats.avgSurprise) : '-'}
              </span>
            </div>
          </div>
          <div className="stat-item">
            <Target size={16} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Streak</span>
              <span className="stat-value">
                {stats.consecutiveBeats ? `${stats.consecutiveBeats} beats` : '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Surprise Chart */}
      {chartData.length > 0 && (
        <div className="earnings-chart">
          <div className="chart-title">EPS Surprise History</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis
                dataKey="quarter"
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-color)' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<SurpriseTooltip />} />
              <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="3 3" />
              <Bar dataKey="surprisePercent" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.beat ? 'var(--success-color)' : 'var(--danger-color)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History Table */}
      {history && history.length > 0 && (
        <div className="earnings-history">
          <div className="history-title">Recent Quarters</div>
          <table className="history-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Actual</th>
                <th>Est.</th>
                <th>Surprise</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 4).map((h, idx) => (
                <tr key={idx}>
                  <td>{h.period || formatDate(h.quarter)}</td>
                  <td>{formatCurrency(h.epsActual)}</td>
                  <td>{formatCurrency(h.epsEstimate)}</td>
                  <td className={h.beat ? 'positive' : 'negative'}>
                    {h.beat ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {formatPercent(h.surprisePercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dividend Info */}
      {dividend && (dividend.exDate || dividend.payDate) && (
        <div className="dividend-info">
          <DollarSign size={14} />
          <span>
            {dividend.exDate && `Ex-Div: ${formatDate(dividend.exDate)}`}
            {dividend.exDate && dividend.payDate && ' | '}
            {dividend.payDate && `Pay: ${formatDate(dividend.payDate)}`}
          </span>
        </div>
      )}
    </div>
  );
}

export default EarningsCalendar;
