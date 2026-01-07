// frontend/src/components/portfolio/TransactionList.js
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Filter,
  Calendar,
  BarChart3,
  X
} from 'lucide-react';
import { TradeAttributionDetail } from '../agent';
import './TransactionList.css';

const TRANSACTION_TYPES = {
  buy: { label: 'Buy', icon: TrendingUp, className: 'buy' },
  sell: { label: 'Sell', icon: TrendingDown, className: 'sell' },
  dividend: { label: 'Dividend', icon: DollarSign, className: 'dividend' },
  deposit: { label: 'Deposit', icon: DollarSign, className: 'deposit' },
  withdraw: { label: 'Withdraw', icon: DollarSign, className: 'withdraw' },
  split: { label: 'Split', icon: TrendingUp, className: 'split' },
  fee: { label: 'Fee', icon: DollarSign, className: 'fee' }
};

function TransactionList({ transactions, onLoadMore }) {
  const [filterType, setFilterType] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  // Normalize transactions to handle both API field naming conventions
  const normalizedTransactions = transactions.map(t => ({
    ...t,
    type: t.type || t.transaction_type,
    price: t.price || t.price_per_share,
    amount: t.amount || t.total_amount
  }));

  const filteredTransactions = filterType === 'all'
    ? normalizedTransactions
    : normalizedTransactions.filter(t => t.type === filterType);

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="transactions-section">
      <div className="section-header">
        <h2>Transaction History</h2>
        <div className="section-controls">
          <div className="filter-group">
            <Filter size={16} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="buy">Buys</option>
              <option value="sell">Sells</option>
              <option value="dividend">Dividends</option>
              <option value="deposit">Deposits</option>
              <option value="withdraw">Withdrawals</option>
            </select>
          </div>
        </div>
      </div>

      <div className="transactions-list">
        {filteredTransactions.map((tx, idx) => {
          const typeConfig = TRANSACTION_TYPES[tx.type] || TRANSACTION_TYPES.fee;
          const TypeIcon = typeConfig.icon;
          const isPositive = ['buy', 'deposit', 'dividend'].includes(tx.type);

          return (
            <div key={idx} className="transaction-item">
              <div className={`transaction-icon ${typeConfig.className}`}>
                <TypeIcon size={18} />
              </div>

              <div className="transaction-details">
                <div className="transaction-header">
                  <span className={`transaction-type ${typeConfig.className}`}>
                    {typeConfig.label}
                  </span>
                  {tx.symbol && (
                    <Link to={`/company/${tx.symbol}`} className="transaction-symbol">
                      {tx.symbol}
                    </Link>
                  )}
                </div>
                <div className="transaction-meta">
                  {tx.shares && (
                    <span>{tx.shares.toLocaleString()} shares</span>
                  )}
                  {tx.price && (
                    <span>@ {formatValue(tx.price)}</span>
                  )}
                  {tx.notes && (
                    <span className="transaction-notes">{tx.notes}</span>
                  )}
                </div>
              </div>

              <div className="transaction-amount">
                <span className={isPositive ? 'positive' : 'negative'}>
                  {isPositive ? '+' : '-'}{formatValue(tx.amount || (tx.shares * tx.price))}
                </span>
                <span className="transaction-date">
                  <Calendar size={12} />
                  {formatDate(tx.created_at)}
                </span>
              </div>

              {/* Attribution button for sell transactions */}
              {tx.type === 'sell' && tx.id && (
                <button
                  className="transaction-attribution-btn"
                  onClick={() => setSelectedTransaction(tx)}
                  title="View trade attribution"
                >
                  <BarChart3 size={16} />
                </button>
              )}
            </div>
          );
        })}

        {filteredTransactions.length === 0 && (
          <div className="empty-transactions">
            <p>No transactions found</p>
          </div>
        )}
      </div>

      {transactions.length >= 50 && (
        <div className="load-more">
          <button className="btn btn-secondary" onClick={onLoadMore}>
            Load More
          </button>
        </div>
      )}

      {/* Attribution Modal */}
      {selectedTransaction && (
        <div className="attribution-modal-overlay" onClick={() => setSelectedTransaction(null)}>
          <div className="attribution-modal" onClick={e => e.stopPropagation()}>
            <button
              className="attribution-modal-close"
              onClick={() => setSelectedTransaction(null)}
            >
              <X size={20} />
            </button>
            <TradeAttributionDetail
              transactionId={selectedTransaction.id}
              onClose={() => setSelectedTransaction(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionList;
