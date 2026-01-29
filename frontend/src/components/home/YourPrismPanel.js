// frontend/src/components/home/YourPrismPanel.js
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Bot,
  Bell,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Plus,
  Zap,
  IconButton,
  PrismSparkle,
  MessageSquare
} from '../icons';
import './YourPrismPanel.css';

// Format percentage
function formatPercent(value) {
  if (value === null || value === undefined) return '0.0%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// Onboarding CTAs for new users
function OnboardingState() {
  return (
    <div className="your-prism-panel onboarding">
      <div className="prism-onboarding-header">
        <div className="ai-icon-container">
          <PrismSparkle size={14} />
        </div>
        <div>
          <h3>Get Started with PRISM</h3>
          <p>Set up portfolios and AI agents for personalized insights</p>
        </div>
      </div>

      <div className="prism-onboarding-actions">
        <Link to="/portfolios" className="prism-onboarding-cta primary">
          <IconButton icon={Briefcase} colorScheme="portfolio" size="small" />
          <span>Create Portfolio</span>
          <ChevronRight size={16} />
        </Link>

        <Link to="/analyst" className="prism-onboarding-cta">
          <IconButton icon={MessageSquare} colorScheme="ai" size="small" />
          <span>Talk to AI Analysts</span>
          <ChevronRight size={16} />
        </Link>

        <Link to="/agents/new" className="prism-onboarding-cta">
          <IconButton icon={Bot} colorScheme="ai" size="small" />
          <span>Set Up AI Trading Agent</span>
          <ChevronRight size={16} />
        </Link>

        <Link to="/alerts" className="prism-onboarding-cta">
          <IconButton icon={Bell} colorScheme="alerts" size="small" />
          <span>Configure Alerts</span>
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function YourPrismPanel({
  portfolios = [],
  agents = [],
  alertsSummary = null,
  loading = false
}) {
  // Ensure portfolios and agents are arrays - memoize to avoid recalculation
  const portfoliosList = useMemo(
    () => (Array.isArray(portfolios) ? portfolios : []),
    [portfolios]
  );
  const agentsList = useMemo(
    () => (Array.isArray(agents) ? agents : []),
    [agents]
  );
  const hasData = portfoliosList.length > 0 || agentsList.length > 0;

  // Calculate stats
  const stats = useMemo(() => {
    const totalValue = portfoliosList.reduce((sum, p) => sum + (p.total_value || 0), 0) || 0;
    const dailyChange = portfoliosList.reduce((sum, p) => sum + (p.daily_change || 0), 0) || 0;
    const dailyChangePct = totalValue > 0
      ? (dailyChange / (totalValue - dailyChange)) * 100
      : 0;
    const runningAgents = agentsList.filter(a => a.status === 'running').length || 0;
    const pendingSignals = agentsList.reduce((sum, a) => sum + (a.pending_signals || 0), 0) || 0;

    return { totalValue, dailyChange, dailyChangePct, runningAgents, pendingSignals };
  }, [portfoliosList, agentsList]);

  if (loading) {
    return (
      <div className="your-prism-panel loading">
        <div className="prism-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  // Show onboarding for new users with no data
  if (!hasData) {
    return <OnboardingState />;
  }

  return (
    <div className="your-prism-panel">
      <div className="prism-header">
        <span className="section-label">YOUR PRISM</span>
      </div>

      <div className="prism-items">
        {/* Portfolios Row */}
        <Link to="/portfolios" className="prism-item">
          <IconButton
            icon={Briefcase}
            colorScheme="portfolio"
            size="small"
          />
          <div className="prism-item-content">
            <span className="prism-item-title">Portfolios</span>
            {portfoliosList.length > 0 ? (
              <span className={`prism-item-status ${stats.dailyChangePct >= 0 ? 'positive' : 'negative'}`}>
                {stats.dailyChangePct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {stats.dailyChangePct >= 0 ? 'Up' : 'Down'} {formatPercent(Math.abs(stats.dailyChangePct))} today
              </span>
            ) : (
              <span className="prism-item-status empty">No portfolios yet</span>
            )}
          </div>
          <ChevronRight size={16} className="prism-item-arrow" />
        </Link>

        {/* AI Agents Row */}
        <Link to="/agents" className="prism-item">
          <IconButton
            icon={Bot}
            colorScheme="ai"
            size="small"
          />
          <div className="prism-item-content">
            <span className="prism-item-title">AI Agents</span>
            {agentsList.length > 0 ? (
              <span className="prism-item-status">
                {stats.runningAgents} active
                {stats.pendingSignals > 0 && (
                  <span className="prism-signal-badge">
                    <Zap size={10} />
                    {stats.pendingSignals} signal{stats.pendingSignals > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            ) : (
              <span className="prism-item-status empty">No agents configured</span>
            )}
          </div>
          <ChevronRight size={16} className="prism-item-arrow" />
        </Link>

        {/* Alerts Row */}
        <Link to="/alerts" className="prism-item">
          <IconButton
            icon={Bell}
            colorScheme="alerts"
            size="small"
          />
          <div className="prism-item-content">
            <span className="prism-item-title">Alerts</span>
            <span className="prism-item-status">
              {alertsSummary?.unread || 0} unread
            </span>
          </div>
          <ChevronRight size={16} className="prism-item-arrow" />
        </Link>
      </div>

      {/* Quick Actions - show if user is missing portfolios or agents */}
      {(portfoliosList.length === 0 || agentsList.length === 0) && (
        <div className="prism-quick-actions">
          {portfoliosList.length === 0 && (
            <Link to="/portfolios/new" className="prism-quick-action">
              <Plus size={14} /> Create Portfolio
            </Link>
          )}
          {agentsList.length === 0 && (
            <Link to="/agents/new" className="prism-quick-action">
              <Plus size={14} /> Set Up Trading Agent
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default YourPrismPanel;
