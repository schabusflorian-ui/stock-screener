// frontend/src/components/home/AIDailyBriefing.js
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Bot,
  Bell,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  IconButton,
  PrismSparkle
} from '../icons';
import './AIDailyBriefing.css';

// Get time-based greeting
function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Format currency
function formatCurrency(value) {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

// Format percentage
function formatPercent(value) {
  if (value === null || value === undefined) return '0.0%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// Generate briefing text (professional, neutral tone)
function generateBriefingText(portfolios, agents, alertsSummary, marketRegime) {
  const parts = [];

  // Portfolio summary
  if (portfolios?.length > 0) {
    const avgChange = portfolios.reduce((sum, p) => sum + (p.daily_change_pct || 0), 0) / portfolios.length;

    if (avgChange !== 0) {
      const direction = avgChange > 0 ? 'up' : 'down';
      parts.push(`Your portfolios are ${direction} ${Math.abs(avgChange).toFixed(2)}% today.`);
    }
  }

  // Agent activity
  if (agents?.length > 0) {
    const runningAgents = agents.filter(a => a.status === 'running').length;
    const totalSignals = agents.reduce((sum, a) => sum + (a.pending_signals || 0), 0);

    if (runningAgents > 0) {
      parts.push(`${runningAgents} AI agent${runningAgents > 1 ? 's' : ''} active.`);
    }
    if (totalSignals > 0) {
      parts.push(`${totalSignals} signal${totalSignals > 1 ? 's' : ''} awaiting review.`);
    }
  }

  // Alerts summary
  if (alertsSummary?.unread > 0) {
    parts.push(`${alertsSummary.unread} unread alert${alertsSummary.unread > 1 ? 's' : ''}.`);
  }

  // Market regime context
  if (marketRegime) {
    const regimeText = {
      CRISIS: 'Market conditions indicate elevated risk.',
      LATE_CYCLE: 'Markets showing late-cycle characteristics.',
      FEAR: 'Sentiment indicators suggest caution.',
      EARLY_CYCLE: 'Early cycle conditions may favor growth.',
      NEUTRAL: 'Market conditions are balanced.'
    };
    if (regimeText[marketRegime]) {
      parts.push(regimeText[marketRegime]);
    }
  }

  return parts.length > 0 ? parts.join(' ') : 'No significant updates at this time.';
}

// Onboarding CTAs for new users
function OnboardingCTAs() {
  return (
    <div className="ai-briefing-onboarding">
      <div className="onboarding-header">
        <div className="ai-icon-container animated">
          <PrismSparkle size={16} />
        </div>
        <div>
          <h3>Get Started with PRISM</h3>
          <p>Set up portfolios and AI agents to unlock personalized insights</p>
        </div>
      </div>

      <div className="onboarding-actions">
        <Link to="/portfolios" className="onboarding-cta primary">
          <IconButton icon={Briefcase} colorScheme="portfolio" size="small" />
          <span>Create Portfolio</span>
          <ArrowRight size={16} />
        </Link>

        <Link to="/agents/new" className="onboarding-cta">
          <IconButton icon={Bot} colorScheme="ai" size="small" />
          <span>Set Up AI Agent</span>
          <ArrowRight size={16} />
        </Link>

        <Link to="/alerts" className="onboarding-cta">
          <IconButton icon={Bell} colorScheme="alerts" size="small" />
          <span>Configure Alerts</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function AIDailyBriefing({
  portfolios = [],
  agents = [],
  alertsSummary = null,
  marketRegime = null,
  loading = false
}) {
  const timeOfDay = getTimeOfDay();
  // Ensure portfolios and agents are arrays
  const portfoliosList = Array.isArray(portfolios) ? portfolios : [];
  const agentsList = Array.isArray(agents) ? agents : [];
  const hasData = portfoliosList.length > 0 || agentsList.length > 0;

  const briefingText = useMemo(() => {
    if (!hasData) return null;
    return generateBriefingText(portfoliosList, agentsList, alertsSummary, marketRegime);
  }, [portfoliosList, agentsList, alertsSummary, marketRegime, hasData]);

  // Calculate summary stats
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
      <div className="ai-briefing-card loading">
        <div className="briefing-skeleton">
          <div className="skeleton-line wide" />
          <div className="skeleton-line medium" />
        </div>
      </div>
    );
  }

  // Show onboarding for new users
  if (!hasData) {
    return <OnboardingCTAs />;
  }

  return (
    <div className="ai-briefing-card">
      <div className="briefing-header">
        <div className="briefing-greeting">
          <div className="ai-icon-container animated">
            <PrismSparkle size={14} />
          </div>
          <h2>Good {timeOfDay}</h2>
        </div>
        <span className="briefing-date">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
          })}
        </span>
      </div>

      <p className="briefing-text">{briefingText}</p>

      <div className="briefing-quick-stats">
        {stats.totalValue > 0 && (
          <div className="quick-stat">
            <span className="quick-stat-label">Portfolio Value</span>
            <span className="quick-stat-value">{formatCurrency(stats.totalValue)}</span>
            <span className={`quick-stat-change ${stats.dailyChangePct >= 0 ? 'positive' : 'negative'}`}>
              {stats.dailyChangePct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {formatPercent(stats.dailyChangePct)}
            </span>
          </div>
        )}

        {stats.runningAgents > 0 && (
          <div className="quick-stat">
            <span className="quick-stat-label">Active Agents</span>
            <span className="quick-stat-value">{stats.runningAgents}</span>
            {stats.pendingSignals > 0 && (
              <span className="quick-stat-badge">
                <AlertCircle size={10} />
                {stats.pendingSignals} pending
              </span>
            )}
          </div>
        )}

        {alertsSummary?.unread > 0 && (
          <div className="quick-stat">
            <span className="quick-stat-label">Unread Alerts</span>
            <span className="quick-stat-value">{alertsSummary.unread}</span>
            <Link to="/alerts" className="quick-stat-link">View</Link>
          </div>
        )}
      </div>

      <div className="briefing-actions">
        <Link to="/agents" className="briefing-action">
          <Bot size={14} />
          Review Signals
        </Link>
        <Link to="/portfolios" className="briefing-action">
          <Briefcase size={14} />
          Portfolios
        </Link>
      </div>
    </div>
  );
}

export default AIDailyBriefing;
