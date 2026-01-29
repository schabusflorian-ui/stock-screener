// frontend/src/components/agents/AgentHeader.js
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  ArrowLeft,
  Play,
  Pause,
  Settings,
  RefreshCw,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle,
  Target,
  BarChart3,
  TrendingUp,
  TrendingDown
} from '../icons';
import './AgentHeader.css';

/**
 * AgentHeader - Status bar and controls for trading agent
 *
 * Features:
 * - Agent name and avatar
 * - Status badge with pulsing animation when running
 * - Mode indicator (Paper/Live)
 * - Quick controls: Start/Pause, Run Scan, Settings
 * - Last/next scan timing
 */
function AgentHeader({
  agent,
  onStart,
  onPause,
  onScan,
  loading = false
}) {
  if (!agent) return null;

  const isRunning = agent.status === 'running';
  const isPaused = agent.status === 'paused';

  const getStatusConfig = () => {
    switch (agent.status) {
      case 'running':
        return {
          color: 'success',
          label: 'Running',
          icon: Zap,
          pulsing: true
        };
      case 'paused':
        return {
          color: 'warning',
          label: 'Paused',
          icon: Pause,
          pulsing: false
        };
      case 'error':
        return {
          color: 'error',
          label: 'Error',
          icon: AlertCircle,
          pulsing: false
        };
      default:
        return {
          color: 'neutral',
          label: 'Idle',
          icon: Clock,
          pulsing: false
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatNextScan = (dateString) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;

    if (diffMs < 0) return 'Overdue';

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) return `in ${diffMins}m`;
    return `in ${diffHours}h ${diffMins % 60}m`;
  };

  // Get mode from linked portfolios
  const getMode = () => {
    if (!agent.portfolios || agent.portfolios.length === 0) return 'no-portfolio';
    const hasLive = agent.portfolios.some(p => p.mode === 'live');
    return hasLive ? 'live' : 'paper';
  };

  const mode = getMode();

  return (
    <header className="agent-header">
      <div className="agent-header__inner">
        {/* Row 1: Back Link */}
        <Link to="/agents" className="agent-header__back-link">
          <ArrowLeft size={18} />
          Back to Agents
        </Link>

        {/* Row 2: Identity + Actions */}
        <div className="agent-header__main">
          <div className="agent-header__identity">
            <div className="agent-header__avatar">
              <Bot size={24} />
            </div>
            <div className="agent-header__title">
              <h1>{agent.name}</h1>
              <span className="agent-header__type">
                {agent.strategy_type?.charAt(0).toUpperCase() + agent.strategy_type?.slice(1)} Strategy
              </span>
            </div>
            {/* Status and Mode badges */}
            <div className="agent-header__badges">
              <div className={`agent-header__status agent-header__status--${statusConfig.color} ${statusConfig.pulsing ? 'pulsing' : ''}`}>
                <StatusIcon size={14} />
                <span>{statusConfig.label}</span>
              </div>
              <div className={`agent-header__mode agent-header__mode--${mode}`}>
                {mode === 'live' ? (
                  <>
                    <Zap size={12} />
                    <span>Live Trading</span>
                  </>
                ) : mode === 'paper' ? (
                  <>
                    <CheckCircle size={12} />
                    <span>Paper Trading</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} />
                    <span>No Portfolio</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="agent-header__actions">
            {/* Start/Pause button */}
            {isRunning ? (
              <button
                className="btn btn--secondary agent-header__control"
                onClick={onPause}
                disabled={loading}
              >
                <Pause size={16} />
                <span>Pause</span>
              </button>
            ) : (
              <button
                className="btn btn--primary agent-header__control"
                onClick={onStart}
                disabled={loading || mode === 'no-portfolio'}
                title={mode === 'no-portfolio' ? 'Create a portfolio first' : 'Start autonomous trading'}
              >
                <Play size={16} />
                <span>Start</span>
              </button>
            )}

            {/* Run Scan button - only show if onScan is provided */}
            {onScan && (
              <button
                className="btn btn--secondary agent-header__control"
                onClick={onScan}
                disabled={loading}
                title="Run scan now"
              >
                <RefreshCw size={16} className={loading ? 'spinning' : ''} />
                <span>Scan</span>
              </button>
            )}

            {/* Settings link */}
            <Link
              to={`/agents/${agent.id}/settings`}
              className="btn btn--ghost agent-header__control"
            >
              <Settings size={16} />
              <span>Settings</span>
            </Link>
          </div>
        </div>

        {/* Row 3: Stats Bar (Meta Ribbon) */}
        <div className="agent-header__stats-bar">
          <div className="agent-header__stat agent-header__stat--main">
            <Target size={20} />
            <div>
              <span className="agent-header__stat-label">Signals Generated</span>
              <span className="agent-header__stat-value agent-header__stat-value--large">
                {agent.total_signals_generated || 0}
              </span>
            </div>
          </div>

          <div className="agent-header__stat">
            <Zap size={20} />
            <div>
              <span className="agent-header__stat-label">Trades Executed</span>
              <span className="agent-header__stat-value">
                {agent.total_trades_executed || 0}
              </span>
            </div>
          </div>

          {agent.win_rate != null && (
            <div className={`agent-header__stat ${agent.win_rate >= 50 ? 'agent-header__stat--positive' : 'agent-header__stat--negative'}`}>
              {agent.win_rate >= 50 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <div>
                <span className="agent-header__stat-label">Win Rate</span>
                <span className="agent-header__stat-value">{agent.win_rate.toFixed(1)}%</span>
              </div>
            </div>
          )}

          {agent.sharpe_ratio != null && (
            <div className="agent-header__stat">
              <BarChart3 size={20} />
              <div>
                <span className="agent-header__stat-label">Sharpe Ratio</span>
                <span className="agent-header__stat-value">{agent.sharpe_ratio.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Last Scan timing in stats bar */}
          {(isRunning || isPaused) && (
            <div className="agent-header__stat agent-header__stat--timing">
              <Clock size={20} />
              <div>
                <span className="agent-header__stat-label">Last Scan</span>
                <span className="agent-header__stat-value">{formatTimeAgo(agent.last_scan_at)}</span>
                {isRunning && agent.next_scan_at && (
                  <span className="agent-header__stat-subvalue">Next: {formatNextScan(agent.next_scan_at)}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AgentHeader;
