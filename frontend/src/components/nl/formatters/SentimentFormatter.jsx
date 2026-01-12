/**
 * SentimentFormatter - Handles all sentiment-related response types
 *
 * Types handled:
 * - sentiment_analysis
 * - news_sentiment
 * - analyst_sentiment
 * - insider_activity
 * - trending_sentiment
 * - market_sentiment
 * - sentiment_overview
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus, MessageSquare, Users, BarChart2, Activity } from 'lucide-react';
import './Formatters.css';

function SentimentFormatter({ result, onSymbolClick }) {
  const { type } = result;

  switch (type) {
    case 'sentiment_analysis':
      return <SentimentAnalysisView result={result} onSymbolClick={onSymbolClick} />;

    case 'news_sentiment':
      return <NewsSentimentView result={result} onSymbolClick={onSymbolClick} />;

    case 'analyst_sentiment':
      return <AnalystSentimentView result={result} onSymbolClick={onSymbolClick} />;

    case 'insider_activity':
      return <InsiderActivityView result={result} onSymbolClick={onSymbolClick} />;

    case 'trending_sentiment':
      return <TrendingSentimentView result={result} onSymbolClick={onSymbolClick} />;

    case 'market_sentiment':
      return <MarketSentimentView result={result} />;

    case 'sentiment_overview':
      return <SentimentOverviewView result={result} onSymbolClick={onSymbolClick} />;

    default:
      return <SentimentAnalysisView result={result} onSymbolClick={onSymbolClick} />;
  }
}

/**
 * Main sentiment analysis view
 */
function SentimentAnalysisView({ result, onSymbolClick }) {
  const { symbol, name, overall_signal, sentiment_score, interpretation, sources } = result;

  return (
    <div className="fmt-sentiment-analysis">
      {symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          {name && <span className="fmt-name">{name}</span>}
          <SignalBadge signal={overall_signal} />
        </div>
      )}

      {sentiment_score !== undefined && (
        <div className="fmt-sentiment-score">
          <span className="fmt-score-label">Sentiment Score</span>
          <div className="fmt-score-bar">
            <div
              className={`fmt-score-fill ${getScoreClass(sentiment_score)}`}
              style={{ width: `${Math.abs(sentiment_score) * 50 + 50}%` }}
            />
          </div>
          <span className="fmt-score-value">{formatScore(sentiment_score)}</span>
        </div>
      )}

      {/* Source breakdown */}
      {sources && typeof sources === 'object' && Object.keys(sources).length > 0 && (
        <div className="fmt-sources">
          <h4 className="fmt-section-title">Sources</h4>
          <div className="fmt-source-grid">
            {Object.entries(sources).map(([source, data]) => (
              <div key={source} className="fmt-source-card">
                <span className="fmt-source-name">{formatLabel(source)}</span>
                <span className="fmt-source-value">
                  {typeof data === 'object' ? data.score || data.signal || '-' : data}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {interpretation && (
        <div className="fmt-interpretation">
          {interpretation}
        </div>
      )}
    </div>
  );
}

/**
 * News sentiment view
 */
function NewsSentimentView({ result, onSymbolClick }) {
  const { symbol, articles, overall_sentiment, news_count } = result;

  return (
    <div className="fmt-news-sentiment">
      {symbol && (
        <div className="fmt-header">
          <MessageSquare size={16} />
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          <span className="fmt-name">News Sentiment</span>
          {overall_sentiment && <SignalBadge signal={overall_sentiment} />}
        </div>
      )}

      {news_count !== undefined && (
        <div className="fmt-news-count">{news_count} articles analyzed</div>
      )}

      {articles && articles.length > 0 && (
        <div className="fmt-articles-list">
          {articles.slice(0, 5).map((article, i) => (
            <div key={i} className="fmt-article-item">
              <span className="fmt-article-title">{article.title || article.headline}</span>
              <div className="fmt-article-meta">
                {article.source && <span>{article.source}</span>}
                {article.sentiment && <SignalBadge signal={article.sentiment} small />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Analyst sentiment view
 */
function AnalystSentimentView({ result, onSymbolClick }) {
  const { symbol, consensus, ratings, price_target, analysts } = result;

  return (
    <div className="fmt-analyst-sentiment">
      {symbol && (
        <div className="fmt-header">
          <BarChart2 size={16} />
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          <span className="fmt-name">Analyst Ratings</span>
        </div>
      )}

      <div className="fmt-metrics-grid">
        {consensus && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Consensus</span>
            <span className="fmt-metric-value">{consensus}</span>
          </div>
        )}
        {price_target && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Avg Price Target</span>
            <span className="fmt-metric-value">${price_target}</span>
          </div>
        )}
        {analysts && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Analysts</span>
            <span className="fmt-metric-value">{analysts}</span>
          </div>
        )}
      </div>

      {ratings && (
        <div className="fmt-ratings-breakdown">
          <h4 className="fmt-section-title">Rating Distribution</h4>
          <div className="fmt-ratings-bars">
            {['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'].map(rating => {
              const count = ratings[rating] || 0;
              const total = Object.values(ratings).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={rating} className="fmt-rating-bar">
                  <span className="fmt-rating-label">{formatLabel(rating)}</span>
                  <div className="fmt-rating-track">
                    <div
                      className={`fmt-rating-fill ${getRatingClass(rating)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="fmt-rating-count">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Insider activity view
 */
function InsiderActivityView({ result, onSymbolClick }) {
  const { symbol, activity, transactions, summary } = result;

  return (
    <div className="fmt-insider-activity">
      {symbol && (
        <div className="fmt-header">
          <Users size={16} />
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          <span className="fmt-name">Insider Activity</span>
        </div>
      )}

      {summary && (
        <div className="fmt-insider-summary">
          {summary}
        </div>
      )}

      {activity && (
        <div className="fmt-metrics-grid">
          {activity.buys !== undefined && (
            <div className="fmt-metric-card">
              <span className="fmt-metric-label">Buys</span>
              <span className="fmt-metric-value positive">{activity.buys}</span>
            </div>
          )}
          {activity.sells !== undefined && (
            <div className="fmt-metric-card">
              <span className="fmt-metric-label">Sells</span>
              <span className="fmt-metric-value negative">{activity.sells}</span>
            </div>
          )}
          {activity.net_shares !== undefined && (
            <div className="fmt-metric-card">
              <span className="fmt-metric-label">Net Shares</span>
              <span className={`fmt-metric-value ${activity.net_shares >= 0 ? 'positive' : 'negative'}`}>
                {activity.net_shares.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {transactions && transactions.length > 0 && (
        <div className="fmt-transactions">
          <h4 className="fmt-section-title">Recent Transactions</h4>
          <div className="fmt-table-wrapper">
            <table className="fmt-table">
              <thead>
                <tr>
                  <th>Insider</th>
                  <th>Type</th>
                  <th>Shares</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 5).map((tx, i) => (
                  <tr key={i}>
                    <td>{tx.insider || tx.name}</td>
                    <td className={tx.type?.toLowerCase() === 'buy' ? 'positive' : 'negative'}>
                      {tx.type}
                    </td>
                    <td>{tx.shares?.toLocaleString()}</td>
                    <td>{tx.value ? `$${tx.value.toLocaleString()}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Trending sentiment view
 */
function TrendingSentimentView({ result, onSymbolClick }) {
  const { trending, source, period } = result;

  return (
    <div className="fmt-trending-sentiment">
      <div className="fmt-header">
        <Activity size={16} />
        <span className="fmt-name">Trending {source && `on ${source}`}</span>
        {period && <span className="fmt-period">{period}</span>}
      </div>

      {trending && trending.length > 0 && (
        <div className="fmt-trending-list">
          {trending.slice(0, 10).map((item, i) => (
            <div key={i} className="fmt-trending-item">
              <span className="fmt-trending-rank">#{i + 1}</span>
              <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(item.symbol)}>
                {item.symbol}
              </span>
              {item.mentions && <span className="fmt-mentions">{item.mentions} mentions</span>}
              {item.sentiment && <SignalBadge signal={item.sentiment} small />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Market sentiment view
 */
function MarketSentimentView({ result }) {
  const { fear_greed_index, vix, market_mood, indicators } = result;

  return (
    <div className="fmt-market-sentiment">
      <div className="fmt-header">
        <Activity size={16} />
        <span className="fmt-name">Market Sentiment</span>
        {market_mood && <SignalBadge signal={market_mood} />}
      </div>

      <div className="fmt-metrics-grid">
        {fear_greed_index !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Fear & Greed Index</span>
            <span className={`fmt-metric-value ${getFearGreedClass(fear_greed_index)}`}>
              {fear_greed_index}
            </span>
          </div>
        )}
        {vix !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">VIX</span>
            <span className="fmt-metric-value">{vix.toFixed(2)}</span>
          </div>
        )}
      </div>

      {indicators && Object.keys(indicators).length > 0 && (
        <div className="fmt-indicators">
          <h4 className="fmt-section-title">Indicators</h4>
          {Object.entries(indicators).map(([name, value]) => (
            <div key={name} className="fmt-indicator">
              <span className="fmt-indicator-name">{formatLabel(name)}</span>
              <span className="fmt-indicator-value">{formatValue(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sentiment overview view
 */
function SentimentOverviewView({ result, onSymbolClick }) {
  const { symbol, name, components, overall } = result;

  return (
    <div className="fmt-sentiment-overview">
      {symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          {name && <span className="fmt-name">{name}</span>}
          {overall?.signal && <SignalBadge signal={overall.signal} />}
        </div>
      )}

      {components && Object.keys(components).length > 0 && (
        <div className="fmt-sentiment-components">
          {Object.entries(components).map(([source, data]) => (
            <div key={source} className="fmt-component-card">
              <div className="fmt-component-header">
                <span className="fmt-component-name">{formatLabel(source)}</span>
                {data.signal && <SignalBadge signal={data.signal} small />}
              </div>
              {data.score !== undefined && (
                <div className="fmt-component-score">
                  Score: {formatScore(data.score)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper Components
function SignalBadge({ signal, small }) {
  if (!signal) return null;

  const signalLower = String(signal).toLowerCase();
  let className = 'fmt-signal fmt-signal-neutral';
  let Icon = Minus;

  if (signalLower.includes('buy') || signalLower.includes('bullish') || signalLower.includes('positive')) {
    className = 'fmt-signal fmt-signal-bullish';
    Icon = TrendingUp;
  } else if (signalLower.includes('sell') || signalLower.includes('bearish') || signalLower.includes('negative')) {
    className = 'fmt-signal fmt-signal-bearish';
    Icon = TrendingDown;
  }

  return (
    <span className={`${className} ${small ? 'small' : ''}`}>
      <Icon size={small ? 10 : 12} />
      {signal.replace(/_/g, ' ')}
    </span>
  );
}

// Utility functions
function formatLabel(str) {
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

function formatScore(score) {
  if (score === null || score === undefined) return '-';
  const num = Number(score);
  if (isNaN(num)) return score;
  return num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return value.toFixed(2);
  return String(value);
}

function getScoreClass(score) {
  if (score > 0.2) return 'positive';
  if (score < -0.2) return 'negative';
  return 'neutral';
}

function getRatingClass(rating) {
  if (rating.includes('buy')) return 'bullish';
  if (rating.includes('sell')) return 'bearish';
  return 'neutral';
}

function getFearGreedClass(index) {
  if (index >= 70) return 'positive';
  if (index <= 30) return 'negative';
  return 'neutral';
}

export default SentimentFormatter;
