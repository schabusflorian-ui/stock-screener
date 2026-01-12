// frontend/src/components/agent/TradeAttributionDetail.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import {
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  Newspaper,
  Users,
  Building2,
  Calendar,
  DollarSign,
  Target,
  Clock
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Skeleton } from '../Skeleton';
import { attributionAPI } from '../../services/api';
import './TradeAttributionDetail.css';

/**
 * Factor configuration
 */
const FACTOR_CONFIG = {
  technical: { label: 'Technical', icon: Activity, color: '#6366f1' },
  sentiment: { label: 'Sentiment', icon: Newspaper, color: '#10b981' },
  insider: { label: 'Insider', icon: Users, color: '#f59e0b' },
  fundamental: { label: 'Fundamental', icon: Building2, color: '#8b5cf6' },
};

/**
 * TradeAttributionDetail Component
 *
 * Displays detailed attribution analysis for a closed trade.
 */
function TradeAttributionDetail({ transactionId, onClose, className = '' }) {
  const [attribution, setAttribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (transactionId) {
      fetchAttribution();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  const fetchAttribution = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await attributionAPI.getTradeAttribution(transactionId);
      if (response.data?.success) {
        setAttribution(response.data.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load attribution');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`trade-attribution-detail ${className}`}>
        <Card variant="glass">
          <Skeleton className="trade-attribution-detail__skeleton" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`trade-attribution-detail ${className}`}>
        <Card variant="glass">
          <Card.Header>
            <Card.Title>Trade Attribution</Card.Title>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X size={18} />
              </Button>
            )}
          </Card.Header>
          <Card.Content>
            <div className="trade-attribution-detail__error">{error}</div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  if (!attribution) {
    return (
      <div className={`trade-attribution-detail ${className}`}>
        <Card variant="glass">
          <Card.Header>
            <Card.Title>Trade Attribution</Card.Title>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X size={18} />
              </Button>
            )}
          </Card.Header>
          <Card.Content>
            <div className="trade-attribution-detail__empty">
              No attribution data available for this trade
            </div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  const { trade, factors, summary } = attribution;
  const isProfit = trade?.pnl >= 0;

  // Prepare pie chart data
  const pieData = Object.entries(factors || {}).map(([key, data]) => ({
    name: FACTOR_CONFIG[key]?.label || key,
    value: Math.abs(data.contribution * 100),
    contribution: data.contribution * 100,
    color: FACTOR_CONFIG[key]?.color || '#9ca3af',
    direction: data.direction,
  }));

  // Prepare bar chart data for signal accuracy
  const barData = Object.entries(factors || {}).map(([key, data]) => ({
    factor: FACTOR_CONFIG[key]?.label || key,
    accuracy: (data.accuracy || 0) * 100,
    weight: (data.weight || 0) * 100,
  }));

  return (
    <div className={`trade-attribution-detail ${className}`}>
      <Card variant="glass">
        <Card.Header>
          <Card.Title>
            <DollarSign size={18} />
            Trade Attribution: {trade?.symbol}
          </Card.Title>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={18} />
            </Button>
          )}
        </Card.Header>

        <Card.Content>
          {/* Trade Summary */}
          <div className="trade-attribution-detail__summary">
            <div className="trade-attribution-detail__trade-info">
              <div className="trade-attribution-detail__symbol">
                {isProfit ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                <span>{trade?.symbol}</span>
                <Badge variant={trade?.side === 'buy' ? 'green' : 'red'}>
                  {trade?.side?.toUpperCase()}
                </Badge>
              </div>

              <div className="trade-attribution-detail__metrics">
                <div className="trade-attribution-detail__metric">
                  <span className="trade-attribution-detail__metric-label">Entry</span>
                  <span className="trade-attribution-detail__metric-value">
                    ${trade?.entry_price?.toFixed(2)}
                  </span>
                </div>
                <div className="trade-attribution-detail__metric">
                  <span className="trade-attribution-detail__metric-label">Exit</span>
                  <span className="trade-attribution-detail__metric-value">
                    ${trade?.exit_price?.toFixed(2)}
                  </span>
                </div>
                <div className="trade-attribution-detail__metric">
                  <span className="trade-attribution-detail__metric-label">Shares</span>
                  <span className="trade-attribution-detail__metric-value">
                    {trade?.shares}
                  </span>
                </div>
                <div className={`trade-attribution-detail__metric ${isProfit ? 'positive' : 'negative'}`}>
                  <span className="trade-attribution-detail__metric-label">P&L</span>
                  <span className="trade-attribution-detail__metric-value">
                    ${trade?.pnl?.toFixed(2)} ({trade?.pnl_pct?.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="trade-attribution-detail__dates">
                <div className="trade-attribution-detail__date">
                  <Calendar size={14} />
                  <span>Opened: {new Date(trade?.entry_date).toLocaleDateString()}</span>
                </div>
                <div className="trade-attribution-detail__date">
                  <Clock size={14} />
                  <span>Held: {trade?.holding_period} days</span>
                </div>
              </div>
            </div>
          </div>

          {/* Factor Contribution Pie Chart */}
          <div className="trade-attribution-detail__section">
            <h4 className="trade-attribution-detail__section-title">
              <Target size={16} />
              Factor Contributions
            </h4>
            <div className="trade-attribution-detail__chart-container">
              <div className="trade-attribution-detail__pie">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      label={({ name, contribution }) =>
                        `${name}: ${contribution >= 0 ? '+' : ''}${contribution.toFixed(1)}%`
                      }
                      labelLine={{ stroke: 'var(--text-tertiary)' }}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="trade-attribution-detail__tooltip">
                            <div className="trade-attribution-detail__tooltip-title">
                              {d.name}
                            </div>
                            <div className="trade-attribution-detail__tooltip-item">
                              Contribution: {d.contribution >= 0 ? '+' : ''}{d.contribution.toFixed(1)}%
                            </div>
                            <div className="trade-attribution-detail__tooltip-item">
                              Direction: {d.direction}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Factor Details */}
              <div className="trade-attribution-detail__factors">
                {Object.entries(factors || {}).map(([key, data]) => {
                  const config = FACTOR_CONFIG[key];
                  if (!config) return null;
                  const Icon = config.icon;
                  const contribution = (data.contribution || 0) * 100;

                  return (
                    <div key={key} className="trade-attribution-detail__factor">
                      <div className="trade-attribution-detail__factor-header">
                        <Icon size={16} style={{ color: config.color }} />
                        <span className="trade-attribution-detail__factor-label">
                          {config.label}
                        </span>
                        <Badge
                          variant={data.direction === 'positive' ? 'green' : 'red'}
                          size="sm"
                        >
                          {data.direction}
                        </Badge>
                      </div>
                      <div className="trade-attribution-detail__factor-body">
                        <div className="trade-attribution-detail__factor-stat">
                          <span>Contribution</span>
                          <span className={contribution >= 0 ? 'positive' : 'negative'}>
                            {contribution >= 0 ? '+' : ''}{contribution.toFixed(1)}%
                          </span>
                        </div>
                        <div className="trade-attribution-detail__factor-stat">
                          <span>Weight</span>
                          <span>{((data.weight || 0) * 100).toFixed(0)}%</span>
                        </div>
                        {data.signal_at_entry && (
                          <div className="trade-attribution-detail__factor-signal">
                            Signal: {data.signal_at_entry}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Signal Accuracy Chart */}
          <div className="trade-attribution-detail__section">
            <h4 className="trade-attribution-detail__section-title">
              <Activity size={16} />
              Factor Weights & Accuracy
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="factor"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  width={80}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="trade-attribution-detail__tooltip">
                        <div className="trade-attribution-detail__tooltip-title">
                          {d.factor}
                        </div>
                        <div className="trade-attribution-detail__tooltip-item">
                          Weight: {d.weight.toFixed(0)}%
                        </div>
                        <div className="trade-attribution-detail__tooltip-item">
                          Accuracy: {d.accuracy.toFixed(0)}%
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="weight" fill="var(--brand-primary)" name="Weight" />
                <Bar dataKey="accuracy" fill="#10b981" name="Accuracy" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Analysis */}
          {summary && (
            <div className="trade-attribution-detail__section">
              <h4 className="trade-attribution-detail__section-title">
                Analysis Summary
              </h4>
              <div className="trade-attribution-detail__analysis">
                {summary.primary_driver && (
                  <div className="trade-attribution-detail__analysis-item">
                    <strong>Primary Driver:</strong> {summary.primary_driver}
                  </div>
                )}
                {summary.key_insight && (
                  <div className="trade-attribution-detail__analysis-item">
                    <strong>Key Insight:</strong> {summary.key_insight}
                  </div>
                )}
                {summary.lessons && (
                  <div className="trade-attribution-detail__analysis-item">
                    <strong>Lessons:</strong> {summary.lessons}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

TradeAttributionDetail.propTypes = {
  transactionId: PropTypes.number.isRequired,
  onClose: PropTypes.func,
  className: PropTypes.string,
};

export default TradeAttributionDetail;
