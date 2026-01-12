// frontend/src/components/agent/AgentStatusBar.js
// Agent status header showing running state, mode, and controls

import { useState } from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  Settings,
  FileText,
  Circle,
  Zap,
  FlaskConical,
  Lock
} from 'lucide-react';
import './AgentStatusBar.css';

const MODES = {
  paper: { label: 'Paper', icon: FlaskConical, class: 'paper' },
  live: { label: 'Live', icon: Zap, class: 'live' },
  paused: { label: 'Paused', icon: Lock, class: 'paused' }
};

function AgentStatusBar({
  running = false,
  mode = 'paper',
  lastScan,
  nextScan,
  onPause,
  onResume,
  onRunNow,
  onConfigure,
  onViewLogs,
  loading = false
}) {
  const [actionLoading, setActionLoading] = useState(null);

  const modeConfig = MODES[mode] || MODES.paper;
  const ModeIcon = modeConfig.icon;

  const handleAction = async (action, handler) => {
    if (!handler) return;
    setActionLoading(action);
    try {
      await handler();
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const formatTimeUntil = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMs < 0) return 'Due';
    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffHours < 24) return `in ${diffHours}h`;
    return date.toLocaleDateString();
  };

  return (
    <div className="agent-status-bar">
      <div className="agent-status-bar__content">
        {/* Status indicators */}
        <div className="agent-status-bar__indicators">
          {/* Running status */}
          <div className={`agent-status-bar__indicator agent-status-bar__indicator--${running ? 'running' : 'stopped'}`}>
            <Circle size={10} className={running ? 'pulse' : ''} fill="currentColor" />
            <span className="agent-status-bar__indicator-label">
              {running ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>

          {/* Mode */}
          <div className={`agent-status-bar__indicator agent-status-bar__indicator--mode agent-status-bar__indicator--${modeConfig.class}`}>
            <ModeIcon size={14} />
            <span className="agent-status-bar__indicator-label">
              {modeConfig.label}
            </span>
          </div>

          {/* Last scan */}
          <div className="agent-status-bar__indicator agent-status-bar__indicator--time">
            <span className="agent-status-bar__indicator-title">Last Scan:</span>
            <span className="agent-status-bar__indicator-value">{formatTimeAgo(lastScan)}</span>
          </div>

          {/* Next scan */}
          <div className="agent-status-bar__indicator agent-status-bar__indicator--time">
            <span className="agent-status-bar__indicator-title">Next Scan:</span>
            <span className="agent-status-bar__indicator-value">{formatTimeUntil(nextScan)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="agent-status-bar__controls">
          {running ? (
            <button
              className="agent-status-bar__btn agent-status-bar__btn--pause"
              onClick={() => handleAction('pause', onPause)}
              disabled={loading || actionLoading}
            >
              {actionLoading === 'pause' ? (
                <RefreshCw size={16} className="spinning" />
              ) : (
                <Pause size={16} />
              )}
              <span>Pause Agent</span>
            </button>
          ) : (
            <button
              className="agent-status-bar__btn agent-status-bar__btn--resume"
              onClick={() => handleAction('resume', onResume)}
              disabled={loading || actionLoading}
            >
              {actionLoading === 'resume' ? (
                <RefreshCw size={16} className="spinning" />
              ) : (
                <Play size={16} />
              )}
              <span>Start Agent</span>
            </button>
          )}

          <button
            className="agent-status-bar__btn agent-status-bar__btn--run"
            onClick={() => handleAction('run', onRunNow)}
            disabled={loading || actionLoading || !running}
            title={!running ? 'Agent must be running' : 'Run analysis now'}
          >
            {actionLoading === 'run' ? (
              <RefreshCw size={16} className="spinning" />
            ) : (
              <RefreshCw size={16} />
            )}
            <span>Run Now</span>
          </button>

          <button
            className="agent-status-bar__btn agent-status-bar__btn--secondary"
            onClick={onConfigure}
            disabled={loading}
          >
            <Settings size={16} />
            <span>Configure</span>
          </button>

          <button
            className="agent-status-bar__btn agent-status-bar__btn--secondary"
            onClick={onViewLogs}
            disabled={loading}
          >
            <FileText size={16} />
            <span>Logs</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentStatusBar;
