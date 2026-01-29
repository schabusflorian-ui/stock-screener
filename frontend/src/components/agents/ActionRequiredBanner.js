// frontend/src/components/agents/ActionRequiredBanner.js
// Conditional banner showing pending actions that need user attention

import { Target, Calendar, AlertTriangle, ChevronRight } from '../icons';
import Button from '../ui/Button';
import './ActionRequiredBanner.css';

function formatCurrency(value) {
  if (value == null) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export default function ActionRequiredBanner({
  // Advanced agent props
  pendingSignals = 0,
  onReviewSignals,
  // Beginner agent props
  contributionDue = false,
  contributionAmount = 0,
  onExecuteContribution,
  onSkipContribution,
  // Error props
  hasErrors = false,
  errorMessage = '',
  onViewErrors
}) {
  // Don't render if no actions needed
  if (pendingSignals === 0 && !contributionDue && !hasErrors) {
    return null;
  }

  // Determine banner type and priority (errors > contributions > signals)
  const isError = hasErrors;
  const isContribution = !isError && contributionDue;
  const isSignals = !isError && !isContribution && pendingSignals > 0;

  const bannerClass = isError ? 'error' : isContribution ? 'warning' : 'info';

  return (
    <div className={`action-banner action-banner--${bannerClass}`}>
      <div className="action-banner__icon">
        {isError && <AlertTriangle size={20} />}
        {isContribution && <Calendar size={20} />}
        {isSignals && <Target size={20} />}
      </div>

      <div className="action-banner__content">
        {isError && (
          <>
            <span className="action-banner__title">Error Detected</span>
            <span className="action-banner__message">{errorMessage || 'Agent encountered an issue'}</span>
          </>
        )}

        {isContribution && (
          <>
            <span className="action-banner__title">Contribution Due</span>
            <span className="action-banner__message">
              Your {formatCurrency(contributionAmount)} contribution is ready to execute
            </span>
          </>
        )}

        {isSignals && (
          <>
            <span className="action-banner__title">Signals Awaiting Review</span>
            <span className="action-banner__message">
              {pendingSignals} {pendingSignals === 1 ? 'signal requires' : 'signals require'} your approval
            </span>
          </>
        )}
      </div>

      <div className="action-banner__actions">
        {isError && onViewErrors && (
          <Button variant="ghost" size="sm" onClick={onViewErrors}>
            View Details
            <ChevronRight size={14} />
          </Button>
        )}

        {isContribution && (
          <>
            {onSkipContribution && (
              <Button variant="ghost" size="sm" onClick={onSkipContribution}>
                Skip
              </Button>
            )}
            {onExecuteContribution && (
              <Button variant="primary" size="sm" onClick={onExecuteContribution}>
                Execute Contribution
              </Button>
            )}
          </>
        )}

        {isSignals && onReviewSignals && (
          <Button variant="primary" size="sm" onClick={onReviewSignals}>
            Review Signals
            <ChevronRight size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
