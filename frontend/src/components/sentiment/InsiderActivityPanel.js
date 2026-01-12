// frontend/src/components/sentiment/InsiderActivityPanel.js
// Display insider trading activity with buy/sell signals

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { sentimentAPI } from '../../services/api';
import './InsiderActivityPanel.css';

// Format currency value
const formatValue = (value) => {
  if (!value) return '$0';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Insider transaction row
const InsiderRow = ({ tx, type }) => {
  const isBuy = type === 'buy';

  return (
    <div className={`insider-row ${isBuy ? 'buy' : 'sell'}`}>
      <div className="insider-main">
        <Link to={`/company/${tx.symbol}`} className="insider-symbol">
          {tx.symbol}
        </Link>
        <span className="insider-name" title={tx.insiderTitle}>
          {tx.insiderName?.split(' ').slice(0, 2).join(' ')}
        </span>
      </div>
      <div className="insider-details">
        <span className={`insider-value ${isBuy ? 'positive' : 'negative'}`}>
          {isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {formatValue(tx.totalValue)}
        </span>
        <span className="insider-date">{formatDate(tx.date)}</span>
      </div>
    </div>
  );
};

// Net flow card
const NetFlowCard = ({ stock, type }) => {
  const isBuying = type === 'buying';

  return (
    <div className={`net-flow-card ${isBuying ? 'bullish' : 'bearish'}`}>
      <div className="flow-header">
        <Link to={`/company/${stock.symbol}`} className="flow-symbol">
          {stock.symbol}
        </Link>
        {isBuying ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      </div>
      <div className="flow-value">
        {formatValue(stock.netFlow)}
      </div>
      <div className="flow-meta">
        <span className="flow-insiders">
          <Users size={10} /> {stock.uniqueInsiders}
        </span>
        <span className="flow-ratio">
          {stock.buyCount}B / {stock.sellCount}S
        </span>
      </div>
    </div>
  );
};

function InsiderActivityPanel({ days = 30 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await sentimentAPI.getInsiderActivity(days);
        setData(response.data);
      } catch (err) {
        console.error('Error fetching insider activity:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [days]);

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading) {
    return (
      <div className="insider-activity-panel loading">
        <div className="panel-header">
          <h3><Users size={18} /> Insider Activity</h3>
        </div>
        <div className="loading-state">
          <RefreshCw className="spinning" size={20} />
          <span>Loading insider data...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="insider-activity-panel error">
        <div className="panel-header">
          <h3><Users size={18} /> Insider Activity</h3>
        </div>
        <div className="error-state">
          Unable to load insider activity
        </div>
      </div>
    );
  }

  const { overview, significantBuys, significantSells, netBuying, netSelling } = data;

  return (
    <div className="insider-activity-panel">
      <div className="panel-header">
        <h3><Users size={18} /> Insider Activity</h3>
        <span className="period-badge">{data.period}</span>
      </div>

      {/* Overview Stats */}
      <div className="insider-overview">
        <div className="overview-stat">
          <span className="stat-value positive">{overview.totalBuys}</span>
          <span className="stat-label">Buys</span>
        </div>
        <div className="overview-stat">
          <span className="stat-value negative">{overview.totalSells}</span>
          <span className="stat-label">Sells</span>
        </div>
        <div className="overview-stat">
          <span className="stat-value">{overview.companiesWithActivity}</span>
          <span className="stat-label">Companies</span>
        </div>
        <div className="overview-stat">
          <span className={`stat-value ${overview.buyToSellRatio >= 1 ? 'positive' : 'negative'}`}>
            {overview.buyToSellRatio}x
          </span>
          <span className="stat-label">B/S Ratio</span>
        </div>
      </div>

      {/* Net Flow Summary */}
      <div className="net-flow-section">
        <div
          className="section-header clickable"
          onClick={() => toggleSection('netFlow')}
        >
          <h4>
            <DollarSign size={14} /> Net Insider Flow
          </h4>
          {expandedSection === 'netFlow' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>

        {expandedSection === 'netFlow' && (
          <div className="net-flow-grid">
            <div className="flow-column">
              <div className="column-label positive">
                <TrendingUp size={12} /> Net Buying
              </div>
              {netBuying.slice(0, 5).map(stock => (
                <NetFlowCard key={stock.symbol} stock={stock} type="buying" />
              ))}
              {netBuying.length === 0 && (
                <div className="no-data">No net buying activity</div>
              )}
            </div>
            <div className="flow-column">
              <div className="column-label negative">
                <TrendingDown size={12} /> Net Selling
              </div>
              {netSelling.slice(0, 5).map(stock => (
                <NetFlowCard key={stock.symbol} stock={stock} type="selling" />
              ))}
              {netSelling.length === 0 && (
                <div className="no-data">No net selling activity</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Significant Transactions */}
      <div className="transactions-section">
        <div
          className="section-header clickable"
          onClick={() => toggleSection('transactions')}
        >
          <h4>Significant Transactions</h4>
          {expandedSection === 'transactions' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>

        {expandedSection === 'transactions' && (
          <div className="transactions-grid">
            <div className="transactions-column">
              <div className="column-label positive">
                <ArrowUpRight size={12} /> Big Buys (≥$50K)
              </div>
              <div className="transactions-list">
                {significantBuys.slice(0, 8).map((tx, i) => (
                  <InsiderRow key={`buy-${i}`} tx={tx} type="buy" />
                ))}
                {significantBuys.length === 0 && (
                  <div className="no-data">No significant buys</div>
                )}
              </div>
            </div>
            <div className="transactions-column">
              <div className="column-label negative">
                <ArrowDownRight size={12} /> Big Sells (≥$100K)
              </div>
              <div className="transactions-list">
                {significantSells.slice(0, 8).map((tx, i) => (
                  <InsiderRow key={`sell-${i}`} tx={tx} type="sell" />
                ))}
                {significantSells.length === 0 && (
                  <div className="no-data">No significant sells</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default InsiderActivityPanel;
