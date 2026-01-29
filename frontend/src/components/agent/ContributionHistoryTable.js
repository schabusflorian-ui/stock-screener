// frontend/src/components/agent/ContributionHistoryTable.js
// Table showing contribution history for beginner strategy agents

import React, { useState, useEffect } from 'react';
import {
  History,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  TrendingUp,
  TrendingDown
} from '../icons';
import { agentsAPI } from '../../services/api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import './ContributionHistoryTable.css';

const STATUS_CONFIG = {
  executed: { icon: CheckCircle, color: '#059669', label: 'Executed' },
  pending: { icon: Clock, color: '#D97706', label: 'Pending' },
  failed: { icon: XCircle, color: '#DC2626', label: 'Failed' },
  skipped: { icon: XCircle, color: '#94A3B8', label: 'Skipped' }
};

function ContributionHistoryTable({ agentId }) {
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('executed_at');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadContributions();
  }, [agentId]);

  const loadContributions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentsAPI.getContributions(agentId);
      setContributions(response.data.data || response.data.contributions || []);
    } catch (err) {
      console.error('Failed to load contributions:', err);
      setError(err.response?.data?.error || 'Failed to load contribution history');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedContributions = [...contributions].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'executed_at' || sortField === 'created_at') {
      aVal = new Date(aVal || 0).getTime();
      bVal = new Date(bVal || 0).getTime();
    }

    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatAmount = (amount) => {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPnL = (pnl) => {
    if (!pnl && pnl !== 0) return '-';
    const formatted = formatAmount(Math.abs(pnl));
    return pnl >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  // Calculate totals
  const totals = contributions.reduce((acc, c) => {
    if (c.status === 'executed') {
      acc.totalInvested += c.amount || 0;
      acc.totalPnL += c.unrealized_pnl || 0;
      acc.count += 1;
    }
    return acc;
  }, { totalInvested: 0, totalPnL: 0, count: 0 });

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  if (loading) {
    return (
      <Card variant="glass" className="contribution-history">
        <Card.Header>
          <History size={18} />
          <h3>Contribution History</h3>
        </Card.Header>
        <Card.Content>
          <div className="contribution-history__loading">
            <RefreshCw size={24} className="spinning" />
            <p>Loading contribution history...</p>
          </div>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="contribution-history">
      <Card.Header>
        <History size={18} />
        <h3>Contribution History</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadContributions}
        >
          <RefreshCw size={14} />
        </Button>
      </Card.Header>
      <Card.Content>
        {error && (
          <div className="contribution-history__error">
            {error}
          </div>
        )}

        {/* Summary Stats */}
        <div className="contribution-history__summary">
          <div className="contribution-history__stat">
            <DollarSign size={16} />
            <div className="contribution-history__stat-content">
              <span className="contribution-history__stat-label">Total Invested</span>
              <span className="contribution-history__stat-value">{formatAmount(totals.totalInvested)}</span>
            </div>
          </div>
          <div className="contribution-history__stat">
            {totals.totalPnL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <div className="contribution-history__stat-content">
              <span className="contribution-history__stat-label">Unrealized P&L</span>
              <span className={`contribution-history__stat-value ${totals.totalPnL >= 0 ? 'positive' : 'negative'}`}>
                {formatPnL(totals.totalPnL)}
              </span>
            </div>
          </div>
          <div className="contribution-history__stat">
            <CheckCircle size={16} />
            <div className="contribution-history__stat-content">
              <span className="contribution-history__stat-label">Contributions</span>
              <span className="contribution-history__stat-value">{totals.count}</span>
            </div>
          </div>
        </div>

        {contributions.length === 0 ? (
          <div className="contribution-history__empty">
            <History size={32} />
            <p>No contributions yet</p>
            <span>Contributions will appear here once executed</span>
          </div>
        ) : (
          <div className="contribution-history__table-wrapper">
            <table className="contribution-history__table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('executed_at')}>
                    Date <SortIcon field="executed_at" />
                  </th>
                  <th onClick={() => handleSort('amount')}>
                    Amount <SortIcon field="amount" />
                  </th>
                  <th>Assets</th>
                  <th onClick={() => handleSort('status')}>
                    Status <SortIcon field="status" />
                  </th>
                  <th onClick={() => handleSort('unrealized_pnl')}>
                    P&L <SortIcon field="unrealized_pnl" />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedContributions.map(contribution => {
                  const statusConfig = STATUS_CONFIG[contribution.status] || STATUS_CONFIG.pending;
                  const StatusIcon = statusConfig.icon;
                  const isExpanded = expandedId === contribution.id;

                  return (
                    <React.Fragment key={contribution.id}>
                      <tr className={isExpanded ? 'expanded' : ''}>
                        <td>{formatDate(contribution.executed_at || contribution.created_at)}</td>
                        <td className="contribution-history__amount">
                          {formatAmount(contribution.amount)}
                        </td>
                        <td>
                          <div className="contribution-history__assets">
                            {contribution.trades?.slice(0, 2).map((trade, idx) => (
                              <span key={idx} className="contribution-history__asset-badge">
                                {trade.symbol}
                              </span>
                            ))}
                            {contribution.trades?.length > 2 && (
                              <span className="contribution-history__more">
                                +{contribution.trades.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className="contribution-history__status"
                            style={{ color: statusConfig.color }}
                          >
                            <StatusIcon size={14} />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className={`contribution-history__pnl ${contribution.unrealized_pnl >= 0 ? 'positive' : 'negative'}`}>
                          {contribution.status === 'executed' ? formatPnL(contribution.unrealized_pnl) : '-'}
                        </td>
                        <td>
                          <button
                            className="contribution-history__expand-btn"
                            onClick={() => setExpandedId(isExpanded ? null : contribution.id)}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="contribution-history__details-row">
                          <td colSpan={6}>
                            <div className="contribution-history__details">
                              <h4>Trade Details</h4>
                              {contribution.trades && contribution.trades.length > 0 ? (
                                <div className="contribution-history__trades">
                                  {contribution.trades.map((trade, idx) => (
                                    <div key={idx} className="contribution-history__trade">
                                      <div className="contribution-history__trade-info">
                                        <span className="contribution-history__trade-symbol">{trade.symbol}</span>
                                        <span className="contribution-history__trade-shares">
                                          {trade.shares?.toFixed(4)} shares
                                        </span>
                                      </div>
                                      <div className="contribution-history__trade-prices">
                                        <span>@ {formatAmount(trade.price_at_execution)}</span>
                                        <span className="contribution-history__trade-total">
                                          {formatAmount(trade.amount)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="contribution-history__no-trades">No trade details available</p>
                              )}
                              {contribution.notes && (
                                <div className="contribution-history__notes">
                                  <strong>Notes:</strong> {contribution.notes}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

export default ContributionHistoryTable;
