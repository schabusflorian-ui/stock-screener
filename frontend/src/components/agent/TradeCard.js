// frontend/src/components/agent/TradeCard.js
// Compact trade card for pending approvals

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Check,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import './TradeCard.css';

function TradeCard({
  id,
  symbol,
  action,
  value,
  shares,
  confidence,
  signalScore,
  reasoning = [],
  createdAt,
  onApprove,
  onReject,
  loading = false,
  compact = false
}) {
  const [expanded, setExpanded] = useState(false);

  const isBuy = action?.toLowerCase().includes('buy');
  const ActionIcon = isBuy ? TrendingUp : TrendingDown;
  const actionClass = isBuy ? 'buy' : 'sell';
  const actionLabel = action?.replace('_', ' ').toUpperCase() || (isBuy ? 'BUY' : 'SELL');

  const formatValue = (val) => {
    if (!val && val !== 0) return '-';
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatPercent = (val) => {
    if (val === null || val === undefined) return '-';
    return `${(val * 100).toFixed(0)}%`;
  };

  const handleApprove = (e) => {
    e.stopPropagation();
    if (onApprove) onApprove(id);
  };

  const handleReject = (e) => {
    e.stopPropagation();
    if (onReject) onReject(id);
  };

  if (compact) {
    return (
      <div className={`trade-card trade-card--compact trade-card--${actionClass}`}>
        <div className="trade-card__icon">
          <ActionIcon size={16} />
        </div>
        <div className="trade-card__main">
          <span className="trade-card__action-label">{actionLabel}</span>
          <Link to={`/company/${symbol}`} className="trade-card__symbol">
            {symbol}
          </Link>
        </div>
        <div className="trade-card__value">{formatValue(value)}</div>
        <div className="trade-card__confidence">{formatPercent(confidence)}</div>
        <div className="trade-card__actions">
          <button
            className="trade-card__btn trade-card__btn--approve"
            onClick={handleApprove}
            disabled={loading}
            title="Approve"
          >
            {loading ? <RefreshCw size={14} className="spinning" /> : <Check size={14} />}
          </button>
          <button
            className="trade-card__btn trade-card__btn--reject"
            onClick={handleReject}
            disabled={loading}
            title="Reject"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`trade-card trade-card--${actionClass}`}>
      <div className="trade-card__header" onClick={() => setExpanded(!expanded)}>
        <div className="trade-card__icon-wrapper">
          <ActionIcon size={20} />
        </div>

        <div className="trade-card__info">
          <div className="trade-card__top-row">
            <span className={`trade-card__action-badge trade-card__action-badge--${actionClass}`}>
              {actionLabel}
            </span>
            <Link
              to={`/company/${symbol}`}
              className="trade-card__symbol"
              onClick={(e) => e.stopPropagation()}
            >
              {symbol}
            </Link>
          </div>
          <div className="trade-card__bottom-row">
            <span className="trade-card__value">{formatValue(value)}</span>
            {shares && <span className="trade-card__shares">{shares} shares</span>}
            <span className="trade-card__separator">•</span>
            <span className="trade-card__confidence">
              {formatPercent(confidence)} confidence
            </span>
          </div>
        </div>

        <div className="trade-card__actions">
          <button
            className="trade-card__btn trade-card__btn--approve"
            onClick={handleApprove}
            disabled={loading}
          >
            {loading ? (
              <RefreshCw size={16} className="spinning" />
            ) : (
              <>
                <Check size={16} />
                <span>Approve</span>
              </>
            )}
          </button>
          <button
            className="trade-card__btn trade-card__btn--reject"
            onClick={handleReject}
            disabled={loading}
          >
            <X size={16} />
            <span>Reject</span>
          </button>
        </div>

        <button className="trade-card__expand">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="trade-card__details">
          {signalScore !== undefined && (
            <div className="trade-card__detail-row">
              <span className="trade-card__detail-label">Signal Score</span>
              <span className="trade-card__detail-value">
                {signalScore > 0 ? '+' : ''}{signalScore?.toFixed(2)}
              </span>
            </div>
          )}

          {reasoning && reasoning.length > 0 && (
            <div className="trade-card__reasoning">
              <div className="trade-card__reasoning-header">
                <Info size={14} />
                <span>Key Factors</span>
              </div>
              <div className="trade-card__reasoning-list">
                {reasoning.slice(0, 3).map((reason, idx) => (
                  <div
                    key={idx}
                    className={`trade-card__reason trade-card__reason--${reason.direction || 'neutral'}`}
                  >
                    <span className="trade-card__reason-indicator">
                      {reason.direction === 'bullish' ? '▲' : reason.direction === 'bearish' ? '▼' : '●'}
                    </span>
                    <span className="trade-card__reason-text">
                      <strong>{reason.factor}:</strong> {reason.details}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {createdAt && (
            <div className="trade-card__detail-row">
              <span className="trade-card__detail-label">Created</span>
              <span className="trade-card__detail-value">
                {new Date(createdAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TradeCard;
