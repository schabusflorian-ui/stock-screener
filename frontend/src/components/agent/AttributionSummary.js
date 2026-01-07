// frontend/src/components/agent/AttributionSummary.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCircle, XCircle } from 'lucide-react';
import Card from '../ui/Card';
import { Skeleton } from '../Skeleton';
import { attributionAPI } from '../../services/api';
import './AttributionSummary.css';

/**
 * Factor colors for the pie chart
 */
const FACTOR_COLORS = {
  technical: '#3B82F6',   // Blue
  sentiment: '#8B5CF6',   // Purple
  insider: '#F59E0B',     // Amber
  fundamental: '#10B981', // Green
  unexplained: '#9CA3AF', // Gray
};

/**
 * AttributionSummary Component
 *
 * Displays a pie chart breakdown of factor contributions for a single trade,
 * showing which signals contributed to the trade's outcome.
 */
function AttributionSummary({ transactionId, className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (transactionId) {
      fetchAttribution();
    }
  }, [transactionId]);

  const fetchAttribution = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await attributionAPI.analyzeTrade(transactionId);
      if (response.data?.success) {
        setData(response.data.data);
      } else {
        setError(response.data?.error || 'Failed to load attribution');
      }
    } catch (err) {
      setError(err.message || 'Failed to load attribution');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card variant="glass" className={`attribution-summary attribution-summary--loading ${className}`}>
        <Skeleton className="attribution-summary__skeleton-header" />
        <Skeleton className="attribution-summary__skeleton-chart" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card variant="base" className={`attribution-summary attribution-summary--error ${className}`}>
        <div className="attribution-summary__error">
          Unable to load attribution
        </div>
      </Card>
    );
  }

  const chartData = [
    ...data.attribution.factors.map(f => ({
      name: f.factor.charAt(0).toUpperCase() + f.factor.slice(1),
      factor: f.factor,
      value: Math.abs(f.contribution) * 100,
      correct: f.correct,
    })),
    ...(Math.abs(data.attribution.unexplained) > 0.001 ? [{
      name: 'Unexplained',
      factor: 'unexplained',
      value: Math.abs(data.attribution.unexplained) * 100,
      correct: data.attribution.unexplained > 0,
    }] : []),
  ].filter(d => d.value > 0);

  const pnlIsPositive = data.performance.pnlPct >= 0;

  return (
    <Card variant="glass" className={`attribution-summary ${className}`}>
      {/* Header */}
      <div className="attribution-summary__header">
        <div>
          <h3 className="attribution-summary__title">{data.trade.symbol} Trade Attribution</h3>
          <p className="attribution-summary__subtitle">
            {data.trade.entryDate} → {data.trade.exitDate} ({data.performance.holdingDays} days)
          </p>
        </div>
        <div className={`attribution-summary__pnl ${pnlIsPositive ? 'positive' : 'negative'}`}>
          {pnlIsPositive ? '+' : ''}{(data.performance.pnlPct * 100).toFixed(2)}%
        </div>
      </div>

      <div className="attribution-summary__content">
        {/* Pie Chart */}
        <div className="attribution-summary__chart">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={FACTOR_COLORS[entry.factor]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => `${value.toFixed(1)}%`}
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Factor Breakdown */}
        <div className="attribution-summary__factors">
          {data.attribution.factors.map((factor) => (
            <div key={factor.factor} className="attribution-summary__factor">
              <div className="attribution-summary__factor-header">
                <div
                  className="attribution-summary__factor-color"
                  style={{ backgroundColor: FACTOR_COLORS[factor.factor] }}
                />
                <span className="attribution-summary__factor-name">
                  {factor.factor.charAt(0).toUpperCase() + factor.factor.slice(1)}
                </span>
              </div>
              <div className="attribution-summary__factor-details">
                {factor.correct ? (
                  <CheckCircle size={14} className="attribution-summary__icon--correct" />
                ) : (
                  <XCircle size={14} className="attribution-summary__icon--incorrect" />
                )}
                <span className="attribution-summary__factor-signal">
                  Signal: {factor.signalAtEntry?.toFixed(2) || 'N/A'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Entry Signals */}
      {data.signalsAtEntry && (
        <div className="attribution-summary__signals">
          <h4 className="attribution-summary__section-title">Signals at Entry</h4>
          <div className="attribution-summary__signals-grid">
            {Object.entries(data.signalsAtEntry).map(([key, signal]) => (
              <div key={key} className="attribution-summary__signal">
                <span className="attribution-summary__signal-name">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
                <span className={`attribution-summary__signal-value ${
                  signal.score > 0 ? 'positive' : signal.score < 0 ? 'negative' : ''
                }`}>
                  {signal.score?.toFixed(2) || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regime Context */}
      <div className="attribution-summary__footer">
        Market regime at entry: <strong>{data.regimeAtEntry || 'Unknown'}</strong>
      </div>
    </Card>
  );
}

AttributionSummary.propTypes = {
  transactionId: PropTypes.number.isRequired,
  className: PropTypes.string,
};

export default AttributionSummary;
