// frontend/src/pages/TrendingTickersPage.js
// Redesigned multi-source social sentiment trends page
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Line, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, RefreshCw, MessageCircle,
  MessageSquare, Newspaper, Activity, ArrowUpRight, ArrowDownRight,
  Clock, AlertCircle, ExternalLink, History, Target
} from 'lucide-react';
import { sentimentAPI, pricesAPI } from '../services/api';
import { PageHeader } from '../components/ui';
import { WatchlistButton } from '../components';
import { useFormatters } from '../hooks/useFormatters';
import MarketSentimentCard from '../components/MarketSentimentCard';
import './TrendingTickersPage.css';

// Sentiment badge component
const SentimentBadge = ({ score }) => {
  const getClass = () => {
    if (score > 0.2) return 'sentiment-very-bullish';
    if (score > 0.05) return 'sentiment-bullish';
    if (score < -0.2) return 'sentiment-very-bearish';
    if (score < -0.05) return 'sentiment-bearish';
    return 'sentiment-neutral';
  };

  const getLabel = () => {
    if (score > 0.2) return 'Very Bullish';
    if (score > 0.05) return 'Bullish';
    if (score < -0.2) return 'Very Bearish';
    if (score < -0.05) return 'Bearish';
    return 'Neutral';
  };

  return (
    <span className={`sentiment-badge ${getClass()}`}>
      {getLabel()}
    </span>
  );
};

// Signal badge
const SignalBadge = ({ signal }) => {
  const config = {
    strong_buy: { color: '#10B981', label: 'Strong Buy' },
    buy: { color: '#34D399', label: 'Buy' },
    lean_buy: { color: '#6EE7B7', label: 'Lean Buy' },
    hold: { color: '#94A3B8', label: 'Hold' },
    lean_sell: { color: '#FCA5A5', label: 'Lean Sell' },
    sell: { color: '#F87171', label: 'Sell' },
    strong_sell: { color: '#EF4444', label: 'Strong Sell' },
  };
  const cfg = config[signal] || config.hold;

  return (
    <span
      className="signal-badge"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, borderColor: cfg.color }}
    >
      {cfg.label}
    </span>
  );
};

// Sentiment meter mini component
const SentimentMeter = ({ score }) => {
  const percentage = ((score + 1) / 2) * 100;
  return (
    <div className="sentiment-meter-mini">
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{
            width: `${percentage}%`,
            background: score > 0 ? 'var(--positive)' : score < 0 ? 'var(--negative)' : 'var(--text-tertiary)'
          }}
        />
      </div>
      <span className={`meter-value ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}`}>
        {score > 0 ? '+' : ''}{(score * 100).toFixed(0)}
      </span>
    </div>
  );
};

// Source icon component
const SourceIcon = ({ source, size = 14 }) => {
  switch (source) {
    case 'reddit': return <MessageCircle size={size} color="#FF4500" />;
    case 'stocktwits': return <MessageSquare size={size} color="#00B2FF" />;
    case 'news': return <Newspaper size={size} color="#F59E0B" />;
    case 'market': return <Activity size={size} color="#8B5CF6" />;
    default: return <Activity size={size} />;
  }
};

// Subreddit badge
const SubredditBadge = ({ name }) => {
  const colors = {
    wallstreetbets: '#ff4500',
    stocks: '#0079d3',
    investing: '#46d160',
    stockmarket: '#00bfff',
    options: '#ff6b35',
    ValueInvesting: '#228b22',
    dividends: '#ffd700'
  };

  return (
    <span
      className="subreddit-badge"
      style={{ borderColor: colors[name] || 'var(--border-primary)' }}
    >
      r/{name}
    </span>
  );
};

// Mover Card Component
const MoverCard = ({ ticker, direction }) => {
  const isUp = direction === 'up';
  return (
    <div className={`mover-card ${isUp ? 'bullish' : 'bearish'}`}>
      <div className="mover-header">
        <Link to={`/company/${ticker.symbol}`} className="mover-symbol">
          {ticker.symbol}
        </Link>
        {isUp ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
      </div>
      <div className="mover-sentiment">
        {ticker.sentiment > 0 ? '+' : ''}{(ticker.sentiment * 100).toFixed(0)}
      </div>
      <div className="mover-change">
        {ticker.change > 0 ? '+' : ''}{(ticker.change * 100).toFixed(0)} pts
      </div>
    </div>
  );
};

function TrendingTickersPage() {
  const fmt = useFormatters();

  // Format date for display using preferences
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return fmt.date(dateStr);
  };

  // Core state
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Data state
  const [trending, setTrending] = useState([]);
  const [movers, setMovers] = useState({ gainers: [], losers: [] });
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [tickerPosts, setTickerPosts] = useState([]);
  const [tickerNews, setTickerNews] = useState([]);
  const [tickerStockTwits, setTickerStockTwits] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [stockTwitsLoading, setStockTwitsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'mentionCount', direction: 'desc' });
  const [sentimentHistory, setSentimentHistory] = useState([]);
  const [analystData, setAnalystData] = useState(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [topUpside, setTopUpside] = useState([]);
  const [strongBuys, setStrongBuys] = useState([]);
  const [analystListLoading, setAnalystListLoading] = useState(false);
  const [priceData, setPriceData] = useState({});

  // Sort trending data
  const sortedTrending = useMemo(() => {
    return [...trending].sort((a, b) => {
      const { key, direction } = sortConfig;
      let aVal = a[key] ?? 0;
      let bVal = b[key] ?? 0;

      if (key === 'symbol') {
        aVal = aVal.toString();
        bVal = bVal.toString();
        return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [trending, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  // Stats derived from data
  const stats = useMemo(() => ({
    totalMentions: trending.reduce((sum, t) => sum + (t.mentionCount || 0), 0),
    totalPosts: trending.reduce((sum, t) => sum + (t.uniquePosts || 0), 0),
    avgSentiment: trending.length > 0
      ? trending.reduce((sum, t) => sum + (t.avgSentiment || 0), 0) / trending.length
      : 0,
    bullishCount: trending.filter(t => (t.avgSentiment || 0) > 0.05).length,
    bearishCount: trending.filter(t => (t.avgSentiment || 0) < -0.05).length
  }), [trending]);

  // Load trending data
  const loadTrending = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await sentimentAPI.getTrending(period, 50, forceRefresh);
      const trendingData = response.data.trending || [];
      setTrending(trendingData);

      if (trendingData.length > 0) {
        setLastRefreshed(trendingData[0].calculatedAt);

        // Calculate movers (biggest sentiment changes)
        const sorted = [...trendingData].sort((a, b) =>
          (b.avgSentiment || 0) - (a.avgSentiment || 0)
        );
        setMovers({
          gainers: sorted.slice(0, 5).map(t => ({
            symbol: t.symbol,
            sentiment: t.avgSentiment || 0,
            change: t.avgSentiment || 0, // Would need historical data for real change
            mentions: t.mentionCount
          })),
          losers: sorted.slice(-5).reverse().map(t => ({
            symbol: t.symbol,
            sentiment: t.avgSentiment || 0,
            change: t.avgSentiment || 0,
            mentions: t.mentionCount
          }))
        });
      }

      // Load prices for trending symbols in background
      const symbols = trendingData.map(t => t.symbol).slice(0, 30);
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await pricesAPI.getMetrics(symbol);
            if (res?.data?.data) {
              setPriceData(prev => ({ ...prev, [symbol]: res.data.data }));
            }
          } catch (e) {
            // Ignore individual price fetch errors
          }
        })
      );
    } catch (err) {
      console.error('Error loading trending:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  // Load posts for selected ticker
  const loadTickerPosts = useCallback(async (symbol) => {
    setPostsLoading(true);
    try {
      const response = await sentimentAPI.getPosts(symbol, { limit: 20, sort: 'score' });
      setTickerPosts(response.data.posts || []);
    } catch (err) {
      console.error('Error loading posts:', err);
      setTickerPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  // Load news for selected ticker
  const loadTickerNews = useCallback(async (symbol) => {
    setNewsLoading(true);
    try {
      const response = await sentimentAPI.getNews(symbol, { limit: 10 });
      setTickerNews(response.data.articles || []);
    } catch (err) {
      console.error('Error loading news:', err);
      setTickerNews([]);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  // Load StockTwits for selected ticker
  const loadTickerStockTwits = useCallback(async (symbol) => {
    setStockTwitsLoading(true);
    try {
      const response = await sentimentAPI.getStockTwits(symbol, { limit: 20 });
      setTickerStockTwits(response.data.messages || []);
    } catch (err) {
      console.error('Error loading StockTwits:', err);
      setTickerStockTwits([]);
    } finally {
      setStockTwitsLoading(false);
    }
  }, []);

  // Load sentiment history for selected ticker
  const loadSentimentHistory = useCallback(async (symbol) => {
    try {
      const response = await sentimentAPI.getHistory(symbol, 30);
      // Map API response to chart-friendly format
      const history = (response.data.history || []).map(item => ({
        date: item.snapshot_date,
        sentiment: item.avg_sentiment || item.weighted_sentiment || 0,
        mentions: item.post_count || 0,
        signal: item.signal,
        positive: item.positive_count || 0,
        negative: item.negative_count || 0,
      }));
      setSentimentHistory(history);
    } catch (err) {
      console.error('Error loading sentiment history:', err);
      setSentimentHistory([]);
    }
  }, []);

  // Load analyst data for selected ticker
  const loadAnalystData = useCallback(async (symbol) => {
    setAnalystLoading(true);
    try {
      const response = await sentimentAPI.getAnalyst(symbol);
      const data = response.data;

      // Flatten the nested response for easier access in the component
      if (data && data.priceTargets) {
        setAnalystData({
          current_price: data.priceTargets.current,
          target_high: data.priceTargets.targetHigh,
          target_low: data.priceTargets.targetLow,
          target_mean: data.priceTargets.targetMean,
          target_median: data.priceTargets.targetMedian,
          number_of_analysts: data.priceTargets.numberOfAnalysts,
          recommendation_key: data.priceTargets.recommendationKey,
          recommendation_mean: data.priceTargets.recommendationMean,
          upside_potential: data.priceTargets.upsidePotential,
          strong_buy: data.recommendations?.strongBuy || 0,
          buy: data.recommendations?.buy || 0,
          hold: data.recommendations?.hold || 0,
          sell: data.recommendations?.sell || 0,
          strong_sell: data.recommendations?.strongSell || 0,
          buy_percent: data.recommendations?.buyPercent,
          hold_percent: data.recommendations?.holdPercent,
          sell_percent: data.recommendations?.sellPercent,
          earnings_beat_rate: data.earningsBeatRate,
          signal: data.signal?.signal,
          signal_strength: data.signal?.strength,
          signal_confidence: data.signal?.confidence,
        });
      } else {
        setAnalystData(null);
      }
    } catch (err) {
      console.error('Error loading analyst data:', err);
      setAnalystData(null);
    } finally {
      setAnalystLoading(false);
    }
  }, []);

  // Load analyst lists (top upside & strong buys)
  const loadAnalystLists = useCallback(async () => {
    setAnalystListLoading(true);
    try {
      const [upsideRes, strongBuyRes] = await Promise.all([
        sentimentAPI.getAnalystTopUpside(15),
        sentimentAPI.getAnalystStrongBuy(15)
      ]);
      setTopUpside(upsideRes.data.stocks || []);
      setStrongBuys(strongBuyRes.data.stocks || []);
    } catch (err) {
      console.error('Error loading analyst lists:', err);
    } finally {
      setAnalystListLoading(false);
    }
  }, []);

  const handleRowClick = useCallback((symbol) => {
    setSelectedTicker(symbol);
  }, []);

  useEffect(() => {
    loadTrending();
  }, [loadTrending]);

  useEffect(() => {
    if (selectedTicker) {
      loadTickerPosts(selectedTicker);
      loadTickerNews(selectedTicker);
      loadTickerStockTwits(selectedTicker);
      loadSentimentHistory(selectedTicker);
      loadAnalystData(selectedTicker);
    }
  }, [selectedTicker, loadTickerPosts, loadTickerNews, loadTickerStockTwits, loadSentimentHistory, loadAnalystData]);

  // Load analyst lists when analyst or overview tab is activated
  useEffect(() => {
    if ((activeTab === 'analyst' || activeTab === 'overview') && topUpside.length === 0 && strongBuys.length === 0) {
      loadAnalystLists();
    }
  }, [activeTab, loadAnalystLists, topUpside.length, strongBuys.length]);

  // Chart data
  const sentimentDistribution = [
    { name: 'Bullish', value: stats.bullishCount, color: '#10b981' },
    { name: 'Neutral', value: trending.length - stats.bullishCount - stats.bearishCount, color: '#6b7280' },
    { name: 'Bearish', value: stats.bearishCount, color: '#ef4444' }
  ];

  const topMentionedChart = trending.slice(0, 10).map(t => ({
    symbol: t.symbol,
    mentions: t.mentionCount || 0,
    sentiment: (t.avgSentiment || 0) * 100
  }));

  // Use formatter's relativeTime for relative dates
  const formatRelativeDate = (dateStr) => {
    if (!dateStr) return '-';
    return fmt.relativeTime(dateStr);
  };

  // Loading state
  if (loading) {
    return (
      <div className="trending-page">
        <div className="loading-overlay">
          <div className="spinner"></div>
          <span>Loading sentiment data...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="trending-page error-state">
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>Error loading trending data: {error}</span>
          <button onClick={() => loadTrending()}>Retry</button>
        </div>
      </div>
    );
  }

  // Empty state
  if (trending.length === 0) {
    return (
      <div className="trending-page">
        <div className="page-header">
          <div className="header-content">
            <h1>Social Sentiment Trends</h1>
            <p className="subtitle">Multi-source sentiment analysis from Reddit, StockTwits & News</p>
          </div>
        </div>
        <div className="empty-state-card">
          <Activity size={48} className="empty-icon" />
          <h2>No Sentiment Data Yet</h2>
          <p>Click below to scan social media for trending stock mentions. This may take 1-2 minutes.</p>
          <button
            className="btn-primary btn-large"
            onClick={() => loadTrending(true)}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Scanning...' : 'Scan Social Media'}
          </button>
          {refreshing && (
            <p className="scanning-note">Scanning Reddit, StockTwits, and news sources...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="trending-page">
      {/* Header */}
      <PageHeader
        title="Social Sentiment Trends"
        subtitle={
          <>
            Multi-source sentiment analysis
            {lastRefreshed && (
              <span className="last-refreshed">
                <Clock size={12} /> Updated {formatDate(lastRefreshed)}
              </span>
            )}
          </>
        }
        actions={
          <div className="header-actions">
            <div className="period-selector">
              {['24h', '7d', '30d'].map(p => (
                <button
                  key={p}
                  className={period === p ? 'active' : ''}
                  onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            className="btn-refresh"
            onClick={() => loadTrending(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
        }
      />

      {/* Tab Navigation */}
      <div className="main-tabs">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'reddit', label: 'Reddit', icon: MessageCircle },
          { id: 'stocktwits', label: 'StockTwits', icon: MessageSquare },
          { id: 'news', label: 'News', icon: Newspaper },
          { id: 'analyst', label: 'Analyst', icon: Target },
          { id: 'history', label: 'History', icon: History },
        ].map(tab => (
          <button
            key={tab.id}
            className={`main-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Market Context */}
          <div className="market-sentiment-section">
            <MarketSentimentCard />
          </div>

          {/* Source Summary Cards */}
          <div className="sources-overview-section">
            <h2 className="section-title">Data Sources Overview</h2>
            <div className="sources-grid">
              {/* Reddit Summary */}
              <div className="source-summary-card" onClick={() => setActiveTab('reddit')}>
                <div className="source-header">
                  <MessageCircle size={18} className="source-icon reddit" />
                  <span className="source-name">Reddit</span>
                </div>
                <div className="source-stats">
                  <div className="source-stat">
                    <span className="stat-value">{trending.length}</span>
                    <span className="stat-label">Trending</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-value">{stats.totalMentions.toLocaleString()}</span>
                    <span className="stat-label">Mentions</span>
                  </div>
                  <div className={`source-stat ${stats.avgSentiment > 0 ? 'positive' : stats.avgSentiment < 0 ? 'negative' : ''}`}>
                    <span className="stat-value">{stats.avgSentiment > 0 ? '+' : ''}{(stats.avgSentiment * 100).toFixed(0)}%</span>
                    <span className="stat-label">Avg Sentiment</span>
                  </div>
                </div>
                {movers.gainers.length > 0 && (
                  <div className="source-top-ticker">
                    <span className="top-label">Top Bullish:</span>
                    <Link to={`/company/${movers.gainers[0].symbol}`} className="top-symbol" onClick={e => e.stopPropagation()}>
                      {movers.gainers[0].symbol}
                    </Link>
                    <span className="top-sentiment positive">+{(movers.gainers[0].sentiment * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>

              {/* StockTwits Summary */}
              <div className="source-summary-card" onClick={() => setActiveTab('stocktwits')}>
                <div className="source-header">
                  <MessageSquare size={18} className="source-icon stocktwits" />
                  <span className="source-name">StockTwits</span>
                </div>
                <div className="source-stats">
                  <div className="source-stat">
                    <span className="stat-value">Live</span>
                    <span className="stat-label">Status</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-value">Per Stock</span>
                    <span className="stat-label">Data</span>
                  </div>
                </div>
                <div className="source-description">
                  Real-time trader sentiment and message volume
                </div>
              </div>

              {/* News Summary */}
              <div className="source-summary-card" onClick={() => setActiveTab('news')}>
                <div className="source-header">
                  <Newspaper size={18} className="source-icon news" />
                  <span className="source-name">News</span>
                </div>
                <div className="source-stats">
                  <div className="source-stat">
                    <span className="stat-value">Live</span>
                    <span className="stat-label">Status</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-value">Per Stock</span>
                    <span className="stat-label">Data</span>
                  </div>
                </div>
                <div className="source-description">
                  Financial news sentiment analysis
                </div>
              </div>

              {/* Analyst Summary */}
              <div className="source-summary-card" onClick={() => setActiveTab('analyst')}>
                <div className="source-header">
                  <Target size={18} className="source-icon analyst" />
                  <span className="source-name">Analyst</span>
                </div>
                <div className="source-stats">
                  <div className="source-stat">
                    <span className="stat-value">{topUpside.length || '-'}</span>
                    <span className="stat-label">Top Upside</span>
                  </div>
                  <div className="source-stat">
                    <span className="stat-value">{strongBuys.length || '-'}</span>
                    <span className="stat-label">Strong Buys</span>
                  </div>
                </div>
                {topUpside.length > 0 && (
                  <div className="source-top-ticker">
                    <span className="top-label">Top Upside:</span>
                    <Link to={`/company/${topUpside[0].symbol}`} className="top-symbol" onClick={e => e.stopPropagation()}>
                      {topUpside[0].symbol}
                    </Link>
                    <span className="top-sentiment positive">+{topUpside[0].upside_potential?.toFixed(0)}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Social Sentiment Movers Row */}
          <div className="movers-section">
            <h2 className="section-title">Social Sentiment Movers <span className="source-tag">Reddit</span></h2>
            <div className="movers-row">
              <div className="movers-column">
                <h3 className="movers-title bullish">
                  <TrendingUp size={16} /> Most Bullish
                </h3>
                <div className="movers-list">
                  {movers.gainers.map(ticker => (
                    <MoverCard key={ticker.symbol} ticker={ticker} direction="up" />
                  ))}
                </div>
              </div>
              <div className="movers-column">
                <h3 className="movers-title bearish">
                  <TrendingDown size={16} /> Most Bearish
                </h3>
                <div className="movers-list">
                  {movers.losers.map(ticker => (
                    <MoverCard key={ticker.symbol} ticker={ticker} direction="down" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Analyst Highlights */}
          {(topUpside.length > 0 || strongBuys.length > 0) && (
            <div className="analyst-highlights-section">
              <h2 className="section-title">Analyst Highlights <span className="source-tag">Yahoo Finance</span></h2>
              <div className="analyst-highlights-row">
                <div className="highlight-column">
                  <h3 className="highlight-title">
                    <ArrowUpRight size={16} color="#10B981" /> Highest Upside Potential
                  </h3>
                  <div className="highlight-list">
                    {topUpside.slice(0, 5).map((stock, idx) => (
                      <Link key={stock.symbol} to={`/company/${stock.symbol}`} className="highlight-item">
                        <span className="rank">{idx + 1}</span>
                        <span className="symbol">{stock.symbol}</span>
                        <span className="upside positive">+{stock.upside_potential?.toFixed(0)}%</span>
                        <span className="target">${stock.target_mean?.toFixed(0)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="highlight-column">
                  <h3 className="highlight-title">
                    <Target size={16} color="#6366F1" /> Strong Buy Consensus
                  </h3>
                  <div className="highlight-list">
                    {strongBuys.slice(0, 5).map((stock, idx) => (
                      <Link key={stock.symbol} to={`/company/${stock.symbol}`} className="highlight-item">
                        <span className="rank">{idx + 1}</span>
                        <span className="symbol">{stock.symbol}</span>
                        <span className="buy-pct">{stock.buy_percent?.toFixed(0)}% Buy</span>
                        <SignalBadge signal={stock.signal} />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Social Sentiment Stats - Combined Sources */}
          <div className="stats-section">
            <h2 className="section-title">Social Sentiment Stats</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-value">{trending.length}</span>
                <span className="stat-label">Trending Tickers</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.totalMentions.toLocaleString()}</span>
                <span className="stat-label">Reddit Mentions</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.totalPosts.toLocaleString()}</span>
                <span className="stat-label">Reddit Posts</span>
              </div>
              <div className="stat-card positive">
                <span className="stat-value">{stats.bullishCount}</span>
                <span className="stat-label">Bullish Tickers</span>
              </div>
              <div className="stat-card negative">
                <span className="stat-value">{stats.bearishCount}</span>
                <span className="stat-label">Bearish Tickers</span>
              </div>
              <div className={`stat-card ${stats.avgSentiment > 0 ? 'positive' : stats.avgSentiment < 0 ? 'negative' : ''}`}>
                <span className="stat-value">
                  {stats.avgSentiment > 0 ? '+' : ''}{(stats.avgSentiment * 100).toFixed(1)}
                </span>
                <span className="stat-label">Avg Sentiment</span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="charts-row">
            <div className="card chart-card">
              <h3>Most Mentioned Stocks</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topMentionedChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <YAxis
                    dataKey="symbol"
                    type="category"
                    width={50}
                    tick={{ fill: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                    formatter={(value, name) => [value, name === 'mentions' ? 'Mentions' : 'Sentiment']}
                  />
                  <Bar dataKey="mentions" fill="var(--brand-primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card chart-card pie-card">
              <h3>Sentiment Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sentimentDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {sentimentDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Full Trending Table */}
          <div className="card trending-table-card full-width">
            <div className="card-header">
              <h3>All Trending Tickers</h3>
              <span className="ticker-count">{trending.length} tickers</span>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sortable" onClick={() => handleSort('symbol')}>
                      Symbol{getSortIndicator('symbol')}
                    </th>
                    <th>Company</th>
                    <th>Price</th>
                    <th>1D</th>
                    <th className="sortable" onClick={() => handleSort('mentionCount')}>
                      Mentions{getSortIndicator('mentionCount')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('uniquePosts')}>
                      Posts{getSortIndicator('uniquePosts')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('avgSentiment')}>
                      Sentiment{getSortIndicator('avgSentiment')}
                    </th>
                    <th>Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrending.map((ticker, index) => (
                    <tr
                      key={ticker.symbol}
                      className={selectedTicker === ticker.symbol ? 'selected' : ''}
                      onClick={() => handleRowClick(ticker.symbol)}
                    >
                      <td className="rank">{index + 1}</td>
                      <td>
                        <Link
                          to={`/company/${ticker.symbol}`}
                          className="symbol-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ticker.symbol}
                        </Link>
                      </td>
                      <td className="company-name">{ticker.companyName || '-'}</td>
                      <td className="price-cell">
                        {priceData[ticker.symbol]?.last_price
                          ? `$${priceData[ticker.symbol].last_price.toFixed(2)}`
                          : '-'}
                      </td>
                      <td className={`change-cell ${
                        priceData[ticker.symbol]?.change_1d > 0 ? 'positive' :
                        priceData[ticker.symbol]?.change_1d < 0 ? 'negative' : ''
                      }`}>
                        {priceData[ticker.symbol]?.change_1d != null
                          ? `${priceData[ticker.symbol].change_1d > 0 ? '+' : ''}${priceData[ticker.symbol].change_1d.toFixed(1)}%`
                          : '-'}
                      </td>
                      <td className="highlight">{ticker.mentionCount || 0}</td>
                      <td>{ticker.uniquePosts || 0}</td>
                      <td>
                        <SentimentBadge score={ticker.avgSentiment || 0} />
                      </td>
                      <td>
                        <SentimentMeter score={ticker.avgSentiment || 0} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <WatchlistButton symbol={ticker.symbol} size="small" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Reddit Tab */}
      {activeTab === 'reddit' && (
        <div className="source-tab-content">
          <div className="content-grid">
            {/* Trending Table */}
            <div className="card trending-table-card">
              <div className="card-header">
                <h3>
                  <MessageCircle size={16} color="#FF4500" />
                  Reddit Trending
                </h3>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="sortable" onClick={() => handleSort('symbol')}>
                        Symbol{getSortIndicator('symbol')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('mentionCount')}>
                        Mentions{getSortIndicator('mentionCount')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('uniquePosts')}>
                        Posts{getSortIndicator('uniquePosts')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('avgSentiment')}>
                        Sentiment{getSortIndicator('avgSentiment')}
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrending.map((ticker, index) => (
                      <tr
                        key={ticker.symbol}
                        className={selectedTicker === ticker.symbol ? 'selected' : ''}
                        onClick={() => handleRowClick(ticker.symbol)}
                      >
                        <td className="rank">{index + 1}</td>
                        <td>
                          <span className="symbol-text">{ticker.symbol}</span>
                        </td>
                        <td className="highlight">{ticker.mentionCount || 0}</td>
                        <td>{ticker.uniquePosts || 0}</td>
                        <td>
                          <SentimentBadge score={ticker.avgSentiment || 0} />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <WatchlistButton symbol={ticker.symbol} size="small" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Posts Panel */}
            <div className="card posts-card">
              <div className="card-header">
                <h3>
                  {selectedTicker ? `Posts for $${selectedTicker}` : 'Select a ticker'}
                </h3>
                {selectedTicker && (
                  <Link to={`/company/${selectedTicker}`} className="view-company-link">
                    View Company <ExternalLink size={12} />
                  </Link>
                )}
              </div>
              {postsLoading ? (
                <div className="posts-loading">
                  <div className="spinner small"></div>
                  <span>Loading posts...</span>
                </div>
              ) : selectedTicker && tickerPosts.length === 0 ? (
                <div className="no-posts">
                  No posts found for ${selectedTicker}. Try refreshing the data.
                </div>
              ) : !selectedTicker ? (
                <div className="no-posts">
                  <MessageCircle size={32} />
                  <p>Click on a ticker to see related Reddit posts</p>
                </div>
              ) : (
                <div className="posts-list">
                  {tickerPosts.map((post) => (
                    <div key={post.post_id || post.id} className="post-item">
                      <div className="post-header">
                        <SubredditBadge name={post.subreddit} />
                        <span className="post-date">{formatRelativeDate(post.posted_at)}</span>
                        <SentimentBadge score={post.sentiment_score || 0} />
                      </div>
                      <div className="post-title">{post.title}</div>
                      {post.selftext && (
                        <p className="post-text">{post.selftext}</p>
                      )}
                      <div className="post-meta">
                        <span className="meta-item">▲ {post.score}</span>
                        <span className="meta-item">💬 {post.num_comments}</span>
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="post-link"
                        >
                          View on Reddit →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* News Tab */}
      {activeTab === 'news' && (
        <div className="source-tab-content">
          <div className="content-grid">
            {/* Trending Table (for selecting ticker) */}
            <div className="card trending-table-card">
              <div className="card-header">
                <h3>
                  <Newspaper size={16} color="#F59E0B" />
                  Select a Stock
                </h3>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="sortable" onClick={() => handleSort('symbol')}>
                        Symbol{getSortIndicator('symbol')}
                      </th>
                      <th>Company</th>
                      <th className="sortable" onClick={() => handleSort('mentionCount')}>
                        Mentions{getSortIndicator('mentionCount')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('avgSentiment')}>
                        Sentiment{getSortIndicator('avgSentiment')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrending.slice(0, 30).map((ticker, index) => (
                      <tr
                        key={ticker.symbol}
                        className={selectedTicker === ticker.symbol ? 'selected' : ''}
                        onClick={() => handleRowClick(ticker.symbol)}
                      >
                        <td className="rank">{index + 1}</td>
                        <td>
                          <span className="symbol-text">{ticker.symbol}</span>
                        </td>
                        <td className="company-name">{ticker.companyName || '-'}</td>
                        <td>{ticker.mentionCount || 0}</td>
                        <td>
                          <SentimentBadge score={ticker.avgSentiment || 0} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* News Panel */}
            <div className="card news-card">
              <div className="card-header">
                <h3>
                  {selectedTicker ? `News for $${selectedTicker}` : 'Select a ticker'}
                </h3>
                {selectedTicker && (
                  <Link to={`/company/${selectedTicker}`} className="view-company-link">
                    View Company <ExternalLink size={12} />
                  </Link>
                )}
              </div>
              {newsLoading ? (
                <div className="posts-loading">
                  <div className="spinner small"></div>
                  <span>Loading news...</span>
                </div>
              ) : selectedTicker && tickerNews.length === 0 ? (
                <div className="no-posts">
                  No news articles found for ${selectedTicker}.
                </div>
              ) : !selectedTicker ? (
                <div className="no-posts">
                  <Newspaper size={32} />
                  <p>Click on a ticker to see related news articles</p>
                </div>
              ) : (
                <div className="news-list">
                  {tickerNews.map((article, index) => (
                    <div key={article.id || index} className="news-item">
                      <div className="news-header">
                        <span className="news-source">{article.source || 'News'}</span>
                        <span className="news-date">{formatRelativeDate(article.published_at)}</span>
                        {article.sentiment_score != null && (
                          <SentimentBadge score={article.sentiment_score} />
                        )}
                      </div>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="news-title"
                      >
                        {article.title}
                      </a>
                      {article.summary && (
                        <p className="news-summary">{article.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* StockTwits Tab */}
      {activeTab === 'stocktwits' && (
        <div className="source-tab-content">
          <div className="content-grid">
            {/* Trending Table */}
            <div className="card trending-table-card">
              <div className="card-header">
                <h3>
                  <MessageSquare size={16} color="#00B2FF" />
                  Select a Stock
                </h3>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="sortable" onClick={() => handleSort('symbol')}>
                        Symbol{getSortIndicator('symbol')}
                      </th>
                      <th>Company</th>
                      <th className="sortable" onClick={() => handleSort('mentionCount')}>
                        Mentions{getSortIndicator('mentionCount')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('avgSentiment')}>
                        Sentiment{getSortIndicator('avgSentiment')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrending.slice(0, 30).map((ticker, index) => (
                      <tr
                        key={ticker.symbol}
                        className={selectedTicker === ticker.symbol ? 'selected' : ''}
                        onClick={() => handleRowClick(ticker.symbol)}
                      >
                        <td className="rank">{index + 1}</td>
                        <td>
                          <span className="symbol-text">{ticker.symbol}</span>
                        </td>
                        <td className="company-name">{ticker.companyName || '-'}</td>
                        <td>{ticker.mentionCount || 0}</td>
                        <td>
                          <SentimentBadge score={ticker.avgSentiment || 0} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* StockTwits Panel */}
            <div className="card posts-card">
              <div className="card-header">
                <h3>
                  {selectedTicker ? `StockTwits for $${selectedTicker}` : 'Select a ticker'}
                </h3>
                {selectedTicker && (
                  <Link to={`/company/${selectedTicker}`} className="view-company-link">
                    View Company <ExternalLink size={12} />
                  </Link>
                )}
              </div>
              {stockTwitsLoading ? (
                <div className="posts-loading">
                  <div className="spinner small"></div>
                  <span>Loading StockTwits...</span>
                </div>
              ) : selectedTicker && tickerStockTwits.length === 0 ? (
                <div className="no-posts">
                  No StockTwits messages found for ${selectedTicker}.
                </div>
              ) : !selectedTicker ? (
                <div className="no-posts">
                  <MessageSquare size={32} />
                  <p>Click on a ticker to see StockTwits messages</p>
                </div>
              ) : (
                <div className="posts-list">
                  {tickerStockTwits.map((msg, index) => (
                    <div key={msg.id || index} className="post-item">
                      <div className="post-header">
                        <span className="stocktwits-user">@{msg.user?.username || 'user'}</span>
                        <span className="post-date">{formatRelativeDate(msg.created_at)}</span>
                        {msg.sentiment && (
                          <span className={`stocktwits-sentiment ${msg.sentiment.toLowerCase()}`}>
                            {msg.sentiment}
                          </span>
                        )}
                      </div>
                      <div className="post-title">{msg.body}</div>
                      <div className="post-meta">
                        {msg.likes_count != null && <span className="meta-item">❤️ {msg.likes_count}</span>}
                        {msg.reshares_count != null && <span className="meta-item">🔄 {msg.reshares_count}</span>}
                        <a
                          href={`https://stocktwits.com/${msg.user?.username}/message/${msg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="post-link"
                        >
                          View on StockTwits →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analyst Tab */}
      {activeTab === 'analyst' && (
        <div className="source-tab-content">
          <div className="analyst-content">
            {/* Top Lists Row */}
            <div className="analyst-lists-row">
              {/* Top Upside */}
              <div className="card analyst-list-card">
                <div className="card-header">
                  <h3>
                    <TrendingUp size={16} color="#10B981" />
                    Top Upside Potential
                  </h3>
                  <span className="list-count">{topUpside.length} stocks</span>
                </div>
                {analystListLoading ? (
                  <div className="posts-loading">
                    <div className="spinner small"></div>
                    <span>Loading...</span>
                  </div>
                ) : topUpside.length > 0 ? (
                  <div className="analyst-list">
                    {topUpside.map((stock, idx) => (
                      <div
                        key={stock.symbol}
                        className={`analyst-list-item ${selectedTicker === stock.symbol ? 'selected' : ''}`}
                        onClick={() => handleRowClick(stock.symbol)}
                      >
                        <span className="rank">{idx + 1}</span>
                        <span className="symbol">{stock.symbol}</span>
                        <span className="upside positive">+{stock.upside_potential?.toFixed(0)}%</span>
                        <span className="price-target">${stock.target_mean?.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-posts">
                    <Target size={24} />
                    <p>No analyst data available yet</p>
                  </div>
                )}
              </div>

              {/* Strong Buys */}
              <div className="card analyst-list-card">
                <div className="card-header">
                  <h3>
                    <Target size={16} color="#6366F1" />
                    Strong Buy Consensus
                  </h3>
                  <span className="list-count">{strongBuys.length} stocks</span>
                </div>
                {analystListLoading ? (
                  <div className="posts-loading">
                    <div className="spinner small"></div>
                    <span>Loading...</span>
                  </div>
                ) : strongBuys.length > 0 ? (
                  <div className="analyst-list">
                    {strongBuys.map((stock, idx) => (
                      <div
                        key={stock.symbol}
                        className={`analyst-list-item ${selectedTicker === stock.symbol ? 'selected' : ''}`}
                        onClick={() => handleRowClick(stock.symbol)}
                      >
                        <span className="rank">{idx + 1}</span>
                        <span className="symbol">{stock.symbol}</span>
                        <span className="buy-pct">{stock.buy_percent?.toFixed(0)}% Buy</span>
                        <SignalBadge signal={stock.signal} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-posts">
                    <Target size={24} />
                    <p>No strong buy data available yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Selected Stock Detail */}
            {selectedTicker && (
              <div className="card analyst-detail-card">
                <div className="card-header">
                  <h3>
                    <Target size={16} />
                    ${selectedTicker} Analyst Ratings
                  </h3>
                  <Link to={`/company/${selectedTicker}`} className="view-company-link">
                    View Company <ExternalLink size={12} />
                  </Link>
                </div>

                {analystLoading ? (
                  <div className="posts-loading">
                    <div className="spinner small"></div>
                    <span>Loading analyst data...</span>
                  </div>
                ) : analystData ? (
                  <div className="analyst-detail-content">
                    {/* Price Target Section */}
                    <div className="analyst-section">
                      <h4>Price Targets</h4>
                      <div className="price-target-display">
                        <div className="current-price">
                          <span className="label">Current</span>
                          <span className="value">${analystData.current_price?.toFixed(2)}</span>
                        </div>
                        <div className="price-arrow">
                          {analystData.upside_potential > 0 ? (
                            <ArrowUpRight size={24} color="#10B981" />
                          ) : (
                            <ArrowDownRight size={24} color="#EF4444" />
                          )}
                        </div>
                        <div className="target-price">
                          <span className="label">Target (Mean)</span>
                          <span className="value">${analystData.target_mean?.toFixed(2)}</span>
                        </div>
                        <div className={`upside-badge ${analystData.upside_potential > 0 ? 'positive' : 'negative'}`}>
                          {analystData.upside_potential > 0 ? '+' : ''}{analystData.upside_potential?.toFixed(1)}%
                        </div>
                      </div>
                      <div className="price-range">
                        <div className="range-bar">
                          <div className="range-track">
                            <div
                              className="current-marker"
                              style={{
                                left: `${Math.min(100, Math.max(0, ((analystData.current_price - analystData.target_low) / (analystData.target_high - analystData.target_low)) * 100))}%`
                              }}
                            />
                          </div>
                          <div className="range-labels">
                            <span>Low: ${analystData.target_low?.toFixed(0)}</span>
                            <span>High: ${analystData.target_high?.toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recommendation Distribution */}
                    <div className="analyst-section">
                      <h4>Analyst Recommendations ({analystData.number_of_analysts} analysts)</h4>
                      <div className="recommendation-bars">
                        <div className="rec-bar-row">
                          <span className="rec-label">Strong Buy</span>
                          <div className="rec-bar-track">
                            <div
                              className="rec-bar-fill strong-buy"
                              style={{ width: `${(analystData.strong_buy / analystData.number_of_analysts) * 100}%` }}
                            />
                          </div>
                          <span className="rec-count">{analystData.strong_buy}</span>
                        </div>
                        <div className="rec-bar-row">
                          <span className="rec-label">Buy</span>
                          <div className="rec-bar-track">
                            <div
                              className="rec-bar-fill buy"
                              style={{ width: `${(analystData.buy / analystData.number_of_analysts) * 100}%` }}
                            />
                          </div>
                          <span className="rec-count">{analystData.buy}</span>
                        </div>
                        <div className="rec-bar-row">
                          <span className="rec-label">Hold</span>
                          <div className="rec-bar-track">
                            <div
                              className="rec-bar-fill hold"
                              style={{ width: `${(analystData.hold / analystData.number_of_analysts) * 100}%` }}
                            />
                          </div>
                          <span className="rec-count">{analystData.hold}</span>
                        </div>
                        <div className="rec-bar-row">
                          <span className="rec-label">Sell</span>
                          <div className="rec-bar-track">
                            <div
                              className="rec-bar-fill sell"
                              style={{ width: `${(analystData.sell / analystData.number_of_analysts) * 100}%` }}
                            />
                          </div>
                          <span className="rec-count">{analystData.sell}</span>
                        </div>
                        <div className="rec-bar-row">
                          <span className="rec-label">Strong Sell</span>
                          <div className="rec-bar-track">
                            <div
                              className="rec-bar-fill strong-sell"
                              style={{ width: `${(analystData.strong_sell / analystData.number_of_analysts) * 100}%` }}
                            />
                          </div>
                          <span className="rec-count">{analystData.strong_sell}</span>
                        </div>
                      </div>
                    </div>

                    {/* Signal Summary */}
                    <div className="analyst-section signal-section">
                      <div className="signal-row">
                        <div className="signal-item">
                          <span className="signal-label">Buy %</span>
                          <span className={`signal-value ${analystData.buy_percent >= 50 ? 'positive' : ''}`}>
                            {analystData.buy_percent?.toFixed(0)}%
                          </span>
                        </div>
                        <div className="signal-item">
                          <span className="signal-label">Recommendation</span>
                          <span className="signal-value">{analystData.recommendation_key?.replace('_', ' ')}</span>
                        </div>
                        <div className="signal-item">
                          <span className="signal-label">Signal</span>
                          <SignalBadge signal={analystData.signal} />
                        </div>
                        {analystData.earnings_beat_rate != null && (
                          <div className="signal-item">
                            <span className="signal-label">Earnings Beat Rate</span>
                            <span className={`signal-value ${analystData.earnings_beat_rate >= 75 ? 'positive' : ''}`}>
                              {analystData.earnings_beat_rate?.toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="no-posts">
                    <Target size={32} />
                    <p>No analyst data available for ${selectedTicker}</p>
                    <p className="history-note">Try refreshing or selecting a different stock</p>
                  </div>
                )}
              </div>
            )}

            {!selectedTicker && (
              <div className="card analyst-placeholder">
                <Target size={48} className="empty-icon" />
                <h3>Select a Stock</h3>
                <p>Choose a stock from the lists above to view detailed analyst ratings</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="source-tab-content">
          <div className="history-content">
            {/* Ticker Selection */}
            <div className="card ticker-select-card">
              <div className="card-header">
                <h3>
                  <History size={16} />
                  Sentiment History
                </h3>
              </div>
              <p className="history-desc">
                Select a ticker to view its sentiment trend over time
              </p>
              <div className="ticker-chips">
                {trending.slice(0, 15).map(ticker => (
                  <button
                    key={ticker.symbol}
                    className={`ticker-chip ${selectedTicker === ticker.symbol ? 'active' : ''}`}
                    onClick={() => handleRowClick(ticker.symbol)}
                  >
                    {ticker.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* History Chart */}
            {selectedTicker && (
              <div className="card history-chart-card">
                <div className="card-header">
                  <h3>
                    ${selectedTicker} Sentiment Trend (30 Days)
                  </h3>
                  <Link to={`/company/${selectedTicker}`} className="view-company-link">
                    View Company <ExternalLink size={12} />
                  </Link>
                </div>
                {sentimentHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={sentimentHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        domain={[-1, 1]}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(val) => (val * 100).toFixed(0)}
                      />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                        formatter={(value) => [(value * 100).toFixed(1), 'Sentiment']}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      />
                      <defs>
                        <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--positive)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="sentiment"
                        stroke="var(--positive)"
                        strokeWidth={2}
                        fill="url(#sentimentGradient)"
                      />
                      <Line
                        type="monotone"
                        dataKey="mentions"
                        stroke="var(--brand-primary)"
                        strokeWidth={1}
                        strokeDasharray="5 5"
                        yAxisId={1}
                        hide
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="no-posts">
                    <History size={32} />
                    <p>No historical data available for ${selectedTicker}</p>
                    <p className="history-note">Historical tracking requires multiple data snapshots over time</p>
                  </div>
                )}
              </div>
            )}

            {!selectedTicker && (
              <div className="card history-placeholder">
                <History size={48} className="empty-icon" />
                <h3>Select a Ticker</h3>
                <p>Choose a ticker above to view its sentiment history</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrendingTickersPage;
