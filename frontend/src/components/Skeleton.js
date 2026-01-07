// frontend/src/components/Skeleton.js
import './Skeleton.css';

// Base skeleton component
function Skeleton({ width, height, variant = 'text', className = '' }) {
  const style = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : variant === 'circular' ? width : '100%'),
  };

  return (
    <div
      className={`skeleton ${variant} ${className}`}
      style={style}
    />
  );
}

// Text line skeleton
function SkeletonText({ lines = 1, width = '100%' }) {
  return (
    <div className="skeleton-text">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 && lines > 1 ? '70%' : width}
          variant="text"
        />
      ))}
    </div>
  );
}

// Card skeleton for portfolio/investor cards
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-header">
        <Skeleton variant="circular" width={44} height={44} />
        <div className="skeleton-card-title">
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <div className="skeleton-card-body">
        <Skeleton height={40} />
        <div className="skeleton-card-stats">
          <Skeleton width="30%" height={14} />
          <Skeleton width="30%" height={14} />
        </div>
      </div>
    </div>
  );
}

// Table row skeleton
function SkeletonTableRow({ columns = 5 }) {
  return (
    <tr className="skeleton-table-row">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}>
          <Skeleton width={i === 0 ? '80%' : '60%'} height={14} />
        </td>
      ))}
    </tr>
  );
}

// Full table skeleton
function SkeletonTable({ rows = 10, columns = 6 }) {
  return (
    <div className="skeleton-table-wrapper">
      <table className="skeleton-table">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}>
                <Skeleton width="70%" height={12} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Stats bar skeleton
function SkeletonStatsBar({ items = 4 }) {
  return (
    <div className="skeleton-stats-bar">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="skeleton-stat-item">
          <Skeleton variant="circular" width={20} height={20} />
          <div className="skeleton-stat-content">
            <Skeleton width={60} height={10} />
            <Skeleton width={80} height={18} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Chart skeleton
function SkeletonChart({ height = 300 }) {
  return (
    <div className="skeleton-chart" style={{ height }}>
      <div className="skeleton-chart-header">
        <Skeleton width={120} height={16} />
        <div className="skeleton-chart-controls">
          <Skeleton width={80} height={28} />
          <Skeleton width={80} height={28} />
        </div>
      </div>
      <div className="skeleton-chart-body">
        <Skeleton height={height - 60} />
      </div>
    </div>
  );
}

// Full page loading skeleton for portfolio detail
function SkeletonPortfolioDetail() {
  return (
    <div className="skeleton-portfolio-detail">
      {/* Header */}
      <div className="skeleton-header">
        <Skeleton width={150} height={14} />
        <div className="skeleton-header-main">
          <div className="skeleton-identity">
            <Skeleton variant="circular" width={56} height={56} />
            <div className="skeleton-title-area">
              <Skeleton width={200} height={24} />
              <Skeleton width={80} height={14} />
            </div>
          </div>
          <div className="skeleton-actions">
            <Skeleton width={100} height={36} />
            <Skeleton width={100} height={36} />
            <Skeleton width={100} height={36} />
          </div>
        </div>
        <SkeletonStatsBar items={4} />
      </div>

      {/* Tabs */}
      <div className="skeleton-tabs">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width={80} height={40} />
        ))}
      </div>

      {/* Content */}
      <div className="skeleton-content">
        <div className="skeleton-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}

// Portfolio list skeleton
function SkeletonPortfolioList() {
  return (
    <div className="skeleton-portfolio-list">
      <div className="skeleton-list-header">
        <div className="skeleton-list-title">
          <Skeleton variant="circular" width={28} height={28} />
          <Skeleton width={150} height={24} />
        </div>
        <div className="skeleton-list-actions">
          <Skeleton width={120} height={36} />
          <Skeleton width={100} height={36} />
        </div>
      </div>
      <SkeletonStatsBar items={3} />
      <div className="skeleton-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

// Screening results skeleton
function SkeletonScreeningResults({ rows = 10 }) {
  return (
    <div className="skeleton-screening-results">
      <div className="skeleton-results-header">
        <Skeleton width={200} height={20} />
        <div className="skeleton-results-controls">
          <Skeleton width={120} height={32} />
          <Skeleton width={100} height={32} />
        </div>
      </div>
      <div className="skeleton-table-container">
        <table className="skeleton-table">
          <thead>
            <tr>
              {Array.from({ length: 8 }).map((_, i) => (
                <th key={i}><Skeleton width={i === 0 ? 60 : 80} height={14} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} columns={8} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Watchlist skeleton
function SkeletonWatchlist() {
  return (
    <div className="skeleton-watchlist">
      <div className="skeleton-watchlist-header">
        <Skeleton width={180} height={24} />
        <div className="skeleton-watchlist-actions">
          <Skeleton width={100} height={36} />
          <Skeleton width={100} height={36} />
        </div>
      </div>
      <div className="skeleton-watchlist-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-watchlist-card">
            <div className="skeleton-watchlist-card-header">
              <Skeleton width={60} height={20} />
              <Skeleton variant="circular" width={24} height={24} />
            </div>
            <Skeleton width="100%" height={14} />
            <div className="skeleton-watchlist-card-price">
              <Skeleton width={80} height={24} />
              <Skeleton width={60} height={16} />
            </div>
            <div className="skeleton-watchlist-card-metrics">
              <Skeleton width="48%" height={12} />
              <Skeleton width="48%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// IPO pipeline skeleton
function SkeletonIPOPipeline() {
  return (
    <div className="skeleton-ipo-pipeline">
      <div className="skeleton-ipo-header">
        <Skeleton width={200} height={28} />
        <SkeletonStatsBar items={4} />
      </div>
      <div className="skeleton-ipo-columns">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="skeleton-ipo-column">
            <Skeleton width={100} height={20} className="skeleton-ipo-column-title" />
            {Array.from({ length: 3 }).map((_, card) => (
              <div key={card} className="skeleton-ipo-card">
                <div className="skeleton-ipo-card-header">
                  <Skeleton width={60} height={18} />
                  <Skeleton width={50} height={16} />
                </div>
                <Skeleton width="90%" height={14} />
                <Skeleton width="60%" height={12} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Insider trading skeleton
function SkeletonInsiderTrading() {
  return (
    <div className="skeleton-insider-trading">
      <div className="skeleton-section-header">
        <Skeleton width={220} height={28} />
        <div className="skeleton-section-filters">
          <Skeleton width={100} height={36} />
          <Skeleton width={120} height={36} />
        </div>
      </div>
      <SkeletonStatsBar items={4} />
      <div className="skeleton-two-column">
        <div className="skeleton-column">
          <Skeleton width={140} height={18} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-list-row">
              <Skeleton width={60} height={16} />
              <Skeleton width={120} height={14} />
              <Skeleton width={80} height={14} />
            </div>
          ))}
        </div>
        <div className="skeleton-column">
          <Skeleton width={140} height={18} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-list-row">
              <Skeleton width={60} height={16} />
              <Skeleton width={120} height={14} />
              <Skeleton width={80} height={14} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Capital allocation skeleton
function SkeletonCapitalAllocation() {
  return (
    <div className="skeleton-capital-allocation">
      <div className="skeleton-section-header">
        <Skeleton width={260} height={28} />
        <Skeleton width={100} height={36} />
      </div>
      <SkeletonStatsBar items={4} />
      <div className="skeleton-tabs-row">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width={100} height={36} />
        ))}
      </div>
      <div className="skeleton-capital-content">
        <SkeletonChart height={250} />
        <div className="skeleton-table-container">
          <table className="skeleton-table">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={6} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Generic page skeleton
function SkeletonPage({ title = true, stats = true, tabs = 0, content = 'cards' }) {
  return (
    <div className="skeleton-page">
      {title && (
        <div className="skeleton-page-header">
          <Skeleton width={200} height={28} />
        </div>
      )}
      {stats && <SkeletonStatsBar items={4} />}
      {tabs > 0 && (
        <div className="skeleton-tabs-row">
          {Array.from({ length: tabs }).map((_, i) => (
            <Skeleton key={i} width={80} height={36} />
          ))}
        </div>
      )}
      <div className="skeleton-page-content">
        {content === 'cards' && (
          <div className="skeleton-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
        {content === 'table' && (
          <div className="skeleton-table-container">
            <table className="skeleton-table">
              <tbody>
                {Array.from({ length: 10 }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={6} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {content === 'chart' && <SkeletonChart height={400} />}
      </div>
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonTableRow,
  SkeletonStatsBar,
  SkeletonChart,
  SkeletonPortfolioDetail,
  SkeletonPortfolioList,
  SkeletonScreeningResults,
  SkeletonWatchlist,
  SkeletonIPOPipeline,
  SkeletonInsiderTrading,
  SkeletonCapitalAllocation,
  SkeletonPage
};

export default Skeleton;
