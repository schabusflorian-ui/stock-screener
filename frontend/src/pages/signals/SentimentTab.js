// frontend/src/pages/signals/SentimentTab.js
// Professional sentiment dashboard with multi-source analysis
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Clock,
  BarChart3,
  Layers,
  AlertTriangle,
  Zap,
  TrendingUp
} from 'lucide-react';
import { sentimentAPI } from '../../services/api';
import SmartMoneySignals from '../../components/SmartMoneySignals';
import { useFormatters } from '../../hooks/useFormatters';
import {
  SourceBreakdownCards,
  AnalystActivityPanel,
  DivergenceAlerts,
  EnhancedTrendingTable,
  RegionToggle
} from '../../components/sentiment';
import './SentimentTab.css';

function SentimentTab() {
  const fmt = useFormatters();

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return fmt.date(dateStr);
  };

  // Core state
  const [period, setPeriod] = useState('24h');
  const [region, setRegion] = useState('US');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Data state
  const [trending, setTrending] = useState([]);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [divergences, setDivergences] = useState([]);

  // Stats derived from trending data
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
      const response = await sentimentAPI.getTrending(period, 50, forceRefresh, region);
      const trendingData = response.data.trending || [];
      setTrending(trendingData);

      if (trendingData.length > 0) {
        setLastRefreshed(trendingData[0].calculatedAt);
      }
    } catch (err) {
      console.error('Error loading trending:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, region]);

  // Load source overview for divergences
  const loadSourceOverview = useCallback(async () => {
    try {
      const res = await sentimentAPI.getSourcesOverview(period);
      setDivergences(res.data.divergences || []);
    } catch (e) {
      console.error('Error loading source overview:', e);
    }
  }, [period]);

  // Initial load and period/region changes
  useEffect(() => {
    loadTrending();
    loadSourceOverview();
  }, [period, region, loadTrending, loadSourceOverview]);

  if (loading && trending.length === 0) {
    return (
      <div className="sentiment-dashboard">
        <div className="loading-state">
          <RefreshCw className="spinning" size={24} />
          <span>Loading sentiment data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sentiment-dashboard">
      {/* Header Bar */}
      <div className="dashboard-header">
        <div className="header-left">
          <div className="period-selector">
            <span className="period-label">Period:</span>
            {['24h', '7d', '30d'].map(p => (
              <button
                key={p}
                className={`period-btn ${period === p ? 'active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <RegionToggle value={region} onChange={setRegion} />
        </div>
        <div className="header-actions">
          <button
            className="refresh-btn"
            onClick={() => loadTrending(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            Refresh
          </button>
          {lastRefreshed && (
            <span className="last-updated">
              <Clock size={12} />
              Updated {formatDate(lastRefreshed)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Section: Market Pulse */}
      <section className="sentiment-section">
        <div className="section-header">
          <BarChart3 size={18} />
          <h2>Market Pulse</h2>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.totalMentions.toLocaleString()}</span>
            <span className="stat-label">Total Mentions</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.totalPosts.toLocaleString()}</span>
            <span className="stat-label">Unique Posts</span>
          </div>
          <div className="stat-card">
            <span className={`stat-value ${stats.avgSentiment > 0 ? 'positive' : stats.avgSentiment < 0 ? 'negative' : ''}`}>
              {stats.avgSentiment > 0 ? '+' : ''}{(stats.avgSentiment * 100).toFixed(1)}
            </span>
            <span className="stat-label">Avg Sentiment</span>
          </div>
          <div className="stat-card">
            <span className="stat-value positive">{stats.bullishCount}</span>
            <span className="stat-label">Bullish Tickers</span>
          </div>
          <div className="stat-card">
            <span className="stat-value negative">{stats.bearishCount}</span>
            <span className="stat-label">Bearish Tickers</span>
          </div>
        </div>
      </section>

      {/* Section: Sentiment by Source */}
      <section className="sentiment-section">
        <div className="section-header">
          <Layers size={18} />
          <h2>Sentiment by Source</h2>
        </div>
        <SourceBreakdownCards period={period} />
      </section>

      {/* Section: Divergence Alerts (conditional) */}
      {divergences.length > 0 && (
        <section className="sentiment-section">
          <div className="section-header">
            <AlertTriangle size={18} />
            <h2>Divergence Alerts</h2>
          </div>
          <DivergenceAlerts divergences={divergences} />
        </section>
      )}

      {/* Section: Smart Money & Analyst Activity */}
      <section className="sentiment-section">
        <div className="section-header">
          <Zap size={18} />
          <h2>Smart Money Signals</h2>
        </div>
        <div className="signals-grid">
          <SmartMoneySignals />
          <AnalystActivityPanel />
        </div>
      </section>

      {/* Section: Trending Tickers */}
      <section className="sentiment-section">
        <div className="section-header">
          <TrendingUp size={18} />
          <h2>Trending Tickers</h2>
          {region !== 'US' && (
            <span className={`region-indicator ${region.toLowerCase()}`}>
              {region === 'EU' ? '🇪🇺' : '🇬🇧'} {region} Data
            </span>
          )}
        </div>
        <EnhancedTrendingTable period={period} region={region} />
      </section>
    </div>
  );
}

export default SentimentTab;
