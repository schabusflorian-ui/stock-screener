// frontend/src/components/sentiment/SourceBreakdownCards.js
// Display individual sentiment scores for each source

import { useState, useEffect } from 'react';
import { MessageSquare, Hash, Newspaper, Activity, IconButton } from '../icons';
import { sentimentAPI } from '../../services/api';
import { useAskAI } from '../../hooks';
import './SourceBreakdownCards.css';

// Sentiment gauge visualization
const SentimentGauge = ({ score, size = 'normal' }) => {
  const n = Number(score);
  if (isNaN(n)) return <div className={`sentiment-gauge ${size}`}><span>-</span></div>;
  const percentage = ((n + 1) / 2) * 100;
  const isPositive = n > 0.05;
  const isNegative = n < -0.05;
  const color = isPositive ? 'var(--positive)' : isNegative ? 'var(--negative)' : 'var(--text-tertiary)';

  return (
    <div className={`sentiment-gauge ${size}`}>
      <div className="gauge-track">
        <div
          className="gauge-fill"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
        <div className="gauge-marker" style={{ left: '50%' }} />
      </div>
      <div className="gauge-value" style={{ color }}>
        {n > 0 ? '+' : ''}{(n * 100).toFixed(0)}
      </div>
    </div>
  );
};

// Distribution bar
const DistributionBar = ({ bullish, bearish, neutral }) => (
  <div className="distribution-bar">
    <div
      className="dist-segment bullish"
      style={{ width: `${bullish}%` }}
      title={`Bullish: ${bullish}%`}
    />
    <div
      className="dist-segment neutral"
      style={{ width: `${neutral}%` }}
      title={`Neutral: ${neutral}%`}
    />
    <div
      className="dist-segment bearish"
      style={{ width: `${bearish}%` }}
      title={`Bearish: ${bearish}%`}
    />
  </div>
);

// Get sentiment label based on score
const getSentimentLabel = (score) => {
  if (score > 0.2) return 'Very Bullish';
  if (score > 0.05) return 'Bullish';
  if (score < -0.2) return 'Very Bearish';
  if (score < -0.05) return 'Bearish';
  return 'Neutral';
};

// Individual source card
const SourceCard = ({ source, icon: Icon, data, color, colorScheme }) => {
  const avg = Number(data?.avgSentiment ?? 0);
  const label = getSentimentLabel(avg);
  const isPositive = avg > 0.05;
  const isNegative = avg < -0.05;

  return (
    <div className="source-card">
      <div className="source-header">
        <IconButton
          icon={Icon}
          color={color}
          pastel={`${color}20`}
          darkColor={color}
          size="small"
          className="source-icon-btn"
        />
        <div className="source-name">{typeof source === 'string' ? source : String(source ?? '')}</div>
      </div>

      <div className="source-score">
        <span className={`score-value ${isPositive ? 'positive' : isNegative ? 'negative' : ''}`}>
          {!isNaN(avg) ? (avg > 0 ? '+' : '') + (avg * 100).toFixed(0) : '-'}
        </span>
        <span className="score-label">{label}</span>
      </div>

      <SentimentGauge score={avg} size="small" />

      <div className="source-stats">
        <div className="stat">
          <span className="stat-value">
            {Number(data?.postCount ?? data?.messageCount ?? data?.articleCount ?? 0).toLocaleString()}
          </span>
          <span className="stat-label">
            {data.postCount !== undefined ? 'posts' : data.messageCount !== undefined ? 'msgs' : 'articles'}
          </span>
        </div>
      </div>

      <DistributionBar
        bullish={data.bullishPct || 0}
        bearish={data.bearishPct || 0}
        neutral={data.neutralPct || 0}
      />

      {data.topSubreddits?.length > 0 && (
        <div className="source-tags">
          {data.topSubreddits.slice(0, 3).map(sub => (
            <span key={sub} className="tag">r/{sub}</span>
          ))}
        </div>
      )}

      {data.topSources?.length > 0 && (
        <div className="source-tags">
          {data.topSources.slice(0, 3).map(src => (
            <span key={src} className="tag">{src}</span>
          ))}
        </div>
      )}
    </div>
  );
};

function SourceBreakdownCards({ period = '24h' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ask AI context for sentiment source breakdown
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'market_sentiment',
    label: 'Market Sentiment by Source',
    period,
    redditSentiment: data?.reddit?.avgSentiment,
    stocktwitsSentiment: data?.stocktwits?.avgSentiment,
    newsSentiment: data?.news?.avgSentiment,
    redditBullish: data?.reddit?.bullishPct,
    stocktwitsBullish: data?.stocktwits?.bullishPct,
    newsBullish: data?.news?.bullishPct
  }));

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await sentimentAPI.getSourcesOverview(period);
        setData(response.data);
      } catch (err) {
        console.error('Error fetching sources overview:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

  if (loading) {
    return (
      <div className="source-cards-loading">
        <div className="loading-card" />
        <div className="loading-card" />
        <div className="loading-card" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  return (
    <div className="source-breakdown-cards" {...askAIProps}>
      <h3 className="section-title">
        <Activity size={18} />
        Sentiment by Source
      </h3>

      <div className="source-cards-grid">
        <SourceCard
          source="Reddit"
          icon={MessageSquare}
          data={data.reddit}
          color="var(--color-reddit)"
        />
        <SourceCard
          source="StockTwits"
          icon={Hash}
          data={data.stocktwits}
          color="var(--color-stocktwits)"
        />
        <SourceCard
          source="News"
          icon={Newspaper}
          data={data.news}
          color="var(--color-news)"
        />
      </div>
    </div>
  );
}

export default SourceBreakdownCards;
