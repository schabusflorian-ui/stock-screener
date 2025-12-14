// frontend/src/components/NewsAndEvents.js
import { useState, useEffect } from 'react';
import { companyAPI } from '../services/api';
import './NewsAndEvents.css';

// Format relative time
const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Format date for filings
const formatFilingDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Get filing icon based on form type
const getFilingIcon = (formType) => {
  switch (formType) {
    case '10-K': return '📊';
    case '10-Q': return '📈';
    case '8-K': return '📰';
    case '4': return '👤';
    case 'DEF 14A': return '📋';
    case '13F-HR': return '🏦';
    case 'S-1': return '🚀';
    default: return '📄';
  }
};

// Get filing priority color
const getFilingPriority = (formType) => {
  switch (formType) {
    case '8-K': return 'high';
    case '10-K':
    case '10-Q': return 'medium';
    case '4': return 'low';
    default: return 'normal';
  }
};

function NewsAndEvents({ symbol }) {
  const [newsData, setNewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await companyAPI.getNews(symbol);
        setNewsData(response.data);
      } catch (err) {
        console.error('Error fetching news:', err);
        setError('Failed to load news and events');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchNews();
    }
  }, [symbol]);

  if (loading) {
    return (
      <div className="news-events-container">
        <div className="news-loading">Loading news and events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="news-events-container">
        <div className="news-error">{error}</div>
      </div>
    );
  }

  const news = newsData?.news?.data || [];
  const filings = newsData?.secFilings?.data || [];
  const companyInfo = newsData?.secFilings?.companyInfo;

  // Combine and sort for "all" view
  const allItems = [
    ...news.map(item => ({ ...item, type: 'news' })),
    ...filings.map(item => ({
      ...item,
      type: 'filing',
      datetime: item.filedDate + 'T00:00:00Z'
    }))
  ].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

  return (
    <div className="news-events-container">
      {/* Company SEC Info Banner */}
      {companyInfo && (
        <div className="sec-info-banner">
          <span className="cik-badge">CIK: {companyInfo.cik}</span>
          {companyInfo.sicDescription && (
            <span className="sic-badge">{companyInfo.sicDescription}</span>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="news-tabs">
        <button
          className={activeTab === 'all' ? 'active' : ''}
          onClick={() => setActiveTab('all')}
        >
          All ({allItems.length})
        </button>
        <button
          className={activeTab === 'news' ? 'active' : ''}
          onClick={() => setActiveTab('news')}
        >
          News ({news.length})
        </button>
        <button
          className={activeTab === 'filings' ? 'active' : ''}
          onClick={() => setActiveTab('filings')}
        >
          SEC Filings ({filings.length})
        </button>
      </div>

      {/* Content */}
      <div className="news-content">
        {activeTab === 'all' && (
          <div className="all-items-list">
            {allItems.length === 0 ? (
              <div className="no-items">No news or filings found</div>
            ) : (
              allItems.map((item, index) => (
                item.type === 'news' ? (
                  <NewsItem key={`news-${index}`} item={item} />
                ) : (
                  <FilingItem key={`filing-${index}`} item={item} />
                )
              ))
            )}
          </div>
        )}

        {activeTab === 'news' && (
          <div className="news-list">
            {news.length === 0 ? (
              <div className="no-items">No recent news found</div>
            ) : (
              news.map((item, index) => (
                <NewsItem key={index} item={item} />
              ))
            )}
          </div>
        )}

        {activeTab === 'filings' && (
          <div className="filings-list">
            {filings.length === 0 ? (
              <div className="no-items">No recent SEC filings found</div>
            ) : (
              <>
                {/* Filing Legend */}
                <div className="filing-legend">
                  <span><span className="legend-dot high"></span>Material Event (8-K)</span>
                  <span><span className="legend-dot medium"></span>Financial Report</span>
                  <span><span className="legend-dot low"></span>Insider Trade</span>
                </div>
                {filings.map((item, index) => (
                  <FilingItem key={index} item={item} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Last Updated */}
      {newsData?.lastUpdated && (
        <div className="last-updated">
          Last updated: {formatRelativeTime(newsData.lastUpdated)}
        </div>
      )}
    </div>
  );
}

// News Item Component
function NewsItem({ item }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-item"
    >
      <div className="news-item-content">
        <div className="news-item-header">
          <span className="news-source">{item.source}</span>
          <span className="news-time">{formatRelativeTime(item.datetime)}</span>
        </div>
        <h4 className="news-headline">{item.headline}</h4>
        {item.summary && (
          <p className="news-summary">{item.summary}</p>
        )}
      </div>
    </a>
  );
}

// Filing Item Component
function FilingItem({ item }) {
  const priority = getFilingPriority(item.formType);
  const icon = getFilingIcon(item.formType);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`filing-item priority-${priority}`}
    >
      <div className="filing-icon">{icon}</div>
      <div className="filing-content">
        <div className="filing-header">
          <span className="filing-form">{item.formType}</span>
          <span className="filing-date">{formatFilingDate(item.filedDate)}</span>
        </div>
        <p className="filing-title">{item.title}</p>
        {item.reportDate && item.reportDate !== item.filedDate && (
          <span className="filing-report-date">
            Report date: {formatFilingDate(item.reportDate)}
          </span>
        )}
      </div>
    </a>
  );
}

export default NewsAndEvents;
