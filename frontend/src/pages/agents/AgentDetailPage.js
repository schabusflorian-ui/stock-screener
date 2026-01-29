// frontend/src/pages/agents/AgentDetailPage.js
// Agent Dashboard - Tab-based control center for a trading agent

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  RefreshCw,
  Activity,
  Wallet,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Zap,
  Target,
  History,
  LayoutDashboard,
  Brain,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Shield,
  Layers,
  Calendar,
  DollarSign,
  Sparkles
} from '../../components/icons';
import { agentsAPI, attributionAPI } from '../../services/api';
import { useSubscription } from '../../context/SubscriptionContext';
import { FeatureGate } from '../../components/subscription';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import { PaperTradingPanel, MLCombinerPanel, ExecutionTab, AgentHeader, OverviewHero, ActionRequiredBanner } from '../../components/agents';
import {
  HedgeSuggestionsPanel,
  RecommendationHistory,
  FactorPerformance,
  ContributionScheduleCard,
  ContributionHistoryTable,
  ProjectionChart
} from '../../components/agent';
import { SectionErrorBoundary } from '../../components/ErrorBoundary';
import './AgentDetailPage.css';

const SIGNAL_ACTION_CONFIG = {
  strong_buy: { color: '#059669', label: 'Strong Buy' },
  buy: { color: '#059669', label: 'Buy' },
  hold: { color: '#94A3B8', label: 'Hold' },
  sell: { color: '#D97706', label: 'Sell' },
  strong_sell: { color: '#DC2626', label: 'Strong Sell' }
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'signals', label: 'Signals', icon: Target },
  { id: 'execution', label: 'Execution', icon: Zap },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
  { id: 'history', label: 'History', icon: History },
  { id: 'factors', label: 'Factors', icon: Layers },
  { id: 'hedges', label: 'Hedges', icon: Shield },
  { id: 'ml', label: 'ML Training', icon: Brain },
];

// Tabs for beginner strategy agents
const BEGINNER_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'contributions', label: 'Contributions', icon: DollarSign },
  { id: 'projection', label: 'Projection', icon: TrendingUp },
  { id: 'history', label: 'History', icon: History },
];

const STRATEGY_TYPE_LABELS = {
  dca: 'Dollar Cost Averaging',
  value_averaging: 'Value Averaging',
  drip: 'Dividend Reinvestment',
  rebalance: 'Portfolio Rebalancing',
  lump_dca: 'Lump Sum + DCA'
};

// Helper to format reasoning data
function ReasoningFactors({ reasoning }) {
  // Handle if reasoning is a string (JSON)
  let factors = reasoning;
  if (typeof reasoning === 'string') {
    try {
      factors = JSON.parse(reasoning);
    } catch {
      return <p className="signal-card__reasoning-text">{reasoning}</p>;
    }
  }

  if (!Array.isArray(factors) || factors.length === 0) {
    return null;
  }

  const getDirectionIcon = (direction) => {
    switch (direction?.toLowerCase()) {
      case 'bullish':
        return <TrendingUp size={12} className="factor-icon bullish" />;
      case 'bearish':
        return <TrendingDown size={12} className="factor-icon bearish" />;
      case 'supportive':
        return <TrendingUp size={12} className="factor-icon supportive" />;
      case 'cautionary':
        return <TrendingDown size={12} className="factor-icon cautionary" />;
      case 'informational':
        return <Info size={12} className="factor-icon neutral" />;
      default:
        return <Minus size={12} className="factor-icon neutral" />;
    }
  };

  const getDirectionClass = (direction) => {
    switch (direction?.toLowerCase()) {
      case 'bullish':
      case 'supportive':
        return 'bullish';
      case 'bearish':
      case 'cautionary':
        return 'bearish';
      default:
        return 'neutral';
    }
  };

  // Show only top factors (by weight)
  const topFactors = factors
    .filter(f => f.weight > 0 || f.direction !== 'informational')
    .slice(0, 4);

  return (
    <div className="signal-card__factors">
      {topFactors.map((factor, idx) => (
        <div key={idx} className={`signal-card__factor ${getDirectionClass(factor.direction)}`}>
          <div className="signal-card__factor-header">
            {getDirectionIcon(factor.direction)}
            <span className="signal-card__factor-name">{factor.factor}</span>
            {factor.weight > 0 && (
              <span className="signal-card__factor-weight">
                {(factor.weight * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {factor.details && (
            <p className="signal-card__factor-details">{factor.details}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Signal tier configuration
const SIGNAL_TIER_CONFIG = {
  STRONG: { color: '#059669', label: 'Strong' },
  MODERATE: { color: '#D97706', label: 'Moderate' },
  BORDERLINE: { color: '#94A3B8', label: 'Borderline' }
};

// Helper to extract tier from signal reasoning
const getSignalTier = (signal) => {
  if (!signal.reasoning) return null;
  try {
    const reasoning = typeof signal.reasoning === 'string'
      ? JSON.parse(signal.reasoning)
      : signal.reasoning;
    return reasoning?.tier || null;
  } catch {
    return null;
  }
};

function SignalCard({ signal, onApprove, onReject, loadingAction }) {
  const actionConfig = SIGNAL_ACTION_CONFIG[signal.action] || SIGNAL_ACTION_CONFIG.hold;
  const isApproving = loadingAction === 'approve';
  const isRejecting = loadingAction === 'reject';
  const isLoading = isApproving || isRejecting;
  const tier = getSignalTier(signal);
  const tierConfig = tier ? SIGNAL_TIER_CONFIG[tier] : null;

  return (
    <div className={`signal-card ${tier ? `signal-card--${tier.toLowerCase()}` : ''}`}>
      <div className="signal-card__header">
        <div className="signal-card__symbol">
          <span className="signal-card__ticker">{signal.symbol}</span>
          <span
            className="signal-card__action"
            style={{ backgroundColor: actionConfig.color }}
          >
            {actionConfig.label}
          </span>
          {tierConfig && (
            <span
              className="signal-card__tier"
              style={{ backgroundColor: tierConfig.color }}
            >
              {tierConfig.label}
            </span>
          )}
        </div>
        <div className="signal-card__confidence">
          {(signal.confidence * 100).toFixed(0)}%
        </div>
      </div>

      <div className="signal-card__details">
        <div className="signal-card__detail">
          <span className="signal-card__label">Score</span>
          <span className="signal-card__value">{signal.overall_score?.toFixed(2)}</span>
        </div>
        <div className="signal-card__detail">
          <span className="signal-card__label">Position</span>
          <span className="signal-card__value">
            {signal.position_size_pct ? `${(signal.position_size_pct * 100).toFixed(1)}%` : '-'}
          </span>
        </div>
        {signal.price_at_signal && (
          <div className="signal-card__detail">
            <span className="signal-card__label">Price</span>
            <span className="signal-card__value">${signal.price_at_signal.toFixed(2)}</span>
          </div>
        )}
      </div>

      {signal.reasoning && (
        <ReasoningFactors reasoning={signal.reasoning} />
      )}

      <div className="signal-card__actions">
        <Button
          variant="success"
          size="sm"
          onClick={() => onApprove(signal.id)}
          disabled={isLoading}
        >
          {isApproving ? <RefreshCw size={14} className="spinning" /> : <CheckCircle2 size={14} />}
          {isApproving ? 'Approving...' : 'Approve'}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onReject(signal.id)}
          disabled={isLoading}
        >
          {isRejecting ? <RefreshCw size={14} className="spinning" /> : <XCircle size={14} />}
          {isRejecting ? 'Rejecting...' : 'Reject'}
        </Button>
      </div>
    </div>
  );
}

function ActivityItem({ activity }) {
  const getIcon = () => {
    switch (activity.activity_type) {
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
        return <AlertCircle size={14} />;
      default:
        return <Activity size={14} />;
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="activity-item">
      <div className="activity-item__icon">{getIcon()}</div>
      <div className="activity-item__content">
        <span className="activity-item__description">{activity.description}</span>
        <span className="activity-item__time">{formatTime(activity.created_at)}</span>
      </div>
    </div>
  );
}

function AgentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [agent, setAgent] = useState(null);
  const [signals, setSignals] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [activity, setActivity] = useState([]);
  const [marketContext, setMarketContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({}); // Track loading state per signal

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [agentRes, signalsRes, portfoliosRes, activityRes] = await Promise.all([
        agentsAPI.get(id),
        agentsAPI.getSignals(id, { status: 'pending', limit: 10 }),
        agentsAPI.getPortfolios(id),
        agentsAPI.getActivity(id, 20)
      ]);

      setAgent(agentRes.data.data || agentRes.data.agent);
      setSignals(signalsRes.data.data || signalsRes.data.signals || []);
      setPortfolios(portfoliosRes.data.data || portfoliosRes.data.portfolios || []);
      setActivity(activityRes.data.data || activityRes.data.activity || []);

      // Try to get market context
      try {
        const regimeRes = await attributionAPI.getRegime();
        setMarketContext(regimeRes.data);
      } catch (err) {
        console.log('Market context not available:', err.message);
      }
    } catch (err) {
      console.error('Failed to load agent:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling for status updates when agent is running
  useEffect(() => {
    if (agent?.status === 'running') {
      const interval = setInterval(() => {
        loadData();
      }, 30000); // Poll every 30 seconds

      return () => clearInterval(interval);
    }
  }, [agent?.status, loadData]);

  const handleStart = async () => {
    try {
      await agentsAPI.start(id);
      setAgent(prev => ({ ...prev, status: 'running' }));
    } catch (err) {
      console.error('Failed to start agent:', err);
    }
  };

  const handlePause = async () => {
    try {
      await agentsAPI.pause(id);
      setAgent(prev => ({ ...prev, status: 'paused' }));
    } catch (err) {
      console.error('Failed to pause agent:', err);
    }
  };

  const handleRunScan = async () => {
    try {
      setScanLoading(true);
      await agentsAPI.runScan(id);
      // Reload data after scan
      setTimeout(loadData, 2000);
    } catch (err) {
      console.error('Failed to run scan:', err);
    } finally {
      setScanLoading(false);
    }
  };

  const handleApproveSignal = async (signalId) => {
    // Prevent double-clicks
    if (actionLoading[signalId]) return;

    try {
      setActionLoading(prev => ({ ...prev, [signalId]: 'approve' }));
      setError(null); // Clear any previous error

      await agentsAPI.approveSignal(id, signalId);
      setSignals(prev => prev.filter(s => s.id !== signalId));
    } catch (err) {
      console.error('Failed to approve signal:', err);
      setError(`Failed to approve signal: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [signalId]: null }));
    }
  };

  const handleRejectSignal = async (signalId) => {
    // Prevent double-clicks
    if (actionLoading[signalId]) return;

    try {
      setActionLoading(prev => ({ ...prev, [signalId]: 'reject' }));
      setError(null); // Clear any previous error

      await agentsAPI.rejectSignal(id, signalId);
      setSignals(prev => prev.filter(s => s.id !== signalId));
    } catch (err) {
      console.error('Failed to reject signal:', err);
      setError(`Failed to reject signal: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [signalId]: null }));
    }
  };

  const formatValue = (value) => {
    if (!value) return '-';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="agent-detail">
        <Skeleton style={{ height: 80, marginBottom: 24 }} />
        <div className="agent-detail__grid">
          <Skeleton style={{ height: 400 }} />
          <Skeleton style={{ height: 300 }} />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="agent-detail">
        <Card variant="glass" className="agent-detail__error">
          <AlertCircle size={32} />
          <h3>Error Loading Agent</h3>
          <p>{error || 'Agent not found'}</p>
          <div className="agent-detail__error-actions">
            <Button variant="secondary" onClick={() => navigate('/agents')}>
              <ArrowLeft size={16} />
              Back to Agents
            </Button>
            <Button variant="primary" onClick={loadData}>
              <RefreshCw size={16} />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Augment agent with portfolios for header
  const agentWithPortfolios = { ...agent, portfolios };

  // Check if this is a beginner agent
  const isBeginnerAgent = agent.beginner_config || agent.agent_category === 'beginner';
  const beginnerConfig = agent.beginner_config ?
    (typeof agent.beginner_config === 'string' ? JSON.parse(agent.beginner_config) : agent.beginner_config)
    : null;
  const currentTabs = isBeginnerAgent ? BEGINNER_TABS : TABS;

  return (
    <FeatureGate
      feature="paper_trading_bots"
      showPreview={true}
      previewHeight="500px"
      title="AI Trading Agent"
      description="View and control your autonomous trading agent"
    >
    <div className="agent-detail">
      {/* Beginner Agent Badge */}
      {isBeginnerAgent && (
        <div className="agent-detail__beginner-banner">
          <Sparkles size={16} />
          <span>Simple Strategy: {STRATEGY_TYPE_LABELS[beginnerConfig?.strategy_type] || 'Beginner'}</span>
        </div>
      )}

      {/* Header */}
      <AgentHeader
        agent={agentWithPortfolios}
        onStart={handleStart}
        onPause={handlePause}
        onScan={!isBeginnerAgent ? handleRunScan : null}
        loading={scanLoading}
      />

      {/* Tabs */}
      <div className="agent-detail__tabs">
        {currentTabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`agent-detail__tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={16} />
              {tab.label}
              {tab.id === 'signals' && !isBeginnerAgent && signals.length > 0 && (
                <span className="agent-detail__tab-badge">{signals.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="agent-detail__content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="agent-detail__overview">
            {/* Hero Section */}
            {isBeginnerAgent ? (
              <OverviewHero
                type="progress"
                currentValue={portfolios.reduce((sum, p) => sum + (p.current_value || 0), 0)}
                targetValue={beginnerConfig?.target_value || 100000}
                strategy={beginnerConfig?.strategy_type}
                frequency={beginnerConfig?.frequency}
                contributionAmount={beginnerConfig?.amount}
              />
            ) : (
              <OverviewHero
                type="value"
                totalValue={portfolios.reduce((sum, p) => sum + (p.current_value || 0), 0)}
                totalPnL={portfolios.reduce((sum, p) => sum + (p.total_pnl || 0), 0)}
                pnlPercent={(() => {
                  const totalInitial = portfolios.reduce((sum, p) => sum + (p.initial_capital || p.current_value || 0), 0);
                  const totalPnL = portfolios.reduce((sum, p) => sum + (p.total_pnl || 0), 0);
                  return totalInitial > 0 ? (totalPnL / totalInitial) * 100 : 0;
                })()}
                portfolioCount={portfolios.length}
                onAddPortfolio={() => navigate(`/agents/${id}/portfolios/new`)}
              />
            )}

            {/* Action Required Banner */}
            <ActionRequiredBanner
              pendingSignals={!isBeginnerAgent ? signals.length : 0}
              onReviewSignals={() => setActiveTab('signals')}
              contributionDue={isBeginnerAgent && beginnerConfig?.contribution_due}
              contributionAmount={beginnerConfig?.amount}
              onExecuteContribution={loadData}
              hasErrors={agent.status === 'error'}
              errorMessage={agent.error_message}
            />

            <div className="agent-detail__grid">
              {/* Left Column - Portfolios */}
              <div className="agent-detail__main">
                <Card variant="glass" className="agent-detail__portfolios">
                  <Card.Header>
                    <Wallet size={18} />
                    <h3>Your Portfolios</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/agents/${id}/portfolios/new`)}
                    >
                      Add Portfolio
                    </Button>
                  </Card.Header>
                  <Card.Content>
                    {portfolios.length === 0 ? (
                      <div className="agent-detail__empty">
                        <Wallet size={32} />
                        <p>No portfolios managed by this agent yet</p>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => navigate(`/agents/${id}/portfolios/new`)}
                        >
                          Create Portfolio
                        </Button>
                      </div>
                    ) : (
                      <div className="agent-detail__portfolios-list">
                        {portfolios.map(portfolio => (
                          <Link
                            key={portfolio.id}
                            to={`/portfolios/${portfolio.portfolio_id}`}
                            className="agent-detail__portfolio-card"
                          >
                            <div className="agent-detail__portfolio-info">
                              <span className="agent-detail__portfolio-name">
                                {portfolio.name}
                              </span>
                              <span className={`agent-detail__portfolio-mode ${portfolio.mode}`}>
                                {portfolio.mode === 'paper' ? 'Paper Trading' : 'Live'}
                              </span>
                            </div>
                            <div className="agent-detail__portfolio-stats">
                              <span className="agent-detail__portfolio-value">
                                {formatValue(portfolio.current_value)}
                              </span>
                              {portfolio.total_pnl != null && (
                                <span className={`agent-detail__portfolio-pnl ${portfolio.total_pnl >= 0 ? 'positive' : 'negative'}`}>
                                  {portfolio.total_pnl >= 0 ? '+' : ''}{formatValue(portfolio.total_pnl)}
                                </span>
                              )}
                            </div>
                            <ChevronRight size={16} />
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card.Content>
                </Card>

                {/* Beginner Agent: Contribution Schedule (below portfolios) */}
                {isBeginnerAgent && beginnerConfig && (
                  <ContributionScheduleCard
                    agentId={id}
                    config={beginnerConfig}
                    onExecute={loadData}
                  />
                )}
              </div>

              {/* Right Column - Context & Activity */}
              <div className="agent-detail__sidebar">
                {/* Market Context */}
                <Card variant="glass" className="agent-detail__context">
                  <Card.Header>
                    <Activity size={18} />
                    <h3>Market Context</h3>
                  </Card.Header>
                  <Card.Content>
                    {marketContext ? (
                      <div className="agent-detail__context-data">
                        <div className="agent-detail__context-item">
                          <span className="agent-detail__context-label">Regime</span>
                          <span className={`agent-detail__regime ${marketContext.regime?.toLowerCase()}`}>
                            {marketContext.regime || 'Unknown'}
                          </span>
                        </div>
                        {marketContext.confidence && (
                          <div className="agent-detail__context-item">
                            <span className="agent-detail__context-label">Confidence</span>
                            <span>{(marketContext.confidence * 100).toFixed(0)}%</span>
                          </div>
                        )}
                        {marketContext.vix && (
                          <div className="agent-detail__context-item">
                            <span className="agent-detail__context-label">VIX</span>
                            <span>{marketContext.vix.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="agent-detail__context-unavailable">
                        Market context not available
                      </p>
                    )}
                  </Card.Content>
                </Card>

                {/* Activity Log (reduced to 5 items) */}
                <Card variant="glass" className="agent-detail__activity">
                  <Card.Header>
                    <History size={18} />
                    <h3>What's Happening</h3>
                    {activity.length > 5 && (
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('history')}>
                        View All
                        <ChevronRight size={14} />
                      </Button>
                    )}
                  </Card.Header>
                  <Card.Content>
                    {activity.length === 0 ? (
                      <p className="agent-detail__no-activity">Agent is idle - no recent activity</p>
                    ) : (
                      <div className="agent-detail__activity-list">
                        {activity.slice(0, 5).map(item => (
                          <ActivityItem key={item.id} activity={item} />
                        ))}
                      </div>
                    )}
                  </Card.Content>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Signals Tab */}
        {activeTab === 'signals' && (
          <div className="agent-detail__signals-tab">
            <Card variant="glass">
              <Card.Header>
                <Target size={18} />
                <h3>All Pending Signals</h3>
                {signals.length > 0 && (
                  <Button variant="success" size="sm" onClick={() => agentsAPI.approveAllSignals(id).then(loadData)}>
                    <CheckCircle2 size={14} />
                    Approve All
                  </Button>
                )}
              </Card.Header>
              <Card.Content>
                {signals.length === 0 ? (
                  <div className="agent-detail__empty">
                    <Target size={48} />
                    <h4>No Pending Signals</h4>
                    <p>Run a scan to generate new trading signals</p>
                    <Button variant="primary" onClick={handleRunScan} disabled={scanLoading}>
                      {scanLoading ? <RefreshCw size={16} className="spinning" /> : <RefreshCw size={16} />}
                      Run Scan Now
                    </Button>
                  </div>
                ) : (
                  <div className="agent-detail__signals-grid">
                    {signals.map(signal => (
                      <SignalCard
                        key={signal.id}
                        signal={signal}
                        onApprove={handleApproveSignal}
                        onReject={handleRejectSignal}
                        loadingAction={actionLoading[signal.id]}
                      />
                    ))}
                  </div>
                )}
              </Card.Content>
            </Card>
          </div>
        )}

        {/* Execution Tab */}
        {activeTab === 'execution' && (
          <ExecutionTab agentId={id} />
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="agent-detail__performance-tab">
            {portfolios.length > 0 && portfolios[0].mode === 'paper' && (
              <PaperTradingPanel
                agentId={id}
                portfolioId={portfolios[0].portfolio_id}
                onTradeExecuted={loadData}
              />
            )}
            {portfolios.length === 0 && (
              <Card variant="glass">
                <div className="agent-detail__empty" style={{ padding: '64px' }}>
                  <Wallet size={48} />
                  <h4>No Portfolios</h4>
                  <p>Create a portfolio to track performance</p>
                  <Button variant="primary">
                    Create Portfolio
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="agent-detail__history-tab">
            {portfolios.length > 0 ? (
              <RecommendationHistory portfolioId={portfolios[0].portfolio_id} />
            ) : (
              <Card variant="glass">
                <div className="agent-detail__empty" style={{ padding: '64px' }}>
                  <History size={48} />
                  <h4>No Portfolios</h4>
                  <p>Attach a portfolio to view recommendation history</p>
                  <Button variant="primary">
                    Create Portfolio
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Factors Tab */}
        {activeTab === 'factors' && (
          <div className="agent-detail__factors-tab">
            {portfolios.length > 0 ? (
              <FactorPerformance portfolioId={portfolios[0].portfolio_id} />
            ) : (
              <Card variant="glass">
                <div className="agent-detail__empty" style={{ padding: '64px' }}>
                  <Layers size={48} />
                  <h4>No Portfolios</h4>
                  <p>Attach a portfolio to view factor performance</p>
                  <Button variant="primary">
                    Create Portfolio
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Hedges Tab */}
        {activeTab === 'hedges' && (
          <div className="agent-detail__hedges-tab">
            {portfolios.length > 0 ? (
              <HedgeSuggestionsPanel portfolioId={portfolios[0].portfolio_id} />
            ) : (
              <Card variant="glass">
                <div className="agent-detail__empty" style={{ padding: '64px' }}>
                  <Shield size={48} />
                  <h4>No Portfolios</h4>
                  <p>Attach a portfolio to view hedge suggestions</p>
                  <Button variant="primary">
                    Create Portfolio
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ML Training Tab */}
        {activeTab === 'ml' && (
          <SectionErrorBoundary section="ML Training">
            <MLCombinerPanel agentId={id} />
          </SectionErrorBoundary>
        )}

        {/* Beginner Strategy: Schedule Tab */}
        {activeTab === 'schedule' && isBeginnerAgent && (
          <div className="agent-detail__schedule-tab">
            <ContributionScheduleCard
              agentId={id}
              config={beginnerConfig}
              onExecute={loadData}
            />

            {/* Strategy Configuration Summary */}
            <Card variant="glass" className="agent-detail__strategy-config">
              <Card.Header>
                <Info size={18} />
                <h3>Strategy Configuration</h3>
              </Card.Header>
              <Card.Content>
                <div className="agent-detail__config-grid">
                  {beginnerConfig?.strategy_type === 'dca' && (
                    <>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Contribution Amount</span>
                        <span className="agent-detail__config-value">
                          ${beginnerConfig.amount?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Frequency</span>
                        <span className="agent-detail__config-value">
                          {beginnerConfig.frequency?.charAt(0).toUpperCase() + beginnerConfig.frequency?.slice(1)}
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Auto-Reinvest Dividends</span>
                        <span className="agent-detail__config-value">
                          {beginnerConfig.auto_reinvest_dividends ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </>
                  )}
                  {beginnerConfig?.strategy_type === 'value_averaging' && (
                    <>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Target Growth Rate</span>
                        <span className="agent-detail__config-value">
                          {((beginnerConfig.target_growth_rate || 0.10) * 100).toFixed(0)}% per year
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Contribution Range</span>
                        <span className="agent-detail__config-value">
                          ${beginnerConfig.min_contribution?.toLocaleString()} - ${beginnerConfig.max_contribution?.toLocaleString()}
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Review Frequency</span>
                        <span className="agent-detail__config-value">
                          {beginnerConfig.review_frequency?.charAt(0).toUpperCase() + beginnerConfig.review_frequency?.slice(1)}
                        </span>
                      </div>
                    </>
                  )}
                  {beginnerConfig?.strategy_type === 'rebalance' && (
                    <>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Rebalance Threshold</span>
                        <span className="agent-detail__config-value">
                          {((beginnerConfig.rebalance_threshold || 0.05) * 100).toFixed(0)}% drift
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Rebalance Frequency</span>
                        <span className="agent-detail__config-value">
                          {beginnerConfig.rebalance_frequency?.charAt(0).toUpperCase() + beginnerConfig.rebalance_frequency?.slice(1)}
                        </span>
                      </div>
                    </>
                  )}
                  {beginnerConfig?.strategy_type === 'lump_dca' && (
                    <>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Total Amount</span>
                        <span className="agent-detail__config-value">
                          ${beginnerConfig.total_amount?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Lump Sum</span>
                        <span className="agent-detail__config-value">
                          {((beginnerConfig.lump_sum_pct || 0.5) * 100).toFixed(0)}% upfront
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">DCA Period</span>
                        <span className="agent-detail__config-value">
                          {beginnerConfig.dca_months || 6} months, {beginnerConfig.dca_frequency || 'monthly'}
                        </span>
                      </div>
                    </>
                  )}
                  {beginnerConfig?.strategy_type === 'drip' && (
                    <>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Reinvestment Mode</span>
                        <span className="agent-detail__config-value">
                          {beginnerConfig.reinvest_mode === 'same' ? 'Same Stock' : 'Portfolio Allocation'}
                        </span>
                      </div>
                      <div className="agent-detail__config-item">
                        <span className="agent-detail__config-label">Min Dividend</span>
                        <span className="agent-detail__config-value">
                          ${beginnerConfig.min_dividend_to_reinvest || 10}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Target Assets */}
                {(beginnerConfig?.target_assets || beginnerConfig?.target_allocation) && (
                  <div className="agent-detail__target-assets">
                    <h4>Target Allocation</h4>
                    <div className="agent-detail__allocation-list">
                      {(beginnerConfig.target_assets || beginnerConfig.target_allocation || []).map((asset, idx) => (
                        <div key={idx} className="agent-detail__allocation-item">
                          <span className="agent-detail__allocation-symbol">{asset.symbol}</span>
                          <div className="agent-detail__allocation-bar">
                            <div
                              className="agent-detail__allocation-fill"
                              style={{ width: `${(asset.allocation || 0) * 100}%` }}
                            />
                          </div>
                          <span className="agent-detail__allocation-pct">
                            {((asset.allocation || 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card.Content>
            </Card>
          </div>
        )}

        {/* Beginner Strategy: Contributions Tab */}
        {activeTab === 'contributions' && isBeginnerAgent && (
          <ContributionHistoryTable agentId={id} />
        )}

        {/* Beginner Strategy: Projection Tab */}
        {activeTab === 'projection' && isBeginnerAgent && (
          <ProjectionChart
            agentId={id}
            config={beginnerConfig}
            initialValue={portfolios[0]?.current_value || 0}
          />
        )}
      </div>
    </div>
    </FeatureGate>
  );
}

export default AgentDetailPage;
