import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  TrendingUp, TrendingDown, Minus,
  MessageCircle, ThumbsUp, Rocket, BookOpen, BarChart2
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine
} from 'recharts';
import { sentimentAPI } from '../services/api';
import './SentimentCard.css';

const SIGNAL_CONFIG = {
  strong_buy:  { color: '#10B981', bg: '#10B98120', label: 'Strong Buy', icon: TrendingUp },
  buy:         { color: '#34D399', bg: '#34D39920', label: 'Buy', icon: TrendingUp },
  lean_buy:    { color: '#6EE7B7', bg: '#6EE7B720', label: 'Lean Buy', icon: TrendingUp },
  hold:        { color: '#94A3B8', bg: '#94A3B820', label: 'Hold', icon: Minus },
  lean_sell:   { color: '#FCA5A5', bg: '#FCA5A520', label: 'Lean Sell', icon: TrendingDown },
  sell:        { color: '#F87171', bg: '#F8717120', label: 'Sell', icon: TrendingDown },
  strong_sell: { color: '#EF4444', bg: '#EF444420', label: 'Strong Sell', icon: TrendingDown },
};

export function SentimentCard({ data, onRefresh, loading, symbol }) {
  const [showChart, setShowChart] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (showChart && symbol && historyData.length === 0) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChart, symbol]);

  const loadHistory = async () => {
    if (!symbol) return;
    setHistoryLoading(true);
    try {
      const response = await sentimentAPI.getHistory(symbol, 30);
      setHistoryData(response.data.history || []);
    } catch (err) {
      console.error('Error loading sentiment history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!data || !data.analysis) {
    return (
      <div className="sentiment-card sentiment-card--empty">
        <div className="sentiment-header">
          <h3>Reddit Sentiment</h3>
          {onRefresh && (
            <button onClick={onRefresh} className="refresh-btn" disabled={loading}>
              {loading ? 'Loading...' : 'Fetch Data'}
            </button>
          )}
        </div>
        <p className="no-data-message">No sentiment data available. Click "Fetch Data" to analyze Reddit posts.</p>
      </div>
    );
  }

  const { analysis, topPosts } = data;
  const config = SIGNAL_CONFIG[analysis.signal] || SIGNAL_CONFIG.hold;
  const Icon = config.icon;

  // Format date for chart
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Prepare chart data
  const chartData = historyData.map(d => ({
    date: formatDate(d.snapshot_date),
    sentiment: Math.round((d.weighted_sentiment || d.avg_sentiment || 0) * 100),
    posts: d.post_count || 0,
    positive: d.positive_count || 0,
    negative: d.negative_count || 0,
  }));

  return (
    <div className="sentiment-card">
      {/* Header with Signal */}
      <div className="sentiment-header">
        <h3>Reddit Sentiment</h3>
        <div className="header-actions">
          {symbol && (
            <button
              onClick={() => setShowChart(!showChart)}
              className={`chart-btn ${showChart ? 'active' : ''}`}
              title="Toggle Chart"
            >
              <BarChart2 size={16} />
            </button>
          )}
          {onRefresh && (
            <button onClick={onRefresh} className="refresh-btn" disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Main Signal Badge */}
      <div
        className="signal-badge"
        style={{ backgroundColor: config.bg, color: config.color }}
      >
        <Icon size={24} />
        <span className="signal-label">{config.label}</span>
        <span className="signal-confidence">
          {Math.round(analysis.confidence * 100)}% confidence
        </span>
      </div>

      {/* Sentiment History Chart */}
      {showChart && (
        <div className="sentiment-chart-container">
          {historyLoading ? (
            <div className="chart-loading">Loading history...</div>
          ) : chartData.length === 0 ? (
            <div className="chart-empty">No history data yet. Refresh sentiment to start tracking.</div>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={config.color} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={config.color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[-100, 100]}
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => v}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value, name) => [
                    name === 'sentiment' ? `${value}%` : value,
                    name === 'sentiment' ? 'Sentiment' : name === 'posts' ? 'Posts' : name
                  ]}
                />
                <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="sentiment"
                  stroke={config.color}
                  fill="url(#sentimentGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Sentiment Meter */}
      <div className="sentiment-meter">
        <div className="meter-bar">
          <div
            className="meter-fill"
            style={{
              width: `${(analysis.weightedSentiment + 1) * 50}%`,
              backgroundColor: config.color,
            }}
          />
          <div
            className="meter-indicator"
            style={{ left: `${(analysis.weightedSentiment + 1) * 50}%` }}
          />
        </div>
        <div className="meter-labels">
          <span>Bearish</span>
          <span>Neutral</span>
          <span>Bullish</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat">
          <MessageCircle size={16} />
          <span className="stat-value">{analysis.totalPosts}</span>
          <span className="stat-label">Posts</span>
        </div>
        <div className="stat">
          <ThumbsUp size={16} />
          <span className="stat-value">{analysis.positiveCount}</span>
          <span className="stat-label">Bullish</span>
        </div>
        <div className="stat negative">
          <ThumbsUp size={16} style={{ transform: 'rotate(180deg)' }} />
          <span className="stat-value">{analysis.negativeCount}</span>
          <span className="stat-label">Bearish</span>
        </div>
        <div className="stat">
          <BookOpen size={16} />
          <span className="stat-value">{analysis.ddPosts || 0}</span>
          <span className="stat-label">DD Posts</span>
        </div>
      </div>

      {/* Buy/Sell Mentions */}
      {(analysis.buyMentions > 0 || analysis.sellMentions > 0) && (
        <div className="mention-bar">
          <div
            className="mention-buy"
            style={{ width: `${analysis.buyMentions / (analysis.buyMentions + analysis.sellMentions + 1) * 100}%` }}
          >
            {analysis.buyMentions} Buy
          </div>
          <div
            className="mention-sell"
            style={{ width: `${analysis.sellMentions / (analysis.buyMentions + analysis.sellMentions + 1) * 100}%` }}
          >
            {analysis.sellMentions} Sell
          </div>
        </div>
      )}

      {/* Rocket Count (WSB indicator) */}
      {analysis.rocketCount > 0 && (
        <div className="rocket-count">
          <Rocket size={16} />
          <span>{analysis.rocketCount} rockets spotted</span>
        </div>
      )}

      {/* Top Posts */}
      {topPosts && topPosts.length > 0 && (
        <div className="top-posts">
          <h4>Top Posts</h4>
          {topPosts.slice(0, 5).map(post => (
            <a
              key={post.post_id}
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="post-item"
            >
              <span
                className="post-sentiment"
                style={{
                  backgroundColor: post.sentiment_score > 0.1
                    ? '#10B981'
                    : post.sentiment_score < -0.1
                      ? '#EF4444'
                      : '#94A3B8'
                }}
              />
              <span className="post-title">{post.title}</span>
              <span className="post-meta">
                r/{post.subreddit} · {post.score} pts
                {post.is_dd ? ' · DD' : ''}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

SentimentCard.propTypes = {
  data: PropTypes.shape({
    analysis: PropTypes.shape({
      signal: PropTypes.string,
      confidence: PropTypes.number,
      weightedSentiment: PropTypes.number,
      totalPosts: PropTypes.number,
      positiveCount: PropTypes.number,
      negativeCount: PropTypes.number,
      ddPosts: PropTypes.number,
      buyMentions: PropTypes.number,
      sellMentions: PropTypes.number,
      rocketCount: PropTypes.number
    }),
    topPosts: PropTypes.arrayOf(PropTypes.shape({
      post_id: PropTypes.string,
      title: PropTypes.string,
      permalink: PropTypes.string,
      sentiment_score: PropTypes.number,
      subreddit: PropTypes.string,
      score: PropTypes.number,
      is_dd: PropTypes.bool
    }))
  }),
  onRefresh: PropTypes.func,
  loading: PropTypes.bool,
  symbol: PropTypes.string
};

SentimentCard.defaultProps = {
  data: null,
  onRefresh: null,
  loading: false,
  symbol: null
};

export default SentimentCard;
