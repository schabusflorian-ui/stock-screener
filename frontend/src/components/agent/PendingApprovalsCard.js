// frontend/src/components/agent/PendingApprovalsCard.js
// Prominent pending trade approvals card - designed to be unmissable

import { useState, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw
} from 'lucide-react';
import TradeCard from './TradeCard';
import './PendingApprovalsCard.css';

function PendingApprovalsCard({
  trades = [],
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onRefresh,
  loading = false
}) {
  const [bulkLoading, setBulkLoading] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  const handleApprove = useCallback(async (id) => {
    if (!onApprove) return;
    setActionLoading(prev => ({ ...prev, [id]: 'approve' }));
    try {
      await onApprove(id);
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [onApprove]);

  const handleReject = useCallback(async (id) => {
    if (!onReject) return;
    setActionLoading(prev => ({ ...prev, [id]: 'reject' }));
    try {
      await onReject(id);
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [onReject]);

  const handleBulkApprove = async () => {
    if (!onApproveAll || trades.length === 0) return;
    setBulkLoading('approve');
    try {
      await onApproveAll();
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkReject = async () => {
    if (!onRejectAll || trades.length === 0) return;
    setBulkLoading('reject');
    try {
      await onRejectAll();
    } finally {
      setBulkLoading(null);
    }
  };

  const pendingCount = trades.length;
  const totalValue = trades.reduce((sum, t) => sum + (t.value || 0), 0);

  // Empty state
  if (pendingCount === 0 && !loading) {
    return (
      <div className="pending-approvals pending-approvals--empty">
        <div className="pending-approvals__empty-content">
          <CheckCircle size={32} className="pending-approvals__empty-icon" />
          <h3 className="pending-approvals__empty-title">No Pending Trades</h3>
          <p className="pending-approvals__empty-text">
            All caught up! The agent will notify you when new opportunities are found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`pending-approvals ${pendingCount > 0 ? 'pending-approvals--has-pending' : ''}`}>
      {/* Header with attention badge */}
      <div className="pending-approvals__header">
        <div className="pending-approvals__title-section">
          <div className="pending-approvals__badge">
            <AlertCircle size={16} />
            <span>{pendingCount} trade{pendingCount !== 1 ? 's' : ''} awaiting approval</span>
          </div>
          <div className="pending-approvals__meta">
            <Clock size={14} />
            <span>Total value: ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <button
          className="pending-approvals__refresh"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh pending trades"
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Trade cards list */}
      <div className="pending-approvals__list">
        {loading && trades.length === 0 ? (
          <div className="pending-approvals__loading">
            <RefreshCw size={20} className="spinning" />
            <span>Loading pending trades...</span>
          </div>
        ) : (
          trades.map(trade => (
            <TradeCard
              key={trade.id}
              id={trade.id}
              symbol={trade.symbol}
              action={trade.action}
              value={trade.value}
              shares={trade.shares}
              confidence={trade.confidence}
              signalScore={trade.signalScore}
              reasoning={trade.reasoning}
              createdAt={trade.createdAt}
              onApprove={() => handleApprove(trade.id)}
              onReject={() => handleReject(trade.id)}
              loading={actionLoading[trade.id] !== undefined}
            />
          ))
        )}
      </div>

      {/* Bulk actions */}
      {pendingCount > 1 && (
        <div className="pending-approvals__bulk-actions">
          <button
            className="pending-approvals__bulk-btn pending-approvals__bulk-btn--approve"
            onClick={handleBulkApprove}
            disabled={loading || bulkLoading !== null}
          >
            {bulkLoading === 'approve' ? (
              <RefreshCw size={16} className="spinning" />
            ) : (
              <CheckCircle size={16} />
            )}
            <span>Approve All ({pendingCount})</span>
          </button>
          <button
            className="pending-approvals__bulk-btn pending-approvals__bulk-btn--reject"
            onClick={handleBulkReject}
            disabled={loading || bulkLoading !== null}
          >
            {bulkLoading === 'reject' ? (
              <RefreshCw size={16} className="spinning" />
            ) : (
              <XCircle size={16} />
            )}
            <span>Reject All</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default PendingApprovalsCard;
