import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { companyAPI, pricesAPI, indicesAPI, screeningAPI } from '../services/api';
import { PageHeader, Callout } from '../components/ui';
import { useAskAI, AskAIProvider } from '../hooks';
import {
  Sparkles, Building2, Pill, Cpu, Tv, Zap,
  ShoppingCart, Fuel, Plane, Search, Loader2
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, ComposedChart, Cell, ReferenceLine,
  ScatterChart, Scatter
} from 'recharts';
import { PeriodToggle, WatchlistButton, AlphaCompareChart } from '../components';
import { useFormatters } from '../hooks/useFormatters';
import {
  CorrelationHeatmap,
  VarianceAnalysis,
  calculatePearsonCorrelation,
  calculateSpearmanCorrelation,
  calculateMutualInformation,
  calculateVarianceStats,
  CORRELATION_TYPES
} from './AdvancedCharts';
import './ComparePage.css';

// Import from unified metrics configuration
import {
  getComparePageCategories,
  DEFAULT_COMPARE_METRICS,
  RADAR_METRICS
} from '../config/metrics';

// Get metrics from unified config
const METRIC_CATEGORIES = getComparePageCategories();

// Flatten all metrics for easy lookup
const ALL_METRICS = Object.values(METRIC_CATEGORIES).flatMap(cat => cat.metrics);

// Default metrics for table view
const DEFAULT_TABLE_METRICS = DEFAULT_COMPARE_METRICS;

/* Prism Design System chart colors: Primary series Navy, Secondary Green/Orange/Red */
const COMPANY_COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#1E3A5F'];

/* Company Groups for Quick Start Selection */
const COMPANY_GROUPS = [
  {
    id: 'mag7',
    name: 'Magnificent 7',
    icon: Sparkles,
    description: 'Tech giants driving market growth',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA']
  },
  {
    id: 'banks',
    name: 'Major Banks',
    icon: Building2,
    description: 'US financial sector leaders',
    symbols: ['JPM', 'BAC', 'GS', 'MS', 'C']
  },
  {
    id: 'pharma',
    name: 'Big Pharma',
    icon: Pill,
    description: 'Healthcare & pharmaceutical giants',
    symbols: ['JNJ', 'PFE', 'MRK', 'LLY', 'ABBV']
  },
  {
    id: 'semiconductors',
    name: 'Chip Makers',
    icon: Cpu,
    description: 'Semiconductor industry leaders',
    symbols: ['NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM']
  },
  {
    id: 'streaming',
    name: 'Streaming',
    icon: Tv,
    description: 'Entertainment & streaming services',
    symbols: ['NFLX', 'DIS', 'WBD', 'PARA', 'CMCSA']
  },
  {
    id: 'ev',
    name: 'EV & Clean Energy',
    icon: Zap,
    description: 'Electric vehicles & clean tech',
    symbols: ['TSLA', 'RIVN', 'LCID', 'NIO', 'ENPH']
  },
  {
    id: 'consumer',
    name: 'Consumer Staples',
    icon: ShoppingCart,
    description: 'Consumer goods & retail giants',
    symbols: ['PG', 'KO', 'PEP', 'WMT', 'COST']
  },
  {
    id: 'energy',
    name: 'Oil & Energy',
    icon: Fuel,
    description: 'Major oil & gas companies',
    symbols: ['XOM', 'CVX', 'COP', 'SLB', 'EOG']
  },
  {
    id: 'airlines',
    name: 'Airlines',
    icon: Plane,
    description: 'Major US carriers',
    symbols: ['DAL', 'UAL', 'LUV', 'AAL']
  }
];

function ComparePage() {
  const fmt = useFormatters();

  // Ask AI props for individual charts
  const historicalChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'line',
    label: 'Historical Metric Trend',
    companies: selectedCompanies,
    metric: selectedMetric
  }));
  const priceChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'line',
    label: 'Price Performance Comparison',
    companies: selectedCompanies,
    indices: selectedIndices.map(i => i.short_name)
  }));
  const alphaChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'bar',
    label: 'Alpha vs S&P 500',
    companies: selectedCompanies
  }));
  const profitabilityChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'bar',
    label: 'Profitability Comparison (ROIC, ROE, ROA)',
    companies: selectedCompanies
  }));
  const radarChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'radar',
    label: 'Quality Radar Chart',
    companies: selectedCompanies
  }));
  const valuationChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'bar',
    label: 'Valuation Comparison',
    companies: selectedCompanies
  }));
  const correlationChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'heatmap',
    label: 'Correlation Heatmap',
    companies: selectedCompanies,
    correlationType
  }));
  const revenueChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'area',
    label: 'Revenue Trend Comparison',
    companies: selectedCompanies
  }));
  const breakdownAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'breakdown',
    label: 'Latest Period Financial Breakdown',
    companies: selectedCompanies
  }));
  const netIncomeChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'line',
    label: 'Net Income Trend',
    companies: selectedCompanies
  }));
  const varianceChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'variance',
    label: 'Variance Analysis',
    companies: selectedCompanies,
    metric: advancedMetric
  }));
  const scatterChartAskAI = useAskAI(() => ({
    type: 'chart',
    chartType: 'scatter',
    label: 'Scatter Plot Analysis',
    companies: selectedCompanies
  }));

  // Format value for display using preferences
  const formatValue = (value, format) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    switch (format) {
      case 'percent': return fmt.percent(value, { decimals: 1 });
      case 'ratio': return fmt.ratio(value, { decimals: 2, suffix: '' });
      case 'currency': return fmt.currency(value, { compact: true });
      case 'currency_price': return fmt.price(value, { decimals: 2 });
      default: return fmt.number(value, { decimals: 2 });
    }
  };

  const formatCurrencyShort = (value) => {
    if (value === null || value === undefined) return '-';
    return fmt.number(value, { compact: true });
  };
  const [searchParams, setSearchParams] = useSearchParams();

  // Unified search state
  const [unifiedQuery, setUnifiedQuery] = useState('');
  const [unifiedResults, setUnifiedResults] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isAISearching, setIsAISearching] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [companyData, setCompanyData] = useState({});
  const [breakdownData, setBreakdownData] = useState({});
  const [periodType, setPeriodType] = useState('annual');
  const [selectedMetric, setSelectedMetric] = useState('roic');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState('overview');
  const [allCompanies, setAllCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [marketIndices, setMarketIndices] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [indexPriceData, setIndexPriceData] = useState({});
  const [companyPrices, setCompanyPrices] = useState({});
  const [notFoundMessage, setNotFoundMessage] = useState(null);
  // Advanced tab state
  const [correlationType, setCorrelationType] = useState('pearson');
  const [advancedMetric, setAdvancedMetric] = useState('roic');
  // Scatter plot axis selectors
  const [scatter1X, setScatter1X] = useState('roic');
  const [scatter1Y, setScatter1Y] = useState('roe');
  const [scatter2X, setScatter2X] = useState('earnings_growth_yoy');
  const [scatter2Y, setScatter2Y] = useState('pe_ratio');

  // Load all companies for search
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const response = await companyAPI.getAll();
        setAllCompanies(response.data.companies || []);
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };
    loadCompanies();
  }, []);

  // Load market indices (use ETF-based indices with current price data)
  useEffect(() => {
    const loadIndices = async () => {
      try {
        // Use getMarket() instead of getAll() - returns ETF-based indices (SPY, QQQ, DIA)
        // with current prices from daily_prices table instead of stale market_index_prices
        const response = await indicesAPI.getMarket();
        const indices = response.data?.data || response.data || [];
        // Map ETF symbols to display format expected by component
        const formatted = indices.map(idx => ({
          short_name: idx.symbol,
          name: idx.name,
          symbol: idx.symbol,
          last_price: idx.last_price,
          change_1d: idx.change_1d,
          change_1w: idx.change_1w,
          change_1m: idx.change_1m,
          change_ytd: idx.change_ytd,
          change_1y: idx.change_1y
        }));
        setMarketIndices(formatted);
      } catch (error) {
        console.error('Error loading market indices:', error);
      }
    };
    loadIndices();
  }, []);

  // Load data for selected companies
  const loadCompanyData = useCallback(async (symbol) => {
    try {
      const [companyRes, metricsRes, breakdownRes, priceMetricsRes] = await Promise.all([
        companyAPI.getOne(symbol),
        companyAPI.getMetrics(symbol, { limit: 10, periodType }),
        companyAPI.getBreakdown(symbol, { limit: 5, periodType }),
        pricesAPI.getMetrics(symbol).catch(() => ({ data: null }))
      ]);
      // Parse price metrics - access nested data object (API returns { success, data: {...} })
      const pm = priceMetricsRes.data?.data;
      const priceMetrics = pm ? {
        // Price data (backend returns 'last_price', not 'current_price')
        stock_price: pm.last_price,
        current_price: pm.last_price,
        last_price: pm.last_price,
        market_cap: pm.market_cap,
        enterprise_value: pm.enterprise_value,
        beta: pm.beta,
        // Price changes
        change_1d: pm.change_1d,
        change_1w: pm.change_1w,
        change_1m: pm.change_1m,
        change_3m: pm.change_3m,
        change_6m: pm.change_6m,
        change_ytd: pm.change_ytd,
        change_1y: pm.change_1y,
        // 52-week range
        high_52w: pm.high_52w,
        low_52w: pm.low_52w,
        from_52w_high: pm.last_price && pm.high_52w
          ? ((pm.last_price - pm.high_52w) / pm.high_52w * 100)
          : null,
        // Alpha metrics (vs SPY)
        alpha_1d: pm.alpha_1d,
        alpha_1w: pm.alpha_1w,
        alpha_1m: pm.alpha_1m,
        alpha_3m: pm.alpha_3m,
        alpha_6m: pm.alpha_6m,
        alpha_ytd: pm.alpha_ytd,
        alpha_1y: pm.alpha_1y,
        // Risk metrics
        max_drawdown_1y: pm.max_drawdown_1y,
        max_drawdown_3y: pm.max_drawdown_3y,
        max_drawdown_5y: pm.max_drawdown_5y,
        volatility_30d: pm.volatility_30d
      } : {};

      // Extract latest financials from breakdown data (first item is most recent)
      const latestBreakdown = breakdownRes.data?.breakdown?.[0];
      const financialMetrics = latestBreakdown ? {
        revenue: latestBreakdown.revenue_usd ?? latestBreakdown.revenue,
        net_income: latestBreakdown.netIncome_usd ?? latestBreakdown.netIncome,
        operating_income: latestBreakdown.operatingIncome_usd ?? latestBreakdown.operatingIncome,
        gross_profit: latestBreakdown.grossProfit_usd ?? latestBreakdown.grossProfit,
        ebitda: latestBreakdown.ebitda_usd ?? latestBreakdown.ebitda
      } : {};

      return {
        company: companyRes.data.company,
        latestMetrics: { ...companyRes.data.latest_metrics, ...priceMetrics, ...financialMetrics },
        historicalMetrics: metricsRes.data.metrics,
        breakdown: breakdownRes.data.breakdown,
        fiscalYearEnd: metricsRes.data.fiscal_year_end,
        priceMetrics,
        currency: companyRes.data.currency || metricsRes.data.currency || { reporting: 'USD', symbol: '$', isUSD: true }
      };
    } catch (error) {
      console.error(`Error loading data for ${symbol}:`, error);
      const isNotFound = error.response?.status === 404 || error.response?.data?.code === 'COMPANY_NOT_FOUND';
      return { failed: true, symbol, isNotFound };
    }
  }, [periodType]);

  // Reload data when period type changes
  useEffect(() => {
    const reloadAllData = async () => {
      if (selectedCompanies.length === 0) return;
      setLoading(true);
      const newData = {};
      const newBreakdown = {};
      for (const symbol of selectedCompanies) {
        const data = await loadCompanyData(symbol);
        if (data && !data.failed) {
          newData[symbol] = data;
          newBreakdown[symbol] = data.breakdown;
        }
      }
      setCompanyData(newData);
      setBreakdownData(newBreakdown);
      setLoading(false);
    };
    reloadAllData();
  }, [periodType, selectedCompanies, loadCompanyData]);

  const addCompany = useCallback(async (symbol) => {
    setSelectedCompanies(prev => {
      if (prev.length >= 5) {
        alert('Maximum 5 companies can be compared');
        return prev;
      }
      if (prev.includes(symbol)) return prev;
      return [...prev, symbol];
    });

    setLoading(true);
    setUnifiedQuery('');
    setUnifiedResults([]);
    setNotFoundMessage(null);

    const [data, priceRes] = await Promise.all([
      loadCompanyData(symbol),
      pricesAPI.get(symbol, { period: '1y' }).catch(() => ({ data: null }))
    ]);

    if (data?.failed) {
      setSelectedCompanies(prev => prev.filter(s => s !== symbol));
      setNotFoundMessage(
        data.isNotFound
          ? `${symbol} not found. This symbol may not be in our database yet. Try symbols from the search or predefined groups.`
          : `Failed to load ${symbol}. Please try again.`
      );
    } else if (data) {
      setCompanyData(prev => ({ ...prev, [symbol]: data }));
      setBreakdownData(prev => ({ ...prev, [symbol]: data.breakdown }));
    }
    // API response is nested: { success, data: { prices: [...] } }
    if (priceRes.data?.data?.prices) {
      setCompanyPrices(prev => ({
        ...prev,
        [symbol]: priceRes.data.data.prices.map(p => ({ date: p.date, close: p.close }))
      }));
    }
    setLoading(false);
  }, [loadCompanyData]);

  // Add entire company group (up to 5 companies)
  const addCompanyGroup = useCallback(async (group) => {
    const symbolsToAdd = group.symbols.slice(0, 5);
    for (const symbol of symbolsToAdd) {
      if (!selectedCompanies.includes(symbol)) {
        await addCompany(symbol);
      }
    }
  }, [selectedCompanies, addCompany]);

  // Group keyword mappings for AI-like queries
  const groupKeywords = useMemo(() => ({
    'mag 7': 'mag7',
    'magnificent 7': 'mag7',
    'magnificent seven': 'mag7',
    'tech giants': 'mag7',
    'big tech': 'mag7',
    'faang': 'mag7',
    'banks': 'banks',
    'banking': 'banks',
    'financial': 'banks',
    'pharma': 'pharma',
    'pharmaceutical': 'pharma',
    'healthcare': 'pharma',
    'drug': 'pharma',
    'chip': 'semiconductors',
    'semiconductor': 'semiconductors',
    'chips': 'semiconductors',
    'semiconductors': 'semiconductors',
    'streaming': 'streaming',
    'entertainment': 'streaming',
    'media': 'streaming',
    'ev': 'ev',
    'electric vehicle': 'ev',
    'clean energy': 'ev',
    'tesla': 'ev',
    'consumer': 'consumer',
    'consumer staples': 'consumer',
    'retail': 'consumer',
    'oil': 'energy',
    'energy': 'energy',
    'gas': 'energy',
    'airline': 'airlines',
    'airlines': 'airlines',
    'aviation': 'airlines',
  }), []);

  // Find matching group from query
  const findMatchingGroup = useCallback((query) => {
    const lower = query.toLowerCase();
    for (const [keyword, groupId] of Object.entries(groupKeywords)) {
      if (lower.includes(keyword)) {
        return COMPANY_GROUPS.find(g => g.id === groupId);
      }
    }
    return null;
  }, [groupKeywords]);

  // Unified search handler - auto-detects symbol, company name, or group query
  // Check if query looks like an AI/natural language query
  const isNaturalLanguageQuery = useCallback((query) => {
    const lower = query.toLowerCase();
    // Keywords that suggest AI search intent
    const aiKeywords = [
      'compare', 'versus', 'vs', 'similar to', 'like',
      'top', 'best', 'find', 'show', 'get', 'list',
      'largest', 'biggest', 'smallest', 'highest', 'lowest',
      'most', 'least', 'profitable', 'growing', 'undervalued',
      'overvalued', 'dividend', 'growth', 'value', 'companies',
      'stocks', 'with', 'high', 'low', 'above', 'below'
    ];
    // Query has 2+ words and contains AI keywords
    const hasMultipleWords = query.trim().split(/\s+/).length >= 2;
    const hasAIKeyword = aiKeywords.some(kw => lower.includes(kw));
    return hasMultipleWords && hasAIKeyword;
  }, []);

  const handleUnifiedSearch = useCallback((query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setUnifiedResults([]);
      return;
    }

    // Try to match a predefined group first
    const matchedGroup = findMatchingGroup(trimmed);

    if (matchedGroup) {
      // Show group as a quick action
      const results = [{ type: 'group', group: matchedGroup, text: `Compare ${matchedGroup.name}` }];
      // Also show individual companies from the group
      const groupCompanies = allCompanies
        .filter(c => matchedGroup.symbols.includes(c.symbol))
        .filter(c => !selectedCompanies.includes(c.symbol));
      setUnifiedResults([...results, ...groupCompanies]);
      return;
    }

    // Direct symbol match (1-5 uppercase letters, no spaces)
    if (/^[A-Z]{1,5}$/i.test(trimmed)) {
      const results = allCompanies
        .filter(c => c.symbol.toUpperCase().includes(trimmed.toUpperCase()))
        .filter(c => !selectedCompanies.includes(c.symbol))
        .slice(0, 8);
      // If we have results, show them; otherwise show AI option
      if (results.length > 0) {
        setUnifiedResults(results);
      } else {
        setUnifiedResults([{ type: 'ai', text: `Search with AI: "${trimmed}"`, query: trimmed }]);
      }
      return;
    }

    // Search by company name or symbol
    const companyResults = allCompanies
      .filter(c =>
        c.name?.toLowerCase().includes(trimmed.toLowerCase()) ||
        c.symbol.toUpperCase().includes(trimmed.toUpperCase())
      )
      .filter(c => !selectedCompanies.includes(c.symbol))
      .slice(0, 8);

    // If it looks like a natural language query, show AI option first
    if (isNaturalLanguageQuery(trimmed)) {
      const aiResult = [{ type: 'ai', text: `Search with AI: "${trimmed}"`, query: trimmed }];
      setUnifiedResults([...aiResult, ...companyResults]);
      return;
    }

    // If no company matches found and query has 2+ words, suggest AI search
    if (companyResults.length === 0 && trimmed.split(/\s+/).length >= 2) {
      setUnifiedResults([{ type: 'ai', text: `Search with AI: "${trimmed}"`, query: trimmed }]);
      return;
    }

    setUnifiedResults(companyResults);
  }, [allCompanies, selectedCompanies, findMatchingGroup, isNaturalLanguageQuery]);

  // Handle group selection from search - adds all companies from the group
  const handleGroupSelect = useCallback(async (group) => {
    setUnifiedQuery('');
    setUnifiedResults([]);
    await addCompanyGroup(group);
  }, [addCompanyGroup]);

  // Handle AI-powered search - extracts criteria and finds matching companies
  const handleAISearch = useCallback(async (query) => {
    setIsAISearching(true);
    setUnifiedResults([{ type: 'loading', text: 'AI is finding matching companies...' }]);

    try {
      // First, call the NL screen API to extract criteria
      const nlResponse = await fetch('/api/nl/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: { page: 'compare' } })
      });

      if (!nlResponse.ok) {
        throw new Error('Failed to process query');
      }

      const nlData = await nlResponse.json();
      console.log('[Compare AI Search] NL extraction result:', nlData);

      // Build screening criteria from the extraction
      const screenCriteria = {
        periodType: 'annual',
        limit: 5, // Get top 5 for comparison
        ...(nlData.criteria || {})
      };

      // Call the screening API to get matching companies
      const screenResponse = await screeningAPI.screen(screenCriteria);
      const companies = screenResponse.data?.companies || [];

      if (companies.length === 0) {
        setUnifiedResults([{ type: 'no-results', text: 'No matching companies found. Try a different query.' }]);
        setIsAISearching(false);
        return;
      }

      // Add companies to comparison
      setUnifiedQuery('');
      setUnifiedResults([]);
      setIsAISearching(false);

      // Add each company
      for (const company of companies.slice(0, 5)) {
        if (!selectedCompanies.includes(company.symbol)) {
          await addCompany(company.symbol);
        }
      }

    } catch (error) {
      console.error('[Compare AI Search] Error:', error);
      setUnifiedResults([{ type: 'error', text: 'AI search failed. Try using predefined groups or search by symbol.' }]);
      setIsAISearching(false);
    }
  }, [selectedCompanies, addCompany]);

  // Handle URL parameters for symbol(s) - auto-add companies from URL
  // This effect must be after addCompany is defined
  useEffect(() => {
    if (allCompanies.length === 0) return;

    // Check for single symbol (?symbol=AAPL) or multiple (?symbols=AAPL,MSFT,GOOGL)
    const singleSymbol = searchParams.get('symbol');
    const multipleSymbols = searchParams.get('symbols');

    // Only process if there are URL params to handle
    if (!singleSymbol && !multipleSymbols) return;

    const symbolsToAdd = [];
    if (singleSymbol) {
      symbolsToAdd.push(singleSymbol.toUpperCase());
    }
    if (multipleSymbols) {
      symbolsToAdd.push(...multipleSymbols.split(',').map(s => s.trim().toUpperCase()));
    }

    if (symbolsToAdd.length > 0) {
      // Clear URL params first to prevent re-processing
      setSearchParams({}, { replace: true });

      // Add each symbol sequentially to handle async state updates properly
      const addSymbolsSequentially = async () => {
        for (const symbol of symbolsToAdd.slice(0, 5)) {
          // Verify symbol exists in our database
          if (allCompanies.some(c => c.symbol.toUpperCase() === symbol)) {
            await addCompany(symbol);
          }
        }
      };
      addSymbolsSequentially();
    }
  }, [searchParams, allCompanies, setSearchParams, addCompany]);

  const removeCompany = (symbol) => {
    setSelectedCompanies(prev => prev.filter(s => s !== symbol));
    setCompanyData(prev => {
      const newData = { ...prev };
      delete newData[symbol];
      return newData;
    });
    setBreakdownData(prev => {
      const newData = { ...prev };
      delete newData[symbol];
      return newData;
    });
    setCompanyPrices(prev => {
      const newData = { ...prev };
      delete newData[symbol];
      return newData;
    });
  };

  // Toggle index selection
  const toggleIndex = async (index) => {
    const symbol = index.short_name;
    if (selectedIndices.find(i => i.short_name === symbol)) {
      // Remove index
      setSelectedIndices(prev => prev.filter(i => i.short_name !== symbol));
      setIndexPriceData(prev => {
        const newData = { ...prev };
        delete newData[symbol];
        return newData;
      });
    } else {
      // Add index (max 2 indices)
      if (selectedIndices.length >= 2) {
        alert('Maximum 2 indices can be compared at once');
        return;
      }
      setSelectedIndices(prev => [...prev, index]);
      // Load price data for this index using pricesAPI.get() which fetches from
      // daily_prices table (current data) instead of stale market_index_prices
      try {
        const priceRes = await pricesAPI.get(symbol, { period: '1y' });
        // Response structure: { success: true, data: { prices: [...] } }
        const prices = priceRes.data?.data?.prices || priceRes.data?.prices || [];
        setIndexPriceData(prev => ({
          ...prev,
          [symbol]: prices.map(p => ({ date: p.date, close: p.close }))
        }));
      } catch (error) {
        console.error(`Error loading price data for ${symbol}:`, error);
      }
    }
  };

  const removeIndex = (symbol) => {
    setSelectedIndices(prev => prev.filter(i => i.short_name !== symbol));
    setIndexPriceData(prev => {
      const newData = { ...prev };
      delete newData[symbol];
      return newData;
    });
  };

  // Get metrics to display based on selected category
  const getDisplayMetrics = () => {
    if (selectedCategory === 'all') {
      return ALL_METRICS.filter(m => DEFAULT_TABLE_METRICS.includes(m.key));
    }
    return METRIC_CATEGORIES[selectedCategory]?.metrics || [];
  };

  // Prepare chart data for historical comparison
  const getHistoricalChartData = () => {
    const allDates = new Set();
    selectedCompanies.forEach(symbol => {
      companyData[symbol]?.historicalMetrics?.forEach(m => {
        allDates.add(m.fiscal_period);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    return sortedDates.map(date => {
      // Use fiscal_label from the first company that has this date
      let fiscalLabel = null;
      for (const symbol of selectedCompanies) {
        const metric = companyData[symbol]?.historicalMetrics?.find(m => m.fiscal_period === date);
        if (metric?.fiscal_label) {
          fiscalLabel = metric.fiscal_label;
          break;
        }
      }
      const point = {
        date: fiscalLabel || date.substring(0, 7),
        rawDate: date
      };
      selectedCompanies.forEach(symbol => {
        const metric = companyData[symbol]?.historicalMetrics?.find(m => m.fiscal_period === date);
        point[symbol] = metric?.[selectedMetric] ?? null;
      });
      return point;
    });
  };

  // Prepare radar chart data with better normalization
  const getRadarData = () => {
    return RADAR_METRICS.map(metricKey => {
      const metric = ALL_METRICS.find(m => m.key === metricKey);
      const point = { metric: metric?.label || metricKey };

      // Get all values for this metric to find min/max
      const allValues = selectedCompanies
        .map(symbol => companyData[symbol]?.latestMetrics?.[metricKey])
        .filter(v => v !== null && v !== undefined && !isNaN(v));

      const maxVal = Math.max(...allValues, 1);
      const minVal = Math.min(...allValues, 0);

      selectedCompanies.forEach(symbol => {
        const value = companyData[symbol]?.latestMetrics?.[metricKey];
        if (value === null || value === undefined || isNaN(value)) {
          point[symbol] = 0;
          return;
        }

        // Normalize to 0-100 scale
        let normalized;
        if (metric?.higherBetter === false) {
          // For metrics where lower is better (like debt), invert the scale
          normalized = maxVal === minVal ? 50 : ((maxVal - value) / (maxVal - minVal)) * 100;
        } else {
          normalized = maxVal === minVal ? 50 : ((value - minVal) / (maxVal - minVal)) * 100;
        }
        point[symbol] = Math.max(0, Math.min(100, normalized));
      });
      return point;
    });
  };

  // Check if companies have mixed currencies (for warning display)
  const getMixedCurrencyInfo = () => {
    const currencies = selectedCompanies
      .map(symbol => companyData[symbol]?.currency?.reporting)
      .filter(Boolean);

    const uniqueCurrencies = [...new Set(currencies)];
    const hasMixed = uniqueCurrencies.length > 1;

    return {
      hasMixed,
      currencies: uniqueCurrencies,
      byCompany: selectedCompanies.reduce((acc, symbol) => {
        acc[symbol] = companyData[symbol]?.currency || { reporting: 'USD', symbol: '$' };
        return acc;
      }, {})
    };
  };

  const currencyInfo = getMixedCurrencyInfo();

  // Revenue comparison chart data (always uses USD-normalized values for cross-currency comparison)
  const getRevenueComparisonData = () => {
    const allDates = new Set();
    selectedCompanies.forEach(symbol => {
      breakdownData[symbol]?.forEach(b => {
        allDates.add(b.period);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    const result = sortedDates.map(date => {
      // Use fiscal_label from the first company that has this date
      let fiscalLabel = null;
      for (const symbol of selectedCompanies) {
        const bd = breakdownData[symbol]?.find(b => b.period === date);
        if (bd?.fiscal_label) {
          fiscalLabel = bd.fiscal_label;
          break;
        }
      }
      const point = {
        date: fiscalLabel || date.substring(0, 7),
        rawDate: date
      };
      selectedCompanies.forEach(symbol => {
        const bd = breakdownData[symbol]?.find(b => b.period === date);
        // Prefer USD-normalized values for accurate cross-currency comparison
        const revenue = bd?.revenue_usd ?? bd?.revenue;
        const netIncome = bd?.netIncome_usd ?? bd?.netIncome;
        point[`${symbol}_revenue`] = revenue ? revenue / 1e9 : null;
        point[`${symbol}_netIncome`] = netIncome ? netIncome / 1e9 : null;
      });
      return point;
    });

    return result;
  };

  // Margin comparison data
  const getMarginComparisonData = () => {
    return selectedCompanies.map((symbol, idx) => {
      const bd = breakdownData[symbol]?.[0];
      const latest = companyData[symbol]?.latestMetrics;
      return {
        symbol,
        name: companyData[symbol]?.company?.name || symbol,
        grossMargin: bd?.margins?.grossMargin || latest?.gross_margin || 0,
        operatingMargin: bd?.margins?.operatingMargin || latest?.operating_margin || 0,
        netMargin: bd?.margins?.netMargin || latest?.net_margin || 0,
        color: COMPANY_COLORS[idx]
      };
    });
  };

  // Profitability comparison data
  const getProfitabilityData = () => {
    return selectedCompanies.map((symbol, idx) => {
      const latest = companyData[symbol]?.latestMetrics;
      return {
        symbol,
        roic: latest?.roic || 0,
        roe: latest?.roe || 0,
        roa: latest?.roa || 0,
        color: COMPANY_COLORS[idx]
      };
    });
  };

  // Get quality scores from backend (consistent with CompanyPage and Dashboard)
  const getCompanyScores = () => {
    return selectedCompanies.map(symbol => {
      const metrics = companyData[symbol]?.latestMetrics;
      if (!metrics) return { symbol, score: 0, details: {} };

      // Use backend-calculated data_quality_score for consistency
      const score = metrics.data_quality_score || 0;

      // Generate detail labels based on component values (same thresholds as backend)
      const details = {};

      // ROIC rating
      if (metrics.roic >= 30) details.roic = 'Excellent';
      else if (metrics.roic >= 20) details.roic = 'Very Good';
      else if (metrics.roic >= 15) details.roic = 'Good';
      else if (metrics.roic >= 10) details.roic = 'Average';
      else details.roic = 'Below Avg';

      // Net Margin rating
      if (metrics.net_margin >= 20) details.margin = 'Excellent';
      else if (metrics.net_margin >= 15) details.margin = 'Very Good';
      else if (metrics.net_margin >= 10) details.margin = 'Good';
      else if (metrics.net_margin >= 5) details.margin = 'Average';
      else details.margin = 'Below Avg';

      // Debt/Equity rating (lower is better)
      if (metrics.debt_to_equity <= 0.3) details.debt = 'Excellent';
      else if (metrics.debt_to_equity <= 0.5) details.debt = 'Very Good';
      else if (metrics.debt_to_equity <= 1.0) details.debt = 'Good';
      else if (metrics.debt_to_equity <= 2.0) details.debt = 'Average';
      else details.debt = 'High';

      // FCF Yield rating
      if (metrics.fcf_yield >= 8) details.fcf = 'Excellent';
      else if (metrics.fcf_yield >= 5) details.fcf = 'Very Good';
      else if (metrics.fcf_yield >= 3) details.fcf = 'Good';
      else if (metrics.fcf_yield >= 1) details.fcf = 'Average';
      else details.fcf = 'Below Avg';

      return { symbol, score, details };
    }).sort((a, b) => b.score - a.score);
  };

  // Get normalized price performance data for comparison chart
  const getPricePerformanceData = () => {
    // Collect all unique dates from companies and indices
    const allDates = new Set();

    // Add company price dates
    selectedCompanies.forEach(symbol => {
      companyPrices[symbol]?.forEach(p => allDates.add(p.date));
    });

    // Add index price dates
    selectedIndices.forEach(index => {
      indexPriceData[index.short_name]?.forEach(p => allDates.add(p.date));
    });

    const sortedDates = Array.from(allDates).sort();
    if (sortedDates.length === 0) return [];

    // Get base prices (first available price for each)
    const basePrices = {};
    selectedCompanies.forEach(symbol => {
      const prices = companyPrices[symbol];
      if (prices?.length) {
        const firstPrice = prices.find(p => p.close);
        if (firstPrice) basePrices[symbol] = firstPrice.close;
      }
    });
    selectedIndices.forEach(index => {
      const prices = indexPriceData[index.short_name];
      if (prices?.length) {
        const firstPrice = prices.find(p => p.close);
        if (firstPrice) basePrices[index.short_name] = firstPrice.close;
      }
    });

    // Build normalized data points
    return sortedDates.map(date => {
      const point = { date: date.substring(5) }; // MM-DD format

      // Add company performance
      selectedCompanies.forEach(symbol => {
        const priceData = companyPrices[symbol]?.find(p => p.date === date);
        if (priceData?.close && basePrices[symbol]) {
          point[symbol] = ((priceData.close - basePrices[symbol]) / basePrices[symbol]) * 100;
        }
      });

      // Add index performance
      selectedIndices.forEach(index => {
        const priceData = indexPriceData[index.short_name]?.find(p => p.date === date);
        if (priceData?.close && basePrices[index.short_name]) {
          point[index.short_name] = ((priceData.close - basePrices[index.short_name]) / basePrices[index.short_name]) * 100;
        }
      });

      return point;
    });
  };

  // Calculate correlation matrix for Advanced tab
  const correlationMatrix = useMemo(() => {
    if (selectedCompanies.length < 2) return { matrix: {}, labels: [] };

    const labels = selectedCompanies;
    const matrix = {};

    // Build time series data for each company based on selected metric
    // Use fiscal_year for alignment to handle different fiscal year ends
    const seriesData = {};
    selectedCompanies.forEach(symbol => {
      const historical = companyData[symbol]?.historicalMetrics || [];
      seriesData[symbol] = historical.map(m => ({
        // Use fiscal_year for more robust alignment across companies with different FYE
        period: m.fiscal_year || m.fiscal_period,
        value: m[advancedMetric]
      })).filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value));
    });

    // Calculate pairwise correlations
    labels.forEach(symbol1 => {
      matrix[symbol1] = {};
      labels.forEach(symbol2 => {
        if (symbol1 === symbol2) {
          matrix[symbol1][symbol2] = 1;
        } else {
          const series1 = seriesData[symbol1];
          const series2 = seriesData[symbol2];
          let corr = null;

          if (correlationType === 'pearson') {
            corr = calculatePearsonCorrelation(series1, series2);
          } else if (correlationType === 'spearman') {
            corr = calculateSpearmanCorrelation(series1, series2);
          } else if (correlationType === 'mutual_info') {
            corr = calculateMutualInformation(series1, series2);
          }
          matrix[symbol1][symbol2] = corr;
        }
      });
    });

    return { matrix, labels };
  }, [selectedCompanies, companyData, advancedMetric, correlationType]);

  // Calculate variance data for Advanced tab
  const varianceData = useMemo(() => {
    const result = {};
    selectedCompanies.forEach(symbol => {
      const historical = companyData[symbol]?.historicalMetrics || [];
      const data = historical.map(m => ({
        period: m.fiscal_period,
        value: m[advancedMetric]
      })).filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value));

      const stats = calculateVarianceStats(data);
      if (stats) {
        result[symbol] = {
          mean: stats.mean,
          stdDev: stats.stdDev,
          min: stats.min,
          max: stats.max,
          coeffVar: stats.cv
        };
      }
    });
    return result;
  }, [selectedCompanies, companyData, advancedMetric]);

  // Get scatter plot data for Advanced tab (compare two metrics)
  const getScatterData = (metricX, metricY) => {
    return selectedCompanies.map(symbol => {
      const metrics = companyData[symbol]?.latestMetrics;
      return {
        x: metrics?.[metricX] ?? null,
        y: metrics?.[metricY] ?? null,
        symbol,
        label: `${symbol}: ${metricX}=${metrics?.[metricX]?.toFixed(2)}, ${metricY}=${metrics?.[metricY]?.toFixed(2)}`
      };
    }).filter(d => d.x !== null && d.y !== null);
  };

  const exportToCSV = () => {
    if (selectedCompanies.length === 0) return;

    const headers = ['Category', 'Metric', ...selectedCompanies];
    const rows = [];

    Object.entries(METRIC_CATEGORIES).forEach(([catKey, cat]) => {
      cat.metrics.forEach(metric => {
        const row = [cat.label, metric.label];
        selectedCompanies.forEach(symbol => {
          const value = companyData[symbol]?.latestMetrics?.[metric.key];
          row.push(formatValue(value, metric.format));
        });
        rows.push(row);
      });
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison_${selectedCompanies.join('_')}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const scores = getCompanyScores();

  return (
    <div className="compare-page">
      <PageHeader
        title="Company Comparison"
        subtitle="Compare up to 5 companies with detailed metrics and analysis"
      />

      {notFoundMessage && (
        <Callout
          type="warning"
          title="Symbol not found"
          onDismiss={() => setNotFoundMessage(null)}
        >
          {notFoundMessage}
        </Callout>
      )}

      {/* Unified Search Bar - PRISM AI Design */}
      <div className="unified-search-section">
        <div className="unified-search-container">
          <div className="unified-search-input-wrapper">
            {/* AI icon container with gradient background */}
            <div className={`unified-ai-icon-container${isAISearching ? ' loading' : ''}`}>
              {isAISearching ? (
                <Loader2 size={16} />
              ) : (
                <Sparkles size={16} />
              )}
            </div>
            <input
              type="text"
              placeholder="Search symbols, names, or try 'largest AI companies'..."
              value={unifiedQuery}
              onChange={(e) => {
                setUnifiedQuery(e.target.value);
                handleUnifiedSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && unifiedResults.length > 0) {
                  e.preventDefault();
                  const firstResult = unifiedResults[0];
                  if (firstResult.type === 'ai') {
                    handleAISearch(firstResult.query);
                  } else if (firstResult.type === 'group') {
                    handleGroupSelect(firstResult.group);
                  } else if (firstResult.symbol) {
                    addCompany(firstResult.symbol);
                    setUnifiedQuery('');
                    setUnifiedResults([]);
                  }
                }
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              className="unified-search-input"
              disabled={isAISearching}
            />
          </div>

          {/* Search Results Dropdown */}
          {isSearchFocused && unifiedResults.length > 0 && (
            <div className="unified-search-dropdown">
              {unifiedResults.map((result, idx) => {
                if (result.type === 'group') {
                  const IconComponent = result.group.icon;
                  return (
                    <div
                      key={`group-${result.group.id}`}
                      className="search-result group-result"
                      onClick={() => handleGroupSelect(result.group)}
                    >
                      <IconComponent size={16} className="group-result-icon" />
                      <span className="group-result-text">{result.text}</span>
                      <span className="group-result-count">{result.group.symbols.length} companies</span>
                    </div>
                  );
                }
                if (result.type === 'ai') {
                  return (
                    <div
                      key="ai-search"
                      className="search-result ai-result"
                      onClick={() => handleAISearch(result.query)}
                    >
                      <Sparkles size={16} className="ai-icon" />
                      <span>{result.text}</span>
                    </div>
                  );
                }
                if (result.type === 'loading') {
                  return (
                    <div key="loading" className="search-result loading-result">
                      <Loader2 size={16} className="loading-icon" />
                      <span>{result.text}</span>
                    </div>
                  );
                }
                if (result.type === 'no-results' || result.type === 'error') {
                  return (
                    <div key={result.type} className="search-result hint-result">
                      <span>{result.text}</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={result.symbol}
                    className="search-result"
                    onClick={() => addCompany(result.symbol)}
                  >
                    <span className="result-symbol">{result.symbol}</span>
                    <span className="result-name">{result.name}</span>
                    <span className="result-sector">{result.sector}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Market Index Quick Select - Below search bar, centered */}
      {selectedCompanies.length > 0 && marketIndices.length > 0 && (
        <div className="index-selector-section">
          <span className="index-label">Compare vs:</span>
          <div className="index-buttons">
            {marketIndices.map(index => {
              const isSelected = selectedIndices.find(i => i.short_name === index.short_name);
              return (
                <button
                  key={index.short_name}
                  className={`index-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => toggleIndex(index)}
                  title={index.name}
                >
                  {index.short_name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Companies Tags */}
      {(selectedCompanies.length > 0 || selectedIndices.length > 0) && (
        <div className="selected-companies">
          {selectedCompanies.map((symbol, idx) => {
            return (
              <div
                key={symbol}
                className="company-tag"
                style={{ borderColor: COMPANY_COLORS[idx] }}
              >
                <span className="tag-color" style={{ backgroundColor: COMPANY_COLORS[idx] }} />
                <Link to={`/company/${symbol}`} className="tag-symbol">{symbol}</Link>
                <span className="tag-name">{companyData[symbol]?.company?.name}</span>
                <WatchlistButton
                  symbol={symbol}
                  name={companyData[symbol]?.company?.name}
                  sector={companyData[symbol]?.company?.sector}
                  size="small"
                />
                <button className="tag-remove" onClick={() => removeCompany(symbol)}>×</button>
              </div>
            );
          })}
          {selectedIndices.map((index, idx) => (
            <div
              key={index.short_name}
              className="company-tag index-tag"
              style={{ borderColor: '#64748b' }}
            >
              <span className="tag-color" style={{ backgroundColor: '#64748b' }} />
              <span className="tag-symbol">{index.short_name}</span>
              <span className="tag-name">{index.name}</span>
              <span className="tag-badge">Index</span>
              <button className="tag-remove" onClick={() => removeIndex(index.short_name)}>×</button>
            </div>
          ))}
        </div>
      )}

      {selectedCompanies.length > 0 && (
        <>
          {/* Controls */}
          <div className="compare-controls">
            <PeriodToggle
              value={periodType}
              onChange={setPeriodType}
              availablePeriods={[
                { period_type: 'annual', count: 1 },
                { period_type: 'quarterly', count: 1 }
              ]}
            />

            <div className="view-toggle">
              <button className={viewMode === 'overview' ? 'active' : ''} onClick={() => setViewMode('overview')}>
                Overview
              </button>
              <button className={viewMode === 'metrics' ? 'active' : ''} onClick={() => setViewMode('metrics')}>
                Metrics
              </button>
              <button className={viewMode === 'charts' ? 'active' : ''} onClick={() => setViewMode('charts')}>
                Charts
              </button>
              <button className={viewMode === 'financials' ? 'active' : ''} onClick={() => setViewMode('financials')}>
                Financials
              </button>
              <button className={viewMode === 'advanced' ? 'active' : ''} onClick={() => setViewMode('advanced')}>
                Advanced
              </button>
            </div>

            <button className="export-btn" onClick={exportToCSV}>
              Export CSV
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading comparison data...</div>
          ) : (
            <>
              {/* Currency Info Banner */}
              {currencyInfo.hasMixed && (
                <div className="currency-info-banner">
                  <span className="info-icon">$</span>
                  <div className="info-content">
                    <strong>USD Normalized</strong>
                    <span>
                      Companies report in {currencyInfo.currencies.join(', ')}. All monetary values converted to USD for comparison.
                    </span>
                  </div>
                </div>
              )}

              {/* Overview View */}
              {viewMode === 'overview' && (
                <div className="overview-section">
                  {/* Quality Score Cards - Compact horizontal layout */}
                  <div className="score-section">
                    <div className="score-header">
                      <h3>Quality Score Ranking</h3>
                      <div className="score-legend">
                        <span><strong>R</strong> ROIC</span>
                        <span><strong>M</strong> Margin</span>
                        <span><strong>D</strong> Debt</span>
                        <span><strong>F</strong> FCF Yield</span>
                      </div>
                    </div>
                    <div className="score-cards-compact">
                      {scores.map((item, idx) => {
                        const companyName = companyData[item.symbol]?.company?.name || '';
                        return (
                          <div
                            key={item.symbol}
                            className={`score-card-compact ${idx === 0 ? 'winner' : ''}`}
                            style={{ borderLeftColor: COMPANY_COLORS[selectedCompanies.indexOf(item.symbol)] }}
                          >
                            <div className="score-rank-badge">#{idx + 1}</div>
                            <div className="score-company-info">
                              <span className="score-symbol-compact">{item.symbol}</span>
                              <span className="score-name-compact">{companyName}</span>
                            </div>
                            <div className="score-details-compact">
                              <span className={`detail-badge rating-${item.details.roic?.toLowerCase().replace(/\s+/g, '-')}`} title="ROIC Quality">
                                <span className="badge-letter">R</span>
                                <span className="badge-value">{item.details.roic}</span>
                              </span>
                              <span className={`detail-badge rating-${item.details.margin?.toLowerCase().replace(/\s+/g, '-')}`} title="Margin Quality">
                                <span className="badge-letter">M</span>
                                <span className="badge-value">{item.details.margin}</span>
                              </span>
                              <span className={`detail-badge rating-${item.details.debt?.toLowerCase().replace(/\s+/g, '-')}`} title="Debt Quality">
                                <span className="badge-letter">D</span>
                                <span className="badge-value">{item.details.debt}</span>
                              </span>
                              <span className={`detail-badge rating-${item.details.fcf?.toLowerCase().replace(/\s+/g, '-')}`} title="FCF Yield Quality">
                                <span className="badge-letter">F</span>
                                <span className="badge-value">{item.details.fcf}</span>
                              </span>
                            </div>
                            <div className="score-value-compact">{item.score}</div>
                            <div className="score-bar-compact">
                              <div
                                className="score-fill-compact"
                                style={{
                                  width: `${item.score}%`,
                                  backgroundColor: COMPANY_COLORS[selectedCompanies.indexOf(item.symbol)]
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Key Metrics Summary */}
                  <div className="summary-grid">
                    <div className="summary-card">
                      <h4>Profitability (ROIC)</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={getProfitabilityData()} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" stroke="#64748b" unit="%" />
                          <YAxis dataKey="symbol" type="category" stroke="#64748b" width={60} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                            formatter={(v) => `${v.toFixed(1)}%`}
                          />
                          <Bar dataKey="roic" name="ROIC">
                            {getProfitabilityData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="summary-card">
                      <h4>Margin Comparison</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={getMarginComparisonData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="symbol" stroke="#64748b" />
                          <YAxis stroke="#64748b" unit="%" />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                            formatter={(v) => `${v.toFixed(1)}%`}
                          />
                          <Legend />
                          <Bar dataKey="grossMargin" name="Gross" fill="#059669" />
                          <Bar dataKey="operatingMargin" name="Operating" fill="#2563EB" />
                          <Bar dataKey="netMargin" name="Net" fill="#D97706" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="summary-card radar-card">
                      <h4>Quality Radar</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <RadarChart data={getRadarData()}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 11 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                          {selectedCompanies.map((symbol, idx) => (
                            <Radar
                              key={symbol}
                              name={symbol}
                              dataKey={symbol}
                              stroke={COMPANY_COLORS[idx]}
                              fill={COMPANY_COLORS[idx]}
                              fillOpacity={0.15}
                              strokeWidth={2}
                            />
                          ))}
                          <Legend />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Price Performance vs Indices */}
                  {(selectedCompanies.length > 0 || selectedIndices.length > 0) && Object.keys(companyPrices).length > 0 && (
                    <div className="performance-section">
                      <h3>
                        Price Performance (1Y)
                        {selectedIndices.length > 0 && (
                          <span className="section-subtitle"> vs {selectedIndices.map(i => i.short_name).join(', ')}</span>
                        )}
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={getPricePerformanceData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                          <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                            formatter={(v) => v !== null ? `${v.toFixed(1)}%` : '-'}
                            labelFormatter={(label) => `Date: ${label}`}
                          />
                          <Legend />
                          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                          {/* Company price lines */}
                          {selectedCompanies.map((symbol, idx) => (
                            <Line
                              key={symbol}
                              type="monotone"
                              dataKey={symbol}
                              stroke={COMPANY_COLORS[idx]}
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                            />
                          ))}
                          {/* Index price lines - dashed style */}
                          {selectedIndices.map((index) => (
                            <Line
                              key={index.short_name}
                              type="monotone"
                              dataKey={index.short_name}
                              stroke="#64748b"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              dot={false}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Quick Comparison Table */}
                  <div className="quick-table">
                    <h3>Key Metrics at a Glance</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          {selectedCompanies.map((symbol, idx) => (
                            <th key={symbol} style={{ color: COMPANY_COLORS[idx] }}>{symbol}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DEFAULT_TABLE_METRICS.map(metricKey => {
                          const metric = ALL_METRICS.find(m => m.key === metricKey);
                          if (!metric) return null;
                          const values = selectedCompanies.map(s => companyData[s]?.latestMetrics?.[metricKey]);
                          const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
                          const best = metric.higherBetter !== false
                            ? Math.max(...validValues)
                            : Math.min(...validValues);

                          const metricRowAskAI = {
                            onContextMenu: (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            },
                            'data-ask-ai': 'true'
                          };
                          return (
                            <AskAIProvider key={metricKey} value={{ type: 'metric_comparison', metric: metricKey, label: metric.label, companies: selectedCompanies }}>
                              <tr {...metricRowAskAI}>
                                <td className="metric-name" title={metric.description}>{metric.label}</td>
                                {selectedCompanies.map((symbol) => {
                                  const value = companyData[symbol]?.latestMetrics?.[metricKey];
                                  const isBest = value === best && validValues.length > 1;
                                  return (
                                    <td key={symbol} className={isBest ? 'best-value' : ''}>
                                      {formatValue(value, metric.format)}
                                    </td>
                                  );
                                })}
                              </tr>
                            </AskAIProvider>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detailed Metrics View */}
              {viewMode === 'metrics' && (
                <div className="metrics-section">
                  <div className="category-tabs">
                    <button
                      className={selectedCategory === 'all' ? 'active' : ''}
                      onClick={() => setSelectedCategory('all')}
                    >
                      All
                    </button>
                    {Object.entries(METRIC_CATEGORIES).map(([key, cat]) => (
                      <button
                        key={key}
                        className={selectedCategory === key ? 'active' : ''}
                        onClick={() => setSelectedCategory(key)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="metrics-table-wrapper">
                    <table className="metrics-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          {selectedCompanies.map((symbol, idx) => (
                            <th key={symbol} style={{ borderTopColor: COMPANY_COLORS[idx] }}>
                              {symbol}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCategory === 'all' ? (
                          Object.entries(METRIC_CATEGORIES).map(([catKey, cat]) => (
                            <>
                              <tr key={catKey} className="category-row">
                                <td colSpan={selectedCompanies.length + 1}>{cat.label}</td>
                              </tr>
                              {cat.metrics.map(metric => {
                                const values = selectedCompanies.map(s => companyData[s]?.latestMetrics?.[metric.key]);
                                const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
                                const best = metric.higherBetter !== false
                                  ? Math.max(...validValues)
                                  : Math.min(...validValues);

                                return (
                                  <AskAIProvider key={metric.key} value={{ type: 'metric_comparison', metric: metric.key, label: metric.label, companies: selectedCompanies, category: catKey }}>
                                    <tr data-ask-ai="true">
                                      <td className="metric-name" title={metric.description}>{metric.label}</td>
                                      {selectedCompanies.map((symbol) => {
                                        const value = companyData[symbol]?.latestMetrics?.[metric.key];
                                        const isBest = value === best && validValues.length > 1;
                                        return (
                                          <td key={symbol} className={isBest ? 'best-value' : ''}>
                                            {formatValue(value, metric.format)}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  </AskAIProvider>
                                );
                              })}
                            </>
                          ))
                        ) : (
                          getDisplayMetrics().map(metric => {
                            const values = selectedCompanies.map(s => companyData[s]?.latestMetrics?.[metric.key]);
                            const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
                            const best = metric.higherBetter !== false
                              ? Math.max(...validValues)
                              : Math.min(...validValues);

                            return (
                              <AskAIProvider key={metric.key} value={{ type: 'metric_comparison', metric: metric.key, label: metric.label, companies: selectedCompanies, category: selectedCategory }}>
                                <tr data-ask-ai="true">
                                  <td className="metric-name" title={metric.description}>{metric.label}</td>
                                  {selectedCompanies.map((symbol) => {
                                    const value = companyData[symbol]?.latestMetrics?.[metric.key];
                                    const isBest = value === best && validValues.length > 1;
                                    return (
                                      <td key={symbol} className={isBest ? 'best-value' : ''}>
                                        {formatValue(value, metric.format)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              </AskAIProvider>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Price Returns Comparison Table */}
                  {(selectedCompanies.length > 0 && Object.keys(companyPrices).length > 0) && (
                    <div className="metrics-table-wrapper">
                      <h4 className="subsection-title">
                        Price Returns vs Indices
                        {selectedIndices.length > 0 && (
                          <span className="section-subtitle"> ({selectedIndices.map(i => i.short_name).join(', ')})</span>
                        )}
                      </h4>
                      <table className="metrics-table price-returns-table">
                        <thead>
                          <tr>
                            <th>Period</th>
                            {selectedCompanies.map((symbol, idx) => (
                              <th key={symbol} style={{ borderTopColor: COMPANY_COLORS[idx] }}>
                                {symbol}
                              </th>
                            ))}
                            {selectedIndices.map((index) => (
                              <th key={index.short_name} style={{ borderTopColor: '#64748b' }}>
                                {index.short_name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {['1D', '1W', '1M', '3M', 'YTD', '1Y'].map(period => {
                            const periodKey = {
                              '1D': 'change_1d',
                              '1W': 'change_1w',
                              '1M': 'change_1m',
                              '3M': 'change_3m',
                              'YTD': 'change_ytd',
                              '1Y': 'change_1y'
                            }[period];

                            return (
                              <tr key={period}>
                                <td className="metric-name">{period}</td>
                                {selectedCompanies.map((symbol) => {
                                  const value = companyData[symbol]?.latestMetrics?.[periodKey];
                                  const isPositive = value > 0;
                                  const isNegative = value < 0;
                                  return (
                                    <td key={symbol} className={isPositive ? 'positive' : isNegative ? 'negative' : ''}>
                                      {value !== null && value !== undefined ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : '-'}
                                    </td>
                                  );
                                })}
                                {selectedIndices.map((index) => {
                                  // Get index returns from current price data if available
                                  const indexChange = index[periodKey.replace('change_', 'return_')];
                                  const isPositive = indexChange > 0;
                                  const isNegative = indexChange < 0;
                                  return (
                                    <td key={index.short_name} className={`index-value ${isPositive ? 'positive' : isNegative ? 'negative' : ''}`}>
                                      {indexChange !== null && indexChange !== undefined ? `${indexChange >= 0 ? '+' : ''}${indexChange.toFixed(1)}%` : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Charts View */}
              {viewMode === 'charts' && (
                <div className="charts-section">
                  <div className="chart-controls">
                    <label>Compare Metric:</label>
                    <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}>
                      {ALL_METRICS.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="charts-grid">
                    <div className="chart-card full-width" {...historicalChartAskAI}>
                      <h4>Historical {ALL_METRICS.find(m => m.key === selectedMetric)?.label} Trend</h4>
                      <ResponsiveContainer width="100%" height={350}>
                        <LineChart data={getHistoricalChartData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#64748b' }} />
                          <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                            formatter={(v) => v !== null ? `${v.toFixed(1)}%` : '-'}
                          />
                          <Legend />
                          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                          {selectedCompanies.map((symbol, idx) => (
                            <Line
                              key={symbol}
                              type="monotone"
                              dataKey={symbol}
                              stroke={COMPANY_COLORS[idx]}
                              strokeWidth={2}
                              dot={{ r: 4 }}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Price Performance Chart - Companies vs Indices */}
                    {(selectedCompanies.length > 0 || selectedIndices.length > 0) && (
                      <div className="chart-card full-width" {...priceChartAskAI}>
                        <h4>
                          Price Performance (1Y)
                          {selectedIndices.length > 0 && (
                            <span className="chart-subtitle"> vs {selectedIndices.map(i => i.short_name).join(', ')}</span>
                          )}
                        </h4>
                        <ResponsiveContainer width="100%" height={350}>
                          <LineChart data={getPricePerformanceData()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                            <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                              formatter={(v) => v !== null ? `${v.toFixed(1)}%` : '-'}
                              labelFormatter={(label) => `Date: ${label}`}
                            />
                            <Legend />
                            <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                            {/* Company price lines */}
                            {selectedCompanies.map((symbol, idx) => (
                              <Line
                                key={symbol}
                                type="monotone"
                                dataKey={symbol}
                                stroke={COMPANY_COLORS[idx]}
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                              />
                            ))}
                            {/* Index price lines - dashed style */}
                            {selectedIndices.map((index, idx) => (
                              <Line
                                key={index.short_name}
                                type="monotone"
                                dataKey={index.short_name}
                                stroke="#64748b"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Alpha Comparison Chart */}
                    {selectedCompanies.length > 0 && (
                      <div className="chart-card full-width" {...alphaChartAskAI}>
                        <h4>Alpha vs S&P 500</h4>
                        <AskAIProvider value={{ type: 'chart', label: 'Alpha Comparison', metric: 'alpha_compare', symbols: selectedCompanies }}>
                          <AlphaCompareChart symbols={selectedCompanies} height={320} />
                        </AskAIProvider>
                      </div>
                    )}

                    <div className="chart-card" {...profitabilityChartAskAI}>
                      <h4>Profitability Comparison</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={getProfitabilityData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="symbol" stroke="#64748b" />
                          <YAxis stroke="#64748b" unit="%" />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                            formatter={(v) => `${v.toFixed(1)}%`}
                          />
                          <Legend />
                          <Bar dataKey="roic" name="ROIC" fill="#2563EB" />
                          <Bar dataKey="roe" name="ROE" fill="#059669" />
                          <Bar dataKey="roa" name="ROA" fill="#D97706" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card" {...radarChartAskAI}>
                      <h4>Quality Radar</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={getRadarData()}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 11 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b' }} />
                          {selectedCompanies.map((symbol, idx) => (
                            <Radar
                              key={symbol}
                              name={symbol}
                              dataKey={symbol}
                              stroke={COMPANY_COLORS[idx]}
                              fill={COMPANY_COLORS[idx]}
                              fillOpacity={0.15}
                              strokeWidth={2}
                            />
                          ))}
                          <Legend />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* Financials View */}
              {viewMode === 'financials' && (
                <div className="financials-section">
                  <div className="charts-grid">
                    <div className="chart-card full-width" {...revenueChartAskAI}>
                      <h4>Revenue Trend (USD Billions)</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={getRevenueComparisonData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" />
                          <YAxis stroke="#64748b" unit="B" />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                            formatter={(v) => v !== null ? `$${v.toFixed(1)}B` : '-'}
                          />
                          <Legend />
                          {selectedCompanies.map((symbol, idx) => (
                            <Area
                              key={symbol}
                              type="monotone"
                              dataKey={`${symbol}_revenue`}
                              name={`${symbol} Revenue`}
                              stroke={COMPANY_COLORS[idx]}
                              fill={COMPANY_COLORS[idx]}
                              fillOpacity={0.2}
                              strokeWidth={2}
                              connectNulls
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card" {...breakdownAskAI}>
                      <h4>Latest Period Breakdown (USD)</h4>
                      <div className="breakdown-cards">
                        {selectedCompanies.map((symbol, idx) => {
                          const bd = breakdownData[symbol]?.[0];
                          if (!bd) return null;
                          // Use USD-normalized values for cross-currency comparison
                          const revenue = bd.revenue_usd ?? bd.revenue;
                          const grossProfit = bd.grossProfit_usd ?? bd.grossProfit;
                          const operatingIncome = bd.operatingIncome_usd ?? bd.operatingIncome;
                          const netIncome = bd.netIncome_usd ?? bd.netIncome;
                          return (
                            <div key={symbol} className="breakdown-card" style={{ borderColor: COMPANY_COLORS[idx] }}>
                              <div className="breakdown-header">
                                <span style={{ color: COMPANY_COLORS[idx] }}>{symbol}</span>
                                <span className="period" title={bd.period}>
                                  {bd.fiscal_label || bd.period?.substring(0, 7)}
                                </span>
                              </div>
                              <div className="breakdown-item">
                                <span>Revenue</span>
                                <span>${formatCurrencyShort(revenue)}</span>
                              </div>
                              <div className="breakdown-item">
                                <span>Gross Profit</span>
                                <span>${formatCurrencyShort(grossProfit)} ({bd.margins?.grossMargin?.toFixed(1)}%)</span>
                              </div>
                              <div className="breakdown-item">
                                <span>Operating Income</span>
                                <span>${formatCurrencyShort(operatingIncome)} ({bd.margins?.operatingMargin?.toFixed(1)}%)</span>
                              </div>
                              <div className="breakdown-item highlight">
                                <span>Net Income</span>
                                <span>${formatCurrencyShort(netIncome)} ({bd.margins?.netMargin?.toFixed(1)}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="chart-card" {...netIncomeChartAskAI}>
                      <h4>Net Income Trend (USD Billions)</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={getRevenueComparisonData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" stroke="#64748b" />
                          <YAxis stroke="#64748b" unit="B" />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '0.5rem' }}
                            formatter={(v) => v !== null ? `$${v.toFixed(1)}B` : '-'}
                          />
                          <Legend />
                          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                          {selectedCompanies.map((symbol, idx) => (
                            <Line
                              key={symbol}
                              type="monotone"
                              dataKey={`${symbol}_netIncome`}
                              name={`${symbol} Net Income`}
                              stroke={COMPANY_COLORS[idx]}
                              strokeWidth={2}
                              dot={{ r: 4 }}
                            />
                          ))}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* Advanced View */}
              {viewMode === 'advanced' && (
                <div className="advanced-section">
                  {/* Controls */}
                  <div className="advanced-controls">
                    <div className="control-group">
                      <label>Metric:</label>
                      <select value={advancedMetric} onChange={(e) => setAdvancedMetric(e.target.value)}>
                        {Object.entries(METRIC_CATEGORIES).map(([catKey, cat]) => (
                          <optgroup key={catKey} label={cat.label}>
                            {cat.metrics.map(m => (
                              <option key={m.key} value={m.key}>{m.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="control-group">
                      <label>Correlation Type:</label>
                      <div className="correlation-type-toggle">
                        {CORRELATION_TYPES.map(ct => (
                          <button
                            key={ct.value}
                            className={correlationType === ct.value ? 'active' : ''}
                            onClick={() => setCorrelationType(ct.value)}
                            title={ct.description}
                          >
                            {ct.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selectedCompanies.length < 2 ? (
                    <div className="advanced-empty">
                      <p>Select at least 2 companies to view correlation and variance analysis.</p>
                    </div>
                  ) : (
                    <div className="advanced-grid">
                      {/* Correlation Matrix */}
                      <div className="advanced-card correlation-card" {...correlationChartAskAI}>
                        <h4>
                          Correlation Matrix ({ALL_METRICS.find(m => m.key === advancedMetric)?.label})
                          <span className="card-subtitle">
                            {correlationType === 'pearson' && 'Pearson linear correlation (-1 to +1)'}
                            {correlationType === 'spearman' && 'Spearman rank correlation (-1 to +1)'}
                            {correlationType === 'mutual_info' && 'Mutual Information (0 to ∞)'}
                          </span>
                        </h4>
                        <CorrelationHeatmap
                          matrix={correlationMatrix.matrix}
                          labels={correlationMatrix.labels}
                          type={correlationType}
                        />
                      </div>

                      {/* Variance Analysis */}
                      <div className="advanced-card variance-card" {...varianceChartAskAI}>
                        <h4>
                          Variance Analysis ({ALL_METRICS.find(m => m.key === advancedMetric)?.label})
                          <span className="card-subtitle">Statistical dispersion over historical periods</span>
                        </h4>
                        <VarianceAnalysis
                          companies={selectedCompanies}
                          varianceData={varianceData}
                          metricLabel={ALL_METRICS.find(m => m.key === advancedMetric)?.label}
                          colors={COMPANY_COLORS}
                        />
                      </div>

                      {/* Scatter Plot 1 */}
                      <div className="advanced-card scatter-card" {...scatterChartAskAI}>
                        <div className="scatter-header">
                          <h4>
                            Scatter Plot 1
                            <span className="card-subtitle">Compare any two metrics</span>
                          </h4>
                          <div className="scatter-axis-selectors">
                            <div className="axis-selector">
                              <label>X:</label>
                              <select value={scatter1X} onChange={(e) => setScatter1X(e.target.value)}>
                                {Object.entries(METRIC_CATEGORIES).map(([catKey, cat]) => (
                                  <optgroup key={catKey} label={cat.label}>
                                    {cat.metrics.map(m => (
                                      <option key={m.key} value={m.key}>{m.label}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                            <div className="axis-selector">
                              <label>Y:</label>
                              <select value={scatter1Y} onChange={(e) => setScatter1Y(e.target.value)}>
                                {Object.entries(METRIC_CATEGORIES).map(([catKey, cat]) => (
                                  <optgroup key={catKey} label={cat.label}>
                                    {cat.metrics.map(m => (
                                      <option key={m.key} value={m.key}>{m.label}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                            <XAxis
                              dataKey="x"
                              type="number"
                              name={ALL_METRICS.find(m => m.key === scatter1X)?.label || scatter1X}
                              stroke="var(--text-tertiary)"
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                              label={{ value: ALL_METRICS.find(m => m.key === scatter1X)?.label || scatter1X, position: 'bottom', fill: 'var(--text-tertiary)', fontSize: 12 }}
                            />
                            <YAxis
                              dataKey="y"
                              type="number"
                              name={ALL_METRICS.find(m => m.key === scatter1Y)?.label || scatter1Y}
                              stroke="var(--text-tertiary)"
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                              label={{ value: ALL_METRICS.find(m => m.key === scatter1Y)?.label || scatter1Y, angle: -90, position: 'left', fill: 'var(--text-tertiary)', fontSize: 12 }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'var(--bg-primary)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-md)'
                              }}
                              formatter={(value) => value?.toFixed(2)}
                              labelFormatter={(_, payload) => payload[0]?.payload?.symbol || ''}
                            />
                            <Scatter data={getScatterData(scatter1X, scatter1Y)} fill="var(--brand-primary)">
                              {getScatterData(scatter1X, scatter1Y).map((entry, index) => {
                                const companyIdx = selectedCompanies.indexOf(entry.symbol);
                                return (
                                  <Cell
                                    key={index}
                                    fill={COMPANY_COLORS[companyIdx % COMPANY_COLORS.length]}
                                  />
                                );
                              })}
                            </Scatter>
                          </ScatterChart>
                        </ResponsiveContainer>
                        <div className="scatter-legend">
                          {selectedCompanies.map((symbol, idx) => (
                            <span key={symbol} className="scatter-legend-item">
                              <span className="legend-color" style={{ backgroundColor: COMPANY_COLORS[idx] }} />
                              {symbol}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Scatter Plot 2 */}
                      <div className="advanced-card scatter-card" {...scatterChartAskAI}>
                        <div className="scatter-header">
                          <h4>
                            Scatter Plot 2
                            <span className="card-subtitle">Compare any two metrics</span>
                          </h4>
                          <div className="scatter-axis-selectors">
                            <div className="axis-selector">
                              <label>X:</label>
                              <select value={scatter2X} onChange={(e) => setScatter2X(e.target.value)}>
                                {Object.entries(METRIC_CATEGORIES).map(([catKey, cat]) => (
                                  <optgroup key={catKey} label={cat.label}>
                                    {cat.metrics.map(m => (
                                      <option key={m.key} value={m.key}>{m.label}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                            <div className="axis-selector">
                              <label>Y:</label>
                              <select value={scatter2Y} onChange={(e) => setScatter2Y(e.target.value)}>
                                {Object.entries(METRIC_CATEGORIES).map(([catKey, cat]) => (
                                  <optgroup key={catKey} label={cat.label}>
                                    {cat.metrics.map(m => (
                                      <option key={m.key} value={m.key}>{m.label}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                            <XAxis
                              dataKey="x"
                              type="number"
                              name={ALL_METRICS.find(m => m.key === scatter2X)?.label || scatter2X}
                              stroke="var(--text-tertiary)"
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                              label={{ value: ALL_METRICS.find(m => m.key === scatter2X)?.label || scatter2X, position: 'bottom', fill: 'var(--text-tertiary)', fontSize: 12 }}
                            />
                            <YAxis
                              dataKey="y"
                              type="number"
                              name={ALL_METRICS.find(m => m.key === scatter2Y)?.label || scatter2Y}
                              stroke="var(--text-tertiary)"
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                              label={{ value: ALL_METRICS.find(m => m.key === scatter2Y)?.label || scatter2Y, angle: -90, position: 'left', fill: 'var(--text-tertiary)', fontSize: 12 }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'var(--bg-primary)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-md)'
                              }}
                              formatter={(value) => value?.toFixed(2)}
                              labelFormatter={(_, payload) => payload[0]?.payload?.symbol || ''}
                            />
                            <Scatter data={getScatterData(scatter2X, scatter2Y)} fill="var(--chart-ai)">
                              {getScatterData(scatter2X, scatter2Y).map((entry, index) => {
                                const companyIdx = selectedCompanies.indexOf(entry.symbol);
                                return (
                                  <Cell
                                    key={index}
                                    fill={COMPANY_COLORS[companyIdx % COMPANY_COLORS.length]}
                                  />
                                );
                              })}
                            </Scatter>
                          </ScatterChart>
                        </ResponsiveContainer>
                        <div className="scatter-legend">
                          {selectedCompanies.map((symbol, idx) => (
                            <span key={symbol} className="scatter-legend-item">
                              <span className="legend-color" style={{ backgroundColor: COMPANY_COLORS[idx] }} />
                              {symbol}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {selectedCompanies.length === 0 && (
        <div className="compare-empty-state">
          <div className="compare-hero">
            <h2>Compare Companies</h2>
            <p>Search above, or pick a group below to start comparing</p>
          </div>

          <div className="quick-start-section">
            <h3 className="quick-start-title">Quick Start</h3>
            <div className="quick-start-grid">
              {COMPANY_GROUPS.map(group => {
                const IconComponent = group.icon;
                return (
                  <div key={group.id} className="company-group-card">
                    <div className="group-header">
                      <div className="group-icon">
                        <IconComponent size={18} />
                      </div>
                      <div className="group-info">
                        <span className="group-name">{group.name}</span>
                        <span className="group-description">{group.description}</span>
                      </div>
                    </div>
                    <div className="group-symbols">
                      {group.symbols.slice(0, 5).map(symbol => (
                        <span key={symbol} className="symbol-chip">{symbol}</span>
                      ))}
                    </div>
                    <button
                      className="compare-group-btn"
                      onClick={() => addCompanyGroup(group)}
                    >
                      Compare {group.symbols.length > 5 ? 'Top 5' : 'All'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ComparePage;
