import React, { useState, useEffect, memo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle,
  MessageCircle, MessageSquare, Newspaper, Activity, CheckCircle, XCircle, BarChart3
} from './icons';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { sentimentAPI } from '../services/api';
import { useAskAI } from '../hooks/useAskAI';
import './CombinedSentimentPanel.css';

// Signal configuration - using bullish/bearish terminology for regulatory compliance
const SIGNAL_CONFIG = {
  // New bullish/bearish labels
  strong_bullish:  { color: '#10B981', bg: '#10B98120', label: 'Strong Bullish', icon: TrendingUp },
  bullish:         { color: '#34D399', bg: '#34D39920', label: 'Bullish', icon: TrendingUp },
  lean_bullish:    { color: '#6EE7B7', bg: '#6EE7B720', label: 'Lean Bullish', icon: TrendingUp },
  neutral:         { color: '#94A3B8', bg: '#94A3B820', label: 'Neutral', icon: Minus },
  lean_bearish:    { color: '#FCA5A5', bg: '#FCA5A520', label: 'Lean Bearish', icon: TrendingDown },
  bearish:         { color: '#F87171', bg: '#F8717120', label: 'Bearish', icon: TrendingDown },
  strong_bearish:  { color: '#EF4444', bg: '#EF444420', label: 'Strong Bearish', icon: TrendingDown },
  // Legacy mappings for backwards compatibility
  strong_buy:  { color: '#10B981', bg: '#10B98120', label: 'Strong Bullish', icon: TrendingUp },
  buy:         { color: '#34D399', bg: '#34D39920', label: 'Bullish', icon: TrendingUp },
  lean_buy:    { color: '#6EE7B7', bg: '#6EE7B720', label: 'Lean Bullish', icon: TrendingUp },
  hold:        { color: '#94A3B8', bg: '#94A3B820', label: 'Neutral', icon: Minus },
  lean_sell:   { color: '#FCA5A5', bg: '#FCA5A520', label: 'Lean Bearish', icon: TrendingDown },
  sell:        { color: '#F87171', bg: '#F8717120', label: 'Bearish', icon: TrendingDown },
  strong_sell: { color: '#EF4444', bg: '#EF444420', label: 'Strong Bearish', icon: TrendingDown },
  // Market sentiment labels (Fear & Greed index)
  extreme_fear:  { color: '#EF4444', bg: '#EF444420', label: 'Extreme Fear', icon: TrendingDown },
  fear:          { color: '#F87171', bg: '#F8717120', label: 'Fear', icon: TrendingDown },
  slight_fear:   { color: '#FCA5A5', bg: '#FCA5A520', label: 'Slight Fear', icon: TrendingDown },
  slight_greed:  { color: '#6EE7B7', bg: '#6EE7B720', label: 'Slight Greed', icon: TrendingUp },
  greed:         { color: '#34D399', bg: '#34D39920', label: 'Greed', icon: TrendingUp },
  extreme_greed: { color: '#10B981', bg: '#10B98120', label: 'Extreme Greed', icon: TrendingUp },
};

const SOURCE_CONFIG = {
  reddit: { icon: MessageCircle, color: '#FF4500', label: 'Reddit' },
  stocktwits: { icon: MessageSquare, color: '#00B2FF', label: 'StockTwits' },
  news: { icon: Newspaper, color: '#F59E0B', label: 'News' },
  market: { icon: Activity, color: '#8B5CF6', label: 'Market' },
  analyst: { icon: BarChart3, color: '#10B981', label: 'Analyst' },
};

export function CombinedSentimentPanel({ symbol, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Ask AI context menu for combined sentiment
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'combined_sentiment',
    symbol,
    label: 'Multi-Source Sentiment',
    signal: data?.combined?.signal,
    confidence: data?.combined?.confidence,
    sentiment: data?.combined?.sentiment,
    sourcesUsed: data?.combined?.sourcesUsed
  }));

  useEffect(() => {
    if (symbol) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const loadData = async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await sentimentAPI.getCombined(symbol, refresh);
      setData(response.data);
    } catch (err) {
      console.error('Error loading combined sentiment:', err);
      setError('Failed to load sentiment data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    await loadData(true);
    if (onRefresh) onRefresh();
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await sentimentAPI.refreshAll(symbol);
      await loadData(false);
    } catch (err) {
      console.error('Error refreshing all sources:', err);
      setError('Failed to refresh all sources');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="combined-sentiment-panel" {...askAIProps}>
        <div className="panel-loading">
          <RefreshCw className="spin" size={24} />
          <span>Loading sentiment analysis...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="combined-sentiment-panel" {...askAIProps}>
        <div className="panel-error">
          <AlertCircle size={24} />
          <span>{error}</span>
          <button onClick={() => loadData(false)} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  const combined = data?.combined || {};
  const sources = data?.sources || {};
  const config = SIGNAL_CONFIG[combined.signal] || SIGNAL_CONFIG.neutral;
  const Icon = config.icon;

  // Extract agreement data from API response
  const agreementScore = combined.agreement?.score || 0.5;
  const agreementDistribution = combined.agreement?.distribution || { bullish: 0, bearish: 0, neutral: 0 };
  const sourcesAgree = agreementDistribution.bullish || 0;
  const sourcesDisagree = agreementDistribution.bearish || 0;
  // eslint-disable-next-line no-unused-vars
  const sourcesNeutral = agreementDistribution.neutral || 0;

  // Prepare pie chart data for source agreement
  const agreementData = [
    { name: 'Agree', value: agreementScore, color: '#10B981' },
    { name: 'Disagree', value: 1 - agreementScore, color: '#EF4444' },
  ];

  // Source breakdown for visualization
  const sourceBreakdown = Object.entries(sources)
    .filter(([_, src]) => src && !src.error)
    .map(([key, src]) => ({
      name: SOURCE_CONFIG[key]?.label || key,
      sentiment: src.sentiment || 0,
      weight: src.weight || 0,
      signal: src.signal,
      color: SOURCE_CONFIG[key]?.color || '#94A3B8',
    }));

  return (
    <div className="combined-sentiment-panel" {...askAIProps}>
      {/* Header */}
      <div className="panel-header">
        <h3>Multi-Source Sentiment</h3>
        <div className="header-actions">
          <button
            onClick={handleRefresh}
            className="refresh-btn"
            disabled={refreshing}
            title="Refresh combined analysis"
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleRefreshAll}
            className="refresh-all-btn"
            disabled={refreshing}
            title="Refresh all sources (slow)"
          >
            {refreshing ? 'Refreshing...' : 'Refresh All Sources'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'breakdown' ? 'active' : ''}`}
          onClick={() => setActiveTab('breakdown')}
        >
          Breakdown
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          {/* Main Signal */}
          <div
            className="combined-signal"
            style={{ backgroundColor: config.bg, borderColor: config.color }}
          >
            <Icon size={32} style={{ color: config.color }} />
            <div className="signal-info">
              <span className="signal-label" style={{ color: config.color }}>
                {config.label}
              </span>
              <span className="signal-confidence">
                {Math.round((combined.confidence || 0) * 100)}% confidence
              </span>
            </div>
            <div className="signal-score">
              <span className="score-value" style={{ color: config.color }}>
                {combined.sentiment != null ? (combined.sentiment > 0 ? '+' : '') + combined.sentiment.toFixed(2) : '--'}
              </span>
              <span className="score-label">Combined Score</span>
            </div>
          </div>

          {/* Source Agreement */}
          <div className="agreement-section">
            <div className="agreement-chart">
              <ResponsiveContainer width={70} height={70}>
                <PieChart>
                  <Pie
                    data={agreementData}
                    innerRadius={22}
                    outerRadius={32}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                  >
                    {agreementData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="agreement-label">
                <span className="agreement-value">
                  {Math.round(agreementScore * 100)}%
                </span>
                <span className="agreement-text">Agreement</span>
              </div>
            </div>
            <div className="agreement-details">
              <div className="detail-item bullish">
                <CheckCircle size={12} />
                <span>{sourcesAgree} bullish</span>
              </div>
              <div className="detail-item bearish">
                <XCircle size={12} />
                <span>{sourcesDisagree} bearish</span>
              </div>
              <div className="detail-item total">
                <Activity size={12} />
                <span>{combined.sourcesUsed || 0} sources</span>
              </div>
            </div>
          </div>

          {/* Quick Source Summary */}
          <div className="quick-sources">
            {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => {
              const src = sources[key];
              // Check for signal first, then label (market uses label)
              const signalKey = src?.signal || src?.label;
              const srcConfig = signalKey ? SIGNAL_CONFIG[signalKey] : null;
              const SrcIcon = cfg.icon;
              const hasData = src && !src.error && (src.sentiment !== undefined || signalKey);

              return (
                <div key={key} className={`source-pill ${hasData ? '' : 'inactive'}`}>
                  <SrcIcon size={14} style={{ color: cfg.color }} />
                  <span className="source-name">{cfg.label}</span>
                  {hasData && srcConfig ? (
                    <span
                      className="source-signal"
                      style={{ color: srcConfig.color }}
                    >
                      {srcConfig.label}
                    </span>
                  ) : (
                    <span className="source-na">N/A</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Breakdown Tab */}
      {activeTab === 'breakdown' && (
        <div className="tab-content">
          <div className="breakdown-chart">
            {sourceBreakdown.map((src, idx) => (
              <div key={idx} className="breakdown-row">
                <div className="breakdown-label">
                  <span className="breakdown-name">{src.name}</span>
                  <span className="breakdown-weight">{Math.round(src.weight * 100)}%</span>
                </div>
                <div className="breakdown-bar-container">
                  <div className="breakdown-bar">
                    <div
                      className="breakdown-fill"
                      style={{
                        width: `${Math.abs(src.sentiment) * 50}%`,
                        marginLeft: src.sentiment >= 0 ? '50%' : `${50 - Math.abs(src.sentiment) * 50}%`,
                        backgroundColor: src.sentiment >= 0 ? '#10B981' : '#EF4444',
                      }}
                    />
                    <div className="breakdown-center" />
                  </div>
                </div>
                <span
                  className="breakdown-value"
                  style={{ color: src.sentiment >= 0 ? '#10B981' : '#EF4444' }}
                >
                  {src.sentiment >= 0 ? '+' : ''}{src.sentiment.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Weighted Calculation */}
          <div className="weighted-calc">
            <h4>Weighted Calculation</h4>
            <div className="calc-formula">
              {sourceBreakdown.map((src, idx) => (
                <span key={idx} className="calc-term">
                  {idx > 0 && ' + '}
                  <span className="calc-weight">{Math.round(src.weight * 100)}%</span>
                  <span className="calc-mult">×</span>
                  <span
                    className="calc-sentiment"
                    style={{ color: src.sentiment >= 0 ? '#10B981' : '#EF4444' }}
                  >
                    {src.sentiment >= 0 ? '+' : ''}{src.sentiment.toFixed(2)}
                  </span>
                </span>
              ))}
              <span className="calc-equals">=</span>
              <span
                className="calc-result"
                style={{ color: config.color }}
              >
                {combined.sentiment >= 0 ? '+' : ''}{combined.sentiment?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Timestamp */}
      {data?.timestamp && (
        <div className="panel-timestamp">
          Last updated: {new Date(data.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent re-renders
// Will only re-render when props (symbol, onRefresh) actually change
export default memo(CombinedSentimentPanel);
