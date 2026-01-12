// frontend/src/components/agents/PaperTradingPanel.js
// Paper Trading Panel for Agent Dashboard - manages paper trading account

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, TrendingUp, TrendingDown, RefreshCw, Plus, Minus,
  AlertTriangle, Clock, BarChart3,
  ArrowUpRight, ArrowDownRight, Activity, History, Settings
} from 'lucide-react';
import { paperTradingAPI } from '../../services/api';
import './PaperTradingPanel.css';

function PaperTradingPanel({ agentId, portfolioId, onTradeExecuted }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trades, setTrades] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [activeTab, setActiveTab] = useState('positions');
  const [showQuickTrade, setShowQuickTrade] = useState(false);
  const [quickTradeSymbol, setQuickTradeSymbol] = useState('');
  const [quickTradeQuantity, setQuickTradeQuantity] = useState('');
  const [quickTradeSide, setQuickTradeSide] = useState('BUY');
  const [executing, setExecuting] = useState(false);

  // Fetch account data
  const fetchAccount = useCallback(async () => {
    if (!portfolioId) return;

    try {
      setLoading(true);
      // Try to get account linked to portfolio
      const accountName = `portfolio_${portfolioId}`;

      // First, get all accounts to find the linked one
      const accountsRes = await paperTradingAPI.getAccounts();
      const accounts = accountsRes.data?.data || [];
      let linkedAccount = accounts.find(a => a.name === accountName);

      if (!linkedAccount) {
        // Create account if doesn't exist
        const createRes = await paperTradingAPI.createAccount(accountName, 100000);
        linkedAccount = createRes.data?.data;
      }

      if (linkedAccount) {
        // Get full account status
        const statusRes = await paperTradingAPI.getAccount(linkedAccount.id);
        setAccount(statusRes.data?.data);

        // Get recent trades
        const tradesRes = await paperTradingAPI.getTrades(linkedAccount.id, 20);
        setTrades(tradesRes.data?.data || []);

        // Get performance
        const perfRes = await paperTradingAPI.getPerformance(linkedAccount.id, 30);
        setPerformance(perfRes.data?.data);
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching paper trading account:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Execute quick trade
  const executeQuickTrade = async () => {
    if (!account || !quickTradeSymbol || !quickTradeQuantity) return;

    try {
      setExecuting(true);
      const accountId = account.account.id;

      if (quickTradeSide === 'BUY') {
        await paperTradingAPI.buy(accountId, quickTradeSymbol.toUpperCase(), parseInt(quickTradeQuantity));
      } else {
        await paperTradingAPI.sell(accountId, quickTradeSymbol.toUpperCase(), parseInt(quickTradeQuantity));
      }

      // Refresh data
      await fetchAccount();
      setShowQuickTrade(false);
      setQuickTradeSymbol('');
      setQuickTradeQuantity('');

      if (onTradeExecuted) onTradeExecuted();
    } catch (err) {
      console.error('Error executing trade:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setExecuting(false);
    }
  };

  // Reset account
  const handleReset = async () => {
    if (!account || !window.confirm('Reset paper trading account? This will clear all positions and history.')) return;

    try {
      setLoading(true);
      await paperTradingAPI.resetAccount(account.account.id);
      await fetchAccount();
    } catch (err) {
      console.error('Error resetting account:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Take snapshot
  const handleSnapshot = async () => {
    if (!account) return;

    try {
      await paperTradingAPI.takeSnapshot(account.account.id);
      await fetchAccount();
    } catch (err) {
      console.error('Error taking snapshot:', err);
    }
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
  };

  if (loading && !account) {
    return (
      <div className="paper-trading-panel loading">
        <RefreshCw className="spinning" size={20} />
        <span>Loading paper trading account...</span>
      </div>
    );
  }

  if (error && !account) {
    return (
      <div className="paper-trading-panel error">
        <AlertTriangle size={20} />
        <span>{error}</span>
        <button onClick={fetchAccount} className="btn btn-secondary btn-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="paper-trading-panel empty">
        <Wallet size={24} />
        <p>No paper trading account linked</p>
        <button onClick={fetchAccount} className="btn btn-primary btn-sm">
          Create Account
        </button>
      </div>
    );
  }

  const { summary, positions } = account;

  return (
    <div className="paper-trading-panel">
      {/* Header */}
      <div className="paper-trading-header">
        <div className="header-title">
          <Wallet size={20} />
          <h4>Paper Trading</h4>
          <span className="paper-badge">Simulated</span>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-icon"
            onClick={fetchAccount}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="btn btn-icon"
            onClick={handleSnapshot}
            title="Take Snapshot"
          >
            <BarChart3 size={16} />
          </button>
          <button
            className="btn btn-icon"
            onClick={handleReset}
            title="Reset Account"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="paper-trading-summary">
        <div className="summary-card primary">
          <span className="summary-label">Portfolio Value</span>
          <span className="summary-value">{formatCurrency(summary.portfolioValue)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Cash</span>
          <span className="summary-value">{formatCurrency(summary.cashBalance)}</span>
        </div>
        <div className={`summary-card ${summary.totalReturn >= 0 ? 'positive' : 'negative'}`}>
          <span className="summary-label">Total Return</span>
          <span className="summary-value">
            {summary.totalReturn >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {summary.totalReturnPercent}
          </span>
        </div>
        <div className={`summary-card ${summary.unrealizedPnl >= 0 ? 'positive' : 'negative'}`}>
          <span className="summary-label">Unrealized P&L</span>
          <span className="summary-value">{formatCurrency(summary.unrealizedPnl)}</span>
        </div>
      </div>

      {/* Quick Trade Button */}
      <button
        className="btn btn-primary quick-trade-btn"
        onClick={() => setShowQuickTrade(!showQuickTrade)}
      >
        {showQuickTrade ? <Minus size={16} /> : <Plus size={16} />}
        Quick Trade
      </button>

      {/* Quick Trade Form */}
      {showQuickTrade && (
        <div className="quick-trade-form">
          <div className="trade-form-row">
            <div className="form-group">
              <label>Symbol</label>
              <input
                type="text"
                value={quickTradeSymbol}
                onChange={(e) => setQuickTradeSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                value={quickTradeQuantity}
                onChange={(e) => setQuickTradeQuantity(e.target.value)}
                placeholder="100"
                min="1"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Side</label>
              <select
                value={quickTradeSide}
                onChange={(e) => setQuickTradeSide(e.target.value)}
                className="form-select"
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </div>
          </div>
          <div className="trade-form-actions">
            <button
              className={`btn ${quickTradeSide === 'BUY' ? 'btn-success' : 'btn-danger'}`}
              onClick={executeQuickTrade}
              disabled={executing || !quickTradeSymbol || !quickTradeQuantity}
            >
              {executing ? (
                <>
                  <RefreshCw size={14} className="spinning" />
                  Executing...
                </>
              ) : (
                <>
                  {quickTradeSide === 'BUY' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {quickTradeSide === 'BUY' ? 'Buy' : 'Sell'} {quickTradeSymbol || 'Stock'}
                </>
              )}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowQuickTrade(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="paper-trading-tabs">
        <button
          className={`tab ${activeTab === 'positions' ? 'active' : ''}`}
          onClick={() => setActiveTab('positions')}
        >
          Positions ({positions.length})
        </button>
        <button
          className={`tab ${activeTab === 'trades' ? 'active' : ''}`}
          onClick={() => setActiveTab('trades')}
        >
          Trades
        </button>
        <button
          className={`tab ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          Performance
        </button>
      </div>

      {/* Tab Content */}
      <div className="paper-trading-content">
        {activeTab === 'positions' && (
          <div className="positions-list">
            {positions.length === 0 ? (
              <div className="empty-state">
                <Activity size={20} />
                <p>No open positions</p>
              </div>
            ) : (
              positions.map((pos) => (
                <div key={pos.symbol} className="position-card">
                  <div className="position-header">
                    <Link to={`/company/${pos.symbol}`} className="position-symbol">
                      {pos.symbol}
                    </Link>
                    <span className="position-quantity">{pos.quantity} shares</span>
                  </div>
                  <div className="position-details">
                    <div className="position-stat">
                      <span className="stat-label">Avg Cost</span>
                      <span className="stat-value">${pos.avgCost?.toFixed(2)}</span>
                    </div>
                    <div className="position-stat">
                      <span className="stat-label">Current</span>
                      <span className="stat-value">${pos.currentPrice?.toFixed(2)}</span>
                    </div>
                    <div className="position-stat">
                      <span className="stat-label">Value</span>
                      <span className="stat-value">{formatCurrency(pos.marketValue)}</span>
                    </div>
                    <div className={`position-stat ${pos.unrealizedPnl >= 0 ? 'positive' : 'negative'}`}>
                      <span className="stat-label">P&L</span>
                      <span className="stat-value">
                        {formatCurrency(pos.unrealizedPnl)}
                        <small>({formatPercent(pos.unrealizedPnlPercent)})</small>
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'trades' && (
          <div className="trades-list">
            {trades.length === 0 ? (
              <div className="empty-state">
                <History size={20} />
                <p>No trade history</p>
              </div>
            ) : (
              trades.map((trade) => (
                <div key={trade.id} className={`trade-card ${trade.side.toLowerCase()}`}>
                  <div className="trade-header">
                    <span className={`trade-side ${trade.side.toLowerCase()}`}>
                      {trade.side}
                    </span>
                    <span className="trade-symbol">{trade.symbol}</span>
                    <span className="trade-quantity">{trade.quantity} @ ${trade.price?.toFixed(2)}</span>
                  </div>
                  <div className="trade-details">
                    <span className="trade-time">
                      <Clock size={12} />
                      {new Date(trade.executed_at).toLocaleString()}
                    </span>
                    {trade.realized_pnl && (
                      <span className={`trade-pnl ${trade.realized_pnl >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(trade.realized_pnl)}
                      </span>
                    )}
                    <span className="trade-cost">
                      Commission: ${trade.commission?.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="performance-section">
            {performance ? (
              <>
                <div className="performance-stats">
                  <div className="perf-stat">
                    <span className="perf-label">Period Return</span>
                    <span className="perf-value">{performance.periodReturn}</span>
                  </div>
                  <div className="perf-stat">
                    <span className="perf-label">Total Return</span>
                    <span className="perf-value">{performance.totalReturn}</span>
                  </div>
                  <div className="perf-stat">
                    <span className="perf-label">Annualized</span>
                    <span className="perf-value">{performance.annualizedReturn}</span>
                  </div>
                  <div className="perf-stat">
                    <span className="perf-label">Volatility</span>
                    <span className="perf-value">{performance.volatility}</span>
                  </div>
                  <div className="perf-stat">
                    <span className="perf-label">Sharpe Ratio</span>
                    <span className="perf-value">{performance.sharpeRatio}</span>
                  </div>
                  <div className="perf-stat">
                    <span className="perf-label">Max Drawdown</span>
                    <span className="perf-value negative">{performance.maxDrawdown}</span>
                  </div>
                  <div className="perf-stat">
                    <span className="perf-label">Win Rate</span>
                    <span className="perf-value">{performance.winRate}</span>
                  </div>
                </div>

                {performance.snapshots?.length > 0 && (
                  <div className="snapshots-section">
                    <h5>Recent Snapshots</h5>
                    <div className="snapshots-list">
                      {performance.snapshots.map((snap, idx) => (
                        <div key={idx} className="snapshot-row">
                          <span className="snapshot-date">{snap.date}</span>
                          <span className="snapshot-value">{formatCurrency(snap.value)}</span>
                          <span className={`snapshot-pnl ${snap.dailyPnl >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(snap.dailyPnl)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <BarChart3 size={20} />
                <p>No performance data yet</p>
                <button onClick={handleSnapshot} className="btn btn-secondary btn-sm">
                  Take First Snapshot
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="paper-trading-error">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}
    </div>
  );
}

export default PaperTradingPanel;
