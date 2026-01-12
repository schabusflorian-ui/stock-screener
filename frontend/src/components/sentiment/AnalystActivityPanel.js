// frontend/src/components/sentiment/AnalystActivityPanel.js
// Display recent analyst rating changes and activity

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Target, Users, ArrowUpRight,
  ChevronRight, BarChart3
} from 'lucide-react';
import { sentimentAPI } from '../../services/api';
import './AnalystActivityPanel.css';

// Format action for display
const formatAction = (change) => {
  switch (change.type) {
    case 'rating_change':
      return {
        icon: change.action === 'upgrade' ? TrendingUp : TrendingDown,
        color: change.action === 'upgrade' ? 'var(--positive)' : 'var(--negative)',
        text: change.action === 'upgrade' ? 'Upgraded' : 'Downgraded',
        detail: `${change.from} → ${change.to}`,
      };
    case 'price_target':
      return {
        icon: Target,
        color: change.action === 'pt_raise' ? 'var(--positive)' : 'var(--negative)',
        text: change.action === 'pt_raise' ? 'PT Raised' : 'PT Lowered',
        detail: `$${change.oldTarget?.toFixed(0)} → $${change.newTarget?.toFixed(0)}`,
      };
    case 'consensus_shift':
      return {
        icon: Users,
        color: change.action === 'consensus_improve' ? 'var(--positive)' : 'var(--negative)',
        text: change.action === 'consensus_improve' ? 'Consensus Up' : 'Consensus Down',
        detail: `${change.oldBuyPercent}% → ${change.newBuyPercent}%`,
      };
    default:
      return {
        icon: BarChart3,
        color: 'var(--text-secondary)',
        text: 'Update',
        detail: '',
      };
  }
};

// Single activity item
const ActivityItem = ({ change }) => {
  const formatted = formatAction(change);
  const Icon = formatted.icon;

  return (
    <div className="activity-item">
      <div className="activity-icon" style={{ color: formatted.color }}>
        <Icon size={14} />
      </div>
      <div className="activity-content">
        <div className="activity-header">
          <Link to={`/company/${change.symbol}`} className="activity-symbol">
            {change.symbol}
          </Link>
          <span className="activity-action" style={{ color: formatted.color }}>
            {formatted.text}
          </span>
        </div>
        <div className="activity-detail">
          {formatted.detail}
        </div>
      </div>
      <ChevronRight size={14} className="activity-arrow" />
    </div>
  );
};

// Strong buy card
const StrongBuyCard = ({ stock }) => (
  <div className="strong-buy-card">
    <div className="sb-header">
      <Link to={`/company/${stock.symbol}`} className="sb-symbol">
        {stock.symbol}
      </Link>
      <span className="sb-consensus">{stock.buy_percent}% Buy</span>
    </div>
    <div className="sb-details">
      <div className="sb-stat">
        <ArrowUpRight size={12} className="positive" />
        <span>{stock.upside_potential?.toFixed(0)}% upside</span>
      </div>
      <div className="sb-stat">
        <span className="muted">{stock.number_of_analysts} analysts</span>
      </div>
    </div>
  </div>
);

function AnalystActivityPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('activity');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await sentimentAPI.getAnalystActivity();
        setData(response.data);
      } catch (err) {
        console.error('Error fetching analyst activity:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="analyst-panel loading">
        <div className="loading-skeleton" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="analyst-activity-panel">
      <div className="panel-header">
        <h3>
          <BarChart3 size={18} />
          Analyst Activity
        </h3>
        <div className="panel-tabs">
          <button
            className={`panel-tab ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Recent
          </button>
          <button
            className={`panel-tab ${activeTab === 'consensus' ? 'active' : ''}`}
            onClick={() => setActiveTab('consensus')}
          >
            Strong Buys
          </button>
        </div>
      </div>

      <div className="panel-content">
        {activeTab === 'activity' && (
          <div className="activity-list">
            {data.recentChanges?.length > 0 ? (
              data.recentChanges.slice(0, 8).map((change, idx) => (
                <ActivityItem key={`${change.symbol}-${change.type}-${idx}`} change={change} />
              ))
            ) : (
              <div className="empty-state">No recent analyst changes</div>
            )}
          </div>
        )}

        {activeTab === 'consensus' && (
          <div className="strong-buys-grid">
            {data.strongBuys?.length > 0 ? (
              data.strongBuys.slice(0, 6).map(stock => (
                <StrongBuyCard key={stock.symbol} stock={stock} />
              ))
            ) : (
              <div className="empty-state">No strong buy consensus stocks</div>
            )}
          </div>
        )}
      </div>

      {data.totalChanges > 8 && activeTab === 'activity' && (
        <div className="panel-footer">
          <span className="more-count">+{data.totalChanges - 8} more changes</span>
        </div>
      )}
    </div>
  );
}

export default AnalystActivityPanel;
