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
  FileText,
  Info,
  Edit3
} from '../../components/icons';
import { portfoliosAPI, simulateAPI, attributionAPI, pricesAPI, prismAPI } from '../../services/api';
import { usePreferences, useAutoRefresh } from '../../context/PreferencesContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { FeatureGate, LockedIndicator } from '../../components/subscription';
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
import { AskAIProvider } from '../../hooks';
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

// PRISM Health Card - Aggregated portfolio quality score
function PRISMHealthCard({ holdings, prismScores, totalValue, isLocked }) {
  // Calculate weighted average PRISM score
  const holdingsWithScores = holdings.filter(h => prismScores[h.symbol]);

  // Show locked state if user doesn't have access
  if (isLocked) {
    return (
      <div className="overview-card prism-health-card prism-health-card--locked">
        <h3><Brain size={16} /> PRISM Health</h3>
        <LockedIndicator
          feature="prism_reports"
          variant="card"
          message="Portfolio quality scoring"
        />
      </div>
    );
  }

  if (holdingsWithScores.length === 0) {
    return (
      <div className="overview-card prism-health-card">
        <h3><Brain size={16} /> PRISM Health</h3>
        <p className="no-data">PRISM scores loading or not available for holdings</p>
      </div>
    );
  }

  // Calculate value-weighted average score
  const weightedScore = holdingsWithScores.reduce((sum, h) => {
    const weight = (h.current_value || 0) / totalValue;
    return sum + (prismScores[h.symbol] * weight);
  }, 0);

  // Coverage: what % of portfolio value has PRISM scores
  const scoredValue = holdingsWithScores.reduce((sum, h) => sum + (h.current_value || 0), 0);
  const coverage = (scoredValue / totalValue) * 100;

  // Score distribution
  const excellent = holdingsWithScores.filter(h => prismScores[h.symbol] >= 4).length;
  const good = holdingsWithScores.filter(h => prismScores[h.symbol] >= 3 && prismScores[h.symbol] < 4).length;
  const fair = holdingsWithScores.filter(h => prismScores[h.symbol] >= 2 && prismScores[h.symbol] < 3).length;
  const poor = holdingsWithScores.filter(h => prismScores[h.symbol] < 2).length;

  const getHealthClass = (score) => {
    if (score >= 4) return 'excellent';
    if (score >= 3) return 'good';
    if (score >= 2) return 'fair';
    return 'poor';
  };

  return (
    <div className="overview-card prism-health-card">
      <h3><Brain size={16} /> PRISM Health</h3>
      <div className="prism-health-content">
        <div className="prism-main-score">
          <span className={`prism-score-value ${getHealthClass(weightedScore)}`}>
            {weightedScore.toFixed(1)}
          </span>
          <span className="prism-score-max">/5</span>
        </div>
        <div className="prism-score-label">Portfolio Quality Score</div>
        <div className="prism-coverage">
          {coverage.toFixed(0)}% of holdings covered ({holdingsWithScores.length}/{holdings.length})
        </div>
      </div>
      <div className="prism-distribution">
        <div className="prism-dist-row">
          <span className="prism-dist-label excellent">Excellent (4+)</span>
          <span className="prism-dist-count">{excellent}</span>
        </div>
        <div className="prism-dist-row">
          <span className="prism-dist-label good">Good (3-4)</span>
          <span className="prism-dist-count">{good}</span>
        </div>
        <div className="prism-dist-row">
          <span className="prism-dist-label fair">Fair (2-3)</span>
          <span className="prism-dist-count">{fair}</span>
        </div>
        <div className="prism-dist-row">
          <span className="prism-dist-label poor">Poor (&lt;2)</span>
          <span className="prism-dist-count">{poor}</span>
        </div>
      </div>
      <div className="prism-holdings-preview">
        {holdingsWithScores.slice(0, 4).map((h, idx) => (
          <div key={idx} className="prism-holding-item">
            <span className="prism-holding-symbol">{h.symbol}</span>
            <span className={`prism-holding-score ${getHealthClass(prismScores[h.symbol])}`}>
              {prismScores[h.symbol].toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simulate Section with sub-tabs
function SimulateSection({ portfolioId, holdings, initialValue }) {
  const [activeSimTab, setActiveSimTab] = useState('distribution');

  // Workflow order: Understand distributions → Size positions → Simulate → Validate → Analyze
  const SIMULATE_TABS = [
    { id: 'distribution', label: 'Distribution', icon: BarChart3 },
    { id: 'position', label: 'Position Sizing', icon: Target },
    { id: 'montecarlo', label: 'Monte Carlo', icon: Activity },
    { id: 'backtest', label: 'Backtest', icon: Clock },
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
          <FeatureGate
            feature="monte_carlo"
            requiredTier="ultra"
            title="Monte Carlo Simulation"
            description="Run probability simulations to understand your portfolio's risk"
            showPreview
            previewHeight="300px"
          >
            <MonteCarloPanel
              portfolioId={portfolioId}
              initialValue={initialValue}
            />
          </FeatureGate>
        )}

        {activeSimTab === 'distribution' && (
          <DistributionPanel
            portfolioId={portfolioId}
          />
        )}

        {activeSimTab === 'backtest' && (
          <FeatureGate
            feature="backtesting"
            requiredTier="ultra"
            title="Backtesting Engine"
            description="Test your strategy against historical data"
            showPreview
            previewHeight="300px"
          >
            <BacktestPanel
              portfolioId={portfolioId}
              holdings={holdings}
            />
          </FeatureGate>
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
  const { hasFeature, isGrandfatheredActive } = useSubscription();
  const canAccessPrism = hasFeature('prism_reports') || isGrandfatheredActive;
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
  const [prismScores, setPrismScores] = useState({});
  const [prismBlocked, setPrismBlocked] = useState(false);

  // About section state
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutText, setAboutText] = useState('');
  const [savingAbout, setSavingAbout] = useState(false);

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
    if (id && id !== 'null') {
      loadPortfolio();
    } else {
      setLoading(false);
      setError(id === 'null' ? 'Invalid portfolio ID.' : 'Select a portfolio.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load chart data when period changes
  useEffect(() => {
    if (portfolio) {
      loadChartData(chartPeriod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPeriod, portfolio]);

  // Load PRISM scores for portfolio holdings
  useEffect(() => {
    const loadPrismScores = async () => {
      if (holdings.length === 0) return;

      const newScores = {};
      let blocked = false;

      // Load PRISM scores in parallel for all holdings (excluding ETFs)
      await Promise.all(holdings.map(async (h) => {
        if (h.sector === 'ETF' || h.is_etf || blocked) return; // Skip ETFs or if already blocked
        try {
          const prismRes = await prismAPI.getReport(h.symbol);
          if (prismRes?.success && prismRes?.report?.scorecard?.overallScore) {
            newScores[h.symbol] = prismRes.report.scorecard.overallScore;
          }
        } catch (e) {
          // Check if blocked due to subscription (403)
          if (e?.response?.status === 403 || e?.code === 'FEATURE_RESTRICTED') {
            blocked = true;
          }
          // Otherwise PRISM data not available for this symbol
        }
      }));

      setPrismBlocked(blocked);
      setPrismScores(newScores);
    };

    loadPrismScores();
  }, [holdings]);

  // Initialize about text when portfolio loads
  useEffect(() => {
    if (portfolio?.description) {
      setAboutText(portfolio.description);
    }
  }, [portfolio?.description]);

  // Auto-refresh portfolio data based on user preference
  useAutoRefresh(() => {
    loadPortfolio();
  });

  const loadPortfolio = async () => {
    if (!id || id === 'null') return;
    try {
      setLoading(true);
      setError(null);
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
      const rawHoldings = holdingsRes.data.holdings;
      const rawOrders = ordersRes.data.orders;
      const rawTransactions = transactionsRes.data.transactions;
      setHoldings(Array.isArray(rawHoldings) ? rawHoldings : []);
      setOrders(Array.isArray(rawOrders) ? rawOrders : []);
      setTransactions(Array.isArray(rawTransactions) ? rawTransactions : []);

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

  // Save portfolio description
  const saveAbout = async () => {
    try {
      setSavingAbout(true);
      await portfoliosAPI.update(id, { description: aboutText });
      setPortfolio(prev => ({ ...prev, description: aboutText }));
      setEditingAbout(false);
    } catch (err) {
      console.error('Failed to save description:', err);
    } finally {
      setSavingAbout(false);
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
              <div className="portfolio-meta-row">
                <span className="portfolio-type">{portfolio.type}</span>
                {portfolio.type === 'agent_managed' && portfolio.agentId && (
                  <Link to={`/agents/${portfolio.agentId}`} className="agent-link">
                    <Brain size={14} />
                    View Agent
                  </Link>
                )}
              </div>
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
              {/* Row 1: About Section - full width */}
              <div className="overview-card about-card">
                <div className="card-header-row">
                  <h3><Info size={16} /> About This Portfolio</h3>
                  {!editingAbout && (
                    <button className="btn-icon" onClick={() => setEditingAbout(true)} title="Edit description">
                      <Edit3 size={14} />
                    </button>
                  )}
                </div>
                {editingAbout ? (
                  <div className="about-edit">
                    <textarea
                      value={aboutText}
                      onChange={e => setAboutText(e.target.value)}
                      placeholder="Describe your investment thesis, strategy, and goals..."
                      rows={3}
                    />
                    <div className="edit-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditingAbout(false); setAboutText(portfolio?.description || ''); }}>
                        Cancel
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={saveAbout} disabled={savingAbout}>
                        {savingAbout ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="about-content">
                    {portfolio?.description ? (
                      <p>{portfolio.description}</p>
                    ) : (
                      <p className="placeholder-text">
                        Add a description to document your investment thesis and strategy.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Row 2: Key Metrics Card + Allocation Overview */}
              <div className="overview-card metrics-card-compact">
                <h3><BarChart3 size={16} /> Key Metrics</h3>
                <div className="metrics-grid-compact">
                  <Tooltip text="Compound Annual Growth Rate">
                    <div className="metric-compact">
                      <span className="metric-label">CAGR</span>
                      <span className={`metric-value ${(performance?.cagr || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {performance?.cagr?.toFixed(2) || '-'}%
                      </span>
                    </div>
                  </Tooltip>
                  <Tooltip text="Risk-adjusted return (downside only)">
                    <div className="metric-compact">
                      <span className="metric-label">Sortino</span>
                      <span className="metric-value">{performance?.sortinoRatio?.toFixed(2) || '-'}</span>
                    </div>
                  </Tooltip>
                  <Tooltip text="Return / Max Drawdown ratio">
                    <div className="metric-compact">
                      <span className="metric-label">Calmar</span>
                      <span className="metric-value">{performance?.calmarRatio?.toFixed(2) || '-'}</span>
                    </div>
                  </Tooltip>
                  <Tooltip text="Volatility vs market">
                    <div className="metric-compact">
                      <span className="metric-label">Beta</span>
                      <span className="metric-value">{riskMetrics?.beta?.toFixed(2) || '-'}</span>
                    </div>
                  </Tooltip>
                  <Tooltip text="Deviation from benchmark">
                    <div className="metric-compact">
                      <span className="metric-label">Track Err</span>
                      <span className="metric-value">{riskMetrics?.trackingError?.toFixed(2) || '-'}%</span>
                    </div>
                  </Tooltip>
                  <Tooltip text="HHI concentration index">
                    <div className="metric-compact">
                      <span className="metric-label">HHI</span>
                      <span className="metric-value">{allocation?.concentration?.hhi ? (allocation.concentration.hhi * 100).toFixed(0) : '-'}</span>
                    </div>
                  </Tooltip>
                </div>
              </div>

              <div className="overview-card allocation-overview-card">
                <h3><PieChart size={16} /> Allocation</h3>
                <div className="allocation-grid">
                  <div className="top-positions-section">
                    <h4>Top Positions</h4>
                    {holdings.slice(0, 5).map((pos, i) => (
                      <div key={pos.symbol} className="position-bar-row">
                        <span className="position-rank">{i + 1}</span>
                        <Link to={`/company/${pos.symbol}`} className="position-symbol">{pos.symbol}</Link>
                        <div className="weight-bar-container">
                          <div
                            className="weight-bar-fill"
                            style={{ width: `${Math.min(((pos.current_value / portfolio?.total_value) * 100) || 0, 100)}%` }}
                          />
                        </div>
                        <span className="weight-value">
                          {((pos.current_value / portfolio?.total_value) * 100 || 0).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="sector-breakdown-section">
                    <h4>By Sector</h4>
                    {allocation?.sectors?.slice(0, 5).map(sector => (
                      <div key={sector.name} className="sector-row">
                        <span className="sector-name">{sector.name}</span>
                        <span className="sector-weight">{sector.weight?.toFixed(1)}%</span>
                      </div>
                    )) || <p className="no-data">Sector data not available</p>}
                  </div>
                </div>
                {holdings[0] && ((holdings[0].current_value / portfolio?.total_value) * 100) > 25 && (
                  <div className="concentration-warning">
                    <AlertTriangle size={14} />
                    <span>High concentration: {holdings[0].symbol} at {((holdings[0].current_value / portfolio?.total_value) * 100).toFixed(1)}%</span>
                  </div>
                )}
              </div>

              {/* Row 3: Performance & Risk Combined */}
              <div className="overview-card performance-risk-card">
                <h3><Activity size={16} /> Performance & Risk</h3>
                <div className="perf-risk-grid">
                  <div className="perf-section">
                    <h4>Returns</h4>
                    <div className="perf-metrics">
                      <div className="perf-metric">
                        <span className="label">1Y Return</span>
                        <span className={`value ${(performance?.totalReturnPct || 0) >= 0 ? 'positive' : 'negative'}`}>
                          {formatPercent(performance?.totalReturnPct)}
                        </span>
                      </div>
                      <div className="perf-metric">
                        <span className="label">Volatility</span>
                        <span className="value">{performance?.volatility?.toFixed(2) || '-'}%</span>
                      </div>
                      <div className="perf-metric">
                        <span className="label">Sharpe</span>
                        <span className="value">{performance?.sharpeRatio?.toFixed(2) || '-'}</span>
                      </div>
                      <div className="perf-metric">
                        <span className="label">Max DD</span>
                        <span className="value negative">{performance?.maxDrawdown ? `-${Math.abs(performance.maxDrawdown).toFixed(2)}%` : '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="risk-section">
                    <h4>Risk Factors</h4>
                    <div className="risk-metrics">
                      <div className={`risk-metric ${riskMetrics?.beta && Math.abs(riskMetrics.beta - 1) < 0.3 ? 'good' : ''}`}>
                        <span className="label">Beta</span>
                        <span className="value">{riskMetrics?.beta?.toFixed(2) || '-'}</span>
                      </div>
                      <div className={`risk-metric ${riskMetrics?.alpha && riskMetrics.alpha > 0 ? 'good' : ''}`}>
                        <span className="label">Alpha</span>
                        <span className="value">{riskMetrics?.alpha?.toFixed(2) || '-'}%</span>
                      </div>
                      <div className={`risk-metric ${performance?.sortinoRatio && performance.sortinoRatio > 1 ? 'good' : ''}`}>
                        <span className="label">Sortino</span>
                        <span className="value">{performance?.sortinoRatio?.toFixed(2) || '-'}</span>
                      </div>
                      <div className="risk-metric">
                        <span className="label">Top Pos</span>
                        <span className="value">{allocation?.positions?.[0]?.weight?.toFixed(1) || '-'}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3 continued: Dividend & Income */}
              <DividendCard holdings={holdings} transactions={transactions} />

              {/* Row 4: PRISM Health + AI Insights side by side */}
              <PRISMHealthCard
                holdings={holdings}
                prismScores={prismScores}
                totalValue={portfolio?.total_value || 0}
                isLocked={!canAccessPrism || prismBlocked}
              />

              <div className="overview-card ai-insights-compact">
                <PortfolioInsightsPanel
                  portfolio={portfolio}
                  holdings={holdings}
                  performance={performance}
                  riskMetrics={riskMetrics}
                  allocation={allocation}
                  compact={true}
                />
              </div>

              {/* Row 5: Top Holdings + Orders + Activity */}
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
            <AskAIProvider value={{ type: 'chart', label: `${portfolio.name} Performance`, metric: 'portfolio_performance' }}>
              <PerformanceChart
                data={valueHistory.map(h => ({ date: h.date, value: h.value }))}
                benchmarkData={benchmarkHistory.map(h => ({ date: h.date, value: h.close }))}
                period={chartPeriod}
                onPeriodChange={setChartPeriod}
                showBenchmark={true}
                height={400}
                portfolioName={portfolio.name}
                benchmarkName={BENCHMARK_LABELS[preferences.defaultBenchmark] || 'S&P 500'}
                initialInvestment={(portfolio.total_deposited || 0) - (portfolio.total_withdrawn || 0)}
              />
            </AskAIProvider>
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
                className="btn btn-secondary btn-sm"
                onClick={() => setShowOrderForm(true)}
              >
                <Plus size={14} />
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
          <AskAIProvider value={{ type: 'chart', label: `${portfolio.name} Allocation`, metric: 'portfolio_allocation' }}>
            <AllocationChart
              holdings={holdings}
              allocation={allocation}
              totalValue={portfolio.total_value}
            />
          </AskAIProvider>
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
