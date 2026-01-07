// frontend/src/components/agent/AgentRecommendation.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Clock } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Skeleton } from '../Skeleton';
import { agentAPI } from '../../services/api';
import './AgentRecommendation.css';

/**
 * Action configuration with colors and styles
 */
const ACTION_CONFIG = {
  strong_buy: { label: 'Strong Buy', variant: 'green', icon: TrendingUp },
  buy: { label: 'Buy', variant: 'green', icon: TrendingUp },
  hold: { label: 'Hold', variant: 'gray', icon: Minus },
  sell: { label: 'Sell', variant: 'red', icon: TrendingDown },
  strong_sell: { label: 'Strong Sell', variant: 'red', icon: TrendingDown },
};

/**
 * AgentRecommendation Component
 *
 * Displays a detailed AI recommendation for a stock, including
 * the action, score, confidence, reasoning, and regime context.
 */
function AgentRecommendation({ symbol, portfolioId, className = '' }) {
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (symbol) {
      fetchRecommendation();
    }
  }, [symbol, portfolioId]);

  const fetchRecommendation = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentAPI.getRecommendation(symbol, portfolioId);
      if (response.data?.success) {
        setRecommendation(response.data.data);
      } else {
        setError(response.data?.error || 'Failed to load recommendation');
      }
    } catch (err) {
      setError(err.message || 'Failed to load recommendation');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card variant="glass" className={`agent-recommendation agent-recommendation--loading ${className}`}>
        <Skeleton className="agent-recommendation__skeleton-header" />
        <Skeleton className="agent-recommendation__skeleton-score" />
        <Skeleton className="agent-recommendation__skeleton-content" />
      </Card>
    );
  }

  if (error || !recommendation) {
    return (
      <Card variant="base" className={`agent-recommendation agent-recommendation--error ${className}`}>
        <div className="agent-recommendation__error">
          <AlertCircle size={24} />
          <p>{error || 'Unable to load recommendation'}</p>
        </div>
      </Card>
    );
  }

  const actionConfig = ACTION_CONFIG[recommendation.action] || ACTION_CONFIG.hold;
  const ActionIcon = actionConfig.icon;
  const reasoning = recommendation.reasoning ?
    (typeof recommendation.reasoning === 'string' ?
      JSON.parse(recommendation.reasoning) : recommendation.reasoning) : [];

  return (
    <Card variant="glass" className={`agent-recommendation ${className}`}>
      {/* Header */}
      <div className="agent-recommendation__header">
        <div className="agent-recommendation__title">
          <h3>{symbol}</h3>
          <span className="agent-recommendation__subtitle">AI Recommendation</span>
        </div>
        <Badge variant={actionConfig.variant} size="md" className="agent-recommendation__action-badge">
          <ActionIcon size={14} />
          {actionConfig.label}
        </Badge>
      </div>

      {/* Score Bar */}
      <div className="agent-recommendation__score-section">
        <div className="agent-recommendation__score-labels">
          <span>Bearish</span>
          <span>Neutral</span>
          <span>Bullish</span>
        </div>
        <div className="agent-recommendation__score-bar">
          <div
            className="agent-recommendation__score-indicator"
            style={{ left: `${(recommendation.score + 1) * 50}%` }}
          />
        </div>
        <div className="agent-recommendation__score-values">
          <span>Score: <strong>{recommendation.score?.toFixed(2) || 'N/A'}</strong></span>
          <span>Confidence: <strong>{((recommendation.confidence || 0) * 100).toFixed(0)}%</strong></span>
        </div>
      </div>

      {/* Position Size Suggestion */}
      {recommendation.position_size && (
        <div className="agent-recommendation__position">
          Suggested Position: <strong>{(recommendation.position_size * 100).toFixed(1)}%</strong> of portfolio
          {recommendation.suggested_value && (
            <span className="agent-recommendation__position-value">
              (~${recommendation.suggested_value.toLocaleString()})
            </span>
          )}
        </div>
      )}

      {/* Reasoning */}
      {reasoning.length > 0 && (
        <div className="agent-recommendation__reasoning">
          <h4 className="agent-recommendation__section-title">Key Factors</h4>
          <div className="agent-recommendation__reasons">
            {reasoning.slice(0, 4).map((reason, idx) => (
              <div key={idx} className={`agent-recommendation__reason agent-recommendation__reason--${reason.direction || 'neutral'}`}>
                <span className="agent-recommendation__reason-indicator">
                  {reason.direction === 'bullish' ? '▲' : reason.direction === 'bearish' ? '▼' : '●'}
                </span>
                <span className="agent-recommendation__reason-factor">{reason.factor}:</span>
                <span className="agent-recommendation__reason-details">{reason.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regime Context */}
      {recommendation.regime_at_time && (
        <div className="agent-recommendation__regime">
          Market Regime: <strong>{recommendation.regime_at_time}</strong>
          {recommendation.regime_at_time !== 'BULL' && (
            <span className="agent-recommendation__regime-note">
              (Position size adjusted for {recommendation.regime_at_time.toLowerCase()} conditions)
            </span>
          )}
        </div>
      )}

      {/* Timestamp */}
      <div className="agent-recommendation__footer">
        <Clock size={12} />
        <span>Generated: {new Date(recommendation.created_at || recommendation.timestamp).toLocaleString()}</span>
      </div>
    </Card>
  );
}

AgentRecommendation.propTypes = {
  symbol: PropTypes.string.isRequired,
  portfolioId: PropTypes.number,
  className: PropTypes.string,
};

export default AgentRecommendation;
