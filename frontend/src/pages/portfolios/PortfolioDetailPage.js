// frontend/src/pages/portfolios/PortfolioDetailPage.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart,
  List,
  Clock,
  Plus,
  Minus,
  AlertCircle,
  Wallet,
  Target,
  Activity,
  Download,
  Shield,
  LineChart as LineChartIcon,
  AlertTriangle,
  Trash2,
  MoreVertical,
  Grid3X3,
  Award,
  Brain,
  Zap,
  FileText
} from 'lucide-react';
import { portfoliosAPI, simulateAPI, attributionAPI, pricesAPI } from '../../services/api';
import { usePreferences, useAutoRefresh } from '../../context/PreferencesContext';
import HoldingsTable from '../../components/portfolio/HoldingsTable';
import TradeForm from '../../components/portfolio/TradeForm';
import OrderForm from '../../components/portfolio/OrderForm';
import TransactionList from '../../components/portfolio/TransactionList';
import AllocationChart from '../../components/portfolio/AllocationChart';
import PortfolioAlerts from '../../components/portfolio/PortfolioAlerts';
import MonteCarloPanel from '../../components/portfolio/MonteCarloPanel';
import DistributionPanel from '../../components/portfolio/DistributionPanel';
import BacktestPanel from '../../components/portfolio/BacktestPanel';
import PositionSizingPanel from '../../components/portfolio/PositionSizingPanel';
import PerformanceChart from '../../components/portfolio/PerformanceChart';
import PortfolioInsightsPanel from '../../components/portfolio/PortfolioInsightsPanel';
import CorrelationPanel from '../../components/portfolio/CorrelationPanel';
import AlphaAnalyticsPanel from '../../components/portfolio/AlphaAnalyticsPanel';
import ExportPanel from '../../components/portfolio/ExportPanel';
import ExportModal from '../../components/portfolio/ExportModal';
import { SkeletonPortfolioDetail } from '../../components/Skeleton';
import {
  AgentRecommendation,
  RecommendationHistory,
  FactorPerformance,
  RiskLimitsSettings,
  RecommendationPerformance,
  ExecutionSettingsPanel,
  PendingExecutionsPanel,
  HedgeSuggestionsPanel
} from '../../components/agent';
import { PortfolioNotesPanel } from '../../components/notes';
import ETFDetailModal from '../../components/portfolio/ETFDetailModal';
import './PortfolioDetailPage.css';

// Tooltip component
function Tooltip({ text, children }) {
  return (
    <div className="tooltip-wrapper">
      {children}
      <div className="tooltip-content">{text}</div>
    </div>
  );
}

// Confirmation Dialog component
function ConfirmDialog({ title, message, confirmText, cancelText, onConfirm, onCancel, isDestructive }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-header">
          {isDestructive && <AlertTriangle size={24} className="warning-icon" />}
          <h3>{title}</h3>
        </div>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelText || 'Cancel'}
          </button>
          <button
            className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Risk Metrics Card
function RiskMetricsCard({ riskData, performance }) {
  if (!riskData && !performance) {
    return (
      <div className="overview-card risk-card">
        <h3><Shield size={16} /> Risk Metrics</h3>
        <p className="no-data">Risk metrics not available yet</p>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Beta',
      value: riskData?.beta?.toFixed(2) || performance?.benchmark?.beta?.toFixed(2),
      tooltip: 'Portfolio volatility relative to S&P 500. Beta > 1 means more volatile than the market.',
      isGood: (v) => v && Math.abs(parseFloat(v) - 1) < 0.3
    },
    {
      label: 'Alpha',
      value: riskData?.alpha?.toFixed(2) || performance?.benchmark?.alpha?.toFixed(2),
      suffix: '%',
      tooltip: 'Excess return over benchmark. Positive alpha indicates outperformance.',
      isGood: (v) => v && parseFloat(v) > 0
    },
    {
      label: 'Sharpe',
      value: performance?.sharpeRatio?.toFixed(2),
      tooltip: 'Risk-adjusted return. Higher is better. Above 1 is good, above 2 is excellent.',
      isGood: (v) => v && parseFloat(v) > 1
    },
    {
      label: 'Sortino',
      value: riskData?.sortinoRatio?.toFixed(2) || performance?.sortinoRatio?.toFixed(2),
      tooltip: 'Like Sharpe, but only penalizes downside volatility. Higher is better.',
      isGood: (v) => v && parseFloat(v) > 1
    },
    {
      label: 'Max Drawdown',
      value: performance?.maxDrawdown?.toFixed(2),
      suffix: '%',
      tooltip: 'Largest peak-to-trough decline. Lower magnitude is better.',
      isGood: (v) => v && parseFloat(v) > -20
    },
    {
      label: 'Volatility',
      value: performance?.volatility?.toFixed(2),
      suffix: '%',
      tooltip: 'Annualized standard deviation of returns. Lower means more stable.',
      isGood: (v) => v && parseFloat(v) < 20
    }
  ];

  return (
    <div className="overview-card risk-card">
      <h3><Shield size={16} /> Risk Metrics</h3>
      <div className="risk-grid">
        {metrics.map((metric, idx) => (
          <Tooltip key={idx} text={metric.tooltip}>
            <div className={`risk-item ${metric.isGood && metric.value ? (metric.isGood(metric.value) ? 'good' : 'warning') : ''}`}>
              <span className="risk-label">{metric.label}</span>
              <span className="risk-value">
                {metric.value !== undefined && metric.value !== null ? `${metric.value}${metric.suffix || ''}` : '-'}
              </span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

// Dividend Summary Card
function DividendCard({ holdings, transactions }) {
  // Calculate dividend stats from transactions
  // Support both 'type' and 'transaction_type' field names for compatibility
  const dividendTxns = transactions.filter(t =>
    (t.type || t.transaction_type) === 'dividend'
  );
  const totalDividends = dividendTxns.reduce((sum, t) => sum + (t.amount || t.total_amount || 0), 0);

  // Calculate estimated annual yield from holdings
  const holdingsWithDividends = holdings.filter(h => h.dividend_yield && h.dividend_yield > 0);
  const weightedYield = holdings.reduce((sum, h) => {
    return sum + (h.current_value || 0) * ((h.dividend_yield || 0) / 100);
  }, 0);
  const totalValue = holdings.reduce((sum, h) => sum + (h.current_value || 0), 0);
  const portfolioYield = totalValue > 0 ? (weightedYield / totalValue) * 100 : 0;
  const estimatedAnnual = weightedYield;

  // Recent dividends
  const recentDividends = dividendTxns.slice(0, 5);

  return (
    <div className="overview-card dividend-card">
      <h3><DollarSign size={16} /> Dividend Income</h3>
      <div className="dividend-stats">
        <div className="dividend-stat">
          <span className="stat-label">Total Received</span>
          <span className="stat-value positive">${totalDividends.toFixed(2)}</span>
        </div>
        <div className="dividend-stat">
          <span className="stat-label">Portfolio Yield</span>
          <span className="stat-value">{portfolioYield.toFixed(2)}%</span>
        </div>
        <div className="dividend-stat">
          <span className="stat-label">Est. Annual</span>
          <span className="stat-value">${estimatedAnnual.toFixed(2)}</span>
        </div>
      </div>
      {recentDividends.length > 0 && (
        <div className="recent-dividends">
          <h4>Recent Payments</h4>
          {recentDividends.map((d, idx) => (
            <div key={idx} className="dividend-item">
              <span className="dividend-symbol">{d.symbol}</span>
              <span className="dividend-amount">${d.amount?.toFixed(2)}</span>
              <span className="dividend-date">{new Date(d.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
      {recentDividends.length === 0 && holdingsWithDividends.length === 0 && (
        <p className="no-data">No dividend-paying holdings</p>
      )}
    </div>
  );
}

// Simulate Section with sub-tabs
function SimulateSection({ portfolioId, holdings, initialValue }) {
  const [activeSimTab, setActiveSimTab] = useState('montecarlo');

  const SIMULATE_TABS = [
    { id: 'montecarlo', label: 'Monte Carlo', icon: Activity },
    { id: 'distribution', label: 'Distribution', icon: BarChart3 },
    { id: 'backtest', label: 'Backtest', icon: Clock },
    { id: 'position', label: 'Position Sizing', icon: Target },
    { id: 'correlation', label: 'Correlation', icon: Grid3X3 },
    { id: 'alpha', label: 'Alpha Analytics', icon: Award }
  ];

  return (
    <div className="simulate-section">
      <div className="simulate-tabs">
        {SIMULATE_TABS.map(tab => (
          <button
            key={tab.id}
            className={`simulate-tab ${activeSimTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveSimTab(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="simulate-content">
        {activeSimTab === 'montecarlo' && (
          <MonteCarloPanel
            portfolioId={portfolioId}
            initialValue={initialValue}
          />
        )}

        {activeSimTab === 'distribution' && (
          <DistributionPanel
            portfolioId={portfolioId}
          />
        )}

        {activeSimTab === 'backtest' && (
          <BacktestPanel
            portfolioId={portfolioId}
            holdings={holdings}
          />
        )}

        {activeSimTab === 'position' && (
          <PositionSizingPanel
            portfolioId={portfolioId}
            holdings={holdings}
            portfolioValue={initialValue}
          />
        )}

        {activeSimTab === 'correlation' && (
          <CorrelationPanel
            portfolioId={portfolioId}
          />
        )}

        {activeSimTab === 'alpha' && (
          <AlphaAnalyticsPanel
            portfolioId={portfolioId}
          />
        )}
      </div>
    </div>
  );
}

// AI Trading Section with sub-tabs
function AITradingSection({ portfolioId }) {
  const [activeAITab, setActiveAITab] = useState('recommendations');
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendation = async () => {
      try {
        setLoading(true);
        const res = await attributionAPI.getRecommendation(portfolioId);
        if (res.data?.success) {
          setRecommendation(res.data.data);
        }
      } catch (err) {
        console.log('No recommendation available:', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendation();
  }, [portfolioId]);

  const AI_TABS = [
    { id: 'recommendations', label: 'Latest Signal', icon: Brain },
    { id: 'performance', label: 'Performance', icon: Target },
    { id: 'pending', label: 'Pending Trades', icon: Clock },
    { id: 'hedges', label: 'Hedges', icon: Shield },
    { id: 'history', label: 'History', icon: Activity },
    { id: 'factors', label: 'Factors', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Zap }
  ];

  return (
    <div className="ai-trading-section">
      <div className="simulate-tabs">
        {AI_TABS.map(tab => (
          <button
            key={tab.id}
            className={`simulate-tab ${activeAITab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveAITab(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="simulate-content">
        {activeAITab === 'recommendations' && (
          <AgentRecommendation
            recommendation={recommendation}
            loading={loading}
          />
        )}

        {activeAITab === 'performance' && (
          <RecommendationPerformance />
        )}

        {activeAITab === 'pending' && (
          <PendingExecutionsPanel portfolioId={portfolioId} />
        )}

        {activeAITab === 'hedges' && (
          <HedgeSuggestionsPanel portfolioId={portfolioId} />
        )}

        {activeAITab === 'history' && (
          <RecommendationHistory portfolioId={portfolioId} />
        )}

        {activeAITab === 'factors' && (
          <FactorPerformance portfolioId={portfolioId} />
        )}

        {activeAITab === 'settings' && (
          <div className="settings-panels">
            <ExecutionSettingsPanel portfolioId={portfolioId} />
            <RiskLimitsSettings portfolioId={portfolioId} />
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'performance', label: 'Performance', icon: LineChartIcon },
  { id: 'holdings', label: 'Holdings', icon: List },
  { id: 'orders', label: 'Orders', icon: Target },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'backtest', label: 'Backtest', icon: Clock },
  { id: 'risk', label: 'Risk Analysis', icon: Activity },
  { id: 'alerts', label: 'Alerts', icon: AlertCircle }
];

// Benchmark label mapping
const BENCHMARK_LABELS = {
  SPY: 'S&P 500',
  QQQ: 'Nasdaq 100',
  DIA: 'Dow Jones',
  IWM: 'Russell 2000',
  VTI: 'Total Market',
  EFA: 'Intl Developed',
  EEM: 'Emerging Markets'
};

function PortfolioDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const [portfolio, setPortfolio] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [riskMetrics, setRiskMetrics] = useState(null);
  const [allocation, setAllocation] = useState(null);
  const [valueHistory, setValueHistory] = useState([]);
  const [benchmarkHistory, setBenchmarkHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showCashForm, setShowCashForm] = useState(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashError, setCashError] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [chartPeriod, setChartPeriod] = useState('1y');
  const [exporting, setExporting] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [selectedETF, setSelectedETF] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Memoize active orders filter - must be before any early returns
  const activeOrders = useMemo(() =>
    orders.filter(o => o.status === 'active'),
    [orders]
  );

  // Helper to check if a holding is an ETF
  const isETF = (holding) => {
    return holding.sector === 'ETF' || holding.is_etf;
  };

  useEffect(() => {
    loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load chart data when period changes
  useEffect(() => {
    if (portfolio) {
      loadChartData(chartPeriod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPeriod, portfolio]);

  // Auto-refresh portfolio data based on user preference
  useAutoRefresh(() => {
    loadPortfolio();
  });

  const loadPortfolio = async () => {
    try {
      setLoading(true);
      const [portfolioRes, holdingsRes, ordersRes, transactionsRes] = await Promise.all([
        portfoliosAPI.get(id),
        portfoliosAPI.getHoldings(id),
        portfoliosAPI.getOrders(id),
        portfoliosAPI.getTransactions(id, { limit: 100 })
      ]);

      // Merge portfolio data with values for easy access
      setPortfolio({
        ...portfolioRes.data.portfolio,
        cash_balance: portfolioRes.data.values?.cashValue ?? 0,
        total_value: portfolioRes.data.values?.totalValue ?? 0,
        positions_value: portfolioRes.data.values?.positionsValue ?? 0,
        total_deposited: portfolioRes.data.values?.totalDeposited ?? 0,
        total_withdrawn: portfolioRes.data.values?.totalWithdrawn ?? 0,
        // Map performance data for meta ribbon
        total_gain: portfolioRes.data.performance?.totalReturn ?? 0,
        total_gain_pct: portfolioRes.data.performance?.totalReturnPct ?? 0,
        unrealized_pnl: portfolioRes.data.performance?.unrealizedPnl ?? 0,
        unrealized_pnl_pct: portfolioRes.data.performance?.unrealizedPnlPct ?? 0,
        // Map positions count
        positions_count: portfolioRes.data.positions?.count ?? 0
      });
      setHoldings(holdingsRes.data.holdings || []);
      setOrders(ordersRes.data.orders || []);
      setTransactions(transactionsRes.data.transactions || []);

      // Load performance, allocation, and risk metrics
      try {
        const [perfRes, allocRes, riskRes] = await Promise.all([
          simulateAPI.getPerformance(id, '1y'),
          simulateAPI.getAllocation(id),
          simulateAPI.getRisk(id).catch(() => ({ data: {} }))
        ]);
        setPerformance(perfRes.data.data);
        setAllocation(allocRes.data.data);
        setRiskMetrics(riskRes.data.data);
      } catch (err) {
        console.log('Performance metrics not available:', err.message);
      }

      // Load chart data
      loadChartData('1y');
    } catch (err) {
      console.error('Error loading portfolio:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadChartData = async (period) => {
    try {
      const benchmarkSymbol = preferences.defaultBenchmark || 'SPY';
      const [historyRes, benchmarkRes] = await Promise.all([
        portfoliosAPI.getValueHistory(id, period).catch(() => ({ data: { history: [] } })),
        pricesAPI.get(benchmarkSymbol, { period }).catch(() => ({ data: { data: { prices: [] } } }))
      ]);

      setValueHistory(historyRes.data.history || []);
      // pricesAPI returns { data: { prices: [...] } }
      const prices = benchmarkRes.data?.data?.prices || [];
      setBenchmarkHistory(prices);
    } catch (err) {
      console.log('Chart data not available:', err.message);
    }
  };

  const handleTradeComplete = () => {
    setShowTradeForm(false);
    loadPortfolio();
  };

  const handleOrderComplete = () => {
    setShowOrderForm(false);
    loadPortfolio();
  };

  const handleCashAction = async (action, amount) => {
    // Show confirmation for large amounts
    if (amount >= 10000) {
      setConfirmDialog({
        title: `Confirm ${action === 'deposit' ? 'Deposit' : 'Withdrawal'}`,
        message: `Are you sure you want to ${action} $${amount.toLocaleString()}?`,
        confirmText: action === 'deposit' ? 'Deposit' : 'Withdraw',
        isDestructive: action === 'withdraw',
        onConfirm: async () => {
          setConfirmDialog(null);
          await executeCashAction(action, amount);
        },
        onCancel: () => setConfirmDialog(null)
      });
    } else {
      await executeCashAction(action, amount);
    }
  };

  const executeCashAction = async (action, amount) => {
    try {
      setCashLoading(true);
      setCashError(null);
      if (action === 'deposit') {
        await portfoliosAPI.deposit(id, amount);
      } else {
        await portfoliosAPI.withdraw(id, amount);
      }
      setShowCashForm(null);
      setCashLoading(false);
      loadPortfolio();
    } catch (err) {
      console.error('Cash action failed:', err);
      setCashLoading(false);
      const errorMessage = err.response?.data?.error || err.message || 'Operation failed';
      setCashError(errorMessage);
    }
  };

  const handleCancelOrder = (orderId) => {
    setConfirmDialog({
      title: 'Cancel Order',
      message: 'Are you sure you want to cancel this order? This cannot be undone.',
      confirmText: 'Cancel Order',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        await portfoliosAPI.cancelOrder(id, orderId);
        loadPortfolio();
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      // Create export data
      const exportData = {
        portfolio: portfolio,
        holdings: holdings,
        performance: performance,
        transactions: transactions.slice(0, 100),
        exportDate: new Date().toISOString()
      };

      if (format === 'csv') {
        // Export holdings as CSV
        const csv = [
          ['Symbol', 'Shares', 'Avg Cost', 'Current Price', 'Current Value', 'Gain/Loss', 'Gain %'].join(','),
          ...holdings.map(h => [
            h.symbol,
            h.shares,
            h.average_cost?.toFixed(2),
            h.current_price?.toFixed(2),
            h.current_value?.toFixed(2),
            h.unrealized_gain?.toFixed(2),
            h.unrealized_gain_pct?.toFixed(2) + '%'
          ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${portfolio.name.replace(/\s+/g, '_')}_holdings_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'json') {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${portfolio.name.replace(/\s+/g, '_')}_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const handleDeletePortfolio = () => {
    setConfirmDialog({
      title: 'Delete Portfolio',
      message: `Are you sure you want to delete "${portfolio.name}"? This will permanently remove all positions, transactions, and history. This action cannot be undone.`,
      confirmText: 'Delete Portfolio',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await portfoliosAPI.delete(id);
          navigate('/portfolios');
        } catch (err) {
          console.error('Delete failed:', err);
          setConfirmDialog(null);
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  if (loading) {
    return (
      <div className="portfolio-detail-page">
        <SkeletonPortfolioDetail />
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="portfolio-detail-page">
        <div className="error-container">
          <AlertCircle size={48} />
          <p>Error loading portfolio: {error || 'Not found'}</p>
          <Link to="/portfolios" className="btn btn-secondary">
            <ArrowLeft size={16} /> Back to Portfolios
          </Link>
        </div>
      </div>
    );
  }

  const isPositive = (portfolio.total_gain_pct || 0) >= 0;

  return (
    <div className="portfolio-detail-page">
      {/* Header */}
      <header className="detail-header">
        <div className="header-inner">
        <Link to="/portfolios" className="back-link">
          <ArrowLeft size={18} />
          Back to Portfolios
        </Link>

        <div className="header-main">
          <div className="portfolio-identity">
            <div className="portfolio-icon">
              <Wallet size={24} />
            </div>
            <div className="portfolio-title">
              <h1>{portfolio.name}</h1>
              <span className="portfolio-type">{portfolio.type}</span>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowExportModal(true)}
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCashForm('deposit')}
            >
              <Plus size={16} />
              <span>Deposit</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCashForm('withdraw')}
            >
              <Minus size={16} />
              <span>Withdraw</span>
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowTradeForm(true)}
            >
              <TrendingUp size={16} />
              <span>Trade</span>
            </button>
            <div className="actions-menu-container">
              <button
                className="btn btn-icon"
                onClick={() => setShowActionsMenu(!showActionsMenu)}
              >
                <MoreVertical size={22} />
              </button>
              {showActionsMenu && (
                <div className="actions-dropdown" onClick={() => setShowActionsMenu(false)}>
                  <button
                    className="dropdown-item danger"
                    onClick={handleDeletePortfolio}
                  >
                    <Trash2 size={16} />
                    Delete Portfolio
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Stats with Tooltips */}
        <div className="stats-bar">
          <Tooltip text="Total market value of all holdings plus cash">
            <div className="stat-item main">
              <DollarSign size={20} />
              <div>
                <span className="stat-label">Total Value</span>
                <span className="stat-value large">{formatValue(portfolio.total_value)}</span>
              </div>
            </div>
          </Tooltip>

          <Tooltip text="Overall portfolio gain/loss since inception">
            <div className={`stat-item ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <div>
                <span className="stat-label">Total Return</span>
                <span className="stat-value">
                  {formatPercent(portfolio.total_gain_pct)}
                  <span className="stat-subvalue">({formatValue(portfolio.total_gain)})</span>
                </span>
              </div>
            </div>
          </Tooltip>

          <Tooltip text="Available cash for new investments">
            <div className="stat-item">
              <Wallet size={20} />
              <div>
                <span className="stat-label">Cash</span>
                <span className="stat-value">{formatValue(portfolio.cash_balance)}</span>
              </div>
            </div>
          </Tooltip>

          <Tooltip text="Number of unique stock positions">
            <div className="stat-item">
              <BarChart3 size={20} />
              <div>
                <span className="stat-label">Positions</span>
                <span className="stat-value">{portfolio.positions_count || holdings.length}</span>
              </div>
            </div>
          </Tooltip>

          {performance?.sharpeRatio !== undefined && (
            <Tooltip text="Risk-adjusted return measure. Above 1 is good, above 2 is excellent.">
              <div className="stat-item">
                <Target size={20} />
                <div>
                  <span className="stat-label">Sharpe Ratio</span>
                  <span className="stat-value">{performance.sharpeRatio?.toFixed(2) || '-'}</span>
                </div>
              </div>
            </Tooltip>
          )}
        </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs-inner">
        <div className="tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Content */}
      <div className="detail-content">
        {activeTab === 'overview' && (
          <div className="overview-section">
            <div className="overview-grid">
              {/* Performance Summary */}
              <div className="overview-card performance-card">
                <h3>Performance Summary</h3>
                {performance ? (
                  <div className="performance-grid">
                    <Tooltip text="Total return over the past year">
                      <div className="perf-item">
                        <span className="perf-label">1Y Return</span>
                        <span className={`perf-value ${(performance.totalReturnPct || 0) >= 0 ? 'positive' : 'negative'}`}>
                          {formatPercent(performance.totalReturnPct)}
                        </span>
                      </div>
                    </Tooltip>
                    <Tooltip text="Annualized standard deviation of returns">
                      <div className="perf-item">
                        <span className="perf-label">Volatility</span>
                        <span className="perf-value">{performance.volatility?.toFixed(2)}%</span>
                      </div>
                    </Tooltip>
                    <Tooltip text="Return per unit of risk. Higher is better.">
                      <div className="perf-item">
                        <span className="perf-label">Sharpe Ratio</span>
                        <span className="perf-value">{performance.sharpeRatio?.toFixed(2)}</span>
                      </div>
                    </Tooltip>
                    <Tooltip text="Largest peak-to-trough decline">
                      <div className="perf-item">
                        <span className="perf-label">Max Drawdown</span>
                        <span className="perf-value negative">
                          {formatPercent(performance.maxDrawdown ? -performance.maxDrawdown : null)}
                        </span>
                      </div>
                    </Tooltip>
                  </div>
                ) : (
                  <p className="no-data">Performance data not available yet</p>
                )}
              </div>

              {/* Risk Metrics */}
              <RiskMetricsCard riskData={riskMetrics} performance={performance} />

              {/* Dividend Card */}
              <DividendCard holdings={holdings} transactions={transactions} />

              {/* AI Insights - spans full width */}
              <div className="overview-card-full">
                <PortfolioInsightsPanel
                  portfolio={portfolio}
                  holdings={holdings}
                  performance={performance}
                  riskMetrics={riskMetrics}
                  allocation={allocation}
                />
              </div>

              {/* Top Holdings */}
              <div className="overview-card">
                <h3>Top Holdings</h3>
                <div className="top-holdings-list">
                  {holdings.slice(0, 5).map((h, idx) => (
                    <div key={idx} className="top-holding-item">
                      <div className="holding-rank">{idx + 1}</div>
                      {isETF(h) ? (
                        <button
                          className="holding-symbol etf-link"
                          onClick={() => setSelectedETF(h.symbol)}
                        >
                          {h.symbol}
                          <span className="etf-badge-mini">ETF</span>
                        </button>
                      ) : (
                        <Link to={`/company/${h.symbol}`} className="holding-symbol">
                          {h.symbol}
                        </Link>
                      )}
                      <div className="holding-weight">
                        {((h.current_value / portfolio.total_value) * 100).toFixed(1)}%
                      </div>
                      <div className={`holding-gain ${(h.unrealized_pnl || h.unrealized_gain || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {formatPercent(h.unrealized_pnl_pct || h.unrealized_gain_pct)}
                      </div>
                    </div>
                  ))}
                  {holdings.length === 0 && (
                    <p className="no-data">No holdings yet</p>
                  )}
                </div>
              </div>

              {/* Active Orders */}
              <div className="overview-card">
                <h3>Active Orders</h3>
                <div className="orders-list">
                  {activeOrders.slice(0, 5).map((order, idx) => (
                    <div key={idx} className="order-item">
                      <span className={`order-type ${order.order_type}`}>
                        {order.order_type.replace('_', ' ')}
                      </span>
                      <span className="order-symbol">{order.symbol}</span>
                      <span className="order-price">{formatValue(order.trigger_price)}</span>
                    </div>
                  ))}
                  {activeOrders.length === 0 && (
                    <p className="no-data">No active orders</p>
                  )}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowOrderForm(true)}
                >
                  <Plus size={14} />
                  Add Order
                </button>
              </div>

              {/* Recent Activity */}
              <div className="overview-card">
                <h3>Recent Activity</h3>
                <div className="activity-list">
                  {transactions.slice(0, 5).map((t, idx) => (
                    <div key={idx} className="activity-item">
                      <span className={`activity-type ${t.type}`}>{t.type}</span>
                      <span className="activity-detail">
                        {t.symbol ? `${t.shares} ${t.symbol}` : formatValue(t.amount)}
                      </span>
                      <span className="activity-date">
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <p className="no-data">No transactions yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="performance-section">
            <PerformanceChart
              data={valueHistory.map(h => ({ date: h.date, value: h.value }))}
              benchmarkData={benchmarkHistory.map(h => ({ date: h.date, value: h.close }))}
              period={chartPeriod}
              onPeriodChange={setChartPeriod}
              showBenchmark={true}
              height={400}
              portfolioName={portfolio.name}
              benchmarkName={BENCHMARK_LABELS[preferences.defaultBenchmark] || 'S&P 500'}
            />
          </div>
        )}

        {activeTab === 'holdings' && (
          <HoldingsTable
            holdings={holdings}
            portfolioId={id}
            onRefresh={loadPortfolio}
          />
        )}

        {activeTab === 'orders' && (
          <div className="orders-section">
            <div className="section-header">
              <h2>Standing Orders</h2>
              <button
                className="btn btn-primary"
                onClick={() => setShowOrderForm(true)}
              >
                <Plus size={16} />
                New Order
              </button>
            </div>
            <div className="orders-table-wrapper">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Symbol</th>
                    <th>Trigger Price</th>
                    <th>Shares/Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className={`order-type-badge ${order.order_type}`}>
                          {order.order_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <Link to={`/company/${order.symbol}`}>{order.symbol}</Link>
                      </td>
                      <td>{formatValue(order.trigger_price)}</td>
                      <td>{order.shares || formatValue(order.amount)}</td>
                      <td>
                        <span className={`status-badge ${order.status}`}>
                          {order.status}
                        </span>
                      </td>
                      <td>{new Date(order.created_at).toLocaleDateString()}</td>
                      <td>
                        {order.status === 'active' && (
                          <button
                            className="btn-icon"
                            onClick={() => handleCancelOrder(order.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length === 0 && (
                <div className="empty-table">
                  <p>No orders found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <TransactionList
            transactions={transactions}
            onLoadMore={() => {
              // Load more transactions
            }}
          />
        )}

        {activeTab === 'allocation' && (
          <AllocationChart
            holdings={holdings}
            allocation={allocation}
            totalValue={portfolio.total_value}
          />
        )}

        {activeTab === 'notes' && (
          <PortfolioNotesPanel
            portfolioId={parseInt(id)}
            portfolioName={portfolio.name}
          />
        )}

        {activeTab === 'ai' && (
          <AITradingSection portfolioId={parseInt(id)} />
        )}

        {activeTab === 'backtest' && (
          <BacktestPanel
            portfolioId={id}
            holdings={holdings}
          />
        )}

        {activeTab === 'risk' && (
          <SimulateSection
            portfolioId={id}
            holdings={holdings}
            initialValue={portfolio.total_value}
          />
        )}

        {activeTab === 'alerts' && (
          <PortfolioAlerts portfolioId={id} />
        )}

        {activeTab === 'simulate' && (
          <SimulateSection
            portfolioId={id}
            holdings={holdings}
            initialValue={portfolio.total_value}
          />
        )}

        {activeTab === 'export' && (
          <ExportPanel
            portfolioId={id}
            portfolioName={portfolio.name}
          />
        )}
      </div>

      {/* Modals */}
      {showTradeForm && (
        <TradeForm
          portfolioId={id}
          holdings={holdings}
          cashBalance={portfolio.cash_balance}
          onClose={() => setShowTradeForm(false)}
          onComplete={handleTradeComplete}
        />
      )}

      {showOrderForm && (
        <OrderForm
          portfolioId={id}
          holdings={holdings}
          onClose={() => setShowOrderForm(false)}
          onComplete={handleOrderComplete}
        />
      )}

      {showCashForm && (
        <div className="modal-overlay" onClick={() => { setShowCashForm(null); setCashError(null); }}>
          <div className="cash-modal" onClick={e => e.stopPropagation()}>
            <h3>{showCashForm === 'deposit' ? 'Deposit Cash' : 'Withdraw Cash'}</h3>
            {showCashForm === 'withdraw' && (
              <p className="modal-info">
                Available: {formatValue(portfolio.cash_balance)}
              </p>
            )}
            {cashError && (
              <div className="cash-error">
                <AlertCircle size={16} />
                {cashError}
              </div>
            )}
            <form onSubmit={(e) => {
              e.preventDefault();
              const amount = parseFloat(e.target.amount.value);
              if (amount > 0) {
                if (showCashForm === 'withdraw' && amount > portfolio.cash_balance) {
                  setCashError('Insufficient cash balance');
                  return;
                }
                handleCashAction(showCashForm, amount);
              }
            }}>
              <div className="form-group">
                <label>Amount ($)</label>
                <input
                  type="number"
                  name="amount"
                  min="0.01"
                  step="0.01"
                  max={showCashForm === 'withdraw' ? portfolio.cash_balance : undefined}
                  placeholder="0.00"
                  required
                  autoFocus
                  disabled={cashLoading}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowCashForm(null); setCashError(null); }}
                  disabled={cashLoading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={cashLoading}>
                  {cashLoading ? (
                    <>
                      <RefreshCw size={16} className="spinning" />
                      Processing...
                    </>
                  ) : (
                    showCashForm === 'deposit' ? 'Deposit' : 'Withdraw'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          isDestructive={confirmDialog.isDestructive}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}

      {/* ETF Detail Modal */}
      {selectedETF && (
        <ETFDetailModal
          symbol={selectedETF}
          onClose={() => setSelectedETF(null)}
        />
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        portfolioId={id}
        portfolioName={portfolio.name}
      />
    </div>
  );
}

export default PortfolioDetailPage;
