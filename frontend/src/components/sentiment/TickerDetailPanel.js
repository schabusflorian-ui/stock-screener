// frontend/src/components/sentiment/TickerDetailPanel.js
// Expandable panel showing detailed sentiment breakdown for a selected ticker

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  X, MessageSquare, Hash, Newspaper, Target, Users,
  TrendingUp, TrendingDown, ExternalLink, RefreshCw
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { sentimentAPI, pricesAPI } from '../../services/api';
import './TickerDetailPanel.css';

// Source breakdown bar
const SourceBar = ({ label, icon: Icon, score, color }) => {
  const percentage = ((score + 1) / 2) * 100;
  const isPositive = score > 0.05;
  const isNegative = score < -0.05;

  return (
    <div className="source-bar-row">
      <div className="source-bar-label">
        <Icon size={12} style={{ color }} />
        <span>{label}</span>
      </div>
      <div className="source-bar-track">
        <div
          className="source-bar-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: isPositive ? 'var(--positive)' : isNegative ? 'var(--negative)' : 'var(--text-tertiary)'
          }}
        />
      </div>
      <div className={`source-bar-value ${isPositive ? 'positive' : isNegative ? 'negative' : ''}`}>
        {isPositive ? '+' : ''}{(score * 100).toFixed(0)}
      </div>
    </div>
  );
};

// Post item
const PostItem = ({ post }) => {
  const isPositive = (post.sentiment_score || 0) > 0.05;
  const isNegative = (post.sentiment_score || 0) < -0.05;

  return (
    <a
      href={`https://reddit.com${post.permalink}`}
      target="_blank"
      rel="noopener noreferrer"
      className="post-item"
    >
      <div className="post-title">{post.title}</div>
      <div className="post-meta">
        <span className="subreddit">r/{post.subreddit}</span>
        <span className={`sentiment ${isPositive ? 'positive' : isNegative ? 'negative' : ''}`}>
          {isPositive ? '+' : ''}{((post.sentiment_score || 0) * 100).toFixed(0)}
        </span>
        <span className="score">{post.score} pts</span>
        {post.has_rockets && <span className="rocket">🚀</span>}
      </div>
    </a>
  );
};

function TickerDetailPanel({ ticker, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    posts: [],
    news: [],
    stocktwits: [],
    analyst: null,
    history: [],
    combined: null,
  });

  useEffect(() => {
    if (!ticker?.symbol) return;

    const fetchDetails = async () => {
      setLoading(true);
      try {
        // Fetch all data in parallel
        const [postsRes, newsRes, stocktwitsRes, analystRes, historyRes, combinedRes] = await Promise.allSettled([
          sentimentAPI.getPostsForTicker(ticker.symbol, '7d', 10),
          sentimentAPI.getNewsForTicker(ticker.symbol, 10),
          sentimentAPI.getStockTwitsForTicker(ticker.symbol, 10),
          pricesAPI.getMetrics(ticker.symbol),
          sentimentAPI.getHistory(ticker.symbol, 7),
          sentimentAPI.getCombined(ticker.symbol),
        ]);

        setData({
          posts: postsRes.status === 'fulfilled' ? (postsRes.value.data.posts || []) : [],
          news: newsRes.status === 'fulfilled' ? (newsRes.value.data.articles || newsRes.value.data.news || []) : [],
          stocktwits: stocktwitsRes.status === 'fulfilled' ? (stocktwitsRes.value.data.messages || []) : [],
          analyst: analystRes.status === 'fulfilled' ? analystRes.value.data?.data?.analyst : null,
          history: historyRes.status === 'fulfilled' ? (historyRes.value.data.history || []) : [],
          combined: combinedRes.status === 'fulfilled' ? combinedRes.value.data : null,
        });
      } catch (err) {
        console.error('Error fetching ticker details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [ticker?.symbol]);

  if (!ticker) return null;

  return (
    <div className="ticker-detail-panel">
      <div className="panel-header">
        <div className="ticker-info">
          <Link to={`/company/${ticker.symbol}`} className="ticker-symbol">
            {ticker.symbol}
          </Link>
          <span className="ticker-name">{ticker.companyName}</span>
        </div>
        <button className="close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <RefreshCw className="spinning" size={20} />
          <span>Loading details...</span>
        </div>
      ) : (
        <div className="panel-content">
          <div className="panel-grid">
            {/* Source Breakdown */}
            <div className="detail-section">
              <h4>Source Breakdown</h4>
              <div className="source-bars">
                <SourceBar
                  label="Reddit"
                  icon={MessageSquare}
                  score={data.combined?.sources?.reddit?.sentiment || ticker.avgSentiment || 0}
                  color="#ff4500"
                />
                <SourceBar
                  label="StockTwits"
                  icon={Hash}
                  score={data.combined?.sources?.stocktwits?.sentiment || 0}
                  color="#00bfff"
                />
                <SourceBar
                  label="News"
                  icon={Newspaper}
                  score={data.combined?.sources?.news?.sentiment || 0}
                  color="#10b981"
                />
                <SourceBar
                  label="Combined"
                  icon={TrendingUp}
                  score={data.combined?.combined?.sentiment || ticker.avgSentiment || 0}
                  color="var(--brand-primary)"
                />
              </div>
            </div>

            {/* Analyst Consensus */}
            <div className="detail-section">
              <h4>Analyst Consensus</h4>
              {data.analyst ? (
                <div className="analyst-info">
                  <div className="analyst-row">
                    <Target size={14} />
                    <span>Price Target</span>
                    <strong>${data.analyst.targetMean?.toFixed(2)}</strong>
                  </div>
                  <div className="analyst-row">
                    <span>Current</span>
                    <strong>${data.analyst.currentPrice?.toFixed(2)}</strong>
                  </div>
                  <div className={`analyst-row ${data.analyst.upsidePotential > 0 ? 'positive' : 'negative'}`}>
                    {data.analyst.upsidePotential > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    <span>Upside</span>
                    <strong>{data.analyst.upsidePotential?.toFixed(1)}%</strong>
                  </div>
                  <div className="analyst-row">
                    <Users size={14} />
                    <span>Buy Consensus</span>
                    <strong>{data.analyst.buyPercent?.toFixed(0)}%</strong>
                  </div>
                  <div className="analyst-row muted">
                    <span>{data.analyst.numberOfAnalysts} analysts</span>
                  </div>
                </div>
              ) : (
                <div className="empty-section">No analyst data</div>
              )}
            </div>

            {/* Sentiment History */}
            <div className="detail-section wide">
              <h4>7-Day Sentiment</h4>
              {data.history.length > 0 ? (
                <div className="history-chart">
                  <ResponsiveContainer width="100%" height={100}>
                    <AreaChart data={data.history}>
                      <defs>
                        <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis domain={[-1, 1]} hide />
                      <Tooltip
                        formatter={(value) => [`${(value * 100).toFixed(0)}`, 'Sentiment']}
                        labelFormatter={(label) => label}
                      />
                      <Area
                        type="monotone"
                        dataKey="avgSentiment"
                        stroke="var(--brand-primary)"
                        fillOpacity={1}
                        fill="url(#sentimentGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-section">No history data</div>
              )}
            </div>

            {/* Recent Posts */}
            <div className="detail-section">
              <h4>Recent Posts</h4>
              {data.posts.length > 0 ? (
                <div className="posts-list">
                  {data.posts.slice(0, 5).map((post, idx) => (
                    <PostItem key={post.post_id || idx} post={post} />
                  ))}
                </div>
              ) : (
                <div className="empty-section">No recent posts</div>
              )}
            </div>

            {/* Recent News */}
            <div className="detail-section">
              <h4>Recent News</h4>
              {data.news.length > 0 ? (
                <div className="news-list">
                  {data.news.slice(0, 5).map((article, idx) => (
                    <a
                      key={idx}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-item"
                    >
                      <div className="news-title">{article.title}</div>
                      <div className="news-meta">
                        <span className="source">{article.source}</span>
                        <ExternalLink size={10} />
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-section">No recent news</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TickerDetailPanel;
