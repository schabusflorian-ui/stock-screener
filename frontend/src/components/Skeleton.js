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

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonStatsBar,
  SkeletonChart,
  SkeletonPortfolioDetail,
  SkeletonPortfolioList
};

export default Skeleton;
