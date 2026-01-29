// frontend/src/pages/agent/AgentDashboard.js
// Main AI Trading Agent Control Dashboard
// Unified view for agent status, pending approvals, and activity

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Brain,
  ArrowLeft,
  Settings,
  RefreshCw,
  BarChart3,
  TrendingUp
} from '../../components/icons';
import { portfoliosAPI, agentAPI } from '../../services/api';
import AgentStatusBar from '../../components/agent/AgentStatusBar';
import PendingApprovalsCard from '../../components/agent/PendingApprovalsCard';
import AgentActivityLog from '../../components/agent/AgentActivityLog';
import MarketContextCard from '../../components/agent/MarketContextCard';
import { Skeleton } from '../../components/Skeleton';
import './AgentDashboard.css';

function AgentDashboard() {
  const { portfolioId } = useParams();
  const parsedPortfolioId = portfolioId ? parseInt(portfolioId, 10) : null;

  // State
  const [portfolio, setPortfolio] = useState(null);
  const [agentStatus, setAgentStatus] = useState({
    running: false,
    mode: 'paper',
    lastScan: null,
    nextScan: null
  });
  const [pendingTrades, setPendingTrades] = useState([]);
  const [activities, setActivities] = useState([]);
  const [marketContext, setMarketContext] = useState({
    regime: 'NEUTRAL',
    regimeConfidence: 0,
    vix: null,
    breadth: null,
    signalStrength: { positive: 0, negative: 0, neutral: 0 }
  });
  const [todayStats, setTodayStats] = useState({
    executed: 0,
    winRate: 0,
    pnl: 0,
    signalsGenerated: 0,
    approvalRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!parsedPortfolioId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch portfolio details
      const portfolioRes = await portfoliosAPI.get(parsedPortfolioId);
      if (portfolioRes.data) {
        setPortfolio(portfolioRes.data);
      }

      // Fetch agent status (if API exists)
      try {
        const statusRes = await agentAPI.getStatus(parsedPortfolioId);
        if (statusRes.data) {
          setAgentStatus(statusRes.data);
        }
      } catch (e) {
        // Agent API may not exist yet, use defaults
        console.log('Agent status API not available:', e.message);
      }

      // Fetch pending trades
      try {
        const pendingRes = await agentAPI.getPendingTrades(parsedPortfolioId);
        if (pendingRes.data) {
          setPendingTrades(pendingRes.data);
        }
      } catch (e) {
        console.log('Pending trades API not available:', e.message);
      }

      // Fetch activity log
      try {
        const activityRes = await agentAPI.getActivity(parsedPortfolioId);
        if (activityRes.data) {
          setActivities(activityRes.data);
        }
      } catch (e) {
        console.log('Activity API not available:', e.message);
      }

      // Fetch market context
      try {
        const contextRes = await agentAPI.getMarketContext(parsedPortfolioId);
        if (contextRes.data) {
          setMarketContext(contextRes.data);
        }
      } catch (e) {
        console.log('Market context API not available:', e.message);
      }

      // Fetch today's stats
      try {
        const statsRes = await agentAPI.getTodayStats(parsedPortfolioId);
        if (statsRes.data) {
          setTodayStats(statsRes.data);
        }
      } catch (e) {
        console.log('Stats API not available:', e.message);
      }

    } catch (err) {
      setError(err.message || 'Failed to load agent dashboard');
    } finally {
      setLoading(false);
    }
  }, [parsedPortfolioId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Agent control handlers
  const handlePause = async () => {
    try {
      await agentAPI.pause(parsedPortfolioId);
      setAgentStatus(prev => ({ ...prev, running: false }));
    } catch (e) {
      console.error('Failed to pause agent:', e);
    }
  };

  const handleResume = async () => {
    try {
      await agentAPI.resume(parsedPortfolioId);
      setAgentStatus(prev => ({ ...prev, running: true }));
    } catch (e) {
      console.error('Failed to resume agent:', e);
    }
  };

  const handleRunNow = async () => {
    try {
      await agentAPI.runNow(parsedPortfolioId);
      // Refresh data after scan
      setTimeout(fetchData, 2000);
    } catch (e) {
      console.error('Failed to run scan:', e);
    }
  };

  // Trade approval handlers
  const handleApproveTrade = async (tradeId) => {
    try {
      await agentAPI.approveTrade(parsedPortfolioId, tradeId);
      setPendingTrades(prev => prev.filter(t => t.id !== tradeId));
      fetchData(); // Refresh to update stats
    } catch (e) {
      console.error('Failed to approve trade:', e);
    }
  };

  const handleRejectTrade = async (tradeId) => {
    try {
      await agentAPI.rejectTrade(parsedPortfolioId, tradeId);
      setPendingTrades(prev => prev.filter(t => t.id !== tradeId));
    } catch (e) {
      console.error('Failed to reject trade:', e);
    }
  };

  const handleApproveAll = async () => {
    try {
      await agentAPI.approveAllTrades(parsedPortfolioId);
      setPendingTrades([]);
      fetchData();
    } catch (e) {
      console.error('Failed to approve all trades:', e);
    }
  };

  const handleRejectAll = async () => {
    try {
      await agentAPI.rejectAllTrades(parsedPortfolioId);
      setPendingTrades([]);
    } catch (e) {
      console.error('Failed to reject all trades:', e);
    }
  };

  // Error state
  if (!parsedPortfolioId) {
    return (
      <div className="agent-dashboard">
        <div className="agent-dashboard__error">
          <Brain size={48} />
          <h2>Select a Portfolio</h2>
          <p>Please select a portfolio to use the AI Trading Agent.</p>
          <Link to="/portfolios" className="agent-dashboard__link">
            <ArrowLeft size={16} /> Go to Portfolios
          </Link>
        </div>
      </div>
    );
  }

  if (loading && !portfolio) {
    return (
      <div className="agent-dashboard">
        <Skeleton className="agent-dashboard__skeleton-header" />
        <div className="agent-dashboard__skeleton-grid">
          <Skeleton className="agent-dashboard__skeleton-card" />
          <Skeleton className="agent-dashboard__skeleton-card" />
        </div>
        <Skeleton className="agent-dashboard__skeleton-activity" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-dashboard">
        <div className="agent-dashboard__error">
          <h2>Error Loading Dashboard</h2>
          <p>{error}</p>
          <button onClick={fetchData} className="agent-dashboard__retry-btn">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-dashboard">
      {/* Header */}
      <div className="agent-dashboard__header">
        <div className="agent-dashboard__title-section">
          <Link to={`/portfolios/${parsedPortfolioId}`} className="agent-dashboard__back">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="agent-dashboard__title">
              <Brain size={24} />
              AI Trading Agent
            </h1>
            <p className="agent-dashboard__subtitle">
              {portfolio?.name || 'Portfolio'} • Automated Trading Dashboard
            </p>
          </div>
        </div>
        <div className="agent-dashboard__header-actions">
          <Link
            to={`/agent/${parsedPortfolioId}/settings`}
            className="agent-dashboard__settings-btn"
          >
            <Settings size={18} />
            <span>Settings</span>
          </Link>
          <div className="agent-dashboard__portfolio-value">
            <span className="agent-dashboard__value-label">Portfolio Value</span>
            <span className="agent-dashboard__value">
              ${(portfolio?.current_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Agent Status Bar */}
      <AgentStatusBar
        running={agentStatus.running}
        mode={agentStatus.mode}
        lastScan={agentStatus.lastScan}
        nextScan={agentStatus.nextScan}
        onPause={handlePause}
        onResume={handleResume}
        onRunNow={handleRunNow}
        onConfigure={() => window.location.href = `/agent/${parsedPortfolioId}/settings`}
        onViewLogs={() => {}}
        loading={loading}
      />

      {/* Main content grid */}
      <div className="agent-dashboard__grid">
        {/* Left column - Pending approvals */}
        <div className="agent-dashboard__main">
          <PendingApprovalsCard
            trades={pendingTrades}
            onApprove={handleApproveTrade}
            onReject={handleRejectTrade}
            onApproveAll={handleApproveAll}
            onRejectAll={handleRejectAll}
            onRefresh={fetchData}
            loading={loading}
          />
        </div>

        {/* Right column - Context & Stats */}
        <div className="agent-dashboard__sidebar">
          <MarketContextCard
            regime={marketContext.regime}
            regimeConfidence={marketContext.regimeConfidence}
            vix={marketContext.vix}
            vixLevel={marketContext.vixLevel}
            breadth={marketContext.breadth}
            breadthLevel={marketContext.breadthLevel}
            signalStrength={marketContext.signalStrength}
            positionAdjustment={marketContext.positionAdjustment}
            loading={loading}
          />

          {/* Today's Performance card */}
          <div className="agent-dashboard__stats-card">
            <div className="agent-dashboard__stats-header">
              <TrendingUp size={16} />
              <span>Today's Performance</span>
            </div>
            <div className="agent-dashboard__stats-grid">
              <div className="agent-dashboard__stat">
                <span className="agent-dashboard__stat-value">{todayStats.executed}</span>
                <span className="agent-dashboard__stat-label">Trades</span>
              </div>
              <div className="agent-dashboard__stat">
                <span className="agent-dashboard__stat-value">{todayStats.winRate}%</span>
                <span className="agent-dashboard__stat-label">Win Rate</span>
              </div>
              <div className="agent-dashboard__stat">
                <span className={`agent-dashboard__stat-value ${todayStats.pnl >= 0 ? 'positive' : 'negative'}`}>
                  {todayStats.pnl >= 0 ? '+' : ''}${todayStats.pnl.toLocaleString()}
                </span>
                <span className="agent-dashboard__stat-label">P&L</span>
              </div>
              <div className="agent-dashboard__stat">
                <span className="agent-dashboard__stat-value">{todayStats.signalsGenerated}</span>
                <span className="agent-dashboard__stat-label">Signals</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <AgentActivityLog
        activities={activities}
        loading={loading}
        limit={10}
        onRefresh={fetchData}
      />

      {/* Quick actions footer */}
      <div className="agent-dashboard__footer">
        <Link to={`/portfolios/${parsedPortfolioId}/ai`} className="agent-dashboard__footer-link">
          <BarChart3 size={16} />
          <span>Factor Analysis</span>
        </Link>
        <Link to={`/portfolios/${parsedPortfolioId}`} className="agent-dashboard__footer-link">
          <TrendingUp size={16} />
          <span>Portfolio Details</span>
        </Link>
      </div>
    </div>
  );
}

export default AgentDashboard;
