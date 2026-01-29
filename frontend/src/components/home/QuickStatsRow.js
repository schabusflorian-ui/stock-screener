// frontend/src/components/home/QuickStatsRow.js
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Bot,
  Bell,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Zap,
  IconButton
} from '../icons';
import './QuickStatsRow.css';

// Format currency compactly
function formatCurrency(value) {
  if (value === null || value === undefined) return '$0';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// Format percentage
function formatPercent(value) {
  if (value === null || value === undefined) return '0.0%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function QuickStatsRow({
  portfolios = [],
  agents = [],
  alertsSummary = null,
  loading = false
}) {
  // Calculate portfolio stats
  const portfolioStats = React.useMemo(() => {
    if (!portfolios?.length) return null;

    const totalValue = portfolios.reduce((sum, p) => sum + (p.total_value || 0), 0);
    const dailyChange = portfolios.reduce((sum, p) => sum + (p.daily_change || 0), 0);
    const dailyChangePct = totalValue > 0
      ? (dailyChange / (totalValue - dailyChange)) * 100
      : 0;

    return {
      totalValue,
      dailyChange,
      dailyChangePct,
      count: portfolios.length
    };
  }, [portfolios]);

  // Calculate agent stats
  const agentStats = React.useMemo(() => {
    if (!agents?.length) return null;

    const running = agents.filter(a => a.status === 'running').length;
    const paused = agents.filter(a => a.status === 'paused').length;
    const pendingSignals = agents.reduce((sum, a) => sum + (a.pending_signals || 0), 0);
    const totalSignalsWeek = agents.reduce((sum, a) => sum + (a.signals_this_week || 0), 0);

    return {
      total: agents.length,
      running,
      paused,
      pendingSignals,
      totalSignalsWeek
    };
  }, [agents]);

  if (loading) {
    return (
      <div className="quick-stats-row">
        {[1, 2, 3].map(i => (
          <div key={i} className="quick-stat-card skeleton">
            <div className="skeleton-icon" />
            <div className="skeleton-content">
              <div className="skeleton-line short" />
              <div className="skeleton-line wide" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="quick-stats-row">
      {/* Portfolio Snapshot */}
      <Link to="/portfolios" className="quick-stat-card">
        <IconButton
          icon={Briefcase}
          colorScheme="portfolio"
          size="small"
          className="stat-card-icon-btn"
        />
        <div className="stat-card-content">
          <span className="stat-card-label">Portfolio Value</span>
          {portfolioStats ? (
            <>
              <span className="stat-card-value">
                <span className="number">{formatCurrency(portfolioStats.totalValue)}</span>
              </span>
              <span className={`stat-card-change ${portfolioStats.dailyChangePct >= 0 ? 'positive' : 'negative'}`}>
                {portfolioStats.dailyChangePct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span className="number">{formatPercent(portfolioStats.dailyChangePct)}</span> today
              </span>
            </>
          ) : (
            <>
              <span className="stat-card-value empty">No portfolios</span>
              <span className="stat-card-cta">Create one <ChevronRight size={14} /></span>
            </>
          )}
        </div>
      </Link>

      {/* AI Agent Status */}
      <Link to="/agents" className="quick-stat-card">
        <IconButton
          icon={Bot}
          colorScheme="ai"
          size="small"
          className="stat-card-icon-btn"
        />
        <div className="stat-card-content">
          <span className="stat-card-label">AI Agents</span>
          {agentStats ? (
            <>
              <span className="stat-card-value">
                <span className="number">{agentStats.running}</span> active
                {agentStats.paused > 0 && <span className="stat-card-sub"> / <span className="number">{agentStats.paused}</span> paused</span>}
              </span>
              {agentStats.pendingSignals > 0 ? (
                <span className="stat-card-badge warning">
                  <Zap size={10} />
                  <span className="number">{agentStats.pendingSignals}</span> signal{agentStats.pendingSignals > 1 ? 's' : ''} pending
                </span>
              ) : (
                <span className="stat-card-meta">
                  <span className="number">{agentStats.totalSignalsWeek}</span> signal{agentStats.totalSignalsWeek !== 1 ? 's' : ''} this week
                </span>
              )}
            </>
          ) : (
            <>
              <span className="stat-card-value empty">No agents</span>
              <span className="stat-card-cta">Set up <ChevronRight size={14} /></span>
            </>
          )}
        </div>
      </Link>

      {/* Recent Alerts */}
      <Link to="/alerts" className="quick-stat-card">
        <IconButton
          icon={Bell}
          colorScheme="alerts"
          size="small"
          className="stat-card-icon-btn"
        />
        <div className="stat-card-content">
          <span className="stat-card-label">Alerts</span>
          {alertsSummary ? (
            <>
              <span className="stat-card-value">
                <span className="number">{alertsSummary.unread || 0}</span> unread
              </span>
              <span className="stat-card-meta">
                <span className="number">{alertsSummary.total || 0}</span> total this week
              </span>
            </>
          ) : (
            <>
              <span className="stat-card-value">
                <span className="number">0</span> unread
              </span>
              <span className="stat-card-meta">
                <span className="number">0</span> total this week
              </span>
            </>
          )}
        </div>
      </Link>
    </div>
  );
}

export default QuickStatsRow;
