import React, { useState, useEffect } from 'react';
import { MessageSquare, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink } from 'lucide-react';
import { sentimentAPI } from '../services/api';
import './StockTwitsCard.css';

const SIGNAL_CONFIG = {
  strong_buy:  { color: '#10B981', bg: '#10B98120', label: 'Very Bullish', icon: TrendingUp },
  buy:         { color: '#34D399', bg: '#34D39920', label: 'Bullish', icon: TrendingUp },
  lean_buy:    { color: '#6EE7B7', bg: '#6EE7B720', label: 'Lean Bullish', icon: TrendingUp },
  hold:        { color: '#94A3B8', bg: '#94A3B820', label: 'Neutral', icon: Minus },
  lean_sell:   { color: '#FCA5A5', bg: '#FCA5A520', label: 'Lean Bearish', icon: TrendingDown },
  sell:        { color: '#F87171', bg: '#F8717120', label: 'Bearish', icon: TrendingDown },
  strong_sell: { color: '#EF4444', bg: '#EF444420', label: 'Very Bearish', icon: TrendingDown },
};

export function StockTwitsCard({ symbol, data: propData, onRefresh, loading: propLoading }) {
  const [data, setData] = useState(propData || null);
  const [loading, setLoading] = useState(propLoading || false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (propData) {
      setData(propData);
    } else if (symbol && !data) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, propData]);

  const loadData = async (refresh = false) => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const response = await sentimentAPI.getStockTwits(symbol, { refresh });
      setData(response.data);
    } catch (err) {
      console.error('Error loading StockTwits:', err);
      setError('Failed to load StockTwits data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadData(true);
    if (onRefresh) onRefresh();
  };

  if ((loading || propLoading) && !data) {
    return (
      <div className="stocktwits-card stocktwits-card--loading">
        <div className="stocktwits-header">
          <div className="header-title">
            <MessageSquare size={16} />
            <h3>StockTwits</h3>
          </div>
        </div>
        <div className="loading-state">
          <RefreshCw className="spin" size={20} />
          <span>Loading StockTwits...</span>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="stocktwits-card stocktwits-card--empty">
        <div className="stocktwits-header">
          <div className="header-title">
            <MessageSquare size={16} />
            <h3>StockTwits</h3>
          </div>
          {symbol && (
            <button onClick={handleRefresh} className="refresh-btn" disabled={loading}>
              {loading ? 'Loading...' : 'Fetch Data'}
            </button>
          )}
        </div>
        <p className="no-data-message">
          {error || 'No StockTwits data available. Click "Fetch Data" to load.'}
        </p>
      </div>
    );
  }

  const { sentiment, messages, stats } = data;
  const config = SIGNAL_CONFIG[sentiment?.signal] || SIGNAL_CONFIG.hold;
  const Icon = config.icon;

  // Calculate bullish/bearish ratio
  const totalSentiment = (stats?.bullishCount || 0) + (stats?.bearishCount || 0);
  const bullishPercent = totalSentiment > 0
    ? Math.round((stats.bullishCount / totalSentiment) * 100)
    : 50;

  return (
    <div className="stocktwits-card">
      {/* Header */}
      <div className="stocktwits-header">
        <div className="header-title">
          <MessageSquare size={16} />
          <h3>StockTwits</h3>
          {symbol && (
            <a
              href={`https://stocktwits.com/symbol/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="external-link"
              title={`View ${symbol} on StockTwits`}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
        <div className="header-actions">
          <button onClick={handleRefresh} className="refresh-btn" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Sentiment Badge */}
      <div
        className="signal-badge"
        style={{ backgroundColor: config.bg, color: config.color }}
      >
        <Icon size={20} />
        <span className="signal-label">{config.label}</span>
        {sentiment?.confidence != null && (
          <span className="signal-confidence">
            {Math.round(sentiment.confidence * 100)}% confidence
          </span>
        )}
      </div>

      {/* Bullish/Bearish Bar */}
      <div className="sentiment-bar-container">
        <div className="sentiment-bar">
          <div
            className="sentiment-bullish"
            style={{ width: `${bullishPercent}%` }}
          />
          <div
            className="sentiment-bearish"
            style={{ width: `${100 - bullishPercent}%` }}
          />
        </div>
        <div className="sentiment-bar-labels">
          <span className="bullish-label">
            <TrendingUp size={12} />
            {stats?.bullishCount || 0} Bullish ({bullishPercent}%)
          </span>
          <span className="bearish-label">
            {100 - bullishPercent}% Bearish ({stats?.bearishCount || 0})
            <TrendingDown size={12} />
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="stocktwits-stats">
        <div className="stat-item">
          <span className="stat-value">{stats?.totalMessages || 0}</span>
          <span className="stat-label">Messages</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{stats?.totalLikes || 0}</span>
          <span className="stat-label">Likes</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{stats?.uniqueUsers || 0}</span>
          <span className="stat-label">Users</span>
        </div>
      </div>

      {/* Recent Messages */}
      {messages && messages.length > 0 && (
        <div className="recent-messages">
          <h4>Recent Messages</h4>
          {messages.slice(0, 5).map((msg, idx) => (
            <div key={msg.message_id || idx} className="message-item">
              <div className="message-header">
                <span
                  className="message-sentiment"
                  style={{
                    backgroundColor: msg.user_sentiment === 'Bullish'
                      ? '#10B981'
                      : msg.user_sentiment === 'Bearish'
                        ? '#EF4444'
                        : '#94A3B8'
                  }}
                />
                <span className="message-user">@{msg.username || 'user'}</span>
                <span className="message-time">
                  {msg.created_at
                    ? new Date(msg.created_at).toLocaleDateString()
                    : ''}
                </span>
              </div>
              <p className="message-body">{msg.body}</p>
              {msg.likes_count > 0 && (
                <span className="message-likes">{msg.likes_count} likes</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Timestamp */}
      {data.fetchedAt && (
        <div className="stocktwits-timestamp">
          Updated: {new Date(data.fetchedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default StockTwitsCard;
