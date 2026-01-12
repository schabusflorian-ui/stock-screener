// frontend/src/components/sentiment/EnhancedTrendingTable.js
// Enhanced trending tickers table with multi-source sentiment and inline expansion

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  MessageSquare,
  Hash,
  Newspaper,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { sentimentAPI, pricesAPI } from '../../services/api';
import { WatchlistButton } from '../../components';
import './EnhancedTrendingTable.css';

// Sentiment badge with color
const SentimentBadge = ({ score, size = 'normal' }) => {
  const getClass = () => {
    if (score > 0.2) return 'very-bullish';
    if (score > 0.05) return 'bullish';
    if (score < -0.2) return 'very-bearish';
    if (score < -0.05) return 'bearish';
    return 'neutral';
  };

  return (
    <span className={`sentiment-badge ${getClass()} ${size}`}>
      {score > 0 ? '+' : ''}{(score * 100).toFixed(0)}
    </span>
  );
};

// Mini sentiment indicator for source columns
const MiniSentiment = ({ score, count, icon: Icon, tooltip }) => {
  if (!count || count === 0) {
    return <span className="mini-sentiment empty">-</span>;
  }

  const color = score > 0.05 ? 'var(--positive)' : score < -0.05 ? 'var(--negative)' : 'var(--text-tertiary)';

  return (
    <span className="mini-sentiment" title={tooltip} style={{ color }}>
      <Icon size={12} />
      <span className="mini-value">{score > 0 ? '+' : ''}{(score * 100).toFixed(0)}</span>
      <span className="mini-count">({count})</span>
    </span>
  );
};

// Momentum indicator
const MomentumIndicator = ({ momentum }) => {
  if (!momentum || Math.abs(momentum) < 0.01) {
    return <Minus size={14} className="momentum-icon neutral" />;
  }

  if (momentum > 0) {
    return (
      <span className="momentum positive">
        <ArrowUp size={14} />
        <span>{(momentum * 100).toFixed(0)}</span>
      </span>
    );
  }

  return (
    <span className="momentum negative">
      <ArrowDown size={14} />
      <span>{Math.abs(momentum * 100).toFixed(0)}</span>
    </span>
  );
};

// Analyst signal
const AnalystSignal = ({ analyst }) => {
  if (!analyst) {
    return <span className="analyst-signal empty">-</span>;
  }

  const { buyPercent, upsidePotential } = analyst;

  const getColor = () => {
    if (buyPercent >= 80) return 'var(--positive)';
    if (buyPercent >= 60) return 'var(--accent)';
    if (buyPercent <= 30) return 'var(--negative)';
    return 'var(--text-secondary)';
  };

  return (
    <span className="analyst-signal" style={{ color: getColor() }} title={`${buyPercent?.toFixed(0)}% buy rating`}>
      <Target size={12} />
      {upsidePotential > 0 && <span>+{upsidePotential.toFixed(0)}%</span>}
    </span>
  );
};

// Expanded row detail panel
const ExpandedRowPanel = ({ ticker, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [analystData, setAnalystData] = useState(null);

  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      try {
        // Load recent posts
        const postsRes = await sentimentAPI.getPostsForTicker(ticker.symbol, '7d', 5);
        setPosts(postsRes.data.posts || []);

        // Load analyst data
        const analystRes = await pricesAPI.getMetrics(ticker.symbol);
        if (analystRes?.data?.data?.analyst) {
          setAnalystData(analystRes.data.data.analyst);
        }
      } catch (e) {
        console.error('Error loading ticker details:', e);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [ticker.symbol]);

  const formatPrice = (price) => {
    if (!price) return '-';
    return `$${price.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="expanded-panel loading">
        <RefreshCw className="spinning" size={16} />
        <span>Loading details...</span>
      </div>
    );
  }

  return (
    <div className="expanded-panel">
      <div className="expanded-header">
        <div className="expanded-title">
          <span className="expanded-symbol">{ticker.symbol}</span>
          {ticker.companyName && (
            <span className="expanded-company">{ticker.companyName}</span>
          )}
        </div>
        <Link to={`/company/${ticker.symbol}`} className="view-full-link">
          View Full Analysis <ExternalLink size={12} />
        </Link>
      </div>

      <div className="expanded-content">
        {/* Sentiment Summary */}
        <div className="expanded-section">
          <h4>Sentiment Summary</h4>
          <div className="sentiment-summary">
            <div className="summary-item">
              <span className="summary-label">Composite</span>
              <SentimentBadge score={ticker.compositeScore || 0} />
            </div>
            <div className="summary-item">
              <span className="summary-label">Trend</span>
              <MomentumIndicator momentum={ticker.momentum} />
            </div>
            <div className="summary-item">
              <span className="summary-label">Mentions</span>
              <span className="summary-value">{ticker.mentionCount?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>

        {/* Recent Posts */}
        <div className="expanded-section">
          <h4>Recent Mentions</h4>
          {posts.length > 0 ? (
            <ul className="recent-posts">
              {posts.slice(0, 3).map((post, i) => (
                <li key={i} className="post-item">
                  <span className={`post-sentiment ${post.sentimentScore > 0 ? 'positive' : post.sentimentScore < 0 ? 'negative' : ''}`}>
                    {post.sentimentScore > 0 ? '+' : ''}{(post.sentimentScore * 100).toFixed(0)}
                  </span>
                  <span className="post-title">{post.title?.substring(0, 60)}...</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-data">No recent posts found</p>
          )}
        </div>

        {/* Analyst Data */}
        <div className="expanded-section">
          <h4>Analyst Consensus</h4>
          {analystData ? (
            <div className="analyst-summary">
              <div className="analyst-item">
                <span className="analyst-label">Target</span>
                <span className="analyst-value">{formatPrice(analystData.targetMean)}</span>
              </div>
              <div className="analyst-item">
                <span className="analyst-label">Upside</span>
                <span className={`analyst-value ${analystData.upsidePotential > 0 ? 'positive' : 'negative'}`}>
                  {analystData.upsidePotential > 0 ? '+' : ''}{analystData.upsidePotential?.toFixed(1)}%
                </span>
              </div>
              <div className="analyst-item">
                <span className="analyst-label">Rating</span>
                <span className="analyst-value">{analystData.recommendation || '-'}</span>
              </div>
            </div>
          ) : (
            <p className="no-data">No analyst data available</p>
          )}
        </div>
      </div>
    </div>
  );
};

function EnhancedTrendingTable({ period = '24h', region = 'US' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'compositeScore', direction: 'desc' });
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await sentimentAPI.getTrendingEnhanced(period, 30, region);
        setData(response.data);
      } catch (err) {
        console.error('Error fetching enhanced trending:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period, region]);

  const sortedData = useMemo(() => {
    if (!data?.trending) return [];

    return [...data.trending].sort((a, b) => {
      const { key, direction } = sortConfig;
      let aVal, bVal;

      switch (key) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'mentionCount':
          aVal = a.mentionCount || 0;
          bVal = b.mentionCount || 0;
          break;
        case 'compositeScore':
          aVal = Math.abs(a.compositeScore || 0);
          bVal = Math.abs(b.compositeScore || 0);
          break;
        case 'momentum':
          aVal = a.momentum || 0;
          bVal = b.momentum || 0;
          break;
        case 'reddit':
          aVal = a.sources?.reddit?.sentiment || 0;
          bVal = b.sources?.reddit?.sentiment || 0;
          break;
        case 'stocktwits':
          aVal = a.sources?.stocktwits?.sentiment || 0;
          bVal = b.sources?.stocktwits?.sentiment || 0;
          break;
        case 'news':
          aVal = a.sources?.news?.sentiment || 0;
          bVal = b.sources?.news?.sentiment || 0;
          break;
        default:
          aVal = a[key] || 0;
          bVal = b[key] || 0;
      }

      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const handleRowClick = (ticker) => {
    setExpandedRow(expandedRow === ticker.symbol ? null : ticker.symbol);
  };

  if (loading) {
    return (
      <div className="enhanced-trending-table loading">
        <div className="loading-state">
          <RefreshCw className="spinning" size={20} />
          <span>Loading multi-source data...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="enhanced-trending-table error">
        <div className="error-state">
          Unable to load trending data
        </div>
      </div>
    );
  }

  // Hide StockTwits column for non-US regions (StockTwits is US-only)
  const showStockTwits = region === 'US';

  return (
    <div className="enhanced-trending-table">
      <div className="table-header">
        <span className="table-count">{data.count} tickers</span>
        {region !== 'US' && (
          <span className={`region-badge ${region.toLowerCase()}`}>
            {region === 'EU' ? '🇪🇺' : region === 'UK' ? '🇬🇧' : ''} {region} Sources
          </span>
        )}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('symbol')}>
                Symbol {getSortIcon('symbol')}
              </th>
              <th className="sortable" onClick={() => handleSort('mentionCount')}>
                Mentions {getSortIcon('mentionCount')}
              </th>
              <th className="sortable" onClick={() => handleSort('compositeScore')}>
                Composite {getSortIcon('compositeScore')}
              </th>
              <th className="sortable" onClick={() => handleSort('momentum')}>
                Momentum {getSortIcon('momentum')}
              </th>
              <th className="sortable source-col" onClick={() => handleSort('reddit')}>
                <MessageSquare size={12} /> Reddit {getSortIcon('reddit')}
              </th>
              {showStockTwits && (
                <th className="sortable source-col" onClick={() => handleSort('stocktwits')}>
                  <Hash size={12} /> ST {getSortIcon('stocktwits')}
                </th>
              )}
              <th className="sortable source-col" onClick={() => handleSort('news')}>
                <Newspaper size={12} /> News {getSortIcon('news')}
              </th>
              <th>
                <Target size={12} /> Analyst
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map(ticker => (
              <React.Fragment key={ticker.symbol}>
                <tr
                  className={expandedRow === ticker.symbol ? 'expanded' : ''}
                  onClick={() => handleRowClick(ticker)}
                >
                  <td className="symbol-cell">
                    <Link to={`/company/${ticker.symbol}`} className="symbol-link" onClick={e => e.stopPropagation()}>
                      {ticker.symbol}
                    </Link>
                    {ticker.companyName && (
                      <span className="company-name">{ticker.companyName}</span>
                    )}
                  </td>
                  <td className="mentions-cell">
                    {ticker.mentionCount?.toLocaleString() || 0}
                  </td>
                  <td className="composite-cell">
                    <SentimentBadge score={ticker.compositeScore || 0} />
                  </td>
                  <td className="momentum-cell">
                    <MomentumIndicator momentum={ticker.momentum} />
                  </td>
                  <td className="source-cell">
                    <MiniSentiment
                      score={ticker.sources?.reddit?.sentiment}
                      count={ticker.sources?.reddit?.postCount}
                      icon={MessageSquare}
                      tooltip={`Reddit: ${ticker.sources?.reddit?.postCount || 0} posts`}
                    />
                  </td>
                  {showStockTwits && (
                    <td className="source-cell">
                      <MiniSentiment
                        score={ticker.sources?.stocktwits?.sentiment}
                        count={ticker.sources?.stocktwits?.messageCount}
                        icon={Hash}
                        tooltip={`StockTwits: ${ticker.sources?.stocktwits?.messageCount || 0} messages`}
                      />
                    </td>
                  )}
                  <td className="source-cell">
                    <MiniSentiment
                      score={ticker.sources?.news?.sentiment}
                      count={ticker.sources?.news?.articleCount}
                      icon={Newspaper}
                      tooltip={`News: ${ticker.sources?.news?.articleCount || 0} articles`}
                    />
                  </td>
                  <td className="analyst-cell">
                    <AnalystSignal analyst={ticker.analyst} />
                  </td>
                  <td className="actions-cell" onClick={e => e.stopPropagation()}>
                    <WatchlistButton symbol={ticker.symbol} size="small" />
                  </td>
                </tr>
                {expandedRow === ticker.symbol && (
                  <tr className="expanded-row">
                    <td colSpan={showStockTwits ? 9 : 8}>
                      <ExpandedRowPanel
                        ticker={ticker}
                        onClose={() => setExpandedRow(null)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {sortedData.length === 0 && (
        <div className="no-data">
          No trending tickers found for this period
        </div>
      )}
    </div>
  );
}

export default EnhancedTrendingTable;
