// frontend/src/components/agent/OpportunityList.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { TrendingUp, Calendar, MessageSquare, Users, BarChart2 } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Skeleton } from '../Skeleton';
import { attributionAPI } from '../../services/api';
import './OpportunityList.css';

/**
 * Trigger type icons and colors
 */
const TRIGGER_CONFIG = {
  event: { icon: Calendar, color: 'blue', label: 'Event' },
  sentiment: { icon: MessageSquare, color: 'purple', label: 'Sentiment' },
  insider: { icon: Users, color: 'yellow', label: 'Insider' },
  technical: { icon: BarChart2, color: 'green', label: 'Technical' },
};

/**
 * OpportunityList Component
 *
 * Displays a list of investment opportunities found by the opportunity scanner.
 * Each opportunity shows the triggers that flagged it and a combined score.
 */
function OpportunityList({ limit = 10, onSelect, className = '' }) {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOpportunities();
  }, [limit]);

  const fetchOpportunities = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await attributionAPI.getOpportunities({ limit });
      if (response.data?.success) {
        setOpportunities(response.data.data || []);
      } else {
        setError(response.data?.error || 'Failed to load opportunities');
      }
    } catch (err) {
      setError(err.message || 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`opportunity-list ${className}`}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="opportunity-list__skeleton-item" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="base" className={`opportunity-list opportunity-list--error ${className}`}>
        <div className="opportunity-list__error">
          {error}
        </div>
      </Card>
    );
  }

  if (!opportunities.length) {
    return (
      <Card variant="base" className={`opportunity-list opportunity-list--empty ${className}`}>
        <div className="opportunity-list__empty">
          <TrendingUp size={32} className="opportunity-list__empty-icon" />
          <p>No opportunities found</p>
        </div>
      </Card>
    );
  }

  return (
    <div className={`opportunity-list ${className}`}>
      {opportunities.map((opp, idx) => (
        <OpportunityItem
          key={opp.symbol || idx}
          opportunity={opp}
          onClick={() => onSelect?.(opp.symbol)}
        />
      ))}
    </div>
  );
}

/**
 * Individual opportunity item
 */
function OpportunityItem({ opportunity, onClick }) {
  const triggers = opportunity.triggers || [];
  const confirmation = opportunity.confirmation || triggers.length;

  return (
    <Card
      variant="interactive"
      padding="md"
      className="opportunity-item"
      onClick={onClick}
    >
      <div className="opportunity-item__header">
        <div className="opportunity-item__symbol-info">
          <span className="opportunity-item__symbol">{opportunity.symbol}</span>
          <span className="opportunity-item__name">{opportunity.company_name || opportunity.name}</span>
        </div>
        <div className="opportunity-item__badges">
          {confirmation > 1 && (
            <Badge variant="purple" size="sm">
              {confirmation} signals
            </Badge>
          )}
          <Badge
            variant={opportunity.score > 1 ? 'green' : 'gray'}
            size="sm"
          >
            Score: {(opportunity.score || opportunity.totalScore || 0).toFixed(2)}
          </Badge>
        </div>
      </div>

      <div className="opportunity-item__triggers">
        {triggers.map((trigger, tidx) => {
          const config = TRIGGER_CONFIG[trigger.type] || TRIGGER_CONFIG.technical;
          const Icon = config.icon;
          return (
            <div key={tidx} className="opportunity-item__trigger">
              <Icon size={14} />
              <span>{trigger.trigger || trigger.label || config.label}</span>
            </div>
          );
        })}
      </div>

      {opportunity.sector && (
        <div className="opportunity-item__meta">
          <span className="opportunity-item__sector">{opportunity.sector}</span>
        </div>
      )}
    </Card>
  );
}

OpportunityList.propTypes = {
  limit: PropTypes.number,
  onSelect: PropTypes.func,
  className: PropTypes.string,
};

OpportunityItem.propTypes = {
  opportunity: PropTypes.shape({
    symbol: PropTypes.string,
    name: PropTypes.string,
    company_name: PropTypes.string,
    sector: PropTypes.string,
    score: PropTypes.number,
    totalScore: PropTypes.number,
    confirmation: PropTypes.number,
    triggers: PropTypes.arrayOf(PropTypes.shape({
      type: PropTypes.string,
      trigger: PropTypes.string,
      label: PropTypes.string,
    })),
  }).isRequired,
  onClick: PropTypes.func,
};

export default OpportunityList;
