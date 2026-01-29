// frontend/src/components/agent/AgentActivityLog.js
// Real-time activity stream showing agent actions

import { useState } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Play,
  Pause,
  Settings,
  IconButton
} from '../icons';
import './AgentActivityLog.css';

const ACTIVITY_ICONS = {
  executed: CheckCircle,
  rejected: XCircle,
  pending: Clock,
  scan: Search,
  buy: TrendingUp,
  sell: TrendingDown,
  warning: AlertTriangle,
  started: Play,
  paused: Pause,
  configured: Settings
};

const ACTIVITY_COLORS = {
  executed: 'success',
  rejected: 'danger',
  pending: 'warning',
  scan: 'primary',
  buy: 'success',
  sell: 'danger',
  warning: 'warning',
  started: 'success',
  paused: 'warning',
  configured: 'primary'
};

// Map activity colors to IconButton colorSchemes
const ACTIVITY_SCHEMES = {
  executed: 'growth',
  rejected: 'decline',
  pending: 'risk',
  scan: 'analytics',
  buy: 'growth',
  sell: 'decline',
  warning: 'risk',
  started: 'growth',
  paused: 'risk',
  configured: 'analytics'
};

function ActivityEntry({ activity }) {
  const Icon = ACTIVITY_ICONS[activity.type] || Activity;
  const colorClass = ACTIVITY_COLORS[activity.type] || 'default';
  const colorScheme = ACTIVITY_SCHEMES[activity.type] || 'default';

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`activity-entry activity-entry--${colorClass}`}>
      <IconButton
        icon={Icon}
        colorScheme={colorScheme}
        size="small"
        className="activity-entry__icon-btn"
      />
      <div className="activity-entry__content">
        <span className="activity-entry__message">{activity.message}</span>
        {activity.details && (
          <span className="activity-entry__details">{activity.details}</span>
        )}
      </div>
      <span className="activity-entry__time">{formatTime(activity.timestamp)}</span>
    </div>
  );
}

function AgentActivityLog({
  activities = [],
  loading = false,
  limit = 10,
  showViewAll = true,
  onViewAll,
  onRefresh
}) {
  const [expanded, setExpanded] = useState(false);

  const displayedActivities = expanded
    ? activities
    : activities.slice(0, limit);

  return (
    <div className="agent-activity-log">
      {/* Header */}
      <div className="agent-activity-log__header">
        <div className="agent-activity-log__title">
          <Activity size={16} />
          <span>Agent Activity</span>
        </div>
        <div className="agent-activity-log__actions">
          {onRefresh && (
            <button
              className="agent-activity-log__action-btn"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh activity"
            >
              <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            </button>
          )}
          {showViewAll && activities.length > limit && (
            <button
              className="agent-activity-log__view-all"
              onClick={() => onViewAll ? onViewAll() : setExpanded(!expanded)}
            >
              <span>{expanded ? 'Show Less' : 'View All'}</span>
              <ChevronRight size={14} className={expanded ? 'rotated' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Activity list */}
      <div className="agent-activity-log__list">
        {loading && activities.length === 0 ? (
          <div className="agent-activity-log__loading">
            <RefreshCw size={16} className="spinning" />
            <span>Loading activity...</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="agent-activity-log__empty">
            <Activity size={24} />
            <span>No activity yet</span>
          </div>
        ) : (
          displayedActivities.map((activity, index) => (
            <ActivityEntry key={activity.id || index} activity={activity} />
          ))
        )}
      </div>

      {/* Today's summary */}
      {activities.length > 0 && (
        <div className="agent-activity-log__summary">
          <span className="agent-activity-log__summary-label">Today:</span>
          <div className="agent-activity-log__summary-stats">
            <span className="agent-activity-log__stat agent-activity-log__stat--success">
              {activities.filter(a => a.type === 'executed').length} executed
            </span>
            <span className="agent-activity-log__stat agent-activity-log__stat--warning">
              {activities.filter(a => a.type === 'pending').length} pending
            </span>
            <span className="agent-activity-log__stat agent-activity-log__stat--danger">
              {activities.filter(a => a.type === 'rejected').length} rejected
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentActivityLog;
