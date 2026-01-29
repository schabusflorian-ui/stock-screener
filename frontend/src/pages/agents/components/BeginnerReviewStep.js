// frontend/src/pages/agents/components/BeginnerReviewStep.js
// Final review step for beginner strategy wizard

import React from 'react';
import {
  Check,
  DollarSign,
  Calendar,
  PieChart,
  AlertTriangle,
  Edit3
} from '../../../components/icons';
import { STRATEGY_TYPES } from './BeginnerStrategyTypeStep';
import './BeginnerWizard.css';

function BeginnerReviewStep({ agentName, agentDescription, strategyType, config, onEdit }) {
  const strategy = STRATEGY_TYPES.find(s => s.id === strategyType);
  const StrategyIcon = strategy?.icon || DollarSign;

  const formatFrequency = (freq) => {
    switch (freq) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'biweekly': return 'Every 2 weeks';
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
      default: return freq;
    }
  };

  const formatAssets = (assets) => {
    if (!assets || assets.length === 0) return 'None selected';
    return assets.map(a => `${a.symbol} (${Math.round((a.allocation || 0) * 100)}%)`).join(', ');
  };

  const renderStrategyDetails = () => {
    switch (strategyType) {
      case 'dca':
        return (
          <>
            <ReviewItem
              label="Investment Amount"
              value={`$${(config.amount || 0).toLocaleString()} per contribution`}
            />
            <ReviewItem
              label="Frequency"
              value={formatFrequency(config.frequency)}
            />
            <ReviewItem
              label="Target Assets"
              value={formatAssets(config.target_assets)}
            />
          </>
        );

      case 'value_averaging':
        return (
          <>
            <ReviewItem
              label="Starting Portfolio Value"
              value={`$${(config.target_portfolio_value || 0).toLocaleString()}`}
            />
            <ReviewItem
              label="Target Growth Rate"
              value={`${((config.target_growth_rate || 0.10) * 100).toFixed(0)}% per year`}
            />
            <ReviewItem
              label="Contribution Range"
              value={`$${config.min_contribution || 100} - $${config.max_contribution || 2000}`}
            />
            <ReviewItem
              label="Review Frequency"
              value={formatFrequency(config.review_frequency)}
            />
            <ReviewItem
              label="Target Assets"
              value={formatAssets(config.target_assets)}
            />
          </>
        );

      case 'drip':
        return (
          <>
            <ReviewItem
              label="Reinvestment Mode"
              value={config.reinvest_mode === 'same' ? 'Same Stock' : 'Portfolio Allocation'}
            />
            <ReviewItem
              label="Minimum to Reinvest"
              value={`$${config.min_dividend_to_reinvest || 10}`}
            />
            <ReviewItem
              label="Tracked Holdings"
              value={(config.tracked_holdings || []).map(h => h.symbol).join(', ') || 'None'}
            />
          </>
        );

      case 'rebalance':
        return (
          <>
            <ReviewItem
              label="Target Allocation"
              value={formatAssets(config.target_allocation)}
            />
            <ReviewItem
              label="Rebalance Threshold"
              value={`${((config.rebalance_threshold || 0.05) * 100).toFixed(0)}% drift`}
            />
            <ReviewItem
              label="Review Frequency"
              value={formatFrequency(config.rebalance_frequency)}
            />
          </>
        );

      case 'lump_dca':
        return (
          <>
            <ReviewItem
              label="Total Amount"
              value={`$${(config.total_amount || 0).toLocaleString()}`}
            />
            <ReviewItem
              label="Lump Sum Portion"
              value={`${((config.lump_sum_pct || 0.50) * 100).toFixed(0)}% ($${((config.total_amount || 0) * (config.lump_sum_pct || 0.50)).toLocaleString()})`}
            />
            <ReviewItem
              label="DCA Portion"
              value={`${((1 - (config.lump_sum_pct || 0.50)) * 100).toFixed(0)}% over ${config.dca_months || 6} months`}
            />
            <ReviewItem
              label="DCA Frequency"
              value={formatFrequency(config.dca_frequency)}
            />
            <ReviewItem
              label="Target Assets"
              value={formatAssets(config.target_assets)}
            />
          </>
        );

      default:
        return null;
    }
  };

  // Validation warnings
  const warnings = [];
  if (strategyType === 'dca' || strategyType === 'value_averaging' || strategyType === 'lump_dca') {
    if (!config.target_assets || config.target_assets.length === 0) {
      warnings.push('No target assets selected');
    }
    const totalAlloc = (config.target_assets || []).reduce((sum, a) => sum + (a.allocation || 0), 0);
    if (config.target_assets?.length > 0 && Math.abs(totalAlloc - 1) >= 0.01) {
      warnings.push(`Asset allocation totals ${Math.round(totalAlloc * 100)}% (should be 100%)`);
    }
  }
  if (strategyType === 'rebalance') {
    if (!config.target_allocation || config.target_allocation.length === 0) {
      warnings.push('No target allocation defined');
    }
    const totalAlloc = (config.target_allocation || []).reduce((sum, a) => sum + (a.allocation || 0), 0);
    if (config.target_allocation?.length > 0 && Math.abs(totalAlloc - 1) >= 0.01) {
      warnings.push(`Target allocation totals ${Math.round(totalAlloc * 100)}% (should be 100%)`);
    }
  }
  if (strategyType === 'drip') {
    if (!config.tracked_holdings || config.tracked_holdings.length === 0) {
      warnings.push('No dividend holdings selected');
    }
  }

  return (
    <div className="beginner-step">
      <div className="beginner-step__header">
        <h2>Review Your Strategy</h2>
        <p className="beginner-step__subtitle">
          Confirm your configuration before creating the agent.
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="review-warnings">
          <AlertTriangle size={18} />
          <div>
            <strong>Please fix the following:</strong>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="review-section">
        <div className="review-section__header">
          <h3>Agent Details</h3>
          <button type="button" className="edit-btn" onClick={() => onEdit('basics')}>
            <Edit3 size={14} />
            Edit
          </button>
        </div>
        <ReviewItem label="Name" value={agentName || 'Unnamed Agent'} />
        <ReviewItem label="Description" value={agentDescription || 'No description'} />
      </div>

      <div className="review-section">
        <div className="review-section__header">
          <div className="review-strategy-badge" style={{ '--strategy-color': strategy?.color }}>
            <StrategyIcon size={20} />
            <span>{strategy?.name || strategyType}</span>
          </div>
          <button type="button" className="edit-btn" onClick={() => onEdit('strategy')}>
            <Edit3 size={14} />
            Edit
          </button>
        </div>
        {renderStrategyDetails()}
      </div>

      <div className="review-summary-box">
        <Check size={20} />
        <div>
          <strong>Ready to create</strong>
          <p>
            Your {strategy?.shortName || 'strategy'} agent will be created in paper trading mode.
            You'll be able to review and approve all trades before they execute.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }) {
  return (
    <div className="review-item">
      <span className="review-item__label">{label}</span>
      <span className="review-item__value">{value}</span>
    </div>
  );
}

// Add additional CSS for review step
const reviewStyles = `
.review-warnings {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--warning-bg, rgba(245, 158, 11, 0.08));
  border: 1px solid var(--warning-border, rgba(245, 158, 11, 0.2));
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-6);
}

.review-warnings svg {
  flex-shrink: 0;
  color: var(--warning);
}

.review-warnings strong {
  display: block;
  color: var(--warning);
  margin-bottom: var(--space-1);
}

.review-warnings ul {
  margin: 0;
  padding-left: var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.review-section {
  padding: var(--space-5);
  background: var(--glass-bg);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  margin-bottom: var(--space-4);
}

.review-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-primary);
}

.review-section__header h3 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.review-strategy-badge {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--strategy-color);
  border-radius: var(--radius-md);
  color: white;
  font-weight: var(--font-semibold);
}

.edit-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.edit-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.review-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--space-2) 0;
}

.review-item:not(:last-child) {
  border-bottom: 1px dashed var(--border-primary);
}

.review-item__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.review-item__value {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-primary);
  text-align: right;
  max-width: 60%;
}

.review-summary-box {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--positive-bg, rgba(34, 197, 94, 0.08));
  border: 1px solid var(--positive-border, rgba(34, 197, 94, 0.2));
  border-radius: var(--radius-lg);
  margin-top: var(--space-4);
}

.review-summary-box svg {
  flex-shrink: 0;
  color: var(--positive);
}

.review-summary-box strong {
  display: block;
  color: var(--positive);
  margin-bottom: var(--space-1);
}

.review-summary-box p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = reviewStyles;
  document.head.appendChild(styleEl);
}

export default BeginnerReviewStep;
