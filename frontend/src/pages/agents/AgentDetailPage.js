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
  Layers
} from 'lucide-react';
import { agentsAPI, attributionAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import { PaperTradingPanel, MLCombinerPanel, ExecutionTab, AgentHeader } from '../../components/agents';
import { HedgeSuggestionsPanel, RecommendationHistory, FactorPerformance } from '../../components/agent';
import './AgentDetailPage.css';

const SIGNAL_ACTION_CONFIG = {
  strong_buy: { color: '#22c55e', label: 'Strong Buy' },
  buy: { color: '#4ade80', label: 'Buy' },
  hold: { color: '#64748b', label: 'Hold' },
  sell: { color: '#f97316', label: 'Sell' },
  strong_sell: { color: '#ef4444', label: 'Strong Sell' }
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

function SignalCard({ signal, onApprove, onReject }) {
  const actionConfig = SIGNAL_ACTION_CONFIG[signal.action] || SIGNAL_ACTION_CONFIG.hold;

  return (
    <div className="signal-card">
      <div className="signal-card__header">
        <div className="signal-card__symbol">
          <span className="signal-card__ticker">{signal.symbol}</span>
          <span
            className="signal-card__action"
            style={{ backgroundColor: actionConfig.color }}
          >
            {actionConfig.label}
          </span>
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
        >
          <CheckCircle2 size={14} />
          Approve
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onReject(signal.id)}
        >
          <XCircle size={14} />
          Reject
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
    try {
      await agentsAPI.approveSignal(id, signalId);
      setSignals(prev => prev.filter(s => s.id !== signalId));
    } catch (err) {
      console.error('Failed to approve signal:', err);
    }
  };

  const handleRejectSignal = async (signalId) => {
    try {
      await agentsAPI.rejectSignal(id, signalId);
      setSignals(prev => prev.filter(s => s.id !== signalId));
    } catch (err) {
      console.error('Failed to reject signal:', err);
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

  return (
    <div className="agent-detail">
      {/* Header */}
      <AgentHeader
        agent={agentWithPortfolios}
        onStart={handleStart}
        onPause={handlePause}
        onScan={handleRunScan}
        loading={scanLoading}
      />

      {/* Tabs */}
      <div className="agent-detail__tabs">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`agent-detail__tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={16} />
              {tab.label}
              {tab.id === 'signals' && signals.length > 0 && (
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
            <div className="agent-detail__grid">
              {/* Left Column */}
              <div className="agent-detail__main">
                {/* Pending Signals */}
                <Card variant="glass" className="agent-detail__signals">
                  <Card.Header>
                    <Target size={18} />
                    <h3>Pending Signals ({signals.length})</h3>
                    {signals.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('signals')}>
                        View All
                        <ChevronRight size={14} />
                      </Button>
                    )}
                  </Card.Header>
                  <Card.Content>
                    {signals.length === 0 ? (
                      <div className="agent-detail__empty">
                        <Target size={32} />
                        <p>No pending signals</p>
                      </div>
                    ) : (
                      <div className="agent-detail__signals-list">
                        {signals.slice(0, 3).map(signal => (
                          <SignalCard
                            key={signal.id}
                            signal={signal}
                            onApprove={handleApproveSignal}
                            onReject={handleRejectSignal}
                          />
                        ))}
                      </div>
                    )}
                  </Card.Content>
                </Card>

                {/* Managed Portfolios */}
                <Card variant="glass" className="agent-detail__portfolios">
                  <Card.Header>
                    <Wallet size={18} />
                    <h3>Managed Portfolios ({portfolios.length})</h3>
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
                        <p>No portfolios managed by this agent</p>
                        <Button variant="primary" size="sm">
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
              </div>

              {/* Right Column */}
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

                {/* Performance */}
                <Card variant="glass" className="agent-detail__performance">
                  <Card.Header>
                    <BarChart3 size={18} />
                    <h3>Performance</h3>
                  </Card.Header>
                  <Card.Content>
                    <div className="agent-detail__stats">
                      <div className="agent-detail__stat">
                        <span className="agent-detail__stat-label">Signals Generated</span>
                        <span className="agent-detail__stat-value">
                          {agent.total_signals_generated || 0}
                        </span>
                      </div>
                      <div className="agent-detail__stat">
                        <span className="agent-detail__stat-label">Trades Executed</span>
                        <span className="agent-detail__stat-value">
                          {agent.total_trades_executed || 0}
                        </span>
                      </div>
                      {agent.win_rate != null && (
                        <div className="agent-detail__stat">
                          <span className="agent-detail__stat-label">Win Rate</span>
                          <span className={`agent-detail__stat-value ${agent.win_rate >= 50 ? 'positive' : 'negative'}`}>
                            {agent.win_rate.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {agent.sharpe_ratio != null && (
                        <div className="agent-detail__stat">
                          <span className="agent-detail__stat-label">Sharpe Ratio</span>
                          <span className="agent-detail__stat-value">
                            {agent.sharpe_ratio.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card.Content>
                </Card>

                {/* Activity Log */}
                <Card variant="glass" className="agent-detail__activity">
                  <Card.Header>
                    <History size={18} />
                    <h3>Activity</h3>
                  </Card.Header>
                  <Card.Content>
                    {activity.length === 0 ? (
                      <p className="agent-detail__no-activity">No recent activity</p>
                    ) : (
                      <div className="agent-detail__activity-list">
                        {activity.slice(0, 10).map(item => (
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
          <MLCombinerPanel agentId={id} />
        )}
      </div>
    </div>
  );
}

export default AgentDetailPage;
