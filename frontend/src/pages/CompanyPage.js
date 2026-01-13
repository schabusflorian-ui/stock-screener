// frontend/src/pages/CompanyPage.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Calendar,
  ExternalLink,
  Activity,
  Target,
  Shield,
  DollarSign,
  Users,
  Wallet,
  RefreshCcw,
  TrendingUp,
  FileText,
  Globe,
  Crown,
  Bot,
  Loader,
  History,
  ChevronDown,
  X,
  BookOpen
} from 'lucide-react';
import { companyAPI, trendsAPI, insidersAPI, sentimentAPI, capitalAPI, pricesAPI, dividendsAPI, indicesAPI, investorsAPI, analystAPI, aiRatingsAPI, congressionalAPI } from '../services/api';
import {
  PeriodToggle,
  MetricSelector,
  FinancialBreakdown,
  BalanceSheetBreakdown,
  CashFlowBreakdown,
  WatchlistButton,
  MultiMetricChart,
  ClassificationEditor,
  AnalysisDashboard,
  NewsAndEvents,
  AnalystHistoryChart,
  EarningsCalendar,
  EnhancedSignalsPanel,
  AVAILABLE_METRICS,
  DEFAULT_CHART_METRICS,
  DEFAULT_TABLE_METRICS
} from '../components';
// SnowflakeChart available for future use
// import { SnowflakeChart } from '../components/charts';
import { SentimentCard } from '../components/SentimentCard';
import { NewsCard } from '../components/NewsCard';
import CombinedSentimentPanel from '../components/CombinedSentimentPanel';
import StockTwitsCard from '../components/StockTwitsCard';
import { PriceChart } from '../components/PriceChart';
import { AlphaChart } from '../components/AlphaChart';
import { NLQueryBar } from '../components/nl';
import { AddToPortfolioButton } from '../components/portfolio';
import { CompanyNotesPanel } from '../components/notes';
import { dcfAPI } from '../services/api';
import { SectionErrorBoundary } from '../components/ErrorBoundary';
import { useFormatters } from '../hooks/useFormatters';
import './CompanyPage.css';

// Format value function will be defined inside the component to use hook

// Get rating for a metric (excellent, good, fair, poor)
const getMetricRating = (value, metricKey) => {
  if (value === null || value === undefined) return 'na';

  // Thresholds are in percentage terms (e.g., 15 = 15%)
  const thresholds = {
    roic: { excellent: 15, good: 10, fair: 5 },
    fcf_yield: { excellent: 8, good: 5, fair: 2 },
    pe_ratio: { excellent: 15, good: 20, fair: 30 }, // inverted - lower is better
    roe: { excellent: 20, good: 15, fair: 10 },
    net_margin: { excellent: 20, good: 10, fair: 5 },
    debt_to_equity: { excellent: 0.3, good: 0.7, fair: 1.5 }, // inverted
  };

  const t = thresholds[metricKey];
  if (!t) return 'na';

  // Metrics that come as decimals need to be converted to percentages
  // (e.g., 0.26 -> 26 for ROIC)
  // Note: fcf_yield already comes as a percentage from the API
  const decimalMetrics = ['roic', 'roe', 'net_margin'];
  const compareValue = decimalMetrics.includes(metricKey) ? value * 100 : value;

  // For inverted metrics (lower is better)
  if (metricKey === 'pe_ratio' || metricKey === 'debt_to_equity') {
    if (compareValue <= t.excellent) return 'excellent';
    if (compareValue <= t.good) return 'good';
    if (compareValue <= t.fair) return 'fair';
    return 'poor';
  }

  // Normal metrics (higher is better)
  if (compareValue >= t.excellent) return 'excellent';
  if (compareValue >= t.good) return 'good';
  if (compareValue >= t.fair) return 'fair';
  return 'poor';
};

// MetricBar component with visual progress bar
// format: 'percent' (value already as %), 'decimal_percent' (value as decimal), 'ratio' (no % suffix)
const MetricBar = ({ label, value, max, format = 'percent', inverted = false }) => {
  const displayValue = value === null || value === undefined ? null : value;
  // For decimal_percent format, values come as decimals (0.14 = 14%), so multiply by 100
  const isDecimalPercent = format === 'decimal_percent';
  const scaledValue = displayValue !== null && isDecimalPercent ? displayValue * 100 : displayValue;
  const isPercent = format === 'percent' || format === 'decimal_percent';
  const formattedValue = displayValue !== null
    ? (isPercent ? `${scaledValue.toFixed(1)}%` : displayValue.toFixed(2))
    : '-';

  // Calculate bar width (0-100%) - use scaledValue for decimal_percent format
  const normalizedValue = displayValue !== null
    ? Math.min(Math.max(isDecimalPercent ? scaledValue : displayValue, 0), max)
    : 0;
  const barWidth = (normalizedValue / max) * 100;

  // Determine color based on value and whether inverted
  const getBarColor = () => {
    if (displayValue === null) return 'neutral';
    const ratio = normalizedValue / max;
    if (inverted) {
      if (ratio <= 0.3) return 'excellent';
      if (ratio <= 0.5) return 'good';
      if (ratio <= 0.7) return 'fair';
      return 'poor';
    } else {
      if (ratio >= 0.7) return 'excellent';
      if (ratio >= 0.5) return 'good';
      if (ratio >= 0.3) return 'fair';
      return 'poor';
    }
  };

  return (
    <div className="metric-bar-item">
      <div className="metric-bar-header">
        <span className="metric-bar-label">{label}</span>
        <span className={`metric-bar-value ${getBarColor()}`}>{formattedValue}</span>
      </div>
      <div className="metric-bar-track">
        <div
          className={`metric-bar-fill ${getBarColor()}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
};

function CompanyPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const fmt = useFormatters();

  // Format metric value using preferences
  // Note: Some metrics come as decimals (0.14 = 14%), others are already percentages
  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-';
    switch (format) {
      case 'decimal_percent': // Metrics that come as decimals (e.g., roic, roe, margins)
        return fmt.percent(value, { decimals: 1, multiply: true });
      case 'percent': // Metrics already in percentage form (e.g., fcf_yield, earnings_yield, changes)
        return fmt.percent(value, { decimals: 1 });
      case 'ratio': return fmt.ratio(value, { decimals: 2, suffix: '' });
      case 'currency': return fmt.currency(value, { compact: true });
      default: return fmt.number(value, { decimals: 2 });
    }
  };

  const [company, setCompany] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [trends, setTrends] = useState(null);
  const [insiderData, setInsiderData] = useState(null);
  const [congressionalData, setCongressionalData] = useState(null);
  const [congressionalLoading, setCongressionalLoading] = useState(false);
  const [sentimentData, setSentimentData] = useState(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [capitalData, setCapitalData] = useState(null);
  const [capitalLoading, setCapitalLoading] = useState(false);
  const [analystData, setAnalystData] = useState(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [dcfData, setDcfData] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [alphaData, setAlphaData] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [dividendData, setDividendData] = useState(null);
  const [dividendLoading, setDividendLoading] = useState(false);
  const [investorOwners, setInvestorOwners] = useState([]);
  const [loading, setLoading] = useState(true);

  // AI Rating state
  const [aiRating, setAiRating] = useState(null);
  const [aiRatingLoading, setAiRatingLoading] = useState(false);
  const [aiRatingHistory, setAiRatingHistory] = useState([]);
  const [showRatingHistory, setShowRatingHistory] = useState(false);

  // New state for period and metric selection
  const [periodType, setPeriodType] = useState('annual');
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [dataSource, setDataSource] = useState('sec'); // 'sec' (US) or 'xbrl' (EU/UK)
  const [periodAutoSelected, setPeriodAutoSelected] = useState(false);
  const [chartMetrics, setChartMetrics] = useState(DEFAULT_CHART_METRICS);
  const [tableMetrics, setTableMetrics] = useState(DEFAULT_TABLE_METRICS);
  const [financialTab, setFinancialTab] = useState('income');
  const [mainTab, setMainTab] = useState('overview');
  const [analysisSection, setAnalysisSection] = useState('quality'); // section within analysis tab
  const [sentimentView, setSentimentView] = useState('combined'); // 'combined', 'reddit', 'stocktwits', 'news'

  // Memoize latestMetrics to avoid hoisting issues with useCallback dependencies
  const latestMetrics = useMemo(() => company?.latest_metrics || {}, [company]);

  const loadMetrics = useCallback(async () => {
    try {
      const metricsRes = await companyAPI.getMetrics(symbol, {
        limit: 20,
        periodType: periodType
      });
      setMetrics(metricsRes.data.metrics);
      setAvailablePeriods(metricsRes.data.available_periods || []);
      setDataSource(metricsRes.data.data_source || 'sec');

      // Auto-select best available period type on first load
      if (!periodAutoSelected && metricsRes.data.available_periods) {
        const periods = metricsRes.data.available_periods;
        const quarterlyCount = periods.find(p => p.period_type === 'quarterly')?.count || 0;
        const annualCount = periods.find(p => p.period_type === 'annual')?.count || 0;

        // If quarterly data exists, prefer it (US companies)
        // If only annual data exists, use annual (EU/UK companies)
        if (quarterlyCount > 0) {
          setPeriodType('quarterly');
        } else if (annualCount > 0) {
          setPeriodType('annual');
        }
        setPeriodAutoSelected(true);
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  }, [symbol, periodType, periodAutoSelected]);

  useEffect(() => {
    const loadCompanyData = async () => {
      try {
        const [companyRes, trendsRes] = await Promise.all([
          companyAPI.getOne(symbol),
          trendsAPI.getCompanyTrend(symbol)
        ]);

        setCompany(companyRes.data);
        setTrends(trendsRes.data);
        setLoading(false);

        // Load insider data separately (non-blocking)
        try {
          const insiderRes = await insidersAPI.getCompanyActivity(symbol, { months: 6 });
          setInsiderData(insiderRes.data);
        } catch (e) {
          console.log('No insider data available');
        }

        // Load congressional trading data separately (non-blocking)
        try {
          setCongressionalLoading(true);
          const congressionalRes = await congressionalAPI.getCompanyTrades(symbol, 180);
          setCongressionalData(congressionalRes.data);
        } catch (e) {
          console.log('No congressional trading data available');
        } finally {
          setCongressionalLoading(false);
        }

        // Load sentiment data separately (non-blocking)
        try {
          const sentimentRes = await sentimentAPI.get(symbol);
          setSentimentData(sentimentRes.data);
        } catch (e) {
          console.log('No sentiment data available');
        }

        // Load price data first, then DCF with price
        let currentPrice = null;
        try {
          const priceRes = await pricesAPI.getMetrics(symbol);
          if (priceRes.data.success && priceRes.data.data) {
            setPriceData(priceRes.data.data);
            currentPrice = priceRes.data.data.last_price;
          }
        } catch (e) {
          console.log('No price data available');
        }

        // Load alpha data (performance vs benchmark)
        try {
          const [alphaRes, benchmarkRes] = await Promise.all([
            indicesAPI.getAlpha(symbol),
            indicesAPI.getBenchmark()
          ]);
          if (alphaRes.data.success && alphaRes.data.data) {
            setAlphaData(alphaRes.data.data);
          }
          if (benchmarkRes.data.success && benchmarkRes.data.data) {
            setBenchmarkData(benchmarkRes.data.data);
          }
        } catch (e) {
          console.log('No alpha data available');
        }

        // Load DCF data with current price (non-blocking)
        try {
          const dcfRes = await dcfAPI.getValuation(symbol, currentPrice);
          if (dcfRes.data.success) {
            setDcfData(dcfRes.data);
          }
        } catch (e) {
          console.log('No DCF data available');
        }

        // Load famous investors who own this stock (non-blocking)
        try {
          const investorsRes = await investorsAPI.getByStock(symbol);
          if (investorsRes.data.success) {
            setInvestorOwners(investorsRes.data.investors || []);
          }
        } catch (e) {
          console.log('No investor data available');
        }
      } catch (error) {
        console.error('Error loading company:', error);
        setLoading(false);
      }
    };

    loadCompanyData();
  }, [symbol]);

  // Reset auto-selection flag when symbol changes
  useEffect(() => {
    setPeriodAutoSelected(false);
    setDataSource('sec');
  }, [symbol]);

  useEffect(() => {
    if (symbol) {
      loadMetrics();
    }
  }, [symbol, periodType, loadMetrics]);

  // Handler to refresh sentiment data from Reddit
  const handleRefreshSentiment = async () => {
    setSentimentLoading(true);
    try {
      await sentimentAPI.refresh(symbol);
      const sentimentRes = await sentimentAPI.get(symbol);
      setSentimentData(sentimentRes.data);
    } catch (error) {
      console.error('Error refreshing sentiment:', error);
    } finally {
      setSentimentLoading(false);
    }
  };

  // Load capital allocation data
  const loadCapitalData = useCallback(async () => {
    if (!symbol) return;
    setCapitalLoading(true);
    try {
      const res = await capitalAPI.getCompanyOverview(symbol, 20);
      setCapitalData(res.data);
    } catch (error) {
      console.error('Error loading capital data:', error);
    } finally {
      setCapitalLoading(false);
    }
  }, [symbol]);

  // Load capital data when tab is selected
  useEffect(() => {
    if (mainTab === 'stock' && !capitalData && !capitalLoading) {
      loadCapitalData();
    }
  }, [mainTab, capitalData, capitalLoading, loadCapitalData]);

  // Load cached AI rating from localStorage and fetch history from database
  useEffect(() => {
    // Load from localStorage cache first
    const cached = localStorage.getItem(`aiRating_${symbol}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Only use cache if less than 24 hours old
        const cacheAge = Date.now() - (parsed.timestamp || 0);
        if (cacheAge < 24 * 60 * 60 * 1000) {
          setAiRating(parsed.rating);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Also fetch the latest from database
    const fetchLatestRating = async () => {
      try {
        const res = await aiRatingsAPI.getLatest(symbol);
        if (res.data.success && res.data.rating) {
          // If database has a more recent rating, use it
          setAiRating(res.data.rating);
        }
      } catch (e) {
        // Ignore errors, use localStorage cache
      }
    };
    fetchLatestRating();
  }, [symbol]);

  // Load AI rating history
  const loadRatingHistory = useCallback(async () => {
    try {
      const res = await aiRatingsAPI.getHistory(symbol, 10);
      if (res.data.success) {
        setAiRatingHistory(res.data.ratings);
      }
    } catch (e) {
      console.error('Failed to load rating history:', e);
    }
  }, [symbol]);

  // Load history when opening the history panel
  useEffect(() => {
    if (showRatingHistory) {
      loadRatingHistory();
    }
  }, [showRatingHistory, loadRatingHistory]);

  // Get AI investment rating
  const getAIRating = useCallback(async (forceRefresh = false) => {
    if (aiRatingLoading) return;
    if (!forceRefresh && aiRating) return;

    setAiRatingLoading(true);

    try {
      // Create a conversation with the value analyst
      const convResponse = await analystAPI.createConversation({
        analystId: 'value',
        companySymbol: symbol
      });

      // Build context from available data
      const context = {
        metrics: latestMetrics,
        price: priceData,
        dcf: dcfData,
        health: trends?.health
      };

      // Ask for a structured rating
      const msgResponse = await analystAPI.sendMessage(
        convResponse.data.conversation.id,
        `Analyze ${symbol} and provide an investment rating. Consider fundamentals, valuation, financial health, and growth prospects. Respond with ONLY a JSON object: {"score": 7, "label": "Buy", "summary": "Brief 2-3 sentence analysis", "strengths": ["strength1"], "risks": ["risk1"]}. Score from 1-10. Label: "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell".`,
        { context }
      );

      // Parse the response
      const content = msgResponse.data.message.content;
      let rating;

      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          rating = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Fallback parsing if JSON fails
        const scoreMatch = content.match(/(\d+)/);
        rating = {
          score: scoreMatch ? parseInt(scoreMatch[1]) : 5,
          label: 'Hold',
          summary: content.slice(0, 200)
        };
      }

      // Save to state and localStorage cache
      setAiRating(rating);
      localStorage.setItem(`aiRating_${symbol}`, JSON.stringify({
        rating,
        timestamp: Date.now()
      }));

      // Save to database for history tracking
      try {
        await aiRatingsAPI.save(symbol, {
          score: rating.score,
          label: rating.label,
          summary: rating.summary,
          strengths: rating.strengths,
          risks: rating.risks,
          analystId: 'value',
          contextData: context
        });
      } catch (dbErr) {
        console.warn('Failed to save rating to database:', dbErr);
      }
    } catch (err) {
      console.error(`Failed to get AI rating for ${symbol}:`, err);
    } finally {
      setAiRatingLoading(false);
    }
  }, [symbol, aiRatingLoading, aiRating, latestMetrics, priceData, dcfData, trends]);

  // Load dividend data when Stock tab is selected
  const loadDividendData = useCallback(async () => {
    if (!symbol || dividendData || dividendLoading) return;
    setDividendLoading(true);
    try {
      const [metricsRes, historyRes] = await Promise.all([
        dividendsAPI.getCompanyMetrics(symbol),
        dividendsAPI.getCompanyHistory(symbol, 20)
      ]);
      setDividendData({
        metrics: metricsRes.data.success ? metricsRes.data.data : null,
        history: historyRes.data.success ? historyRes.data.data : []
      });
    } catch (error) {
      console.error('Error loading dividend data:', error);
      setDividendData({ metrics: null, history: [] });
    } finally {
      setDividendLoading(false);
    }
  }, [symbol, dividendData, dividendLoading]);

  useEffect(() => {
    if (mainTab === 'stock' && !dividendData && !dividendLoading) {
      loadDividendData();
    }
  }, [mainTab, dividendData, dividendLoading, loadDividendData]);

  // Load analyst data when analyst view is selected
  const loadAnalystData = useCallback(async () => {
    if (!symbol || analystData || analystLoading) return;
    setAnalystLoading(true);
    try {
      const res = await sentimentAPI.getAnalyst(symbol);
      const data = res.data;

      // Flatten the nested response for easier access in the component
      if (data && data.priceTargets) {
        setAnalystData({
          current_price: data.priceTargets.current,
          target_high: data.priceTargets.targetHigh,
          target_low: data.priceTargets.targetLow,
          target_mean: data.priceTargets.targetMean,
          target_median: data.priceTargets.targetMedian,
          number_of_analysts: data.priceTargets.numberOfAnalysts,
          recommendation_key: data.priceTargets.recommendationKey,
          recommendation_mean: data.priceTargets.recommendationMean,
          upside_potential: data.priceTargets.upsidePotential,
          strong_buy: data.recommendations?.strongBuy || 0,
          buy: data.recommendations?.buy || 0,
          hold: data.recommendations?.hold || 0,
          sell: data.recommendations?.sell || 0,
          strong_sell: data.recommendations?.strongSell || 0,
          buy_percent: data.recommendations?.buyPercent,
          hold_percent: data.recommendations?.holdPercent,
          sell_percent: data.recommendations?.sellPercent,
          earnings_beat_rate: data.earningsBeatRate,
          signal: data.signal?.signal,
          signal_strength: data.signal?.strength,
          signal_confidence: data.signal?.confidence,
        });
      } else {
        setAnalystData(null);
      }
    } catch (error) {
      console.error('Error loading analyst data:', error);
    } finally {
      setAnalystLoading(false);
    }
  }, [symbol, analystData, analystLoading]);

  useEffect(() => {
    if (sentimentView === 'analyst' && !analystData && !analystLoading) {
      loadAnalystData();
    }
  }, [sentimentView, analystData, analystLoading, loadAnalystData]);

  if (loading) {
    return (
      <div className="company-page">
        <div className="company-loading">
          <div className="skeleton-header" />
          <div className="skeleton-metrics">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card" />)}
          </div>
          <div className="skeleton-chart" />
        </div>
      </div>
    );
  }

  if (!company) return <div className="error-state">Company not found</div>;

  const chartData = [...metrics].reverse().map(m => {
    const dataPoint = {
      date: m.fiscal_period,
      // Use fiscal label if available (e.g., "FY2024 Q1"), otherwise fall back to date
      period: m.fiscal_label || m.fiscal_period,
      // Include calendar label for reference (e.g., "Q3 2024")
      calendarPeriod: m.calendar_label,
      // Include full fiscal info for tooltips
      fiscalInfo: m.fiscal_info
    };
    chartMetrics.forEach(key => {
      dataPoint[key] = m[key];
    });
    return dataPoint;
  });

  const healthStatus = trends?.health?.health;
  const healthColor =
    healthStatus === 'IMPROVING' ? 'positive' :
    healthStatus === 'STABLE_POSITIVE' ? 'info' :
    healthStatus === 'STABLE' ? 'neutral' :
    healthStatus === 'DETERIORATING' ? 'warning' : 'negative';

  return (
    <div className="company-page">
      {/* Company Header */}
      <header className="company-header-new">
        <div className="company-identity">
          <div className="company-symbol-large">{company.company.symbol}</div>
          <div className="company-details">
            <h1 className="company-name-large">{company.company.name}</h1>
            <div className="company-meta-row">
              <Link to={`/sectors?sector=${encodeURIComponent(company.company.sector)}`} className="meta-link">
                <Building2 size={14} />
                {company.company.sector}
              </Link>
              <span className="meta-separator">-</span>
              <span className="meta-industry">{company.company.industry}</span>
              {company.currency && !company.currency.isUSD && (
                <>
                  <span className="meta-separator">-</span>
                  <span className="meta-currency" title={`Reports in ${company.currency.name}`}>
                    {company.currency.symbol} {company.currency.reporting}
                  </span>
                </>
              )}
            </div>
            <div className="company-external-links">
              {company.company.cik && (
                <a
                  href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.company.cik}&type=10&dateb=&owner=include&count=40`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="external-link"
                  title="SEC EDGAR Filings"
                >
                  <FileText size={14} />
                  <span>SEC Filings</span>
                </a>
              )}
              <a
                href={`https://finance.yahoo.com/quote/${company.company.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="external-link"
                title="Yahoo Finance"
              >
                <ExternalLink size={14} />
                <span>Yahoo</span>
              </a>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(company.company.name)}+investor+relations`}
                target="_blank"
                rel="noopener noreferrer"
                className="external-link"
                title="Search for Investor Relations"
              >
                <Globe size={14} />
                <span>IR</span>
              </a>
            </div>
          </div>
        </div>

        {/* Right side: Stock + Quality + Actions - evenly spaced */}
        <div className="header-metrics-row">
          {/* Stock Price Section */}
          {priceData && priceData.last_price > 0 && (
            <div className="header-metric-box">
              <span className="header-metric-title">Price</span>
              <span className="header-metric-value">${priceData.last_price.toFixed(2)}</span>
              {priceData.change_1d !== null && priceData.change_1d !== undefined && (
                <span className={`header-metric-sub ${priceData.change_1d >= 0 ? 'positive' : 'negative'}`}>
                  {priceData.change_1d >= 0 ? '+' : ''}{priceData.change_1d.toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {/* Quality Section - Expanded with full legend */}
          {latestMetrics?.data_quality_score !== undefined && (
            <div className="header-metric-box quality-box-wide">
              <span className="header-metric-title">Quality Score</span>
              <div className="quality-content-wide">
                <span className="quality-number-large" style={{
                  color: latestMetrics.data_quality_score >= 70 ? '#10b981' :
                         latestMetrics.data_quality_score >= 40 ? '#f59e0b' : '#ef4444'
                }}>{Math.round(latestMetrics.data_quality_score)}</span>
                <div className="quality-legend">
                  {[
                    { key: 'Value', color: '#6366f1', value: (latestMetrics.roic || 0) * 100 },
                    { key: 'Growth', color: '#10b981', value: (latestMetrics.revenue_growth_yoy || 0) * 100 },
                    { key: 'Health', color: '#3b82f6', value: latestMetrics.current_ratio ? Math.min(latestMetrics.current_ratio * 33, 100) : 0 },
                    { key: 'Profit', color: '#f59e0b', value: (latestMetrics.net_margin || 0) * 100 }
                  ].map((dim) => {
                    const val = Math.min(Math.max(dim.value, 0), 100);
                    return (
                      <div key={dim.key} className="quality-legend-item">
                        <span className="quality-legend-label" style={{ color: dim.color }}>{dim.key}</span>
                        <div className="quality-legend-bar-bg">
                          <div className="quality-legend-bar-fg" style={{ width: `${val}%`, background: dim.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Actions Stack - Classification, Watchlist, Portfolio, Trend */}
          <div className="header-actions-stack">
            <div className="action-inline">
              <span className="inline-title">Classify</span>
              <ClassificationEditor
                symbol={company.company.symbol}
                companyName={company.company.name}
                mode="button"
              />
            </div>
            <div className="action-inline">
              <span className="inline-title">Watchlist</span>
              <WatchlistButton
                symbol={company.company.symbol}
                name={company.company.name}
                sector={company.company.sector}
                size="small"
              />
            </div>
            <div className="action-inline">
              <span className="inline-title">Portfolio</span>
              <AddToPortfolioButton
                symbol={company.company.symbol}
                companyId={company.company.id}
                companyName={company.company.name}
                currentPrice={priceData?.last_price}
              />
            </div>
            <div className="action-inline">
              <span className="inline-title">Compare</span>
              <button
                className="compare-btn"
                onClick={() => navigate(`/compare?symbol=${symbol}`)}
                title={`Compare ${symbol} with other stocks`}
              >
                <BarChart3 size={16} />
              </button>
            </div>
            {healthStatus && (
              <div className="action-inline">
                <span className="inline-title">Trend</span>
                <div className={`health-status-badge ${healthColor}`}>
                  <Activity size={14} />
                  <span>{healthStatus.replace(/_/g, ' ')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Natural Language Query Bar */}
      <div className="nl-query-section">
        <NLQueryBar
          placeholder={`Ask about ${symbol}... e.g., 'Find stocks similar to ${symbol}' or 'What's driving ${symbol}'s growth?'`}
          context={{ page: 'company', symbol: symbol }}
          onResultSelect={(s) => navigate(`/company/${s}`)}
        />
      </div>

      {/* Main Navigation Tabs */}
      <nav className="main-tabs-new">
        {['overview', 'analysis', 'financials', 'stock', 'history', 'notes', 'news'].map(tab => (
          <button
            key={tab}
            className={mainTab === tab ? 'active' : ''}
            onClick={() => setMainTab(tab)}
          >
            {tab === 'overview' && <BarChart3 size={16} />}
            {tab === 'analysis' && <Target size={16} />}
            {tab === 'financials' && <DollarSign size={16} />}
            {tab === 'stock' && <TrendingUp size={16} />}
            {tab === 'history' && <Calendar size={16} />}
            {tab === 'notes' && <BookOpen size={16} />}
            {tab === 'news' && <ExternalLink size={16} />}
            <span>{tab === 'stock' ? 'Stock & Capital' : tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </button>
        ))}
      </nav>

      {/* Period Toggle - shown on all tabs */}
      <div className="controls-section-new">
        <PeriodToggle
          value={periodType}
          onChange={setPeriodType}
          availablePeriods={availablePeriods}
          dataSource={dataSource}
        />
      </div>

      {/* OVERVIEW TAB */}
      {mainTab === 'overview' && (
        <div className="overview-v3">
          {/* Row 1: Chart (full width, prominent) */}
          <section className="chart-section-v3" data-tour="financials">
            <div className="chart-header-v3">
              <h3>Historical Performance</h3>
              <MetricSelector
                selectedMetrics={chartMetrics}
                onChange={setChartMetrics}
                maxSelection={6}
                mode="chart"
              />
            </div>
            {chartData.length > 0 ? (
              <SectionErrorBoundary section="Metrics Chart">
                <MultiMetricChart
                  data={chartData}
                  metrics={chartMetrics.map(key => ({
                    key,
                    label: AVAILABLE_METRICS[key]?.label || key,
                    format: AVAILABLE_METRICS[key]?.format || 'number'
                  }))}
                  height={280}
                  title=""
                  periodType={periodType}
                />
              </SectionErrorBoundary>
            ) : (
              <div className="no-data-new">
                <BarChart3 size={32} />
                <p>No {periodType} data available</p>
              </div>
            )}
          </section>

          {/* Row 2: Metrics Dashboard */}
          <section className="metrics-dashboard-v4">
            {/* Hero Metrics - Large prominent display */}
            <div className="hero-metrics">
              <div className="hero-metric roic">
                <div className="hero-icon">
                  <Target size={18} />
                </div>
                <div className="hero-content">
                  <span className="hero-value">{formatValue(latestMetrics.roic, 'decimal_percent')}</span>
                  <span className="hero-label">Return on Invested Capital</span>
                </div>
                <div className={`hero-indicator ${getMetricRating(latestMetrics.roic, 'roic')}`}>
                  {getMetricRating(latestMetrics.roic, 'roic')}
                </div>
              </div>
              <div className="hero-metric fcf">
                <div className="hero-icon">
                  <DollarSign size={18} />
                </div>
                <div className="hero-content">
                  <span className="hero-value">{formatValue(latestMetrics.fcf_yield, 'percent')}</span>
                  <span className="hero-label">Free Cash Flow Yield</span>
                </div>
                <div className={`hero-indicator ${getMetricRating(latestMetrics.fcf_yield, 'fcf_yield')}`}>
                  {getMetricRating(latestMetrics.fcf_yield, 'fcf_yield')}
                </div>
              </div>
              <div className="hero-metric valuation">
                <div className="hero-icon">
                  <BarChart3 size={18} />
                </div>
                <div className="hero-content">
                  <span className="hero-value">{formatValue(latestMetrics.pe_ratio, 'ratio')}x</span>
                  <span className="hero-label">Price to Earnings</span>
                </div>
                <div className={`hero-indicator ${getMetricRating(latestMetrics.pe_ratio, 'pe_ratio')}`}>
                  {getMetricRating(latestMetrics.pe_ratio, 'pe_ratio')}
                </div>
              </div>
              {/* DCF Fair Value - 4th hero metric */}
              {dcfData && (() => {
                const currentPrice = priceData?.last_price || dcfData.currentPrice;
                const upside = currentPrice && dcfData.intrinsicValue
                  ? ((dcfData.intrinsicValue - currentPrice) / currentPrice) * 100
                  : null;
                const rating = upside !== null ? (upside > 15 ? 'good' : upside < -15 ? 'poor' : 'fair') : '';
                return (
                  <div
                    className="hero-metric dcf clickable"
                    onClick={() => { setAnalysisSection('dcf'); setMainTab('analysis'); }}
                    title="Click for full DCF analysis"
                  >
                    <div className="hero-icon">
                      <Target size={18} />
                    </div>
                    <div className="hero-content">
                      <span className="hero-value">${dcfData.intrinsicValue?.toFixed(0)}</span>
                      <span className="hero-label">
                        DCF Fair Value
                        {currentPrice > 0 && <span className="hero-sublabel"> · Now ${currentPrice.toFixed(0)}</span>}
                      </span>
                    </div>
                    {upside !== null && (
                      <div className={`hero-indicator ${rating}`}>
                        {upside >= 0 ? '+' : ''}{upside.toFixed(0)}%
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* AI Investment Rating - 5th hero metric */}
              <div className="ai-rating-container">
                <div
                  className={`hero-metric ai-rating ${aiRating ? 'has-rating' : 'clickable'} ${aiRatingLoading ? 'loading' : ''}`}
                  onClick={!aiRating && !aiRatingLoading ? () => getAIRating(false) : undefined}
                  title={aiRating ? aiRating.summary : 'Click to get AI investment rating'}
                >
                  <div className="hero-icon ai-icon">
                    {aiRatingLoading ? <Loader size={18} className="spin" /> : <Bot size={18} />}
                  </div>
                  {aiRating ? (
                    <>
                      <div className="hero-content">
                        <span className="hero-value ai-score">{aiRating.score}/10</span>
                        <span className="hero-label">
                          AI Rating
                          <span className="hero-sublabel ai-label"> · {aiRating.label}</span>
                        </span>
                      </div>
                      <div className={`hero-indicator ${
                        aiRating.score >= 7 ? 'bullish' :
                        aiRating.score >= 4 ? 'neutral-ai' : 'bearish'
                      }`}>
                        {aiRating.score >= 7 ? 'Bullish' :
                         aiRating.score >= 4 ? 'Neutral' : 'Bearish'}
                      </div>
                    </>
                  ) : (
                    <div className="hero-content ai-empty">
                      <span className="hero-value ai-placeholder">
                        {aiRatingLoading ? 'Analyzing...' : 'Get Rating'}
                      </span>
                      <span className="hero-label">AI Investment Analysis</span>
                    </div>
                  )}
                </div>

                {/* AI Rating Actions */}
                {aiRating && (
                  <div className="ai-rating-actions">
                    <button
                      className="ai-action-btn refresh"
                      onClick={() => getAIRating(true)}
                      disabled={aiRatingLoading}
                      title="Refresh AI analysis"
                    >
                      <RefreshCcw size={14} className={aiRatingLoading ? 'spin' : ''} />
                    </button>
                    <button
                      className={`ai-action-btn history ${showRatingHistory ? 'active' : ''}`}
                      onClick={() => setShowRatingHistory(!showRatingHistory)}
                      title="View rating history"
                    >
                      <History size={14} />
                      <ChevronDown size={12} className={showRatingHistory ? 'rotated' : ''} />
                    </button>
                  </div>
                )}

                {/* Rating History Dropdown */}
                {showRatingHistory && (
                  <div className="ai-rating-history-dropdown">
                    <div className="history-header">
                      <span className="history-title">
                        <History size={14} />
                        Rating History
                      </span>
                      <button className="close-history" onClick={() => setShowRatingHistory(false)}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="history-list">
                      {aiRatingHistory.length === 0 ? (
                        <div className="history-empty">No historical ratings yet</div>
                      ) : (
                        aiRatingHistory.map((rating, idx) => (
                          <div key={rating.id || idx} className="history-item">
                            <div className="history-item-main">
                              <span className={`history-score ${
                                rating.score >= 7 ? 'bullish' :
                                rating.score >= 4 ? 'neutral' : 'bearish'
                              }`}>
                                {rating.score}/10
                              </span>
                              <span className="history-label">{rating.label}</span>
                              <span className="history-date">
                                {new Date(rating.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                            {rating.summary && (
                              <div className="history-summary">{rating.summary}</div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Metrics and Trading Data Row */}
            <div className="metrics-trading-row">
              {/* Metric Categories - Valuation first (wider), then others */}
              <div className="metrics-categories">
                {/* Valuation - First and wider */}
                <div className="metric-category valuation-expanded">
                  <div className="category-header">
                    <span className="category-icon valuation">
                      <Target size={14} />
                    </span>
                    <span className="category-title">Valuation</span>
                  </div>
                  <div className="category-metrics valuation-grid">
                    <MetricBar label="P/E Ratio" value={latestMetrics.pe_ratio} max={40} format="ratio" inverted />
                    <MetricBar label="P/B Ratio" value={latestMetrics.pb_ratio} max={10} format="ratio" inverted />
                    <MetricBar label="P/S Ratio" value={latestMetrics.ps_ratio} max={10} format="ratio" inverted />
                    <MetricBar label="EV/EBITDA" value={latestMetrics.ev_ebitda} max={25} format="ratio" inverted />
                    <MetricBar label="PEG Ratio" value={latestMetrics.peg_ratio} max={3} format="ratio" inverted />
                    <MetricBar label="PEGY Ratio" value={latestMetrics.pegy_ratio} max={3} format="ratio" inverted />
                    <MetricBar label="Earnings Yield" value={latestMetrics.earnings_yield} max={15} format="percent" />
                    <MetricBar label="Div. Yield" value={latestMetrics.dividend_yield} max={8} format="percent" />
                  </div>
                </div>

                {/* Profitability */}
                <div className="metric-category">
                  <div className="category-header">
                    <span className="category-icon profitability">
                      <Activity size={14} />
                    </span>
                    <span className="category-title">Profitability</span>
                  </div>
                  <div className="category-metrics">
                    <MetricBar label="ROE" value={latestMetrics.roe} max={30} format="decimal_percent" />
                    <MetricBar label="Net Margin" value={latestMetrics.net_margin} max={40} format="decimal_percent" />
                    <MetricBar label="Gross Margin" value={latestMetrics.gross_margin} max={80} format="decimal_percent" />
                    <MetricBar label="Operating Margin" value={latestMetrics.operating_margin} max={40} format="decimal_percent" />
                  </div>
                </div>

                {/* Financial Health */}
                <div className="metric-category">
                  <div className="category-header">
                    <span className="category-icon health">
                      <Shield size={14} />
                    </span>
                    <span className="category-title">Financial Health</span>
                  </div>
                  <div className="category-metrics">
                    <MetricBar label="Current Ratio" value={latestMetrics.current_ratio} max={3} format="ratio" />
                    <MetricBar label="Quick Ratio" value={latestMetrics.quick_ratio} max={2} format="ratio" />
                    <MetricBar label="Debt/Equity" value={latestMetrics.debt_to_equity} max={2} format="ratio" inverted />
                    <MetricBar label="Cash Ratio" value={latestMetrics.cash_ratio} max={1} format="ratio" />
                  </div>
                </div>

                {/* Efficiency */}
                <div className="metric-category">
                  <div className="category-header">
                    <span className="category-icon efficiency">
                      <RefreshCcw size={14} />
                    </span>
                    <span className="category-title">Efficiency</span>
                  </div>
                  <div className="category-metrics">
                    <MetricBar label="Asset Turnover" value={latestMetrics.asset_turnover} max={2} format="ratio" />
                    <MetricBar label="ROCE" value={latestMetrics.roce} max={30} format="decimal_percent" />
                    <MetricBar label="ROA" value={latestMetrics.roa} max={20} format="decimal_percent" />
                    <MetricBar label="DuPont ROE" value={latestMetrics.dupont_roe} max={30} format="decimal_percent" />
                  </div>
                </div>
              </div>

              {/* Trading Data Row - Horizontal layout with sections */}
              {priceData && (
                <div className="trading-data-row">
                  {/* Market Data Section */}
                  <div className="trading-section">
                    <span className="trading-section-title">Market</span>
                    <div className="trading-section-metrics">
                      <div className="trading-metric">
                        <span className="trading-label">Market Cap</span>
                        <span className="trading-value">
                          {priceData.market_cap
                            ? priceData.market_cap >= 1e12
                              ? `$${(priceData.market_cap / 1e12).toFixed(2)}T`
                              : priceData.market_cap >= 1e9
                                ? `$${(priceData.market_cap / 1e9).toFixed(1)}B`
                                : `$${(priceData.market_cap / 1e6).toFixed(0)}M`
                            : '-'}
                        </span>
                      </div>
                      <div className="trading-metric">
                        <span className="trading-label">Avg Volume</span>
                        <span className="trading-value">
                          {priceData.avg_volume_30d
                            ? priceData.avg_volume_30d >= 1e6
                              ? `${(priceData.avg_volume_30d / 1e6).toFixed(1)}M`
                              : `${(priceData.avg_volume_30d / 1e3).toFixed(0)}K`
                            : '-'}
                        </span>
                      </div>
                      <div className="trading-metric">
                        <span className="trading-label">Shares Out</span>
                        <span className="trading-value">
                          {priceData.shares_outstanding
                            ? priceData.shares_outstanding >= 1e9
                              ? `${(priceData.shares_outstanding / 1e9).toFixed(2)}B`
                              : `${(priceData.shares_outstanding / 1e6).toFixed(0)}M`
                            : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Performance vs Home Index (Alpha) Section */}
                  {alphaData?.home && (
                    <div className="trading-section alpha-section">
                      <span className="trading-section-title">
                        {alphaData.home.flag} vs {alphaData.home.benchmark}
                      </span>
                      <div className="trading-section-metrics">
                        <div className="trading-metric">
                          <span className="trading-label">Alpha 1M</span>
                          <span className={`trading-value ${
                            alphaData.home.alpha_1m > 0 ? 'outperform' : alphaData.home.alpha_1m < 0 ? 'underperform' : ''
                          }`}>
                            {alphaData.home.alpha_1m != null
                              ? `${alphaData.home.alpha_1m >= 0 ? '+' : ''}${alphaData.home.alpha_1m.toFixed(2)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">Alpha YTD</span>
                          <span className={`trading-value ${
                            alphaData.home.alpha_ytd > 0 ? 'outperform' : alphaData.home.alpha_ytd < 0 ? 'underperform' : ''
                          }`}>
                            {alphaData.home.alpha_ytd != null
                              ? `${alphaData.home.alpha_ytd >= 0 ? '+' : ''}${alphaData.home.alpha_ytd.toFixed(2)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">Alpha 1Y</span>
                          <span className={`trading-value ${
                            alphaData.home.alpha_1y > 0 ? 'outperform' : alphaData.home.alpha_1y < 0 ? 'underperform' : ''
                          }`}>
                            {alphaData.home.alpha_1y != null
                              ? `${alphaData.home.alpha_1y >= 0 ? '+' : ''}${alphaData.home.alpha_1y.toFixed(2)}%`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Performance vs SPY (for non-US companies) */}
                  {alphaData?.spy && !alphaData.isUS && (
                    <div className="trading-section alpha-section">
                      <span className="trading-section-title">
                        vs {alphaData.spy.benchmark}
                      </span>
                      <div className="trading-section-metrics">
                        <div className="trading-metric">
                          <span className="trading-label">Alpha 1M</span>
                          <span className={`trading-value ${
                            alphaData.spy.alpha_1m > 0 ? 'outperform' : alphaData.spy.alpha_1m < 0 ? 'underperform' : ''
                          }`}>
                            {alphaData.spy.alpha_1m != null
                              ? `${alphaData.spy.alpha_1m >= 0 ? '+' : ''}${alphaData.spy.alpha_1m.toFixed(2)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">Alpha YTD</span>
                          <span className={`trading-value ${
                            alphaData.spy.alpha_ytd > 0 ? 'outperform' : alphaData.spy.alpha_ytd < 0 ? 'underperform' : ''
                          }`}>
                            {alphaData.spy.alpha_ytd != null
                              ? `${alphaData.spy.alpha_ytd >= 0 ? '+' : ''}${alphaData.spy.alpha_ytd.toFixed(2)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">Alpha 1Y</span>
                          <span className={`trading-value ${
                            alphaData.spy.alpha_1y > 0 ? 'outperform' : alphaData.spy.alpha_1y < 0 ? 'underperform' : ''
                          }`}>
                            {alphaData.spy.alpha_1y != null
                              ? `${alphaData.spy.alpha_1y >= 0 ? '+' : ''}${alphaData.spy.alpha_1y.toFixed(2)}%`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 52-Week Range Section */}
                  <div className="trading-section">
                    <span className="trading-section-title">52-Week Range</span>
                    <div className="trading-section-metrics">
                      <div className="trading-metric">
                        <span className="trading-label">High</span>
                        <span className="trading-value">${priceData.high_52w?.toFixed(2) || '-'}</span>
                      </div>
                      <div className="trading-metric">
                        <span className="trading-label">Low</span>
                        <span className="trading-value">${priceData.low_52w?.toFixed(2) || '-'}</span>
                      </div>
                      {priceData.low_52w && priceData.high_52w && priceData.last_price && (
                        <div className="trading-metric">
                          <span className="trading-label">Position</span>
                          <span className="trading-value">
                            {Math.round(((priceData.last_price - priceData.low_52w) / (priceData.high_52w - priceData.low_52w)) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Technical Indicators Section */}
                  <div className="trading-section">
                    <span className="trading-section-title">Technicals</span>
                    <div className="trading-section-metrics">
                      <div className="trading-metric">
                        <span className="trading-label">RSI (14)</span>
                        <span className={`trading-value ${
                          priceData.rsi_14 < 30 ? 'oversold' : priceData.rsi_14 > 70 ? 'overbought' : ''
                        }`}>
                          {priceData.rsi_14?.toFixed(1) || '-'}
                        </span>
                      </div>
                      <div className="trading-metric">
                        <span className="trading-label">SMA 50</span>
                        <span className={`trading-value ${
                          priceData.last_price > priceData.sma_50 ? 'above' : 'below'
                        }`}>
                          ${priceData.sma_50?.toFixed(2) || '-'}
                        </span>
                      </div>
                      <div className="trading-metric">
                        <span className="trading-label">SMA 200</span>
                        <span className={`trading-value ${
                          priceData.last_price > priceData.sma_200 ? 'above' : 'below'
                        }`}>
                          ${priceData.sma_200?.toFixed(2) || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Risk Section */}
                  <div className="trading-section">
                    <span className="trading-section-title">Risk</span>
                    <div className="trading-section-metrics">
                      <div className="trading-metric">
                        <span className="trading-label">Volatility</span>
                        <span className="trading-value">
                          {priceData.volatility_30d ? `${priceData.volatility_30d.toFixed(1)}%` : '-'}
                        </span>
                      </div>
                      <div className="trading-metric">
                        <span className="trading-label">Beta</span>
                        <span className="trading-value">
                          {priceData.beta?.toFixed(2) || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Short Interest Section */}
                  {(priceData.shares_short || priceData.short_percent_of_float) && (
                    <div className="trading-section">
                      <span className="trading-section-title">Short Interest</span>
                      <div className="trading-section-metrics">
                        <div className="trading-metric">
                          <span className="trading-label">Shares Short</span>
                          <span className="trading-value">
                            {priceData.shares_short
                              ? priceData.shares_short >= 1e6
                                ? `${(priceData.shares_short / 1e6).toFixed(1)}M`
                                : `${(priceData.shares_short / 1e3).toFixed(0)}K`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">% Float</span>
                          <span className={`trading-value ${
                            priceData.short_percent_of_float > 0.1 ? 'high-short' :
                            priceData.short_percent_of_float > 0.05 ? 'medium-short' : ''
                          }`}>
                            {priceData.short_percent_of_float
                              ? `${(priceData.short_percent_of_float * 100).toFixed(1)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">Days to Cover</span>
                          <span className={`trading-value ${
                            priceData.short_ratio > 5 ? 'high-short' :
                            priceData.short_ratio > 3 ? 'medium-short' : ''
                          }`}>
                            {priceData.short_ratio?.toFixed(1) || '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Max Drawdown Section */}
                  {(priceData.max_drawdown_1y || priceData.max_drawdown_3y || priceData.max_drawdown_5y) && (
                    <div className="trading-section">
                      <span className="trading-section-title">Max Drawdown</span>
                      <div className="trading-section-metrics">
                        <div className="trading-metric">
                          <span className="trading-label">1 Year</span>
                          <span className={`trading-value ${
                            priceData.max_drawdown_1y < -30 ? 'high-risk' :
                            priceData.max_drawdown_1y < -20 ? 'medium-risk' : ''
                          }`}>
                            {priceData.max_drawdown_1y
                              ? `${priceData.max_drawdown_1y.toFixed(1)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">3 Year</span>
                          <span className={`trading-value ${
                            priceData.max_drawdown_3y < -40 ? 'high-risk' :
                            priceData.max_drawdown_3y < -25 ? 'medium-risk' : ''
                          }`}>
                            {priceData.max_drawdown_3y
                              ? `${priceData.max_drawdown_3y.toFixed(1)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="trading-metric">
                          <span className="trading-label">5 Year</span>
                          <span className={`trading-value ${
                            priceData.max_drawdown_5y < -50 ? 'high-risk' :
                            priceData.max_drawdown_5y < -30 ? 'medium-risk' : ''
                          }`}>
                            {priceData.max_drawdown_5y
                              ? `${priceData.max_drawdown_5y.toFixed(1)}%`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Row 3: Sentiment & Insider (2 columns, wider) */}
          <div className="bottom-panels-row">
            {/* Multi-Source Sentiment */}
            <section className="sentiment-panel-v3">
              <div className="panel-title-row">
                <h3>Sentiment & Analyst</h3>
                <div className="sentiment-tabs">
                  {['combined', 'reddit', 'stocktwits', 'news', 'analyst'].map(view => (
                    <button
                      key={view}
                      className={`sentiment-tab ${sentimentView === view ? 'active' : ''}`}
                      onClick={() => setSentimentView(view)}
                    >
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sentiment-content-v3">
                {sentimentView === 'combined' && (
                  <CombinedSentimentPanel symbol={symbol} />
                )}
                {sentimentView === 'reddit' && (
                  <SentimentCard
                    data={sentimentData}
                    onRefresh={handleRefreshSentiment}
                    loading={sentimentLoading}
                    symbol={symbol}
                  />
                )}
                {sentimentView === 'stocktwits' && (
                  <StockTwitsCard symbol={symbol} />
                )}
                {sentimentView === 'news' && (
                  <NewsCard symbol={symbol} />
                )}
                {sentimentView === 'analyst' && (
                  <div className="analyst-card-content">
                    {analystLoading ? (
                      <div className="analyst-loading">
                        <RefreshCcw className="spin" size={20} />
                        <span>Loading analyst data...</span>
                      </div>
                    ) : analystData ? (
                      <div className="analyst-compact">
                        {/* Price Target Row */}
                        <div className="analyst-price-row">
                          <div className="price-current">
                            <span className="price-label">Current</span>
                            <span className="price-value">${analystData.current_price?.toFixed(2)}</span>
                          </div>
                          <div className="price-arrow-compact">
                            {analystData.upside_potential > 0 ? (
                              <span className="arrow-up">▲</span>
                            ) : (
                              <span className="arrow-down">▼</span>
                            )}
                          </div>
                          <div className="price-target-compact">
                            <span className="price-label">Target</span>
                            <span className="price-value">${analystData.target_mean?.toFixed(2)}</span>
                          </div>
                          <div className={`upside-compact ${analystData.upside_potential > 0 ? 'positive' : 'negative'}`}>
                            {analystData.upside_potential > 0 ? '+' : ''}{analystData.upside_potential?.toFixed(1)}%
                          </div>
                        </div>

                        {/* Recommendation Distribution */}
                        <div className="analyst-rec-bars">
                          <div className="rec-row">
                            <span className="rec-lbl">Buy</span>
                            <div className="rec-track">
                              <div
                                className="rec-fill buy"
                                style={{ width: `${analystData.buy_percent || 0}%` }}
                              />
                            </div>
                            <span className="rec-pct">{analystData.buy_percent?.toFixed(0)}%</span>
                          </div>
                          <div className="rec-row">
                            <span className="rec-lbl">Hold</span>
                            <div className="rec-track">
                              <div
                                className="rec-fill hold"
                                style={{ width: `${analystData.hold_percent || 0}%` }}
                              />
                            </div>
                            <span className="rec-pct">{analystData.hold_percent?.toFixed(0)}%</span>
                          </div>
                          <div className="rec-row">
                            <span className="rec-lbl">Sell</span>
                            <div className="rec-track">
                              <div
                                className="rec-fill sell"
                                style={{ width: `${analystData.sell_percent || 0}%` }}
                              />
                            </div>
                            <span className="rec-pct">{analystData.sell_percent?.toFixed(0)}%</span>
                          </div>
                        </div>

                        {/* Signal Summary */}
                        <div className="analyst-signal-row">
                          <div className="signal-item-compact">
                            <span className="signal-lbl">Analysts</span>
                            <span className="signal-val">{analystData.number_of_analysts}</span>
                          </div>
                          <div className="signal-item-compact">
                            <span className="signal-lbl">Consensus</span>
                            <span className="signal-val">{analystData.recommendation_key?.replace('_', ' ')}</span>
                          </div>
                          <div className="signal-item-compact">
                            <span className="signal-lbl">Signal</span>
                            <span className={`signal-badge-compact ${analystData.signal?.replace('_', '-')}`}>
                              {analystData.signal?.replace('_', ' ')}
                            </span>
                          </div>
                          {analystData.earnings_beat_rate != null && (
                            <div className="signal-item-compact">
                              <span className="signal-lbl">Earnings Beat</span>
                              <span className={`signal-val ${analystData.earnings_beat_rate >= 75 ? 'positive' : ''}`}>
                                {analystData.earnings_beat_rate?.toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Analyst Sources Links */}
                        <div className="analyst-sources">
                          <span className="sources-label">View detailed analyst ratings:</span>
                          <div className="sources-links">
                            <a
                              href={`https://finance.yahoo.com/quote/${symbol}/analysis`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="source-link"
                            >
                              <ExternalLink size={12} />
                              Yahoo Finance
                            </a>
                            <a
                              href={`https://www.tipranks.com/stocks/${symbol}/forecast`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="source-link"
                            >
                              <ExternalLink size={12} />
                              TipRanks
                            </a>
                            <a
                              href={`https://www.marketbeat.com/stocks/NASDAQ/${symbol}/price-target/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="source-link"
                            >
                              <ExternalLink size={12} />
                              MarketBeat
                            </a>
                            <a
                              href={`https://www.zacks.com/stock/quote/${symbol}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="source-link"
                            >
                              <ExternalLink size={12} />
                              Zacks
                            </a>
                          </div>
                        </div>

                        {/* Analyst History Chart */}
                        <div className="analyst-history-section">
                          <AnalystHistoryChart symbol={symbol} />
                        </div>

                        {/* Earnings Calendar */}
                        <div className="earnings-section">
                          <EarningsCalendar symbol={symbol} />
                        </div>
                      </div>
                    ) : (
                      <div className="analyst-empty">
                        <Target size={28} />
                        <p>No analyst data available</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: Insider + Famous Investors Stack */}
            <div className="right-panels-stack">
            {/* Insider Activity */}
            <section className="insider-panel-v3">
              <h3>
                <Users size={14} />
                Insider Activity (6 months)
              </h3>
              {insiderData && insiderData.summaries?.['6m'] ? (
                <div className="insider-content-v3">
                  <div className="insider-header-v3">
                    <div className={`signal-badge-v3 ${insiderData.summaries['6m'].signal?.toLowerCase() || 'neutral'}`}>
                      {insiderData.summaries['6m'].signal || 'Neutral'}
                    </div>
                    <div className="insider-stats-v3">
                      <div className="stat buy">
                        <span className="num">{insiderData.summaries['6m'].buyCount || 0}</span>
                        <span className="lbl">Buys</span>
                      </div>
                      <div className="stat sell">
                        <span className="num">{insiderData.summaries['6m'].sellCount || 0}</span>
                        <span className="lbl">Sells</span>
                      </div>
                      <div className="stat net">
                        <span className={`num ${(insiderData.summaries['6m'].netShares || 0) >= 0 ? 'positive' : 'negative'}`}>
                          {((insiderData.summaries['6m'].netShares || 0) / 1000).toFixed(0)}K
                        </span>
                        <span className="lbl">Net Shares</span>
                      </div>
                    </div>
                  </div>
                  {insiderData.transactions && insiderData.transactions.length > 0 && (
                    <div className="insider-list-v3">
                      <div className="list-header">Recent Transactions</div>
                      {insiderData.transactions.slice(0, 4).map((tx, i) => (
                        <div key={i} className="tx-row-v3">
                          <span className={`tx-type-v3 ${tx.transaction_type}`}>
                            {tx.transaction_type === 'buy' ? 'BUY' : 'SELL'}
                          </span>
                          <span className="tx-name-v3">{tx.insider_name || 'Insider'}</span>
                          <span className="tx-shares-v3">{((tx.shares_transacted || tx.shares || 0) / 1000).toFixed(0)}K shares</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link to="/insiders" className="view-more-link">
                    View All Insider Activity
                  </Link>
                </div>
              ) : (
                <div className="no-insider-v3">
                  <Users size={28} />
                  <p>No insider activity data available</p>
                </div>
              )}
            </section>

            {/* Congressional Trading Section */}
            <section className="insider-panel-v3">
              <h3>
                <Building2 size={14} />
                Congressional Trading (6 months)
              </h3>
              {congressionalLoading ? (
                <div className="no-insider-v3">
                  <Loader size={28} className="spinner" />
                  <p>Loading congressional data...</p>
                </div>
              ) : congressionalData && congressionalData.trades?.length > 0 ? (
                <div className="insider-content-v3">
                  <div className="insider-stats-v3">
                    <div className="stat-item-v3">
                      <span className="stat-label-v3">Total Trades</span>
                      <span className="stat-value-v3">{congressionalData.trades.length}</span>
                    </div>
                    <div className="stat-item-v3">
                      <span className="stat-label-v3">Politicians</span>
                      <span className="stat-value-v3">
                        {new Set(congressionalData.trades.map(t => t.politician_id)).size}
                      </span>
                    </div>
                    <div className="stat-item-v3">
                      <span className="stat-label-v3">Purchases</span>
                      <span className="stat-value-v3">
                        {congressionalData.trades.filter(t => t.transaction_type === 'purchase').length}
                      </span>
                    </div>
                  </div>
                  {congressionalData.trades.length > 0 && (
                    <div className="insider-list-v3">
                      <div className="list-header">Recent Transactions</div>
                      {congressionalData.trades.slice(0, 4).map((tx, i) => (
                        <div key={i} className="tx-row-v3">
                          <span className={`tx-type-v3 ${tx.transaction_type}`}>
                            {tx.transaction_type === 'purchase' ? 'BUY' : 'SELL'}
                          </span>
                          <span className="tx-name-v3" title={tx.politician_name}>
                            {tx.politician_name?.split(' ').slice(-1)[0] || 'Unknown'}
                          </span>
                          <span className="tx-shares-v3">
                            {tx.chamber === 'Senate' ? 'Sen.' : 'Rep.'} ({tx.party})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="view-more-link" style={{ cursor: 'default', opacity: 0.7 }}>
                    Congressional trading data
                  </div>
                </div>
              ) : (
                <div className="no-insider-v3">
                  <Building2 size={28} />
                  <p>No congressional trading data available</p>
                </div>
              )}
            </section>

            {/* Famous Investors Section */}
            {investorOwners.length > 0 && (
              <section className="famous-investors-panel">
                <div className="panel-header">
                  <h3>
                    <Crown size={14} />
                    Owned by Famous Investors
                  </h3>
                  <span className="investor-count">{investorOwners.length} investors</span>
                </div>
                <div className="famous-investors-grid">
                  {investorOwners.slice(0, 3).map((inv) => (
                    <Link
                      key={inv.id || inv.investor_id}
                      to={`/investors/${inv.id || inv.investor_id}`}
                      className="investor-card"
                    >
                      <div className="investor-avatar">
                        {(inv.investor_name || inv.name)?.charAt(0) || 'I'}
                      </div>
                      <div className="investor-details">
                        <span className="investor-name">{inv.investor_name || inv.name}</span>
                        <span className="investor-manager">{inv.manager_name || inv.fund_name}</span>
                      </div>
                      <div className="investor-position">
                        <div className="position-weight">
                          <span className="weight-value">{inv.portfolio_weight?.toFixed(2)}%</span>
                          <span className="weight-label">of portfolio</span>
                        </div>
                        <div className="position-value">
                          {inv.market_value >= 1e9
                            ? `$${(inv.market_value / 1e9).toFixed(1)}B`
                            : `$${(inv.market_value / 1e6).toFixed(0)}M`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <Link to="/investors" className="view-all-investors-btn">
                  <Users size={14} />
                  View All Investors
                </Link>
              </section>
            )}

            {/* Enhanced Signals Panel - 13F, Earnings Momentum, Insider Classification */}
            <SectionErrorBoundary section="Enhanced Signals">
              <EnhancedSignalsPanel symbol={symbol} />
            </SectionErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS TAB */}
      {mainTab === 'analysis' && (
        <AnalysisDashboard symbol={symbol} periodType={periodType} initialSection={analysisSection} />
      )}

      {/* FINANCIALS TAB */}
      {mainTab === 'financials' && (
        <div className="financials-content">
          <div className="financial-tabs-new">
            <button
              className={financialTab === 'income' ? 'active' : ''}
              onClick={() => setFinancialTab('income')}
            >
              <DollarSign size={14} />
              Income Statement
            </button>
            <button
              className={financialTab === 'balance' ? 'active' : ''}
              onClick={() => setFinancialTab('balance')}
            >
              <Shield size={14} />
              Balance Sheet
            </button>
            <button
              className={financialTab === 'cashflow' ? 'active' : ''}
              onClick={() => setFinancialTab('cashflow')}
            >
              <Activity size={14} />
              Cash Flow
            </button>
          </div>

          {financialTab === 'income' && (
            <FinancialBreakdown symbol={symbol} periodType={periodType} />
          )}
          {financialTab === 'balance' && (
            <BalanceSheetBreakdown symbol={symbol} periodType={periodType} />
          )}
          {financialTab === 'cashflow' && (
            <CashFlowBreakdown symbol={symbol} periodType={periodType} />
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {mainTab === 'history' && (
        <section className="history-content">
          <div className="section-header-new">
            <h3>Historical Metrics ({metrics.length} periods)</h3>
            <MetricSelector
              selectedMetrics={tableMetrics}
              onChange={setTableMetrics}
              maxSelection={10}
              mode="table"
            />
          </div>
          {metrics.length > 0 ? (
            <div className="metrics-table-new">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    {tableMetrics.map(key => (
                      <th key={key} title={AVAILABLE_METRICS[key]?.description}>
                        {AVAILABLE_METRICS[key]?.label || key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(m => (
                    <tr key={m.fiscal_period}>
                      <td className="period-cell-new" title={m.fiscal_period}>
                        <span className="period-text">{m.fiscal_label || m.fiscal_period}</span>
                      </td>
                      {tableMetrics.map(key => (
                        <td key={key} className={getValueClass(m[key], key)}>
                          {formatValue(m[key], AVAILABLE_METRICS[key]?.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-data-new">
              <Calendar size={32} />
              <p>No {periodType} metrics available</p>
            </div>
          )}
        </section>
      )}

      {/* STOCK & CAPITAL TAB */}
      {mainTab === 'stock' && (
        <div className="stock-capital-content">
          {/* Price Chart Section */}
          <section className="price-chart-section" data-tour="price-chart">
            <h3>
              <TrendingUp size={18} />
              Stock Price
            </h3>
            <SectionErrorBoundary section="Price Chart">
              <PriceChart symbol={symbol} />
            </SectionErrorBoundary>
          </section>

          {/* Performance vs Market Section */}
          {(priceData || alphaData) && (
            <section className="performance-vs-market-section">
              <h3>
                <BarChart3 size={18} />
                Performance vs Market
              </h3>
              <div className="performance-comparison-grid">
                {/* Stock Performance Column */}
                <div className="performance-column stock">
                  <div className="performance-column-header">
                    <span className="column-symbol">{symbol}</span>
                    <span className="column-label">Stock</span>
                  </div>
                  <div className="performance-periods">
                    <div className="performance-row">
                      <span className="period-label">1 Day</span>
                      <span className={`period-value ${priceData?.change_1d >= 0 ? 'positive' : 'negative'}`}>
                        {priceData?.change_1d != null ? `${priceData.change_1d >= 0 ? '+' : ''}${priceData.change_1d.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                    <div className="performance-row">
                      <span className="period-label">1 Week</span>
                      <span className={`period-value ${priceData?.change_1w >= 0 ? 'positive' : 'negative'}`}>
                        {priceData?.change_1w != null ? `${priceData.change_1w >= 0 ? '+' : ''}${priceData.change_1w.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                    <div className="performance-row">
                      <span className="period-label">1 Month</span>
                      <span className={`period-value ${priceData?.change_1m >= 0 ? 'positive' : 'negative'}`}>
                        {priceData?.change_1m != null ? `${priceData.change_1m >= 0 ? '+' : ''}${priceData.change_1m.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                    <div className="performance-row">
                      <span className="period-label">3 Months</span>
                      <span className={`period-value ${priceData?.change_3m >= 0 ? 'positive' : 'negative'}`}>
                        {priceData?.change_3m != null ? `${priceData.change_3m >= 0 ? '+' : ''}${priceData.change_3m.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                    <div className="performance-row">
                      <span className="period-label">YTD</span>
                      <span className={`period-value ${priceData?.change_ytd >= 0 ? 'positive' : 'negative'}`}>
                        {priceData?.change_ytd != null ? `${priceData.change_ytd >= 0 ? '+' : ''}${priceData.change_ytd.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                    <div className="performance-row">
                      <span className="period-label">1 Year</span>
                      <span className={`period-value ${priceData?.change_1y >= 0 ? 'positive' : 'negative'}`}>
                        {priceData?.change_1y != null ? `${priceData.change_1y >= 0 ? '+' : ''}${priceData.change_1y.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Benchmark Column */}
                {benchmarkData && (
                  <div className="performance-column benchmark">
                    <div className="performance-column-header">
                      <span className="column-symbol">{benchmarkData.symbol}</span>
                      <span className="column-label">S&P 500</span>
                    </div>
                    <div className="performance-periods">
                      <div className="performance-row">
                        <span className="period-label">1 Day</span>
                        <span className={`period-value ${benchmarkData.change_1d >= 0 ? 'positive' : 'negative'}`}>
                          {benchmarkData.change_1d != null ? `${benchmarkData.change_1d >= 0 ? '+' : ''}${benchmarkData.change_1d.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Week</span>
                        <span className={`period-value ${benchmarkData.change_1w >= 0 ? 'positive' : 'negative'}`}>
                          {benchmarkData.change_1w != null ? `${benchmarkData.change_1w >= 0 ? '+' : ''}${benchmarkData.change_1w.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Month</span>
                        <span className={`period-value ${benchmarkData.change_1m >= 0 ? 'positive' : 'negative'}`}>
                          {benchmarkData.change_1m != null ? `${benchmarkData.change_1m >= 0 ? '+' : ''}${benchmarkData.change_1m.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">3 Months</span>
                        <span className={`period-value ${benchmarkData.change_3m >= 0 ? 'positive' : 'negative'}`}>
                          {benchmarkData.change_3m != null ? `${benchmarkData.change_3m >= 0 ? '+' : ''}${benchmarkData.change_3m.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">YTD</span>
                        <span className={`period-value ${benchmarkData.change_ytd >= 0 ? 'positive' : 'negative'}`}>
                          {benchmarkData.change_ytd != null ? `${benchmarkData.change_ytd >= 0 ? '+' : ''}${benchmarkData.change_ytd.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Year</span>
                        <span className={`period-value ${benchmarkData.change_1y >= 0 ? 'positive' : 'negative'}`}>
                          {benchmarkData.change_1y != null ? `${benchmarkData.change_1y >= 0 ? '+' : ''}${benchmarkData.change_1y.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Alpha Column - vs Home Index */}
                {alphaData?.home && (
                  <div className="performance-column alpha">
                    <div className="performance-column-header">
                      <span className="column-symbol">{alphaData.home.flag} vs {alphaData.home.benchmark}</span>
                      <span className="column-label">{alphaData.home.benchmarkName}</span>
                    </div>
                    <div className="performance-periods">
                      <div className="performance-row">
                        <span className="period-label">1 Day</span>
                        <span className={`period-value alpha-value ${alphaData.home.alpha_1d > 0 ? 'outperform' : alphaData.home.alpha_1d < 0 ? 'underperform' : ''}`}>
                          {alphaData.home.alpha_1d != null ? `${alphaData.home.alpha_1d >= 0 ? '+' : ''}${alphaData.home.alpha_1d.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Week</span>
                        <span className={`period-value alpha-value ${alphaData.home.alpha_1w > 0 ? 'outperform' : alphaData.home.alpha_1w < 0 ? 'underperform' : ''}`}>
                          {alphaData.home.alpha_1w != null ? `${alphaData.home.alpha_1w >= 0 ? '+' : ''}${alphaData.home.alpha_1w.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Month</span>
                        <span className={`period-value alpha-value ${alphaData.home.alpha_1m > 0 ? 'outperform' : alphaData.home.alpha_1m < 0 ? 'underperform' : ''}`}>
                          {alphaData.home.alpha_1m != null ? `${alphaData.home.alpha_1m >= 0 ? '+' : ''}${alphaData.home.alpha_1m.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">3 Months</span>
                        <span className={`period-value alpha-value ${alphaData.home.alpha_3m > 0 ? 'outperform' : alphaData.home.alpha_3m < 0 ? 'underperform' : ''}`}>
                          {alphaData.home.alpha_3m != null ? `${alphaData.home.alpha_3m >= 0 ? '+' : ''}${alphaData.home.alpha_3m.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">YTD</span>
                        <span className={`period-value alpha-value ${alphaData.home.alpha_ytd > 0 ? 'outperform' : alphaData.home.alpha_ytd < 0 ? 'underperform' : ''}`}>
                          {alphaData.home.alpha_ytd != null ? `${alphaData.home.alpha_ytd >= 0 ? '+' : ''}${alphaData.home.alpha_ytd.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Year</span>
                        <span className={`period-value alpha-value ${alphaData.home.alpha_1y > 0 ? 'outperform' : alphaData.home.alpha_1y < 0 ? 'underperform' : ''}`}>
                          {alphaData.home.alpha_1y != null ? `${alphaData.home.alpha_1y >= 0 ? '+' : ''}${alphaData.home.alpha_1y.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Alpha Column - vs SPY (for non-US companies) */}
                {alphaData?.spy && !alphaData.isUS && (
                  <div className="performance-column alpha">
                    <div className="performance-column-header">
                      <span className="column-symbol">vs {alphaData.spy.benchmark}</span>
                      <span className="column-label">{alphaData.spy.benchmarkName}</span>
                    </div>
                    <div className="performance-periods">
                      <div className="performance-row">
                        <span className="period-label">1 Day</span>
                        <span className={`period-value alpha-value ${alphaData.spy.alpha_1d > 0 ? 'outperform' : alphaData.spy.alpha_1d < 0 ? 'underperform' : ''}`}>
                          {alphaData.spy.alpha_1d != null ? `${alphaData.spy.alpha_1d >= 0 ? '+' : ''}${alphaData.spy.alpha_1d.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Week</span>
                        <span className={`period-value alpha-value ${alphaData.spy.alpha_1w > 0 ? 'outperform' : alphaData.spy.alpha_1w < 0 ? 'underperform' : ''}`}>
                          {alphaData.spy.alpha_1w != null ? `${alphaData.spy.alpha_1w >= 0 ? '+' : ''}${alphaData.spy.alpha_1w.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Month</span>
                        <span className={`period-value alpha-value ${alphaData.spy.alpha_1m > 0 ? 'outperform' : alphaData.spy.alpha_1m < 0 ? 'underperform' : ''}`}>
                          {alphaData.spy.alpha_1m != null ? `${alphaData.spy.alpha_1m >= 0 ? '+' : ''}${alphaData.spy.alpha_1m.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">3 Months</span>
                        <span className={`period-value alpha-value ${alphaData.spy.alpha_3m > 0 ? 'outperform' : alphaData.spy.alpha_3m < 0 ? 'underperform' : ''}`}>
                          {alphaData.spy.alpha_3m != null ? `${alphaData.spy.alpha_3m >= 0 ? '+' : ''}${alphaData.spy.alpha_3m.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">YTD</span>
                        <span className={`period-value alpha-value ${alphaData.spy.alpha_ytd > 0 ? 'outperform' : alphaData.spy.alpha_ytd < 0 ? 'underperform' : ''}`}>
                          {alphaData.spy.alpha_ytd != null ? `${alphaData.spy.alpha_ytd >= 0 ? '+' : ''}${alphaData.spy.alpha_ytd.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="performance-row">
                        <span className="period-label">1 Year</span>
                        <span className={`period-value alpha-value ${alphaData.spy.alpha_1y > 0 ? 'outperform' : alphaData.spy.alpha_1y < 0 ? 'underperform' : ''}`}>
                          {alphaData.spy.alpha_1y != null ? `${alphaData.spy.alpha_1y >= 0 ? '+' : ''}${alphaData.spy.alpha_1y.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Alpha Time Series Chart */}
          <section className="alpha-timeseries-section">
            <h3>
              <Activity size={18} />
              Alpha Over Time
            </h3>
            <SectionErrorBoundary section="Alpha Chart">
              <AlphaChart symbol={symbol} height={280} />
            </SectionErrorBoundary>
          </section>

          {/* Dividend Section */}
          <section className="dividend-section">
            <h3>
              <DollarSign size={18} />
              Dividends
            </h3>
            {dividendLoading ? (
              <div className="loading-state">
                <RefreshCcw className="spin" size={24} />
                <p>Loading dividend data...</p>
              </div>
            ) : dividendData?.metrics ? (
              <div className="dividend-content">
                {/* Dividend Badges */}
                <div className="dividend-badges">
                  {dividendData.metrics.is_dividend_king === 1 && (
                    <span className="dividend-badge king">
                      <span className="badge-icon">👑</span>
                      Dividend King (50+ years)
                    </span>
                  )}
                  {dividendData.metrics.is_dividend_aristocrat === 1 && !dividendData.metrics.is_dividend_king && (
                    <span className="dividend-badge aristocrat">
                      <span className="badge-icon">🏆</span>
                      Dividend Aristocrat (25+ years)
                    </span>
                  )}
                  {dividendData.metrics.years_of_growth >= 10 && dividendData.metrics.years_of_growth < 25 && (
                    <span className="dividend-badge achiever">
                      <span className="badge-icon">📈</span>
                      Dividend Achiever ({dividendData.metrics.years_of_growth} years)
                    </span>
                  )}
                </div>

                {/* Dividend Metrics Grid */}
                <div className="dividend-metrics-grid">
                  <div className="dividend-metric-card highlight">
                    <span className="metric-label">Dividend Yield</span>
                    <span className="metric-value">
                      {dividendData.metrics.dividend_yield
                        ? `${dividendData.metrics.dividend_yield.toFixed(2)}%`
                        : '-'}
                    </span>
                  </div>
                  <div className="dividend-metric-card">
                    <span className="metric-label">Annual Dividend</span>
                    <span className="metric-value">
                      {dividendData.metrics.current_annual_dividend
                        ? `$${dividendData.metrics.current_annual_dividend.toFixed(2)}`
                        : '-'}
                    </span>
                  </div>
                  <div className="dividend-metric-card">
                    <span className="metric-label">Payout Ratio</span>
                    <span className={`metric-value ${
                      dividendData.metrics.payout_ratio > 80 ? 'warning' :
                      dividendData.metrics.payout_ratio > 100 ? 'danger' : ''
                    }`}>
                      {dividendData.metrics.payout_ratio
                        ? `${dividendData.metrics.payout_ratio.toFixed(1)}%`
                        : '-'}
                    </span>
                  </div>
                  <div className="dividend-metric-card">
                    <span className="metric-label">Years of Growth</span>
                    <span className="metric-value">
                      {dividendData.metrics.years_of_growth ?? '-'}
                    </span>
                  </div>
                  <div className="dividend-metric-card">
                    <span className="metric-label">5Y Growth Rate</span>
                    <span className={`metric-value ${
                      dividendData.metrics.dividend_growth_5y > 0 ? 'positive' : ''
                    }`}>
                      {dividendData.metrics.dividend_growth_5y
                        ? `${dividendData.metrics.dividend_growth_5y.toFixed(1)}%`
                        : '-'}
                    </span>
                  </div>
                  <div className="dividend-metric-card">
                    <span className="metric-label">Frequency</span>
                    <span className="metric-value">
                      {dividendData.metrics.dividend_frequency || '-'}
                    </span>
                  </div>
                </div>

                {/* Ex-Dividend Date */}
                {dividendData.metrics.ex_dividend_date && (
                  <div className="dividend-ex-date">
                    <Calendar size={14} />
                    <span>Next Ex-Dividend: {new Date(dividendData.metrics.ex_dividend_date).toLocaleDateString()}</span>
                  </div>
                )}

                {/* Dividend History Table */}
                {dividendData.history && dividendData.history.length > 0 && (
                  <div className="dividend-history">
                    <h4>Recent Dividend Payments</h4>
                    <div className="dividend-history-table-container">
                      <table className="dividend-history-table">
                        <thead>
                          <tr>
                            <th>Ex-Date</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dividendData.history.slice(0, 12).map((div, idx) => (
                            <tr key={idx}>
                              <td>{new Date(div.ex_date).toLocaleDateString()}</td>
                              <td className="amount">${div.amount?.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-dividend-data">
                <DollarSign size={32} />
                <p>No dividend data available</p>
                <span className="no-data-hint">This company may not pay dividends</span>
              </div>
            )}
          </section>

          {/* Capital Allocation Section */}
          <section className="capital-section">
            <h3>
              <Wallet size={18} />
              Capital Allocation
            </h3>
          {capitalLoading ? (
            <div className="loading-state">
              <RefreshCcw className="spin" size={24} />
              <p>Loading capital allocation data...</p>
            </div>
          ) : capitalData && capitalData.capitalAllocation?.length > 0 ? (
            (() => {
              // Get latest annual data for summary
              const latestAnnual = capitalData.capitalAllocation.find(r => r.fiscal_quarter?.includes('-FY'));
              const allocationHistory = capitalData.capitalAllocation;

              return (
                <>
                  {/* Summary Cards */}
                  <div className="capital-summary-grid">
                    <div className="capital-card highlight">
                      <div className="capital-card-header">
                        <Wallet size={18} />
                        <span>Total Shareholder Return</span>
                      </div>
                      <div className="capital-card-value">
                        {formatValue(latestAnnual?.total_shareholder_return, 'currency')}
                      </div>
                      <div className="capital-card-subtitle">
                        {latestAnnual?.fiscal_quarter || 'Latest fiscal year'}
                      </div>
                    </div>

                    <div className="capital-card">
                      <div className="capital-card-header">
                        <DollarSign size={18} />
                        <span>Dividends Paid</span>
                      </div>
                      <div className="capital-card-value">
                        {formatValue(latestAnnual?.dividends_paid, 'currency')}
                      </div>
                      {capitalData.dividends?.dividendYield ? (
                        <div className="capital-card-subtitle">
                          Yield: {capitalData.dividends.dividendYield.toFixed(2)}%
                        </div>
                      ) : latestAnnual?.dividend_payout_ratio ? (
                        <div className="capital-card-subtitle">
                          Payout: {latestAnnual.dividend_payout_ratio.toFixed(1)}%
                        </div>
                      ) : null}
                    </div>

                    <div className="capital-card">
                      <div className="capital-card-header">
                        <RefreshCcw size={18} />
                        <span>Share Buybacks</span>
                      </div>
                      <div className="capital-card-value">
                        {formatValue(latestAnnual?.buybacks_executed, 'currency')}
                      </div>
                      <div className="capital-card-subtitle">
                        {latestAnnual?.buyback_pct_of_fcf
                          ? `${latestAnnual.buyback_pct_of_fcf.toFixed(1)}% of FCF`
                          : '-'}
                      </div>
                    </div>

                    <div className="capital-card">
                      <div className="capital-card-header">
                        <Activity size={18} />
                        <span>Free Cash Flow</span>
                      </div>
                      <div className="capital-card-value">
                        {formatValue(latestAnnual?.free_cash_flow, 'currency')}
                      </div>
                      <div className="capital-card-subtitle">
                        Div Payout: {latestAnnual?.dividend_pct_of_fcf
                          ? `${latestAnnual.dividend_pct_of_fcf.toFixed(1)}%`
                          : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Historical Data Table */}
                  {allocationHistory.length > 0 && (
                    <section className="capital-history-section">
                      <h3>Capital Allocation History</h3>
                      <div className="capital-table-container">
                        <table className="capital-table">
                          <thead>
                            <tr>
                              <th>Period</th>
                              <th>Dividends</th>
                              <th>Buybacks</th>
                              <th>Total Return</th>
                              <th>FCF</th>
                              <th>Div % FCF</th>
                              <th>Buyback % FCF</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allocationHistory.map((row, idx) => (
                              <tr key={row.fiscal_quarter || idx} className={row.fiscal_quarter?.includes('-FY') ? 'annual-row' : ''}>
                                <td className="period-cell">{row.fiscal_quarter}</td>
                                <td>{formatValue(row.dividends_paid, 'currency')}</td>
                                <td>{formatValue(row.buybacks_executed, 'currency')}</td>
                                <td className="highlight-cell">
                                  {formatValue(row.total_shareholder_return, 'currency')}
                                </td>
                                <td>{formatValue(row.free_cash_flow, 'currency')}</td>
                                <td>{row.dividend_pct_of_fcf ? `${row.dividend_pct_of_fcf.toFixed(1)}%` : '-'}</td>
                                <td>{row.buyback_pct_of_fcf ? `${row.buyback_pct_of_fcf.toFixed(1)}%` : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* Dividend Info */}
                  {(capitalData.dividends?.annualDividend > 0 || latestAnnual?.dividends_paid > 0) && (
                    <section className="dividend-info-section">
                      <h3>Dividend Information</h3>
                      <div className="dividend-info-grid">
                        <div className="info-item">
                          <span className="info-label">Annual Dividend</span>
                          <span className="info-value">
                            {formatValue(capitalData.dividends?.annualDividend || latestAnnual?.dividends_paid, 'currency')}
                          </span>
                        </div>
                        {capitalData.dividends?.dividendYield && (
                          <div className="info-item">
                            <span className="info-label">Dividend Yield</span>
                            <span className="info-value positive">
                              {capitalData.dividends.dividendYield.toFixed(2)}%
                            </span>
                          </div>
                        )}
                        <div className="info-item">
                          <span className="info-label">Payout Ratio</span>
                          <span className="info-value">
                            {latestAnnual?.dividend_payout_ratio
                              ? `${latestAnnual.dividend_payout_ratio.toFixed(1)}%`
                              : '-'}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">FCF Payout</span>
                          <span className="info-value">
                            {latestAnnual?.dividend_pct_of_fcf
                              ? `${latestAnnual.dividend_pct_of_fcf.toFixed(1)}%`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </section>
                  )}

                  <Link to="/capital" className="view-all-capital-link">
                    View All Capital Allocation Data →
                  </Link>
                </>
              );
            })()
          ) : (
            <div className="no-data-new">
              <Wallet size={32} />
              <p>No capital allocation data available</p>
            </div>
          )}
          </section>
        </div>
      )}

      {/* NOTES & RESEARCH TAB */}
      {mainTab === 'notes' && (
        <div className="notes-tab-content">
          <CompanyNotesPanel symbol={symbol} companyName={company?.company?.name} />
        </div>
      )}

      {/* NEWS & EVENTS TAB */}
      {mainTab === 'news' && (
        <NewsAndEvents symbol={symbol} />
      )}

      {/* Mobile Action Bar - visible only on mobile */}
      <div className="mobile-action-bar">
        <WatchlistButton
          symbol={company.company.symbol}
          name={company.company.name}
          sector={company.company.sector}
          size="small"
        />
        <AddToPortfolioButton
          symbol={company.company.symbol}
          companyId={company.company.id}
          companyName={company.company.name}
          currentPrice={priceData?.last_price}
        />
        <button
          className="mobile-compare-btn"
          onClick={() => navigate(`/compare?symbol=${symbol}`)}
        >
          <BarChart3 size={18} />
          <span>Compare</span>
        </button>
      </div>
    </div>
  );
}

// Helper function to determine value color class
function getValueClass(value, metricKey) {
  if (value === null || value === undefined) return '';

  const metric = AVAILABLE_METRICS[metricKey];
  if (!metric) return '';

  // For ratios where lower is better (like D/E, P/E)
  const lowerIsBetter = ['debt_to_equity', 'pe_ratio', 'pb_ratio', 'ev_to_ebitda'].includes(metricKey);

  if (metric.format === 'percent') {
    if (lowerIsBetter) {
      return value < 0.5 ? 'value-positive' : value > 1 ? 'value-negative' : '';
    }
    return value > 15 ? 'value-positive' : value < 5 ? 'value-negative' : '';
  }

  return '';
}

export default CompanyPage;
