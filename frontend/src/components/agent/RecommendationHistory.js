// frontend/src/components/agent/RecommendationHistory.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Skeleton } from '../Skeleton';
import { attributionAPI } from '../../services/api';
import './RecommendationHistory.css';

/**
 * Action configuration
 */
const ACTION_CONFIG = {
  strong_buy: { label: 'Strong Buy', variant: 'green', icon: TrendingUp },
  buy: { label: 'Buy', variant: 'green', icon: TrendingUp },
  hold: { label: 'Hold', variant: 'gray', icon: Minus },
  sell: { label: 'Sell', variant: 'red', icon: TrendingDown },
  strong_sell: { label: 'Strong Sell', variant: 'red', icon: TrendingDown },
};

/**
 * RecommendationHistory Component
 *
 * Displays a list of past AI recommendations with their outcomes.
 */
function RecommendationHistory({ portfolioId, className = '' }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, executed, pending
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (portfolioId) {
      fetchRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId, filter]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { portfolioId, limit: 50 };
      if (filter === 'executed') params.executed = 'true';
      if (filter === 'pending') params.executed = 'false';

      const response = await attributionAPI.getRecommendations(params);
      if (response.data?.success) {
        setRecommendations(response.data.data || []);
      } else {
        setError(response.data?.error || 'Failed to load recommendations');
      }
    } catch (err) {
      setError(err.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <Card variant="glass" className={`recommendation-history ${className}`}>
        <Card.Header>
          <Card.Title>Recommendation History</Card.Title>
        </Card.Header>
        <Card.Content>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="recommendation-history__skeleton-row" />
          ))}
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="base" className={`recommendation-history recommendation-history--error ${className}`}>
        <div className="recommendation-history__error">{error}</div>
      </Card>
    );
  }

  return (
    <Card variant="glass" className={`recommendation-history ${className}`}>
      <Card.Header>
        <Card.Title>Recommendation History</Card.Title>
        <div className="recommendation-history__filters">
          <Filter size={16} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="executed">Executed</option>
            <option value="pending">Not Executed</option>
          </select>
        </div>
      </Card.Header>
      <Card.Content>
        {recommendations.length === 0 ? (
          <div className="recommendation-history__empty">
            <Clock size={32} />
            <p>No recommendations yet</p>
          </div>
        ) : (
          <div className="recommendation-history__list">
            {recommendations.map((rec) => (
              <RecommendationRow
                key={rec.id}
                recommendation={rec}
                expanded={expandedId === rec.id}
                onToggle={() => toggleExpand(rec.id)}
              />
            ))}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

/**
 * Single recommendation row
 */
function RecommendationRow({ recommendation, expanded, onToggle }) {
  const config = ACTION_CONFIG[recommendation.action] || ACTION_CONFIG.hold;
  const ActionIcon = config.icon;
  const reasoning = recommendation.reasoning ?
    (typeof recommendation.reasoning === 'string' ?
      JSON.parse(recommendation.reasoning) : recommendation.reasoning) : [];

  return (
    <div className={`recommendation-row ${expanded ? 'expanded' : ''}`}>
      <div className="recommendation-row__header" onClick={onToggle}>
        <div className="recommendation-row__symbol">
          <span className="recommendation-row__symbol-text">
            {recommendation.symbol}
          </span>
          <span className="recommendation-row__company">
            {recommendation.company_name}
          </span>
        </div>

        <div className="recommendation-row__action">
          <Badge variant={config.variant} size="sm">
            <ActionIcon size={12} />
            {config.label}
          </Badge>
        </div>

        <div className="recommendation-row__score">
          <span className="recommendation-row__score-value">
            {recommendation.score?.toFixed(2)}
          </span>
          <span className="recommendation-row__confidence">
            {((recommendation.confidence || 0) * 100).toFixed(0)}% conf
          </span>
        </div>

        <div className="recommendation-row__status">
          {recommendation.was_executed ? (
            <span className="recommendation-row__executed">
              <CheckCircle size={14} />
              Executed
            </span>
          ) : (
            <span className="recommendation-row__pending">
              <XCircle size={14} />
              Not Executed
            </span>
          )}
        </div>

        <div className="recommendation-row__date">
          {new Date(recommendation.date || recommendation.created_at).toLocaleDateString()}
        </div>

        <div className="recommendation-row__expand">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="recommendation-row__details">
          <div className="recommendation-row__detail-grid">
            <div className="recommendation-row__detail">
              <span className="recommendation-row__detail-label">Price at Time</span>
              <span className="recommendation-row__detail-value">
                ${recommendation.price_at_time?.toFixed(2) || 'N/A'}
              </span>
            </div>
            <div className="recommendation-row__detail">
              <span className="recommendation-row__detail-label">Position Size</span>
              <span className="recommendation-row__detail-value">
                {recommendation.position_size ? `${(recommendation.position_size * 100).toFixed(1)}%` : 'N/A'}
              </span>
            </div>
            <div className="recommendation-row__detail">
              <span className="recommendation-row__detail-label">Market Regime</span>
              <span className="recommendation-row__detail-value">
                {recommendation.regime_at_time || 'N/A'}
              </span>
            </div>
            {recommendation.was_executed && recommendation.execution_price && (
              <div className="recommendation-row__detail">
                <span className="recommendation-row__detail-label">Execution Price</span>
                <span className="recommendation-row__detail-value">
                  ${recommendation.execution_price.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {reasoning.length > 0 && (
            <div className="recommendation-row__reasoning">
              <h5>Reasoning</h5>
              <div className="recommendation-row__reasons">
                {reasoning.map((reason, idx) => (
                  <div key={idx} className={`recommendation-row__reason recommendation-row__reason--${reason.direction || 'neutral'}`}>
                    <span className="recommendation-row__reason-indicator">
                      {reason.direction === 'bullish' ? '▲' : reason.direction === 'bearish' ? '▼' : '●'}
                    </span>
                    <span className="recommendation-row__reason-factor">{reason.factor}:</span>
                    <span className="recommendation-row__reason-details">{reason.details}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

RecommendationHistory.propTypes = {
  portfolioId: PropTypes.number.isRequired,
  className: PropTypes.string,
};

RecommendationRow.propTypes = {
  recommendation: PropTypes.object.isRequired,
  expanded: PropTypes.bool,
  onToggle: PropTypes.func,
};

export default RecommendationHistory;
