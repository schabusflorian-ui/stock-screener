// frontend/src/components/agents/LiveActivityFeed.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Target,
  CheckCircle2,
  XCircle,
  Zap,
  Play,
  Pause,
  AlertCircle,
  Activity,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { agentsAPI } from '../../services/api';
import './LiveActivityFeed.css';

/**
 * LiveActivityFeed - Real-time scrolling activity log for agent actions
 *
 * Features:
 * - Auto-refresh when agent is running
 * - Color-coded activity types
 * - Expandable/collapsible
 * - Shows most recent activity first
 */
function LiveActivityFeed({ agentId, status = 'idle', initialLimit = 10 }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadActivity = useCallback(async () => {
    try {
      const limit = showAll ? 100 : initialLimit;
      const res = await agentsAPI.getActivity(agentId, limit);
      setActivities(res.data.data || []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId, showAll, initialLimit]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Auto-refresh when agent is running
  useEffect(() => {
    if (status === 'running') {
      const interval = setInterval(loadActivity, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [status, loadActivity]);

  const getActivityIcon = (type) => {
    switch (type) {
      case 'scan_started':
      case 'scan_completed':
        return <RefreshCw size={14} />;
      case 'signal_generated':
        return <Target size={14} />;
      case 'signal_approved':
        return <CheckCircle2 size={14} />;
      case 'signal_rejected':
        return <XCircle size={14} />;
      case 'trade_executed':
        return <Zap size={14} />;
      case 'agent_started':
        return <Play size={14} />;
      case 'agent_paused':
        return <Pause size={14} />;
      case 'agent_error':
      case 'trade_error':
        return <AlertCircle size={14} />;
      case 'settings_updated':
        return <Activity size={14} />;
      default:
        return <Activity size={14} />;
    }
  };

  const getActivityColor = (type) => {
    if (type.includes('error')) return 'error';
    if (type.includes('approved') || type.includes('executed')) return 'success';
    if (type.includes('rejected') || type.includes('paused')) return 'warning';
    if (type.includes('signal') || type.includes('scan')) return 'info';
    return 'neutral';
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTimestamp = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="live-activity-feed">
      <div className="live-activity-feed__header" onClick={() => setExpanded(!expanded)}>
        <div className="live-activity-feed__title">
          <Activity size={16} />
          <span>Live Activity</span>
          {status === 'running' && (
            <span className="live-activity-feed__live-indicator">
              <span className="live-activity-feed__dot"></span>
              Live
            </span>
          )}
        </div>
        <div className="live-activity-feed__controls">
          {lastUpdate && (
            <span className="live-activity-feed__last-update">
              Updated {formatTime(lastUpdate)}
            </span>
          )}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="live-activity-feed__content">
          {loading ? (
            <div className="live-activity-feed__loading">
              <RefreshCw size={20} className="spinning" />
              <span>Loading activity...</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="live-activity-feed__empty">
              <Clock size={24} />
              <span>No activity yet</span>
            </div>
          ) : (
            <>
              <div className="live-activity-feed__list">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className={`live-activity-feed__item live-activity-feed__item--${getActivityColor(activity.activity_type)}`}
                  >
                    <div className="live-activity-feed__item-icon">
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="live-activity-feed__item-content">
                      <span className="live-activity-feed__item-time">
                        {formatTimestamp(activity.created_at)}
                      </span>
                      <span className="live-activity-feed__item-description">
                        {activity.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {!showAll && activities.length >= initialLimit && (
                <button
                  className="live-activity-feed__show-more"
                  onClick={() => setShowAll(true)}
                >
                  Show More
                </button>
              )}

              {showAll && (
                <button
                  className="live-activity-feed__show-more"
                  onClick={() => setShowAll(false)}
                >
                  Show Less
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default LiveActivityFeed;
