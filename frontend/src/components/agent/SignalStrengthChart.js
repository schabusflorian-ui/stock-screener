// frontend/src/components/agent/SignalStrengthChart.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { Activity, TrendingUp, Users, Building2, Newspaper } from '../icons';
import Card from '../ui/Card';
import { Skeleton } from '../Skeleton';
import { attributionAPI } from '../../services/api';
import { useAskAI, createChartExtractor } from '../../hooks';
import './SignalStrengthChart.css';

/**
 * Signal factor configuration
 */
const SIGNAL_FACTORS = {
  technical: { label: 'Technical', icon: Activity, color: '#7C3AED' },
  sentiment: { label: 'Sentiment', icon: Newspaper, color: '#059669' },
  insider: { label: 'Insider', icon: Users, color: '#D97706' },
  fundamental: { label: 'Fundamental', icon: Building2, color: '#2563EB' },
  momentum: { label: 'Momentum', icon: TrendingUp, color: '#0891B2' },
};

/**
 * SignalStrengthChart Component
 *
 * Displays a radar chart showing the strength of various trading signals.
 */
function SignalStrengthChart({ portfolioId, symbol, className = '' }) {
  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId, symbol]);

  const fetchSignals = async () => {
    try {
      setLoading(true);
      setError(null);

      let response;
      if (symbol) {
        response = await attributionAPI.getSignalStrength(symbol);
      } else if (portfolioId) {
        response = await attributionAPI.getPortfolioSignals(portfolioId);
      }

      if (response?.data?.success) {
        setSignals(response.data.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load signal data');
    } finally {
      setLoading(false);
    }
  };

  // Transform signals for radar chart
  const chartData = React.useMemo(() => {
    if (!signals) return [];

    return Object.entries(SIGNAL_FACTORS).map(([key, config]) => ({
      factor: config.label,
      strength: (signals[key]?.strength || 0) * 100,
      confidence: (signals[key]?.confidence || 0) * 100,
      fullMark: 100,
    }));
  }, [signals]);

  // Calculate overall signal strength
  const overallStrength = React.useMemo(() => {
    if (!signals) return 0;
    const values = Object.values(signals);
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, s) => acc + (s.strength || 0), 0);
    return (sum / values.length) * 100;
  }, [signals]);

  // Ask AI right-click support - must be called before any early returns
  const askAIProps = useAskAI(createChartExtractor(() => ({
    symbol,
    metric: 'signal_strength',
    companyName: `Signal Strength${symbol ? ` - ${symbol}` : ''}`
  })));

  if (loading) {
    return (
      <Card variant="glass" className={`signal-strength-chart ${className}`}>
        <Skeleton className="signal-strength-chart__skeleton" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="glass" className={`signal-strength-chart signal-strength-chart--error ${className}`}>
        <div className="signal-strength-chart__error">{error}</div>
      </Card>
    );
  }

  if (!signals || chartData.length === 0) {
    return (
      <Card variant="glass" className={`signal-strength-chart ${className}`}>
        <Card.Header>
          <Card.Title>
            <Activity size={18} />
            Signal Strength
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="signal-strength-chart__empty">
            No signal data available
          </div>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card variant="glass" className={`signal-strength-chart ${className}`} {...askAIProps}>
      <Card.Header>
        <Card.Title>
          <Activity size={18} />
          Signal Strength {symbol && `- ${symbol}`}
        </Card.Title>
        <div className="signal-strength-chart__overall">
          <span className="signal-strength-chart__overall-label">Overall</span>
          <span
            className="signal-strength-chart__overall-value"
            style={{
              color: overallStrength >= 70
                ? 'var(--positive)'
                : overallStrength >= 40
                  ? 'var(--text-primary)'
                  : 'var(--negative)'
            }}
          >
            {overallStrength.toFixed(0)}%
          </span>
        </div>
      </Card.Header>
      <Card.Content>
        <div className="signal-strength-chart__radar">
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={chartData}>
              <PolarGrid stroke="var(--border-primary)" />
              <PolarAngleAxis
                dataKey="factor"
                tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Radar
                name="Strength"
                dataKey="strength"
                stroke="var(--brand-primary)"
                fill="var(--brand-primary)"
                fillOpacity={0.15}
              />
              <Radar
                name="Confidence"
                dataKey="confidence"
                stroke="#059669"
                fill="#059669"
                fillOpacity={0.15}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="signal-strength-chart__tooltip">
                      <div className="signal-strength-chart__tooltip-title">
                        {d.factor}
                      </div>
                      <div className="signal-strength-chart__tooltip-item">
                        Strength: {d.strength.toFixed(0)}%
                      </div>
                      <div className="signal-strength-chart__tooltip-item">
                        Confidence: {d.confidence.toFixed(0)}%
                      </div>
                    </div>
                  );
                }}
              />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Signal breakdown */}
        <div className="signal-strength-chart__breakdown">
          {Object.entries(SIGNAL_FACTORS).map(([key, config]) => {
            const signal = signals[key] || { strength: 0, confidence: 0 };
            const Icon = config.icon;
            const strength = (signal.strength || 0) * 100;

            return (
              <div key={key} className="signal-strength-chart__factor">
                <div className="signal-strength-chart__factor-header">
                  <Icon size={14} style={{ color: config.color }} />
                  <span className="signal-strength-chart__factor-label">
                    {config.label}
                  </span>
                  <span
                    className="signal-strength-chart__factor-value"
                    style={{
                      color: strength >= 70
                        ? 'var(--positive)'
                        : strength >= 40
                          ? 'var(--text-primary)'
                          : strength > 0
                            ? 'var(--negative)'
                            : 'var(--text-tertiary)'
                    }}
                  >
                    {strength.toFixed(0)}%
                  </span>
                </div>
                <div className="signal-strength-chart__factor-bar">
                  <div
                    className="signal-strength-chart__factor-fill"
                    style={{
                      width: `${strength}%`,
                      backgroundColor: config.color
                    }}
                  />
                </div>
                {signal.signal && (
                  <div className="signal-strength-chart__factor-signal">
                    {signal.signal}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card.Content>
    </Card>
  );
}

SignalStrengthChart.propTypes = {
  portfolioId: PropTypes.number,
  symbol: PropTypes.string,
  className: PropTypes.string,
};

export default SignalStrengthChart;
