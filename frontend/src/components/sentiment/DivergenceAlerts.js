// frontend/src/components/sentiment/DivergenceAlerts.js
// Display alerts when sentiment sources disagree significantly

import { Link } from 'react-router-dom';
import { AlertTriangle, MessageSquare, Newspaper, TrendingUp, TrendingDown } from '../icons';
import './DivergenceAlerts.css';

const DivergenceAlert = ({ divergence }) => {
  const redditPositive = divergence.reddit > 0;
  const newsPositive = divergence.news > 0;

  return (
    <div className={`divergence-alert ${divergence.severity}`}>
      <div className="alert-icon">
        <AlertTriangle size={16} />
      </div>
      <div className="alert-content">
        <div className="alert-header">
          <Link to={`/company/${divergence.symbol}`} className="alert-symbol">
            {divergence.symbol}
          </Link>
          <span className={`severity-badge ${divergence.severity}`}>
            {divergence.severity === 'high' ? 'High' : 'Medium'}
          </span>
        </div>
        <div className="alert-breakdown">
          <div className="source-sentiment">
            <MessageSquare size={12} />
            <span className="source-name">Reddit</span>
            <span className={`sentiment-value ${redditPositive ? 'positive' : 'negative'}`}>
              {redditPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {redditPositive ? '+' : ''}{(divergence.reddit * 100).toFixed(0)}
            </span>
          </div>
          <span className="vs">vs</span>
          <div className="source-sentiment">
            <Newspaper size={12} />
            <span className="source-name">News</span>
            <span className={`sentiment-value ${newsPositive ? 'positive' : 'negative'}`}>
              {newsPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {newsPositive ? '+' : ''}{(divergence.news * 100).toFixed(0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

function DivergenceAlerts({ divergences = [] }) {
  if (!divergences || divergences.length === 0) {
    return null;
  }

  return (
    <div className="divergence-alerts">
      <div className="alerts-header">
        <AlertTriangle size={16} />
        <h3>Source Divergence</h3>
        <span className="alert-count">{divergences.length}</span>
      </div>
      <div className="alerts-description">
        Stocks where sentiment sources significantly disagree
      </div>
      <div className="alerts-list">
        {divergences.slice(0, 5).map(d => (
          <DivergenceAlert key={d.symbol} divergence={d} />
        ))}
      </div>
    </div>
  );
}

export default DivergenceAlerts;
