/**
 * UsageIndicator Component
 *
 * Shows usage progress for metered features (AI queries, reports, etc.)
 * Displays warning states when approaching limits.
 */

import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import { Icon } from '../icons';
import './UsageIndicator.css';

export default function UsageIndicator({
  metric,
  label,
  showBar = true,
  showNumbers = true,
  compact = false,
  className = ''
}) {
  const { getUsageStatus, promptUpgrade, tier } = useSubscription();
  const status = getUsageStatus(metric);

  if (status.unlimited) {
    return (
      <div className={`usage-indicator usage-indicator--unlimited ${compact ? 'usage-indicator--compact' : ''} ${className}`}>
        {label && <span className="usage-indicator__label">{label}</span>}
        <div className="usage-indicator__unlimited">
          <Icon name="infinity" size={14} />
          <span>Unlimited</span>
        </div>
      </div>
    );
  }

  const statusClass = `usage-indicator--${status.status}`;

  const handleUpgradeClick = () => {
    promptUpgrade({
      metric,
      reason: `You've used ${status.current} of ${status.limit} ${formatMetricName(metric)}`,
      source: 'usage_indicator'
    });
  };

  if (compact) {
    return (
      <div className={`usage-indicator usage-indicator--compact ${statusClass} ${className}`}>
        <span className="usage-indicator__count-compact">
          {status.remaining}
        </span>
        <span className="usage-indicator__label-compact">
          {label || formatMetricName(metric)} left
        </span>
        {status.status === 'exceeded' && (
          <button
            className="usage-indicator__upgrade-compact"
            onClick={handleUpgradeClick}
          >
            Upgrade
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`usage-indicator ${statusClass} ${className}`}>
      <div className="usage-indicator__header">
        {label && <span className="usage-indicator__label">{label}</span>}
        {showNumbers && (
          <span className="usage-indicator__numbers">
            {status.current} / {status.limit}
          </span>
        )}
      </div>

      {showBar && (
        <div className="usage-indicator__bar">
          <div
            className="usage-indicator__bar-fill"
            style={{ width: `${Math.min(status.percentage, 100)}%` }}
          />
        </div>
      )}

      {status.status === 'warning' && (
        <div className="usage-indicator__warning">
          <Icon name="alert-triangle" size={12} />
          <span>Only {status.remaining} remaining</span>
        </div>
      )}

      {status.status === 'exceeded' && (
        <div className="usage-indicator__exceeded">
          <Icon name="alert-circle" size={12} />
          <span>Limit reached</span>
          <button onClick={handleUpgradeClick}>Upgrade</button>
        </div>
      )}
    </div>
  );
}

/**
 * UsageBar - Simple bar-only variant
 */
export function UsageBar({ metric, className = '' }) {
  const { getUsageStatus } = useSubscription();
  const status = getUsageStatus(metric);

  if (status.unlimited) {
    return null;
  }

  return (
    <div
      className={`usage-bar usage-bar--${status.status} ${className}`}
      title={`${status.current} / ${status.limit} used`}
    >
      <div
        className="usage-bar__fill"
        style={{ width: `${Math.min(status.percentage, 100)}%` }}
      />
    </div>
  );
}

/**
 * UsageCounter - Compact counter display
 */
export function UsageCounter({
  metric,
  label,
  showIcon = true,
  className = ''
}) {
  const { getUsageStatus, promptUpgrade } = useSubscription();
  const status = getUsageStatus(metric);

  const handleClick = () => {
    if (status.status === 'exceeded') {
      promptUpgrade({
        metric,
        reason: `You've reached your ${formatMetricName(metric)} limit`,
        source: 'usage_counter'
      });
    }
  };

  if (status.unlimited) {
    return (
      <div className={`usage-counter usage-counter--unlimited ${className}`}>
        {showIcon && <Icon name="infinity" size={14} />}
        <span>{label || formatMetricName(metric)}: Unlimited</span>
      </div>
    );
  }

  return (
    <div
      className={`usage-counter usage-counter--${status.status} ${className}`}
      onClick={status.status === 'exceeded' ? handleClick : undefined}
      style={status.status === 'exceeded' ? { cursor: 'pointer' } : undefined}
    >
      {showIcon && (
        <Icon
          name={status.status === 'exceeded' ? 'alert-circle' : status.status === 'warning' ? 'alert-triangle' : 'activity'}
          size={14}
        />
      )}
      <span>
        {label || formatMetricName(metric)}: {status.remaining} left
      </span>
    </div>
  );
}

// Format metric name for display
function formatMetricName(metric) {
  const names = {
    ai_queries_monthly: 'AI queries',
    prism_reports_monthly: 'Prism reports',
    watchlist_stocks: 'watchlist items',
    portfolios: 'portfolios',
    agents: 'agents',
    backtest_runs_monthly: 'backtests',
    monte_carlo_runs_monthly: 'simulations',
    alerts: 'alerts'
  };
  return names[metric] || metric.replace(/_/g, ' ');
}
