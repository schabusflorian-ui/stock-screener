// frontend/src/pages/agents/AgentListPage.js
// AI Agents as First-Class Entities - List Page

import { useState, useEffect, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bot,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ChevronRight,
  Play,
  Pause,
  BarChart3,
  Activity,
  Wallet,
  Clock,
  AlertCircle,
  Zap,
  Sparkles,
  Sliders,
  ChevronDown,
  IconButton,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from '../../components/icons';
import { agentsAPI } from '../../services/api';
import { useSubscription } from '../../context/SubscriptionContext';
import { FeatureGate } from '../../components/subscription';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import './AgentListPage.css';

const STRATEGY_LABELS = {
  technical: 'Technical',
  fundamental: 'Fundamental',
  sentiment: 'Sentiment',
  hybrid: 'Hybrid',
  custom: 'Custom'
};

const STATUS_CONFIG = {
  running: { icon: Play, label: 'Running' },
  idle: { icon: Clock, label: 'Idle' },
  paused: { icon: Pause, label: 'Paused' },
  error: { icon: AlertCircle, label: 'Error' }
};

// Format helpers
const formatDate = (dateStr) => {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

// Memoized AgentCard component
const AgentCard = memo(function AgentCard({ agent, onStart, onPause }) {
  const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const StatusIcon = statusConfig.icon;
  const isSimpleAgent = agent.agent_category === 'beginner' || agent.beginner_config;

  return (
    <Card variant="glass" className="agent-card">
      <div className="agent-card__header">
        <div className="agent-card__identity">
          <IconButton
            icon={Bot}
            colorScheme="ai"
            size="small"
            className="agent-card__avatar-btn"
          />
          <div className="agent-card__info">
            <h3 className="agent-card__name">{agent.name}</h3>
            <div className="agent-card__badges">
              {isSimpleAgent && (
                <span className="agent-card__category-badge simple">
                  Simple
                </span>
              )}
              <span className={`agent-card__strategy agent-card__strategy--${agent.strategy_type || 'custom'}`}>
                {STRATEGY_LABELS[agent.strategy_type] || agent.strategy_type}
              </span>
            </div>
          </div>
        </div>
        <div className={`agent-card__status agent-card__status--${agent.status || 'idle'}`}>
          <StatusIcon size={16} />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {agent.description && (
        <p className="agent-card__description">{agent.description}</p>
      )}

      <div className="agent-card__stats">
        <div className="agent-card__stat">
          <Wallet size={14} />
          <span className="agent-card__stat-label">Portfolios</span>
          <span className="agent-card__stat-value">{agent.portfolio_count || 0}</span>
        </div>
        <div className="agent-card__stat">
          <Activity size={14} />
          <span className="agent-card__stat-label">Signals</span>
          <span className="agent-card__stat-value">{agent.total_signals_generated || 0}</span>
        </div>
        <div className="agent-card__stat">
          <BarChart3 size={14} />
          <span className="agent-card__stat-label">Trades</span>
          <span className="agent-card__stat-value">{agent.total_trades_executed || 0}</span>
        </div>
      </div>

      {(agent.win_rate != null || agent.total_return != null) && (
        <div className="agent-card__performance">
          {agent.win_rate != null && (
            <div className="agent-card__metric">
              <span className="agent-card__metric-label">Win Rate</span>
              <span className={`agent-card__metric-value ${agent.win_rate >= 50 ? 'positive' : 'negative'}`}>
                {agent.win_rate.toFixed(1)}%
              </span>
            </div>
          )}
          {agent.total_return != null && (
            <div className="agent-card__metric">
              <span className="agent-card__metric-label">Total Return</span>
              <span className={`agent-card__metric-value ${agent.total_return >= 0 ? 'positive' : 'negative'}`}>
                {agent.total_return >= 0 ? '+' : ''}{agent.total_return.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      )}

      <div className="agent-card__timing">
        <div className="agent-card__time">
          <Clock size={12} />
          <span>Last scan: {formatDate(agent.last_scan_at)}</span>
        </div>
      </div>

      <div className="agent-card__actions">
        {agent.status === 'running' ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              onPause(agent.id);
            }}
          >
            <Pause size={14} />
            Pause
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              onStart(agent.id);
            }}
          >
            <Play size={14} />
            Start
          </Button>
        )}
        <Link to={`/agents/${agent.id}`} className="agent-card__view-btn">
          View Dashboard
          <ChevronRight size={16} />
        </Link>
      </div>
    </Card>
  );
});

// Strategy filter options
const STRATEGY_FILTER_OPTIONS = {
  all: 'All Strategies',
  technical: 'Technical',
  fundamental: 'Fundamental',
  sentiment: 'Sentiment',
  hybrid: 'Hybrid',
  custom: 'Custom'
};

// Status filter options
const STATUS_FILTER_OPTIONS = {
  all: 'All Statuses',
  running: 'Running',
  idle: 'Idle',
  paused: 'Paused',
  error: 'Error'
};

function AgentListPage() {
  const navigate = useNavigate();
  const { hasFeature, promptUpgrade, getUsageStatus, isGrandfatheredActive } = useSubscription();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // Check if user can create agents
  const canCreateAgents = hasFeature('paper_trading_bots') || isGrandfatheredActive;
  const agentUsage = getUsageStatus('agents');
  const atAgentLimit = !agentUsage.unlimited && agentUsage.current >= agentUsage.limit;

  // Handle create agent button
  const handleCreateAgent = (path) => {
    if (!canCreateAgents) {
      promptUpgrade({
        feature: 'paper_trading_bots',
        requiredTier: 'ultra',
        reason: 'Paper trading bots require an Ultra subscription'
      });
      return;
    }
    if (atAgentLimit) {
      promptUpgrade({
        metric: 'agents',
        reason: `You've reached your agent limit (${agentUsage.limit})`,
        requiredTier: 'ultra'
      });
      return;
    }
    navigate(path);
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentsAPI.getAll();
      // API returns { success: true, data: [...agents...] }
      setAgents(response.data.data || response.data.agents || []);
    } catch (err) {
      console.error('Error loading agents:', err);
      setError(err.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleStartAgent = async (id) => {
    try {
      await agentsAPI.start(id);
      // Optimistically update the UI
      setAgents(prev => prev.map(a =>
        a.id === id ? { ...a, status: 'running' } : a
      ));
    } catch (err) {
      console.error('Failed to start agent:', err);
      // Reload to get actual state
      loadAgents();
    }
  };

  const handlePauseAgent = async (id) => {
    try {
      await agentsAPI.pause(id);
      // Optimistically update the UI
      setAgents(prev => prev.map(a =>
        a.id === id ? { ...a, status: 'paused' } : a
      ));
    } catch (err) {
      console.error('Failed to pause agent:', err);
      loadAgents();
    }
  };

  // Filtering logic
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesSearch =
        agent.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStrategy = strategyFilter === 'all' || agent.strategy_type === strategyFilter;
      const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
      return matchesSearch && matchesStrategy && matchesStatus;
    });
  }, [agents, searchTerm, strategyFilter, statusFilter]);

  // Sorting logic
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={14} />;
    return sortConfig.direction === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />;
  };

  const sortedAgents = useMemo(() => {
    const sorted = [...filteredAgents];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle null/undefined
      if (aVal == null) aVal = sortConfig.key === 'name' ? 'zzz' : -Infinity;
      if (bVal == null) bVal = sortConfig.key === 'name' ? 'zzz' : -Infinity;

      // String comparison for name
      if (sortConfig.key === 'name') {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      // Date comparison
      if (sortConfig.key === 'last_scan_at') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      // Numeric comparison
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [filteredAgents, sortConfig]);

  // Calculate aggregate stats
  const stats = useMemo(() => ({
    total: agents.length,
    running: agents.filter(a => a.status === 'running').length,
    totalPortfolios: agents.reduce((sum, a) => sum + (parseInt(a.portfolio_count, 10) || 0), 0),
    totalSignals: agents.reduce((sum, a) => sum + (parseInt(a.total_signals_generated, 10) || 0), 0)
  }), [agents]);

  if (loading) {
    return (
      <div className="agent-list-page">
        <header className="page-header">
          <div className="header-content">
            <Skeleton style={{ width: 300, height: 40 }} />
          </div>
        </header>
        <div className="page-content">
          <div className="agents-grid">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} style={{ height: 280 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-list-page">
        <div className="page-content">
          <Card variant="glass" className="error-state">
            <AlertCircle size={32} />
            <h3>Error Loading Agents</h3>
            <p>{error}</p>
            <Button variant="primary" onClick={loadAgents}>
              <RefreshCw size={16} />
              Retry
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <FeatureGate
      feature="paper_trading_bots"
      showPreview={true}
      previewHeight="500px"
      title="AI Trading Agents"
      description="Create autonomous AI agents that monitor markets and find opportunities"
    >
    <div className="agent-list-page">
      <header className="page-header">
        <div className="header-content">
          <div className="header-title">
            <Bot size={28} />
            <div>
              <h1>AI Agents</h1>
              <p className="header-subtitle">
                Autonomous AI that monitors markets and finds opportunities
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={loadAgents}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <div className="create-agent-dropdown">
              <button className="btn btn-primary create-agent-dropdown__trigger">
                <Plus size={16} />
                Create Agent
                <ChevronDown size={14} />
              </button>
              <div className="create-agent-dropdown__menu">
                <button
                  type="button"
                  className="create-agent-dropdown__item"
                  onClick={() => handleCreateAgent('/agents/new/simple')}
                >
                  <Sparkles size={18} />
                  <div className="create-agent-dropdown__item-text">
                    <span className="title">Simple Strategy</span>
                    <span className="desc">DCA, Rebalancing, DRIP & more</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="create-agent-dropdown__item"
                  onClick={() => handleCreateAgent('/agents/new')}
                >
                  <Sliders size={18} />
                  <div className="create-agent-dropdown__item-text">
                    <span className="title">Advanced Agent</span>
                    <span className="desc">ML signals, multi-strategy</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {agents.length > 0 && (
          <div className="summary-stats">
            <div className="summary-stat">
              <Bot size={20} />
              <div>
                <span className="stat-label">Agents</span>
                <span className="stat-value">{stats.total}</span>
              </div>
            </div>
            <div className="summary-stat running">
              <Zap size={20} />
              <div>
                <span className="stat-label">Running</span>
                <span className="stat-value">{stats.running}</span>
              </div>
            </div>
            <div className="summary-stat">
              <Wallet size={20} />
              <div>
                <span className="stat-label">Portfolios</span>
                <span className="stat-value">{stats.totalPortfolios}</span>
              </div>
            </div>
            <div className="summary-stat">
              <Activity size={20} />
              <div>
                <span className="stat-label">Signals</span>
                <span className="stat-value">{stats.totalSignals}</span>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="page-content">
        {agents.length === 0 ? (
          <div className="empty-state">
            <Bot size={64} className="empty-icon" />
            <h2>No Agents Yet</h2>
            <p>Create your first trading agent to get started</p>
            <div className="empty-actions">
              <button
                className="btn btn-primary"
                onClick={() => navigate('/agents/new/simple')}
              >
                <Sparkles size={16} />
                Simple Strategy
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate('/agents/new')}
              >
                <Sliders size={16} />
                Advanced Agent
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Filters Bar */}
            <div className="filters-bar">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <Filter size={16} />
                <select
                  value={strategyFilter}
                  onChange={(e) => setStrategyFilter(e.target.value)}
                >
                  {Object.entries(STRATEGY_FILTER_OPTIONS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <Activity size={16} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {Object.entries(STATUS_FILTER_OPTIONS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="view-toggle">
                <button
                  className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table view"
                >
                  <LayoutList size={18} />
                </button>
                <button
                  className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setViewMode('cards')}
                  title="Card view"
                >
                  <LayoutGrid size={18} />
                </button>
              </div>
            </div>

            {/* Table View */}
            {viewMode === 'table' && (
              <div className="agents-table-container">
                <table className="agents-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleSort('name')}>
                        <span>Agent</span>
                        {getSortIcon('name')}
                      </th>
                      <th>Strategy</th>
                      <th>Status</th>
                      <th className="sortable right" onClick={() => handleSort('portfolio_count')}>
                        <span>Portfolios</span>
                        {getSortIcon('portfolio_count')}
                      </th>
                      <th className="sortable right" onClick={() => handleSort('total_signals_generated')}>
                        <span>Signals</span>
                        {getSortIcon('total_signals_generated')}
                      </th>
                      <th className="sortable right" onClick={() => handleSort('win_rate')}>
                        <span>Win Rate</span>
                        {getSortIcon('win_rate')}
                      </th>
                      <th className="sortable right" onClick={() => handleSort('last_scan_at')}>
                        <span>Last Scan</span>
                        {getSortIcon('last_scan_at')}
                      </th>
                      <th className="actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAgents.map(agent => {
                      const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
                      const StatusIcon = statusConfig.icon;
                      const isSimpleAgent = agent.agent_category === 'beginner' || agent.beginner_config;

                      return (
                        <tr key={agent.id}>
                          <td>
                            <Link to={`/agents/${agent.id}`} className="agent-link">
                              <div className="agent-avatar-sm">
                                <Bot size={16} />
                              </div>
                              <span className="agent-name">{agent.name}</span>
                              {isSimpleAgent && (
                                <span className="agent-tag-sm tag-simple">Simple</span>
                              )}
                            </Link>
                          </td>
                          <td>
                            <span className={`agent-tag-sm tag-strategy-${agent.strategy_type || 'custom'}`}>
                              {STRATEGY_LABELS[agent.strategy_type] || agent.strategy_type || 'Custom'}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge status-${agent.status || 'idle'}`}>
                              <StatusIcon size={12} />
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="right">
                            {agent.portfolio_count || 0}
                          </td>
                          <td className="right">
                            {agent.total_signals_generated || 0}
                          </td>
                          <td className={`right ${agent.win_rate >= 50 ? 'positive' : agent.win_rate != null ? 'negative' : ''}`}>
                            {agent.win_rate != null ? formatPercent(agent.win_rate) : '-'}
                          </td>
                          <td className="right date-cell">
                            {formatDate(agent.last_scan_at)}
                          </td>
                          <td className="actions-cell">
                            {agent.status === 'running' ? (
                              <button
                                className="action-btn pause"
                                onClick={() => handlePauseAgent(agent.id)}
                                title="Pause agent"
                              >
                                <Pause size={14} />
                              </button>
                            ) : (
                              <button
                                className="action-btn play"
                                onClick={() => handleStartAgent(agent.id)}
                                title="Start agent"
                              >
                                <Play size={14} />
                              </button>
                            )}
                            <Link
                              to={`/agents/${agent.id}`}
                              className="action-btn"
                              title="View details"
                            >
                              <ChevronRight size={16} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Card View */}
            {viewMode === 'cards' && (
              <div className="agents-grid">
                {sortedAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onStart={handleStartAgent}
                    onPause={handlePauseAgent}
                  />
                ))}

                {/* Add New Card */}
                <button
                  className={`agent-card add-card ${!canCreateAgents ? 'add-card--locked' : ''}`}
                  onClick={() => handleCreateAgent('/agents/new/simple')}
                >
                  <Plus size={32} />
                  <span>{canCreateAgents ? 'New Agent' : 'Unlock Agents'}</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </FeatureGate>
  );
}

export default AgentListPage;
