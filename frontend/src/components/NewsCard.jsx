import React, { useState, useEffect, memo } from 'react';
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus, RefreshCw } from './icons';
import { sentimentAPI } from '../services/api';
import { useAskAI } from '../hooks/useAskAI';
import './NewsCard.css';

const getSentimentColor = (score) => {
  if (score > 0.2) return '#10B981';
  if (score > 0.05) return '#34D399';
  if (score < -0.2) return '#EF4444';
  if (score < -0.05) return '#F87171';
  return '#94A3B8';
};

const getSentimentIcon = (score) => {
  if (score > 0.1) return TrendingUp;
  if (score < -0.1) return TrendingDown;
  return Minus;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (now - date) / (1000 * 60 * 60);

  if (diffHours < 1) return `${Math.floor(diffHours * 60)}m ago`;
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function NewsCard({ symbol }) {
  const [newsData, setNewsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ask AI context menu for news sentiment
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'news_sentiment',
    symbol,
    label: 'News Sentiment',
    avgSentiment: newsData?.summary?.avg_sentiment,
    articleCount: newsData?.summary?.total_articles
  }));

  useEffect(() => {
    if (symbol) {
      loadNews();
    }
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNews = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sentimentAPI.getNews(symbol, { limit: 10, refresh });
      setNewsData(response.data);
    } catch (err) {
      console.error('Error loading news:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => loadNews(true);

  if (loading && !newsData) {
    return (
      <div className="news-card news-card--loading" {...askAIProps}>
        <div className="news-header">
          <h3><Newspaper size={16} /> News Sentiment</h3>
        </div>
        <div className="news-loading">Loading news...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="news-card news-card--error" {...askAIProps}>
        <div className="news-header">
          <h3><Newspaper size={16} /> News Sentiment</h3>
        </div>
        <p className="news-error">Failed to load news</p>
      </div>
    );
  }

  const { articles = [], summary } = newsData || {};
  const avgSentiment = summary?.avg_sentiment || 0;
  const SentimentIcon = getSentimentIcon(avgSentiment);

  return (
    <div className="news-card" {...askAIProps}>
      <div className="news-header">
        <h3><Newspaper size={16} /> News Sentiment</h3>
        <button
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh news"
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Summary */}
      {summary && summary.total_articles > 0 && (
        <div className="news-summary">
          <div
            className="summary-sentiment"
            style={{ color: getSentimentColor(avgSentiment) }}
          >
            <SentimentIcon size={20} />
            <span className="sentiment-value">
              {avgSentiment > 0 ? '+' : ''}{(avgSentiment * 100).toFixed(0)}%
            </span>
          </div>
          <div className="summary-stats">
            <span className="stat positive">{summary.positive_count || 0} bullish</span>
            <span className="stat neutral">{summary.neutral_count || 0} neutral</span>
            <span className="stat negative">{summary.negative_count || 0} bearish</span>
          </div>
        </div>
      )}

      {/* Articles List */}
      {articles.length === 0 ? (
        <div className="news-empty">
          <p>No news articles yet.</p>
          <button className="fetch-btn" onClick={handleRefresh} disabled={loading}>
            {loading ? 'Fetching...' : 'Fetch News'}
          </button>
        </div>
      ) : (
        <div className="news-list">
          {articles.map((article, index) => {
            const ArticleSentimentIcon = getSentimentIcon(article.sentiment_score || 0);
            return (
              <a
                key={article.url || index}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="news-item"
              >
                <div
                  className="item-sentiment"
                  style={{ backgroundColor: getSentimentColor(article.sentiment_score || 0) }}
                >
                  <ArticleSentimentIcon size={12} />
                </div>
                <div className="item-content">
                  <span className="item-title">{article.title}</span>
                  <div className="item-meta">
                    <span className="item-source">{article.source}</span>
                    <span className="item-date">{formatDate(article.published_at)}</span>
                  </div>
                </div>
                <ExternalLink size={14} className="item-link" />
              </a>
            );
          })}
        </div>
      )}

      {articles.length > 0 && (
        <div className="news-footer">
          <span className="article-count">{summary?.total_articles || articles.length} articles this week</span>
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(NewsCard);
