// frontend/src/components/agent/PendingExecutionsPanel.js
// Show and manage pending trades awaiting approval

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  History,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Percent
} from 'lucide-react';
import { executionAPI } from '../../services/api';
import './PendingExecutionsPanel.css';

function PendingExecutionsPanel({ portfolioId }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [pendingRes, historyRes, statsRes] = await Promise.all([
        executionAPI.getPortfolioPending(portfolioId),
        executionAPI.getHistory(portfolioId, 20),
        executionAPI.getStats(portfolioId).catch(() => ({ data: null }))
      ]);

      setPending(pendingRes.data?.executions || []);
      setHistory(historyRes.data?.executions || []);
      setStats(statsRes.data?.stats || null);
    } catch (err) {
      console.error('Error loading executions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      setActionLoading(prev => ({ ...prev, [id]: 'approve' }));
      await executionAPI.approve(id);
      await loadData();
    } catch (err) {
      console.error('Error approving execution:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: null }));
    }
  };

  const handleReject = async (id, reason = '') => {
    try {
      setActionLoading(prev => ({ ...prev, [id]: 'reject' }));
      await executionAPI.reject(id, reason);
      await loadData();
    } catch (err) {
      console.error('Error rejecting execution:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: null }));
    }
  };

  const handleApproveAll = async () => {
    try {
      setActionLoading(prev => ({ ...prev, all: 'approve' }));
      await executionAPI.approveAll(portfolioId);
      await loadData();
    } catch (err) {
      console.error('Error approving all:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, all: null }));
    }
  };

  const handleRejectAll = async () => {
    try {
      setActionLoading(prev => ({ ...prev, all: 'reject' }));
      await executionAPI.rejectAll(portfolioId, 'Batch rejection');
      await loadData();
    } catch (err) {
      console.error('Error rejecting all:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, all: null }));
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(1)}%`;
  };

  const getActionIcon = (action) => {
    if (action?.toLowerCase().includes('buy')) {
      return <TrendingUp size={14} className="action-icon buy" />;
    }
    return <TrendingDown size={14} className="action-icon sell" />;
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { label: 'Pending', class: 'pending' },
      approved: { label: 'Approved', class: 'approved' },
      rejected: { label: 'Rejected', class: 'rejected' },
      executed: { label: 'Executed', class: 'executed' },
      expired: { label: 'Expired', class: 'expired' }
    };
    const s = statusMap[status] || { label: status, class: 'unknown' };
    return <span className={`status-badge ${s.class}`}>{s.label}</span>;
  };

  if (loading) {
    return (
      <div className="pending-executions loading">
        <RefreshCw size={24} className="spinning" />
        <span>Loading pending trades...</span>
      </div>
    );
  }

  return (
    <div className="pending-executions">
      {/* Header */}
      <div className="executions-header">
        <div className="header-tabs">
          <button
            className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <Clock size={16} />
            Pending
            {pending.length > 0 && (
              <span className="tab-badge">{pending.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} />
            History
          </button>
        </div>

        {activeTab === 'pending' && pending.length > 0 && (
          <div className="bulk-actions">
            <button
              className="btn btn-sm btn-success"
              onClick={handleApproveAll}
              disabled={actionLoading.all === 'approve'}
            >
              {actionLoading.all === 'approve' ? (
                <RefreshCw size={14} className="spinning" />
              ) : (
                <Check size={14} />
              )}
              Approve All
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={handleRejectAll}
              disabled={actionLoading.all === 'reject'}
            >
              {actionLoading.all === 'reject' ? (
                <RefreshCw size={14} className="spinning" />
              ) : (
                <X size={14} />
              )}
              Reject All
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="executions-alert error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="execution-stats">
          <div className="stat-item">
            <span className="stat-label">Total Executed</span>
            <span className="stat-value">{stats.totalExecuted || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Approved Rate</span>
            <span className="stat-value">
              {formatPercent(stats.approvalRate)}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Value</span>
            <span className="stat-value">{formatValue(stats.totalValue)}</span>
          </div>
        </div>
      )}

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <div className="executions-content">
          {pending.length === 0 ? (
            <div className="empty-state">
              <Clock size={32} />
              <h4>No Pending Trades</h4>
              <p>
                When the AI trading system generates recommendations that meet your thresholds,
                they will appear here for approval.
              </p>
            </div>
          ) : (
            <div className="executions-list">
              {pending.map((exec) => (
                <div key={exec.id} className="execution-card">
                  <div className="execution-main" onClick={() => setExpandedRow(expandedRow === exec.id ? null : exec.id)}>
                    <div className="execution-symbol">
                      {getActionIcon(exec.action)}
                      <Link to={`/company/${exec.symbol}`} onClick={e => e.stopPropagation()}>
                        {exec.symbol}
                      </Link>
                    </div>
                    <div className="execution-action">
                      <span className={`action-badge ${exec.action?.toLowerCase()}`}>
                        {exec.action}
                      </span>
                    </div>
                    <div className="execution-details">
                      <span className="detail-item">
                        <DollarSign size={12} />
                        {formatValue(exec.estimated_value)}
                      </span>
                      <span className="detail-item">
                        {exec.shares} shares
                      </span>
                    </div>
                    <div className="execution-score">
                      <Percent size={12} />
                      {formatPercent(exec.signal_score)}
                    </div>
                    <div className="execution-expand">
                      {expandedRow === exec.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {expandedRow === exec.id && (
                    <div className="execution-expanded">
                      <div className="expanded-details">
                        <div className="detail-row">
                          <span className="detail-label">Created</span>
                          <span className="detail-value">
                            {new Date(exec.created_at).toLocaleString()}
                          </span>
                        </div>
                        {exec.recommendation_id && (
                          <div className="detail-row">
                            <span className="detail-label">Recommendation ID</span>
                            <span className="detail-value">#{exec.recommendation_id}</span>
                          </div>
                        )}
                      </div>
                      <div className="expanded-actions">
                        <button
                          className="btn btn-success"
                          onClick={() => handleApprove(exec.id)}
                          disabled={actionLoading[exec.id]}
                        >
                          {actionLoading[exec.id] === 'approve' ? (
                            <RefreshCw size={14} className="spinning" />
                          ) : (
                            <Check size={14} />
                          )}
                          Approve
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleReject(exec.id)}
                          disabled={actionLoading[exec.id]}
                        >
                          {actionLoading[exec.id] === 'reject' ? (
                            <RefreshCw size={14} className="spinning" />
                          ) : (
                            <X size={14} />
                          )}
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="executions-content">
          {history.length === 0 ? (
            <div className="empty-state">
              <History size={32} />
              <h4>No Execution History</h4>
              <p>
                Past approved, rejected, and executed trades will appear here.
              </p>
            </div>
          ) : (
            <div className="history-table">
              <div className="history-header">
                <span>Symbol</span>
                <span>Action</span>
                <span>Value</span>
                <span>Status</span>
                <span>Date</span>
              </div>
              {history.map((exec) => (
                <div key={exec.id} className="history-row">
                  <span className="history-symbol">
                    {getActionIcon(exec.action)}
                    <Link to={`/company/${exec.symbol}`}>{exec.symbol}</Link>
                  </span>
                  <span className={`history-action ${exec.action?.toLowerCase()}`}>
                    {exec.action}
                  </span>
                  <span className="history-value">
                    {formatValue(exec.estimated_value)}
                  </span>
                  <span className="history-status">
                    {getStatusBadge(exec.status)}
                  </span>
                  <span className="history-date">
                    {new Date(exec.decided_at || exec.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PendingExecutionsPanel;
