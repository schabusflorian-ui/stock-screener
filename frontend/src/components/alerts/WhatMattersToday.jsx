// frontend/src/components/alerts/WhatMattersToday.jsx
// AI-powered "What Matters Today" summary card

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, ChevronRight } from '../icons';
import { alertsAPI } from '../../services/api';
import './WhatMattersToday.css';

const PRIORITY_COLORS = {
  5: { bg: '#D1FAE5', text: '#065F46', label: 'Critical' },
  4: { bg: '#DBEAFE', text: '#1E40AF', label: 'Important' },
  3: { bg: '#FEF3C7', text: '#B45309', label: 'Moderate' },
  2: { bg: '#F3F4F6', text: '#374151', label: 'Low' },
  1: { bg: '#F3F4F6', text: '#6B7280', label: 'Info' }
};

const SIGNAL_ICONS = {
  strong_buy: TrendingUp,
  buy: TrendingUp,
  bullish: TrendingUp,
  strong_bullish: TrendingUp,
  warning: AlertTriangle,
  watch: AlertTriangle
};

export default function WhatMattersToday({ userId = 'default', onAlertClick }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const response = await alertsAPI.getAISummary(userId);
      if (response.data?.success) {
        setSummary(response.data.data);
      } else {
        setError('Failed to load summary');
      }
    } catch (err) {
      setError(err.message || 'Failed to load AI summary');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleRefresh = () => {
    loadSummary(true);
  };

  if (loading) {
    return (
      <div className="what-matters-card loading">
        <div className="what-matters-header">
          <Sparkles className="ai-icon spinning" size={20} />
          <span>Analyzing your alerts...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="what-matters-card error">
        <div className="what-matters-header">
          <AlertTriangle className="error-icon" size={20} />
          <span>Unable to load AI summary</span>
        </div>
        <p className="error-message">{error}</p>
        <button className="retry-btn" onClick={handleRefresh}>
          <RefreshCw size={14} /> Try Again
        </button>
      </div>
    );
  }

  if (!summary || summary.alertCount === 0) {
    return (
      <div className="what-matters-card empty">
        <div className="what-matters-header">
          <div className="header-left">
            <Sparkles className="ai-icon" size={20} />
            <h3>What Matters Today</h3>
          </div>
        </div>
        <p className="empty-message">
          No new alerts in the past 24 hours. Your watchlist and portfolio are stable.
        </p>
      </div>
    );
  }

  return (
    <div className="what-matters-card">
      <div className="what-matters-header">
        <div className="header-left">
          <Sparkles className="ai-icon" size={20} />
          <h3>What Matters Today</h3>
          {summary.generated && (
            <span className="ai-badge">AI Summary</span>
          )}
        </div>
        <div className="header-right">
          <span className="alert-count">
            {summary.alertCount} alerts
            {summary.highPriorityCount > 0 && (
              <span className="high-priority-badge">
                {summary.highPriorityCount} important
              </span>
            )}
          </span>
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh summary"
          >
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      <div className="what-matters-content">
        <p className="ai-summary">{summary.summary}</p>

        {summary.topPriorities && summary.topPriorities.length > 0 && (
          <div className="top-priorities">
            <h4>Top Priorities</h4>
            <div className="priority-list">
              {summary.topPriorities.map((item, index) => {
                const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS[3];
                const IconComponent = SIGNAL_ICONS[item.signalType] || AlertTriangle;

                return (
                  <Link
                    key={index}
                    to={item.symbol ? `/company/${item.symbol}` : '#'}
                    className="priority-item"
                    onClick={() => onAlertClick?.(item)}
                  >
                    <div className="priority-icon">
                      <IconComponent size={16} />
                    </div>
                    <div className="priority-info">
                      <span className="priority-symbol">{item.symbol}</span>
                      <span className="priority-title">{item.title}</span>
                    </div>
                    <span
                      className="priority-badge"
                      style={{ backgroundColor: priorityStyle.bg, color: priorityStyle.text }}
                    >
                      P{item.priority}
                    </span>
                    <ChevronRight size={14} className="chevron" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {summary.suggestedActions && summary.suggestedActions.length > 0 && (
          <div className="suggested-actions">
            <h4>Suggested Actions</h4>
            <ul>
              {summary.suggestedActions.map((action, index) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {summary.generatedAt && (
        <div className="what-matters-footer">
          <span className="generated-at">
            Generated {new Date(summary.generatedAt).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}