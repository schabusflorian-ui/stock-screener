// frontend/src/components/agent/ContributionScheduleCard.js
// Displays the next contribution and schedule for beginner strategies

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Clock,
  CheckCircle2,
  PlayCircle
} from '../icons';
import { agentsAPI } from '../../services/api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import './ContributionScheduleCard.css';

const STRATEGY_LABELS = {
  dca: 'Dollar Cost Averaging',
  value_averaging: 'Value Averaging',
  drip: 'Dividend Reinvestment',
  rebalance: 'Portfolio Rebalancing',
  lump_dca: 'Lump Sum + DCA'
};

const FREQUENCY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly'
};

function ContributionScheduleCard({ agentId, config, onExecute }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPreview();
  }, [agentId]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentsAPI.previewContribution(agentId);
      setPreview(response.data.data || response.data);
    } catch (err) {
      console.error('Failed to load contribution preview:', err);
      // Don't set error for 404 (no contribution due)
      if (err.response?.status !== 404) {
        setError(err.response?.data?.error || 'Failed to load preview');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    try {
      setExecuting(true);
      setError(null);
      await agentsAPI.executeContribution(agentId);
      await loadPreview();
      if (onExecute) onExecute();
    } catch (err) {
      console.error('Failed to execute contribution:', err);
      setError(err.response?.data?.error || 'Failed to execute contribution');
    } finally {
      setExecuting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not scheduled';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatAmount = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getNextContributionDate = () => {
    if (config?.next_contribution_date) {
      return config.next_contribution_date;
    }
    if (config?.next_rebalance_date) {
      return config.next_rebalance_date;
    }
    return null;
  };

  const getContributionAmount = () => {
    const strategyType = config?.strategy_type;

    switch (strategyType) {
      case 'dca':
        return config.amount;
      case 'value_averaging':
        // This would be calculated by the preview
        return preview?.contributionAmount || config.min_contribution;
      case 'lump_dca':
        if (!config.lump_sum_executed) {
          return config.total_amount * config.lump_sum_pct;
        }
        return config.dca_remaining / (config.dca_months || 6);
      case 'rebalance':
        return preview?.totalRebalanceAmount || null;
      case 'drip':
        return preview?.pendingDividends || null;
      default:
        return null;
    }
  };

  const getFrequency = () => {
    const strategyType = config?.strategy_type;

    switch (strategyType) {
      case 'dca':
      case 'lump_dca':
        return config.frequency || config.dca_frequency;
      case 'value_averaging':
        return config.review_frequency;
      case 'rebalance':
        return config.rebalance_frequency;
      case 'drip':
        return 'On dividend receipt';
      default:
        return null;
    }
  };

  const isDue = () => {
    const nextDate = getNextContributionDate();
    if (!nextDate) return false;
    return new Date(nextDate) <= new Date();
  };

  const strategyType = config?.strategy_type;
  const frequency = getFrequency();
  const contributionAmount = getContributionAmount();
  const nextDate = getNextContributionDate();

  return (
    <Card variant="glass" className="contribution-schedule-card">
      <Card.Header>
        <Calendar size={18} />
        <h3>Contribution Schedule</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadPreview}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </Button>
      </Card.Header>
      <Card.Content>
        {error && (
          <div className="contribution-schedule-card__error">
            {error}
          </div>
        )}

        <div className="contribution-schedule-card__strategy">
          <span className="contribution-schedule-card__strategy-label">Strategy</span>
          <span className="contribution-schedule-card__strategy-value">
            {STRATEGY_LABELS[strategyType] || strategyType}
          </span>
        </div>

        <div className="contribution-schedule-card__grid">
          <div className="contribution-schedule-card__item">
            <div className="contribution-schedule-card__item-icon">
              <Clock size={16} />
            </div>
            <div className="contribution-schedule-card__item-content">
              <span className="contribution-schedule-card__item-label">Frequency</span>
              <span className="contribution-schedule-card__item-value">
                {FREQUENCY_LABELS[frequency] || frequency || '-'}
              </span>
            </div>
          </div>

          <div className="contribution-schedule-card__item">
            <div className="contribution-schedule-card__item-icon">
              <DollarSign size={16} />
            </div>
            <div className="contribution-schedule-card__item-content">
              <span className="contribution-schedule-card__item-label">
                {strategyType === 'rebalance' ? 'Rebalance Amount' : 'Contribution'}
              </span>
              <span className="contribution-schedule-card__item-value">
                {contributionAmount ? formatAmount(contributionAmount) : 'Varies'}
              </span>
            </div>
          </div>
        </div>

        <div className={`contribution-schedule-card__next ${isDue() ? 'due' : ''}`}>
          <div className="contribution-schedule-card__next-header">
            <Calendar size={16} />
            <span className="contribution-schedule-card__next-label">
              {isDue() ? 'Contribution Due' : 'Next Contribution'}
            </span>
          </div>
          <span className="contribution-schedule-card__next-date">
            {formatDate(nextDate)}
          </span>
          {isDue() && (
            <span className="contribution-schedule-card__due-badge">
              Due Now
            </span>
          )}
        </div>

        {/* Preview of what will be bought */}
        {preview?.trades && preview.trades.length > 0 && (
          <div className="contribution-schedule-card__preview">
            <span className="contribution-schedule-card__preview-label">Planned Trades</span>
            <div className="contribution-schedule-card__trades">
              {preview.trades.map((trade, idx) => (
                <div key={idx} className="contribution-schedule-card__trade">
                  <span className="contribution-schedule-card__trade-symbol">{trade.symbol}</span>
                  <span className="contribution-schedule-card__trade-action">{trade.action}</span>
                  <span className="contribution-schedule-card__trade-amount">
                    {formatAmount(trade.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target assets for DCA/VA/Lump+DCA */}
        {!preview?.trades && config?.target_assets && config.target_assets.length > 0 && (
          <div className="contribution-schedule-card__assets">
            <span className="contribution-schedule-card__assets-label">Target Assets</span>
            <div className="contribution-schedule-card__assets-list">
              {config.target_assets.map((asset, idx) => (
                <div key={idx} className="contribution-schedule-card__asset">
                  <span className="contribution-schedule-card__asset-symbol">{asset.symbol}</span>
                  <span className="contribution-schedule-card__asset-allocation">
                    {(asset.allocation * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Execute button for due contributions */}
        {isDue() && (
          <div className="contribution-schedule-card__actions">
            <Button
              variant="primary"
              onClick={handleExecute}
              disabled={executing}
              className="contribution-schedule-card__execute-btn"
            >
              {executing ? (
                <>
                  <RefreshCw size={16} className="spinning" />
                  Executing...
                </>
              ) : (
                <>
                  <PlayCircle size={16} />
                  Execute Contribution
                </>
              )}
            </Button>
          </div>
        )}

        {/* Value Averaging specific info */}
        {strategyType === 'value_averaging' && (
          <div className="contribution-schedule-card__va-info">
            <div className="contribution-schedule-card__va-item">
              <TrendingUp size={14} />
              <span>Target Growth: {((config.target_growth_rate || 0.10) * 100).toFixed(0)}%/year</span>
            </div>
            <div className="contribution-schedule-card__va-item">
              <DollarSign size={14} />
              <span>
                Range: {formatAmount(config.min_contribution)} - {formatAmount(config.max_contribution)}
              </span>
            </div>
          </div>
        )}

        {/* Lump+DCA specific progress */}
        {strategyType === 'lump_dca' && (
          <div className="contribution-schedule-card__lump-progress">
            <div className="contribution-schedule-card__lump-item">
              <CheckCircle2 size={14} className={config.lump_sum_executed ? 'completed' : ''} />
              <span>
                Lump Sum ({(config.lump_sum_pct * 100).toFixed(0)}%):
                {config.lump_sum_executed ? ' Completed' : ` ${formatAmount(config.total_amount * config.lump_sum_pct)} pending`}
              </span>
            </div>
            <div className="contribution-schedule-card__lump-item">
              <Clock size={14} />
              <span>
                DCA Remaining: {formatAmount(config.dca_remaining || config.total_amount * (1 - config.lump_sum_pct))}
              </span>
            </div>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

export default ContributionScheduleCard;
