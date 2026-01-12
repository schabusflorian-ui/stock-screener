// frontend/src/pages/agents/AgentListPage.js
// Trading Agents as First-Class Entities - List Page

import { useState, useEffect } from 'react';
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
  Zap
} from 'lucide-react';
import { agentsAPI } from '../../services/api';
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

const STRATEGY_COLORS = {
  technical: '#3b82f6',
  fundamental: '#22c55e',
  sentiment: '#f59e0b',
  hybrid: '#8b5cf6',
  custom: '#64748b'
};

const STATUS_CONFIG = {
  running: { color: '#22c55e', icon: Play, label: 'Running' },
  idle: { color: '#64748b', icon: Clock, label: 'Idle' },
  paused: { color: '#f59e0b', icon: Pause, label: 'Paused' },
  error: { color: '#ef4444', icon: AlertCircle, label: 'Error' }
};

function AgentCard({ agent, onStart, onPause }) {
  const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const StatusIcon = statusConfig.icon;

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

  return (
    <Card variant="glass" className="agent-card">
      <div className="agent-card__header">
        <div className="agent-card__identity">
          <div className="agent-card__avatar">
            <Bot size={24} />
          </div>
          <div className="agent-card__info">
            <h3 className="agent-card__name">{agent.name}</h3>
            <span
              className="agent-card__strategy"
              style={{ backgroundColor: STRATEGY_COLORS[agent.strategy_type] }}
            >
              {STRATEGY_LABELS[agent.strategy_type] || agent.strategy_type}
            </span>
          </div>
        </div>
        <div className="agent-card__status" style={{ color: statusConfig.color }}>
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
}

function AgentListPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const filteredAgents = agents.filter(agent => {
    const matchesSearch =
      agent.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStrategy = strategyFilter === 'all' || agent.strategy_type === strategyFilter;
    const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
    return matchesSearch && matchesStrategy && matchesStatus;
  });

  // Calculate aggregate stats
  const stats = {
    total: agents.length,
    running: agents.filter(a => a.status === 'running').length,
    totalPortfolios: agents.reduce((sum, a) => sum + (a.portfolio_count || 0), 0),
    totalSignals: agents.reduce((sum, a) => sum + (a.total_signals_generated || 0), 0)
  };

  if (loading) {
    return (
      <div className="agent-list-page">
        <div className="agent-list-page__header">
          <Skeleton style={{ width: 300, height: 40 }} />
        </div>
        <div className="agent-list-page__stats">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} style={{ height: 80 }} />
          ))}
        </div>
        <div className="agent-list-page__grid">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} style={{ height: 280 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-list-page">
        <Card variant="glass" className="agent-list-page__error">
          <AlertCircle size={32} />
          <h3>Error Loading Agents</h3>
          <p>{error}</p>
          <Button variant="primary" onClick={loadAgents}>
            <RefreshCw size={16} />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="agent-list-page">
      {/* Header */}
      <header className="agent-list-page__header">
        <div className="agent-list-page__title-section">
          <Bot size={28} />
          <div>
            <h1>Trading Agents</h1>
            <p className="agent-list-page__subtitle">
              Autonomous AI agents that generate signals and manage portfolios
            </p>
          </div>
        </div>
        <div className="agent-list-page__actions">
          <Button variant="secondary" onClick={loadAgents}>
            <RefreshCw size={16} />
            Refresh
          </Button>
          <Button variant="primary" onClick={() => navigate('/agents/new')}>
            <Plus size={16} />
            Create Agent
          </Button>
        </div>
      </header>

      {/* Stats */}
      <div className="agent-list-page__stats">
        <Card variant="glass" className="agent-list-page__stat-card">
          <div className="agent-list-page__stat-icon">
            <Bot size={20} />
          </div>
          <div className="agent-list-page__stat-content">
            <span className="agent-list-page__stat-label">Total Agents</span>
            <span className="agent-list-page__stat-value">{stats.total}</span>
          </div>
        </Card>
        <Card variant="glass" className="agent-list-page__stat-card">
          <div className="agent-list-page__stat-icon running">
            <Zap size={20} />
          </div>
          <div className="agent-list-page__stat-content">
            <span className="agent-list-page__stat-label">Running</span>
            <span className="agent-list-page__stat-value">{stats.running}</span>
          </div>
        </Card>
        <Card variant="glass" className="agent-list-page__stat-card">
          <div className="agent-list-page__stat-icon">
            <Wallet size={20} />
          </div>
          <div className="agent-list-page__stat-content">
            <span className="agent-list-page__stat-label">Managed Portfolios</span>
            <span className="agent-list-page__stat-value">{stats.totalPortfolios}</span>
          </div>
        </Card>
        <Card variant="glass" className="agent-list-page__stat-card">
          <div className="agent-list-page__stat-icon">
            <Activity size={20} />
          </div>
          <div className="agent-list-page__stat-content">
            <span className="agent-list-page__stat-label">Total Signals</span>
            <span className="agent-list-page__stat-value">{stats.totalSignals}</span>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="agent-list-page__filters">
        <div className="agent-list-page__search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="agent-list-page__filter-group">
          <Filter size={16} />
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
          >
            <option value="all">All Strategies</option>
            {Object.entries(STRATEGY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="agent-list-page__filter-group">
          <Activity size={16} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="idle">Idle</option>
            <option value="paused">Paused</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Agent Grid */}
      {filteredAgents.length === 0 ? (
        <Card variant="glass" className="agent-list-page__empty">
          <Bot size={48} />
          <h3>No Agents Found</h3>
          {agents.length === 0 ? (
            <>
              <p>Create your first trading agent to get started.</p>
              <Button variant="primary" onClick={() => navigate('/agents/new')}>
                <Plus size={16} />
                Create Agent
              </Button>
            </>
          ) : (
            <p>No agents match your current filters.</p>
          )}
        </Card>
      ) : (
        <div className="agent-list-page__grid">
          {filteredAgents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onStart={handleStartAgent}
              onPause={handlePauseAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentListPage;
