// frontend/src/components/agent/FactorPerformance.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Card from '../ui/Card';
import { Skeleton } from '../Skeleton';
import { attributionAPI } from '../../services/api';
import './FactorPerformance.css';

/**
 * Factor labels for display
 */
const FACTOR_LABELS = {
  technical: 'Technical',
  sentiment: 'Sentiment',
  insider: 'Insider',
  fundamental: 'Fundamental',
};

/**
 * Period options
 */
const PERIODS = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
  { value: 'all', label: 'All Time' },
];

/**
 * FactorPerformance Component
 *
 * Displays a bar chart showing win rates for each signal factor,
 * helping users understand which signals are most predictive.
 */
function FactorPerformance({ portfolioId, className = '' }) {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('90d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (portfolioId) {
      fetchFactorPerformance();
    }
  }, [portfolioId, period]);

  const fetchFactorPerformance = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await attributionAPI.getFactorPerformance(portfolioId, period);
      if (response.data?.success) {
        setData(response.data.data);
      } else {
        setError(response.data?.error || 'Failed to load factor performance');
      }
    } catch (err) {
      setError(err.message || 'Failed to load factor performance');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card variant="glass" className={`factor-performance factor-performance--loading ${className}`}>
        <Skeleton className="factor-performance__skeleton-header" />
        <Skeleton className="factor-performance__skeleton-chart" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card variant="base" className={`factor-performance factor-performance--error ${className}`}>
        <div className="factor-performance__error">
          Unable to load factor performance
        </div>
      </Card>
    );
  }

  const chartData = data.ranked?.map(f => ({
    name: FACTOR_LABELS[f.factor] || f.factor,
    factor: f.factor,
    winRate: f.winRate * 100,
    trades: f.totalTrades,
  })) || [];

  return (
    <Card variant="glass" className={`factor-performance ${className}`}>
      <div className="factor-performance__header">
        <h3 className="factor-performance__title">Factor Performance</h3>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="factor-performance__period-select"
        >
          {PERIODS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="factor-performance__chart">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            />
            <Tooltip
              formatter={(value) => [`${value.toFixed(1)}%`, 'Win Rate']}
              labelFormatter={(label) => label}
              contentStyle={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '8px',
              }}
            />
            <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.winRate >= 50 ? 'var(--positive)' : 'var(--negative)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="factor-performance__summary">
        {data.bestFactor && data.factors[data.bestFactor] && (
          <div className="factor-performance__summary-item factor-performance__summary-item--positive">
            <TrendingUp size={16} />
            <div>
              <span className="factor-performance__summary-label">Best Factor</span>
              <span className="factor-performance__summary-value">
                {FACTOR_LABELS[data.bestFactor]} ({(data.factors[data.bestFactor].winRate * 100).toFixed(0)}% win rate)
              </span>
            </div>
          </div>
        )}
        {data.worstFactor && data.factors[data.worstFactor] && (
          <div className="factor-performance__summary-item factor-performance__summary-item--negative">
            <TrendingDown size={16} />
            <div>
              <span className="factor-performance__summary-label">Needs Improvement</span>
              <span className="factor-performance__summary-value">
                {FACTOR_LABELS[data.worstFactor]} ({(data.factors[data.worstFactor].winRate * 100).toFixed(0)}% win rate)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="factor-performance__footer">
        Based on {data.totalTrades} closed trades
      </div>
    </Card>
  );
}

FactorPerformance.propTypes = {
  portfolioId: PropTypes.number.isRequired,
  className: PropTypes.string,
};

export default FactorPerformance;
