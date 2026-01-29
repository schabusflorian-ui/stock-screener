// frontend/src/components/agents/ExecutionTab.js
// Three-column execution queue for trading agents

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Play,
  CheckCircle2,
  Timer,
  DollarSign,
  ChevronRight,
  Zap
} from '../icons';
import { agentsAPI } from '../../services/api';
import Button from '../ui/Button';
import './ExecutionTab.css';

function ExecutionCard({ execution, type, onApprove, onReject, onExecute, loading }) {
  const isBuy = execution.action?.toLowerCase().includes('buy');
  const ActionIcon = isBuy ? TrendingUp : TrendingDown;

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`execution-card ${type} ${isBuy ? 'buy' : 'sell'}`}>
      <div className="execution-card__header">
        <div className="execution-card__symbol">
          <ActionIcon size={16} className={`action-icon ${isBuy ? 'buy' : 'sell'}`} />
          <Link to={`/company/${execution.symbol}`} className="symbol-link">
            {execution.symbol}
          </Link>
        </div>
        <span className={`execution-card__action ${isBuy ? 'buy' : 'sell'}`}>
          {execution.action}
        </span>
      </div>

      <div className="execution-card__details">
        <div className="execution-card__detail">
          <DollarSign size={12} />
          <span>{formatValue(execution.estimated_value || execution.position_value)}</span>
        </div>
        <div className="execution-card__detail">
          <span>{execution.shares || Math.round(execution.position_size_pct * 100)}%</span>
        </div>
        <div className="execution-card__detail">
          <Timer size={12} />
          <span>{formatDate(execution.created_at)}</span>
        </div>
      </div>

      {execution.confidence && (
        <div className="execution-card__confidence">
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{ width: `${execution.confidence * 100}%` }}
            />
          </div>
          <span className="confidence-value">{(execution.confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      {type === 'pending' && (
        <div className="execution-card__actions">
          <Button
            variant="success"
            size="sm"
            onClick={() => onApprove(execution.id)}
            disabled={loading}
          >
            {loading === 'approve' ? <RefreshCw size={14} className="spinning" /> : <Check size={14} />}
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onReject(execution.id)}
            disabled={loading}
          >
            {loading === 'reject' ? <RefreshCw size={14} className="spinning" /> : <X size={14} />}
            Reject
          </Button>
        </div>
      )}

      {type === 'approved' && (
        <div className="execution-card__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onExecute(execution.id)}
            disabled={loading}
          >
            {loading === 'execute' ? <RefreshCw size={14} className="spinning" /> : <Play size={14} />}
            Execute
          </Button>
        </div>
      )}

      {type === 'executed' && (
        <div className="execution-card__result">
          {execution.executed_price && (
            <span className="executed-price">@ ${execution.executed_price.toFixed(2)}</span>
          )}
          <span className="executed-time">{formatDate(execution.executed_at)}</span>
        </div>
      )}
    </div>
  );
}

function ExecutionColumn({ title, icon: Icon, items, type, count, emptyMessage, onApprove, onReject, onExecute, loadingStates, headerAction }) {
  return (
    <div className={`execution-column ${type}`}>
      <div className="execution-column__header">
        <div className="execution-column__title">
          <Icon size={18} />
          <h3>{title}</h3>
          {count > 0 && <span className="execution-column__count">{count}</span>}
        </div>
        {headerAction}
      </div>

      <div className="execution-column__content">
        {items.length === 0 ? (
          <div className="execution-column__empty">
            <Icon size={24} />
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="execution-column__list">
            {items.map((item) => (
              <ExecutionCard
                key={item.id}
                execution={item}
                type={type}
                onApprove={onApprove}
                onReject={onReject}
                onExecute={onExecute}
                loading={loadingStates[item.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutionTab({ agentId }) {
  const [signals, setSignals] = useState({ pending: [], approved: [], executed: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [bulkLoading, setBulkLoading] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch signals by status
      const [pendingRes, approvedRes, executedRes] = await Promise.all([
        agentsAPI.getSignals(agentId, { status: 'pending', limit: 50 }),
        agentsAPI.getSignals(agentId, { status: 'approved', limit: 50 }),
        agentsAPI.getSignals(agentId, { status: 'executed', limit: 20 })
      ]);

      setSignals({
        pending: pendingRes.data.data || pendingRes.data.signals || [],
        approved: approvedRes.data.data || approvedRes.data.signals || [],
        executed: executedRes.data.data || executedRes.data.signals || []
      });
    } catch (err) {
      console.error('Error loading executions:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (signalId) => {
    try {
      setActionLoading(prev => ({ ...prev, [signalId]: 'approve' }));
      await agentsAPI.approveSignal(agentId, signalId);
      await loadData();
    } catch (err) {
      console.error('Error approving signal:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [signalId]: null }));
    }
  };

  const handleReject = async (signalId) => {
    try {
      setActionLoading(prev => ({ ...prev, [signalId]: 'reject' }));
      await agentsAPI.rejectSignal(agentId, signalId);
      await loadData();
    } catch (err) {
      console.error('Error rejecting signal:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [signalId]: null }));
    }
  };

  const handleExecute = async (signalId) => {
    try {
      setActionLoading(prev => ({ ...prev, [signalId]: 'execute' }));
      // Execute a single signal - this triggers the paper/live trading engine
      await agentsAPI.executeSignal(agentId, signalId);
      await loadData();
    } catch (err) {
      console.error('Error executing signal:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [signalId]: null }));
    }
  };

  const handleApproveAll = async () => {
    try {
      setBulkLoading('approve-all');
      await agentsAPI.approveAllSignals(agentId);
      await loadData();
    } catch (err) {
      console.error('Error approving all:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setBulkLoading(null);
    }
  };

  const handleExecuteAll = async () => {
    try {
      setBulkLoading('execute-all');
      // Execute all approved signals via single API call
      await agentsAPI.executeAllSignals(agentId);
      await loadData();
    } catch (err) {
      console.error('Error executing all:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setBulkLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="execution-tab loading">
        <RefreshCw size={24} className="spinning" />
        <span>Loading execution queue...</span>
      </div>
    );
  }

  return (
    <div className="execution-tab">
      {error && (
        <div className="execution-tab__error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            <X size={14} />
          </Button>
        </div>
      )}

      {/* Summary Stats */}
      <div className="execution-tab__summary">
        <div className="summary-stat">
          <span className="summary-stat__value">{signals.pending.length}</span>
          <span className="summary-stat__label">Pending</span>
        </div>
        <ChevronRight size={16} className="summary-arrow" />
        <div className="summary-stat">
          <span className="summary-stat__value">{signals.approved.length}</span>
          <span className="summary-stat__label">Approved</span>
        </div>
        <ChevronRight size={16} className="summary-arrow" />
        <div className="summary-stat">
          <span className="summary-stat__value">{signals.executed.length}</span>
          <span className="summary-stat__label">Executed</span>
        </div>
        <div className="summary-actions">
          <Button variant="ghost" size="sm" onClick={loadData}>
            <RefreshCw size={14} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Three-Column Layout */}
      <div className="execution-tab__columns">
        <ExecutionColumn
          title="Pending Approval"
          icon={Clock}
          items={signals.pending}
          type="pending"
          count={signals.pending.length}
          emptyMessage="No signals awaiting approval"
          onApprove={handleApprove}
          onReject={handleReject}
          loadingStates={actionLoading}
          headerAction={
            signals.pending.length > 0 && (
              <Button
                variant="success"
                size="sm"
                onClick={handleApproveAll}
                disabled={bulkLoading === 'approve-all'}
              >
                {bulkLoading === 'approve-all' ? (
                  <RefreshCw size={14} className="spinning" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                Approve All
              </Button>
            )
          }
        />

        <ExecutionColumn
          title="Approved Queue"
          icon={CheckCircle2}
          items={signals.approved}
          type="approved"
          count={signals.approved.length}
          emptyMessage="No approved signals ready for execution"
          onExecute={handleExecute}
          loadingStates={actionLoading}
          headerAction={
            signals.approved.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteAll}
                disabled={bulkLoading === 'execute-all'}
              >
                {bulkLoading === 'execute-all' ? (
                  <RefreshCw size={14} className="spinning" />
                ) : (
                  <Zap size={14} />
                )}
                Execute All
              </Button>
            )
          }
        />

        <ExecutionColumn
          title="Recently Executed"
          icon={CheckCircle2}
          items={signals.executed}
          type="executed"
          count={signals.executed.length}
          emptyMessage="No trades executed yet"
          loadingStates={actionLoading}
        />
      </div>
    </div>
  );
}

export default ExecutionTab;
