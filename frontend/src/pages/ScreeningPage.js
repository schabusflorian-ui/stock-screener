// frontend/src/pages/ScreeningPage.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { screeningAPI, companyAPI } from '../services/api';
import { WatchlistButton, PeriodToggle, ComparisonChart } from '../components';
import { NLQueryBar } from '../components/nl';
import { PageHeader, Card } from '../components/ui';
import { ChevronUp, ChevronDown, Filter, Columns, X } from 'lucide-react';
import { useFormatters } from '../hooks/useFormatters';
import './ScreeningPage.css';

// All available columns for the results table
const ALL_COLUMNS = [
  { key: 'symbol', label: 'Symbol', format: 'text', filterable: true, alwaysVisible: true },
  { key: 'name', label: 'Company', format: 'text', filterable: true },
  { key: 'sector', label: 'Sector', format: 'text', filterable: true },
  { key: 'industry', label: 'Industry', format: 'text', filterable: true },
  // Price & Market Data (from price_metrics)
  { key: 'last_price', label: 'Price', format: 'currency', filterable: true },
  { key: 'market_cap', label: 'Mkt Cap', format: 'currency_large', filterable: true },
  { key: 'enterprise_value', label: 'EV', format: 'currency_large', filterable: true },
  { key: 'beta', label: 'Beta', format: 'ratio', filterable: true, colorCode: { good: 1, bad: 2, inverse: true } },
  { key: 'change_1d', label: '1D %', format: 'percent', filterable: true, colorCode: { good: 0, bad: -5 } },
  { key: 'change_1w', label: '1W %', format: 'percent', filterable: true, colorCode: { good: 0, bad: -10 } },
  { key: 'change_1m', label: '1M %', format: 'percent', filterable: true, colorCode: { good: 0, bad: -15 } },
  { key: 'change_ytd', label: 'YTD %', format: 'percent', filterable: true, colorCode: { good: 0, bad: -20 } },
  // Alpha (vs SPY benchmark)
  { key: 'alpha_1m', label: 'Alpha 1M', format: 'percent', filterable: true, colorCode: { good: 0, bad: -10 } },
  { key: 'alpha_ytd', label: 'Alpha YTD', format: 'percent', filterable: true, colorCode: { good: 0, bad: -10 } },
  { key: 'alpha_1y', label: 'Alpha 1Y', format: 'percent', filterable: true, colorCode: { good: 0, bad: -10 } },
  // Profitability
  { key: 'roic', label: 'ROIC', format: 'percent', filterable: true, colorCode: { good: 15, bad: 5 } },
  { key: 'roe', label: 'ROE', format: 'percent', filterable: true, colorCode: { good: 15, bad: 5 } },
  { key: 'roa', label: 'ROA', format: 'percent', filterable: true, colorCode: { good: 10, bad: 2 } },
  { key: 'gross_margin', label: 'Gross Margin', format: 'percent', filterable: true, colorCode: { good: 40, bad: 20 } },
  { key: 'operating_margin', label: 'Op. Margin', format: 'percent', filterable: true, colorCode: { good: 15, bad: 5 } },
  { key: 'net_margin', label: 'Net Margin', format: 'percent', filterable: true, colorCode: { good: 15, bad: 0 } },
  // Cash Flow
  { key: 'fcf_yield', label: 'FCF Yield', format: 'percent', filterable: true, colorCode: { good: 5, bad: 0 } },
  { key: 'fcf_margin', label: 'FCF Margin', format: 'percent', filterable: true, colorCode: { good: 10, bad: 0 } },
  // Valuation
  { key: 'pe_ratio', label: 'P/E', format: 'ratio', filterable: true, colorCode: { good: 15, bad: 30, inverse: true } },
  { key: 'pb_ratio', label: 'P/B', format: 'ratio', filterable: true, colorCode: { good: 1.5, bad: 4, inverse: true } },
  { key: 'ps_ratio', label: 'P/S', format: 'ratio', filterable: true, colorCode: { good: 2, bad: 8, inverse: true } },
  { key: 'ev_ebitda', label: 'EV/EBITDA', format: 'ratio', filterable: true, colorCode: { good: 10, bad: 20, inverse: true } },
  { key: 'peg_ratio', label: 'PEG', format: 'ratio', filterable: true, colorCode: { good: 1, bad: 2, inverse: true } },
  { key: 'pegy_ratio', label: 'PEGY', format: 'ratio', filterable: true, colorCode: { good: 1, bad: 2, inverse: true } },
  // Financial Health
  { key: 'debt_to_equity', label: 'Debt/Eq', format: 'ratio', filterable: true, colorCode: { good: 0.5, bad: 2, inverse: true } },
  { key: 'debt_to_assets', label: 'Debt/Assets', format: 'ratio', filterable: true, colorCode: { good: 0.3, bad: 0.6, inverse: true } },
  { key: 'current_ratio', label: 'Current', format: 'ratio', filterable: true, colorCode: { good: 2, bad: 1 } },
  { key: 'quick_ratio', label: 'Quick', format: 'ratio', filterable: true, colorCode: { good: 1.5, bad: 0.8 } },
  { key: 'interest_coverage', label: 'Int. Coverage', format: 'ratio', filterable: true, colorCode: { good: 5, bad: 2 } },
  // Growth
  { key: 'revenue_growth_yoy', label: 'Rev Growth', format: 'percent', filterable: true, colorCode: { good: 10, bad: 0 } },
  { key: 'earnings_growth_yoy', label: 'Earn Growth', format: 'percent', filterable: true, colorCode: { good: 10, bad: 0 } },
  { key: 'fcf_growth_yoy', label: 'FCF Growth', format: 'percent', filterable: true, colorCode: { good: 10, bad: 0 } },
  // Efficiency
  { key: 'asset_turnover', label: 'Asset Turn', format: 'ratio', filterable: true, colorCode: { good: 1, bad: 0.3 } },
  // Other
  { key: 'fiscal_period', label: 'Period', format: 'date', filterable: true },
  { key: 'quality_score', label: 'Quality', format: 'number', filterable: true },
];

// Default visible columns
const DEFAULT_VISIBLE_COLUMNS = ['symbol', 'name', 'sector', 'roic', 'roe', 'net_margin', 'fcf_yield', 'pe_ratio', 'debt_to_equity', 'revenue_growth_yoy', 'fiscal_period'];

// Storage key for column preferences
const COLUMN_PREFS_KEY = 'screening_column_preferences';

// Metric definitions for the criteria builder
const METRIC_DEFINITIONS = {
  profitability: {
    label: 'Profitability',
    metrics: [
      { key: 'ROIC', min: 'minROIC', max: 'maxROIC', format: 'percent', description: 'Return on Invested Capital' },
      { key: 'ROE', min: 'minROE', max: 'maxROE', format: 'percent', description: 'Return on Equity' },
      { key: 'ROA', min: 'minROA', max: 'maxROA', format: 'percent', description: 'Return on Assets' },
    ]
  },
  margins: {
    label: 'Margins',
    metrics: [
      { key: 'Gross Margin', min: 'minGrossMargin', max: 'maxGrossMargin', format: 'percent', description: 'Gross Profit / Revenue' },
      { key: 'Operating Margin', min: 'minOperatingMargin', max: 'maxOperatingMargin', format: 'percent', description: 'Operating Income / Revenue' },
      { key: 'Net Margin', min: 'minNetMargin', max: 'maxNetMargin', format: 'percent', description: 'Net Income / Revenue' },
    ]
  },
  cashFlow: {
    label: 'Cash Flow',
    metrics: [
      { key: 'FCF Yield', min: 'minFCFYield', max: 'maxFCFYield', format: 'percent', description: 'Free Cash Flow / Market Cap' },
      { key: 'FCF Margin', min: 'minFCFMargin', max: 'maxFCFMargin', format: 'percent', description: 'Free Cash Flow / Revenue' },
    ]
  },
  valuation: {
    label: 'Valuation',
    metrics: [
      { key: 'P/E Ratio', min: 'minPERatio', max: 'maxPERatio', format: 'ratio', description: 'Price / Earnings' },
      { key: 'P/B Ratio', min: 'minPBRatio', max: 'maxPBRatio', format: 'ratio', description: 'Price / Book Value' },
      { key: 'P/S Ratio', min: 'minPSRatio', max: 'maxPSRatio', format: 'ratio', description: 'Price / Sales' },
      { key: 'EV/EBITDA', min: 'minEVEBITDA', max: 'maxEVEBITDA', format: 'ratio', description: 'Enterprise Value / EBITDA' },
      { key: 'PEG Ratio', min: 'minPEGRatio', max: 'maxPEGRatio', format: 'ratio', description: 'P/E / Earnings Growth (<1 = undervalued)' },
      { key: 'PEGY Ratio', min: 'minPEGYRatio', max: 'maxPEGYRatio', format: 'ratio', description: 'P/E / (Earnings Growth + Dividend Yield)' },
    ]
  },
  financialHealth: {
    label: 'Financial Health',
    metrics: [
      { key: 'Debt/Equity', min: 'minDebtToEquity', max: 'maxDebtToEquity', format: 'ratio', description: 'Total Debt / Equity' },
      { key: 'Debt/Assets', min: 'minDebtToAssets', max: 'maxDebtToAssets', format: 'ratio', description: 'Total Debt / Assets' },
      { key: 'Current Ratio', min: 'minCurrentRatio', max: 'maxCurrentRatio', format: 'ratio', description: 'Current Assets / Current Liabilities' },
      { key: 'Quick Ratio', min: 'minQuickRatio', max: 'maxQuickRatio', format: 'ratio', description: 'Liquid Assets / Current Liabilities' },
      { key: 'Interest Coverage', min: 'minInterestCoverage', max: 'maxInterestCoverage', format: 'ratio', description: 'EBIT / Interest Expense' },
    ]
  },
  growth: {
    label: 'Growth',
    metrics: [
      { key: 'Revenue Growth', min: 'minRevenueGrowth', max: 'maxRevenueGrowth', format: 'percent', description: 'Year-over-Year Revenue Growth' },
      { key: 'Earnings Growth', min: 'minEarningsGrowth', max: 'maxEarningsGrowth', format: 'percent', description: 'Year-over-Year Earnings Growth' },
      { key: 'FCF Growth', min: 'minFCFGrowth', max: 'maxFCFGrowth', format: 'percent', description: 'Year-over-Year FCF Growth' },
    ]
  },
  alpha: {
    label: 'Alpha (vs S&P 500)',
    metrics: [
      { key: 'Alpha 1M', min: 'minAlpha1M', max: 'maxAlpha1M', format: 'percent', description: '1 Month performance vs S&P 500' },
      { key: 'Alpha 3M', min: 'minAlpha3M', max: 'maxAlpha3M', format: 'percent', description: '3 Month performance vs S&P 500' },
      { key: 'Alpha YTD', min: 'minAlphaYTD', max: 'maxAlphaYTD', format: 'percent', description: 'Year-to-date performance vs S&P 500' },
      { key: 'Alpha 1Y', min: 'minAlpha1Y', max: 'maxAlpha1Y', format: 'percent', description: '1 Year performance vs S&P 500' },
    ]
  }
};

// Templates storage key
const TEMPLATES_STORAGE_KEY = 'stock_screener_templates';

function ScreeningPage() {
  const fmt = useFormatters();

  // Format value for display using preferences
  const formatValue = (value, format) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    switch (format) {
      case 'percent': return fmt.percent(value, { decimals: 1 });
      case 'ratio': return fmt.ratio(value, { decimals: 2, suffix: '' });
      case 'currency': return fmt.currency(value, { compact: true, decimals: 2 });
      case 'currency_large': return fmt.currency(value, { compact: true, decimals: 1 });
      case 'number': return fmt.number(value, { compact: false, decimals: 0 });
      default: return fmt.number(value, { decimals: 2 });
    }
  };
  const navigate = useNavigate();

  // View mode: 'presets' or 'custom'
  const [viewMode, setViewMode] = useState('presets');

  // Filter options from backend
  const [filterOptions, setFilterOptions] = useState({
    sectors: [],
    industriesBySector: {},
    availablePeriods: []
  });

  // Presets
  const [presets, setPresets] = useState([]);

  // Results
  const [results, setResults] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeScreen, setActiveScreen] = useState(null);
  const [screenDuration, setScreenDuration] = useState(null);

  // Custom criteria state
  const [criteria, setCriteria] = useState({});
  const [periodType, setPeriodType] = useState('annual');
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const [sortBy, setSortBy] = useState('roic');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [limit, setLimit] = useState(50);

  // Historical screening
  const [historicalMode, setHistoricalMode] = useState('current');
  const [lookbackYears, setLookbackYears] = useState(1);
  const [asOfDate, setAsOfDate] = useState('');

  // Templates
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Chart comparison state
  const [resultsView, setResultsView] = useState('table'); // 'table' or 'chart'
  const [selectedForChart, setSelectedForChart] = useState([]);
  const [chartMetric, setChartMetric] = useState('roic');
  const [chartData, setChartData] = useState([]);
  const [loadingChartData, setLoadingChartData] = useState(false);

  // Table sorting state (client-side sorting of results)
  const [tableSortColumn, setTableSortColumn] = useState('roic');
  const [tableSortDirection, setTableSortDirection] = useState('desc');

  // Column visibility state - load from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(COLUMN_PREFS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_COLUMNS;
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Column filters state (text/value filters for each column)
  const [columnFilters, setColumnFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);


  // Save column preferences to localStorage
  useEffect(() => {
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Toggle column visibility
  const toggleColumn = (columnKey) => {
    const column = ALL_COLUMNS.find(c => c.key === columnKey);
    if (column?.alwaysVisible) return; // Can't hide always-visible columns

    setVisibleColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey]
    );
  };

  // Get visible column definitions in order
  const visibleColumnDefs = useMemo(() => {
    return ALL_COLUMNS.filter(col => visibleColumns.includes(col.key));
  }, [visibleColumns]);

  // Update column filter
  const updateColumnFilter = (columnKey, value) => {
    setColumnFilters(prev => {
      if (!value || value === '') {
        const { [columnKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [columnKey]: value };
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setColumnFilters({});
  };

  // Check if any filters are active
  const hasActiveFilters = Object.keys(columnFilters).length > 0;

  // Handle table header click for sorting
  const handleTableSort = (column) => {
    if (tableSortColumn === column) {
      // Toggle direction if same column
      setTableSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - default to descending for most metrics, ascending for symbol/name
      setTableSortColumn(column);
      setTableSortDirection(['symbol', 'name', 'sector', 'industry'].includes(column) ? 'asc' : 'desc');
    }
  };

  // Filter and sort results client-side
  const filteredAndSortedResults = useMemo(() => {
    if (!results.length) return results;

    // First apply filters
    let filtered = results;
    if (hasActiveFilters) {
      filtered = results.filter(stock => {
        return Object.entries(columnFilters).every(([colKey, filterValue]) => {
          const stockValue = stock[colKey];
          if (stockValue === null || stockValue === undefined) return false;

          const column = ALL_COLUMNS.find(c => c.key === colKey);

          // Text columns: case-insensitive contains
          if (column?.format === 'text' || column?.format === 'date') {
            return String(stockValue).toLowerCase().includes(filterValue.toLowerCase());
          }

          // Numeric columns: parse filter as range (e.g., ">10", "<5", "10-20", or just "10")
          const strFilter = String(filterValue).trim();
          const numValue = parseFloat(stockValue);

          if (strFilter.startsWith('>=')) {
            return numValue >= parseFloat(strFilter.slice(2));
          } else if (strFilter.startsWith('<=')) {
            return numValue <= parseFloat(strFilter.slice(2));
          } else if (strFilter.startsWith('>')) {
            return numValue > parseFloat(strFilter.slice(1));
          } else if (strFilter.startsWith('<')) {
            return numValue < parseFloat(strFilter.slice(1));
          } else if (strFilter.includes('-') && !strFilter.startsWith('-')) {
            const [min, max] = strFilter.split('-').map(s => parseFloat(s.trim()));
            return numValue >= min && numValue <= max;
          } else {
            // Exact or contains for numeric
            return String(stockValue).includes(strFilter);
          }
        });
      });
    }

    // Then sort
    return [...filtered].sort((a, b) => {
      let aVal = a[tableSortColumn];
      let bVal = b[tableSortColumn];

      // Handle null/undefined values - push to end
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      // String comparison for text columns
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal);
        return tableSortDirection === 'asc' ? comparison : -comparison;
      }

      // Numeric comparison
      const comparison = aVal - bVal;
      return tableSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [results, tableSortColumn, tableSortDirection, columnFilters, hasActiveFilters]);

  // Helper to get cell class based on value and column color coding
  const getCellClass = (value, column) => {
    if (value === null || value === undefined || !column.colorCode) return '';
    const { good, bad, inverse } = column.colorCode;
    if (inverse) {
      if (value <= good) return 'positive';
      if (value >= bad) return 'negative';
    } else {
      if (value >= good) return 'positive';
      if (value <= bad) return 'negative';
    }
    return '';
  };

  // Load filter options and presets
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [optionsRes, presetsRes] = await Promise.all([
          screeningAPI.getOptions(),
          screeningAPI.getPresets()
        ]);
        setFilterOptions(optionsRes.data);
        setPresets(presetsRes.data.presets);
      } catch (error) {
        console.error('Error loading options:', error);
      }
    };
    loadOptions();

    // Load saved templates from localStorage
    const saved = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (saved) {
      setSavedTemplates(JSON.parse(saved));
    }
  }, []);

  // Run custom screen
  const runCustomScreen = useCallback(async () => {
    setLoading(true);
    setActiveScreen('Custom Screen');

    try {
      const screenCriteria = {
        ...criteria,
        periodType,
        sectors: selectedSectors,
        industries: selectedIndustries,
        sortBy,
        sortOrder,
        limit,
        ...(historicalMode === 'lookback' && { lookbackYears }),
        ...(historicalMode === 'date' && asOfDate && { asOfDate })
      };

      const response = await screeningAPI.custom(screenCriteria);
      setResults(response.data.results);
      setTotalResults(response.data.total);
      setScreenDuration(response.data.duration);
      setLoading(false);
    } catch (error) {
      console.error('Screening error:', error);
      setLoading(false);
    }
  }, [criteria, periodType, selectedSectors, selectedIndustries, sortBy, sortOrder, limit, historicalMode, lookbackYears, asOfDate]);

  // Run preset screen (no limit - returns all matches)
  const runPresetScreen = async (presetId, name) => {
    setLoading(true);
    setActiveScreen(name);

    try {
      let response;
      switch(presetId) {
        case 'buffett': response = await screeningAPI.buffett(); break;
        case 'value': response = await screeningAPI.value(); break;
        case 'magic': response = await screeningAPI.magic(); break;
        case 'quality': response = await screeningAPI.quality(); break;
        case 'growth': response = await screeningAPI.growth(); break;
        case 'dividend': response = await screeningAPI.dividend(); break;
        case 'fortress': response = await screeningAPI.fortress(); break;
        case 'cigarbutts': response = await screeningAPI.cigarbutts(); break;
        case 'compounders': response = await screeningAPI.compounders(); break;
        case 'flywheel': response = await screeningAPI.flywheel(); break;
        case 'forensic': response = await screeningAPI.forensic(); break;
        case 'asymmetry': response = await screeningAPI.asymmetry(); break;
        case 'moats': response = await screeningAPI.moats(); break;
        default: return;
      }

      setResults(response.data.results);
      setTotalResults(response.data.count);
      setScreenDuration(null);
      setLoading(false);
    } catch (error) {
      console.error('Screening error:', error);
      setLoading(false);
    }
  };

  // Update criteria value
  const updateCriteria = (key, value) => {
    setCriteria(prev => {
      if (value === '' || value === null) {
        const newCriteria = { ...prev };
        delete newCriteria[key];
        return newCriteria;
      }
      return { ...prev, [key]: parseFloat(value) };
    });
  };

  // Save template
  const saveTemplate = () => {
    if (!templateName.trim()) return;

    const template = {
      id: Date.now(),
      name: templateName,
      criteria,
      periodType,
      sectors: selectedSectors,
      industries: selectedIndustries,
      sortBy,
      sortOrder,
      historicalMode,
      lookbackYears,
      asOfDate
    };

    const newTemplates = [...savedTemplates, template];
    setSavedTemplates(newTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates));
    setTemplateName('');
    setShowSaveDialog(false);
  };

  // Load template
  const loadTemplate = (template) => {
    setCriteria(template.criteria || {});
    setPeriodType(template.periodType || 'annual');
    setSelectedSectors(template.sectors || []);
    setSelectedIndustries(template.industries || []);
    setSortBy(template.sortBy || 'roic');
    setSortOrder(template.sortOrder || 'DESC');
    setHistoricalMode(template.historicalMode || 'current');
    setLookbackYears(template.lookbackYears || 1);
    setAsOfDate(template.asOfDate || '');
    setViewMode('custom');
  };

  // Delete template
  const deleteTemplate = (templateId) => {
    const newTemplates = savedTemplates.filter(t => t.id !== templateId);
    setSavedTemplates(newTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates));
  };

  // Clear all criteria
  const clearCriteria = () => {
    setCriteria({});
    setSelectedSectors([]);
    setSelectedIndustries([]);
    setHistoricalMode('current');
    setLookbackYears(1);
    setAsOfDate('');
  };

  // Export results to CSV
  const exportToCSV = () => {
    if (results.length === 0) return;

    const headers = ['Symbol', 'Name', 'Sector', 'Industry', 'ROIC', 'ROE', 'Net Margin', 'FCF Yield', 'P/E', 'Debt/Equity', 'Period'];
    const rows = results.map(r => [
      r.symbol,
      `"${r.name}"`,
      r.sector,
      `"${r.industry}"`,
      r.roic?.toFixed(2),
      r.roe?.toFixed(2),
      r.net_margin?.toFixed(2),
      r.fcf_yield?.toFixed(2),
      r.pe_ratio?.toFixed(2),
      r.debt_to_equity?.toFixed(2),
      r.fiscal_period
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screen_${activeScreen?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Count active criteria
  const activeCriteriaCount = Object.keys(criteria).length +
    (selectedSectors.length > 0 ? 1 : 0) +
    (selectedIndustries.length > 0 ? 1 : 0) +
    (historicalMode !== 'current' ? 1 : 0);

  // Toggle stock selection for chart comparison
  const toggleChartSelection = (stock) => {
    setSelectedForChart(prev => {
      const exists = prev.find(s => s.symbol === stock.symbol);
      if (exists) {
        return prev.filter(s => s.symbol !== stock.symbol);
      }
      if (prev.length >= 10) {
        return prev; // Max 10 stocks for comparison
      }
      return [...prev, stock];
    });
  };

  // Load historical metrics for selected stocks
  const loadChartData = useCallback(async () => {
    if (selectedForChart.length === 0) {
      setChartData([]);
      return;
    }

    setLoadingChartData(true);
    try {
      const promises = selectedForChart.map(stock =>
        companyAPI.getMetrics(stock.symbol, { limit: 20, periodType })
      );
      const responses = await Promise.all(promises);

      const series = responses.map((res, idx) => {
        const metrics = res.data.metrics || [];
        const stock = selectedForChart[idx];

        // Convert metrics to chart format
        const data = [...metrics].reverse().map(m => ({
          time: m.fiscal_date_ending?.split('T')[0] || m.fiscal_period,
          value: m[chartMetric] ?? null
        })).filter(d => d.value !== null);

        return {
          name: stock.symbol,
          symbol: stock.symbol,
          data
        };
      });

      setChartData(series);
    } catch (error) {
      console.error('Error loading chart data:', error);
    }
    setLoadingChartData(false);
  }, [selectedForChart, chartMetric, periodType]);

  // Load chart data when selection or metric changes
  useEffect(() => {
    if (resultsView === 'chart' && selectedForChart.length > 0) {
      loadChartData();
    }
  }, [resultsView, selectedForChart, chartMetric, loadChartData]);

  // Clear chart selection when results change
  useEffect(() => {
    setSelectedForChart([]);
    setChartData([]);
  }, [results]);

  return (
    <div className="screening-page">
      <PageHeader
        title="Stock Screener"
        subtitle="Find stocks matching your investment criteria"
        actions={
          <div className="view-toggle">
            <button
              className={viewMode === 'presets' ? 'active' : ''}
              onClick={() => setViewMode('presets')}
            >
              Preset Screens
            </button>
            <button
              className={viewMode === 'custom' ? 'active' : ''}
              onClick={() => setViewMode('custom')}
            >
              Custom Screener
            </button>
          </div>
        }
      />

      {/* Natural Language Query Bar */}
      <div className="nl-query-section">
        <NLQueryBar
          placeholder="Try: 'Show me undervalued tech stocks' or 'High dividend stocks with low debt'"
          context={{ page: 'screening' }}
          onResultSelect={(symbol) => navigate(`/company/${symbol}`)}
        />
      </div>

      {/* Saved Templates Bar */}
      {savedTemplates.length > 0 && (
        <div className="templates-bar">
          <span className="templates-label">Saved:</span>
          {savedTemplates.map(template => (
            <div key={template.id} className="template-chip">
              <button onClick={() => loadTemplate(template)}>{template.name}</button>
              <span className="template-delete" onClick={() => deleteTemplate(template.id)}>×</span>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'presets' && (
        <div className="presets-section">
          <div className="screen-buttons">
            {presets.map(preset => (
              <button
                key={preset.id}
                onClick={() => runPresetScreen(preset.id, preset.name)}
                className={activeScreen === preset.name ? 'active' : ''}
              >
                <span className="preset-name">{preset.name}</span>
                <small>{preset.description}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'custom' && (
        <div className="custom-screener">
          {/* Controls Row */}
          <div className="screener-controls">
            <PeriodToggle
              value={periodType}
              onChange={setPeriodType}
              availablePeriods={[
                { period_type: 'annual', count: 1 },
                { period_type: 'quarterly', count: 1 }
              ]}
            />

            <div className="historical-toggle">
              <select
                value={historicalMode}
                onChange={(e) => setHistoricalMode(e.target.value)}
              >
                <option value="current">Current Data</option>
                <option value="lookback">Years Ago</option>
                <option value="date">As Of Date</option>
              </select>

              {historicalMode === 'lookback' && (
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={lookbackYears}
                  onChange={(e) => setLookbackYears(parseInt(e.target.value))}
                  className="lookback-input"
                />
              )}

              {historicalMode === 'date' && (
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="date-input"
                />
              )}
            </div>

            <div className="sort-controls">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="roic">Sort by ROIC</option>
                <option value="roe">Sort by ROE</option>
                <option value="net_margin">Sort by Net Margin</option>
                <option value="fcf_yield">Sort by FCF Yield</option>
                <option value="pe_ratio">Sort by P/E</option>
                <option value="debt_to_equity">Sort by Debt/Equity</option>
                <option value="revenue_growth_yoy">Sort by Revenue Growth</option>
                <option value="current_ratio">Sort by Current Ratio</option>
              </select>
              <button
                className="sort-order-btn"
                onClick={() => setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC')}
              >
                {sortOrder === 'DESC' ? '↓' : '↑'}
              </button>
            </div>

            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="limit-select"
            >
              <option value={25}>25 results</option>
              <option value={50}>50 results</option>
              <option value={100}>100 results</option>
              <option value={200}>200 results</option>
            </select>
          </div>

          {/* Filters Row */}
          <div className="filters-row">
            {/* Sector Filter */}
            <div className="filter-group">
              <label>Sectors</label>
              <select
                multiple
                value={selectedSectors}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, opt => opt.value);
                  setSelectedSectors(values);
                  setSelectedIndustries([]); // Reset industries when sectors change
                }}
                className="multi-select"
              >
                {filterOptions.sectors.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>

            {/* Industry Filter (dependent on sector) */}
            {selectedSectors.length > 0 && (
              <div className="filter-group">
                <label>Industries</label>
                <select
                  multiple
                  value={selectedIndustries}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, opt => opt.value);
                    setSelectedIndustries(values);
                  }}
                  className="multi-select"
                >
                  {selectedSectors.flatMap(sector =>
                    (filterOptions.industriesBySector[sector] || []).map(industry => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Criteria Builder */}
          <div className="criteria-builder">
            <div className="criteria-header">
              <h3>Screening Criteria {activeCriteriaCount > 0 && <span className="criteria-count">({activeCriteriaCount} active)</span>}</h3>
              <button className="clear-btn" onClick={clearCriteria}>Clear All</button>
            </div>

            <div className="criteria-categories">
              {Object.entries(METRIC_DEFINITIONS).map(([catKey, category]) => (
                <div key={catKey} className="criteria-category">
                  <h4>{category.label}</h4>
                  <div className="criteria-metrics">
                    {category.metrics.map(metric => (
                      <div key={metric.key} className="criteria-row">
                        <span className="metric-label" title={metric.description}>{metric.key}</span>
                        <div className="range-inputs">
                          <input
                            type="number"
                            placeholder="Min"
                            value={criteria[metric.min] ?? ''}
                            onChange={(e) => updateCriteria(metric.min, e.target.value)}
                            step={metric.format === 'ratio' ? '0.1' : '1'}
                          />
                          <span className="range-separator">to</span>
                          <input
                            type="number"
                            placeholder="Max"
                            value={criteria[metric.max] ?? ''}
                            onChange={(e) => updateCriteria(metric.max, e.target.value)}
                            step={metric.format === 'ratio' ? '0.1' : '1'}
                          />
                          <span className="unit">{metric.format === 'percent' ? '%' : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button className="run-screen-btn" onClick={runCustomScreen} disabled={loading}>
              {loading ? 'Screening...' : 'Run Screen'}
            </button>
            <button className="save-template-btn" onClick={() => setShowSaveDialog(true)}>
              Save as Template
            </button>
          </div>

          {/* Save Template Dialog */}
          {showSaveDialog && (
            <div className="save-dialog-overlay">
              <div className="save-dialog">
                <h4>Save Screen Template</h4>
                <input
                  type="text"
                  placeholder="Template name..."
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  autoFocus
                />
                <div className="dialog-buttons">
                  <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
                  <button onClick={saveTemplate} className="primary">Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results Section */}
      {loading && <div className="loading">Running screen...</div>}

      {!loading && results.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h2>
              {activeScreen}
              <span className="result-count">
                ({results.length}{totalResults > results.length ? ` of ${totalResults}` : ''} matches)
              </span>
              {screenDuration && <span className="duration">{screenDuration}ms</span>}
            </h2>
            <div className="results-actions">
              <div className="results-view-toggle">
                <button
                  className={resultsView === 'table' ? 'active' : ''}
                  onClick={() => setResultsView('table')}
                >
                  📋 Table
                </button>
                <button
                  className={resultsView === 'chart' ? 'active' : ''}
                  onClick={() => setResultsView('chart')}
                >
                  📈 Chart
                </button>
              </div>
              <button className="export-btn" onClick={exportToCSV}>Export CSV</button>
            </div>
          </div>

          {/* Chart View */}
          {resultsView === 'chart' && (
            <div className="chart-view-section">
              <div className="chart-controls">
                <div className="chart-metric-selector">
                  <label>Metric:</label>
                  <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)}>
                    <option value="roic">ROIC</option>
                    <option value="roe">ROE</option>
                    <option value="net_margin">Net Margin</option>
                    <option value="gross_margin">Gross Margin</option>
                    <option value="operating_margin">Operating Margin</option>
                    <option value="fcf_yield">FCF Yield</option>
                    <option value="debt_to_equity">Debt/Equity</option>
                    <option value="current_ratio">Current Ratio</option>
                    <option value="revenue_growth_yoy">Revenue Growth</option>
                  </select>
                </div>
                <span className="selection-hint">
                  {selectedForChart.length === 0
                    ? 'Select stocks from the table below to compare'
                    : `${selectedForChart.length}/10 stocks selected`}
                </span>
                {selectedForChart.length > 0 && (
                  <button
                    className="clear-selection-btn"
                    onClick={() => setSelectedForChart([])}
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {loadingChartData && (
                <div className="chart-loading">Loading chart data...</div>
              )}

              {!loadingChartData && chartData.length > 0 && (
                <ComparisonChart
                  series={chartData}
                  title={`${chartMetric.replace(/_/g, ' ').toUpperCase()} Comparison`}
                  height={400}
                  formatValue={(v) => chartMetric.includes('ratio') ? v?.toFixed(2) : `${v?.toFixed(1)}%`}
                  yAxisLabel={chartMetric.includes('ratio') ? '' : '%'}
                />
              )}

              {!loadingChartData && chartData.length === 0 && selectedForChart.length > 0 && (
                <div className="chart-empty">
                  <p>No historical data available for selected stocks</p>
                </div>
              )}

              {selectedForChart.length === 0 && (
                <div className="chart-placeholder">
                  <div className="placeholder-icon">📊</div>
                  <p>Select stocks from the table below to visualize their metrics over time</p>
                  <small>Click the checkbox next to any stock to add it to the comparison chart</small>
                </div>
              )}
            </div>
          )}

          {/* Table Controls */}
          <div className="table-controls">
            <div className="table-controls-left">
              <button
                className={`table-control-btn ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
                title="Toggle column filters"
              >
                <Filter size={16} />
                {hasActiveFilters && <span className="filter-badge">{Object.keys(columnFilters).length}</span>}
              </button>
              {hasActiveFilters && (
                <button className="clear-filters-btn" onClick={clearAllFilters}>
                  Clear filters
                </button>
              )}
              <span className="results-count">
                {hasActiveFilters
                  ? `${filteredAndSortedResults.length} of ${results.length} results`
                  : `${results.length} results`}
              </span>
            </div>
            <div className="table-controls-right">
              <div className="column-selector-wrapper">
                <button
                  className={`table-control-btn ${showColumnSelector ? 'active' : ''}`}
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  title="Select columns"
                >
                  <Columns size={16} />
                  <span>Columns</span>
                </button>
                {showColumnSelector && (
                  <div className="column-selector-dropdown">
                    <div className="column-selector-header">
                      <span>Show/Hide Columns</span>
                      <button onClick={() => setShowColumnSelector(false)}><X size={14} /></button>
                    </div>
                    <div className="column-selector-list">
                      {ALL_COLUMNS.map(col => (
                        <label key={col.key} className={`column-option ${col.alwaysVisible ? 'disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={visibleColumns.includes(col.key)}
                            onChange={() => toggleColumn(col.key)}
                            disabled={col.alwaysVisible}
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="column-selector-footer">
                      <button onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}>
                        Reset to Default
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className={`results-table ${resultsView === 'chart' ? 'with-selection' : ''}`}>
            <table>
              <thead>
                <tr>
                  {resultsView === 'chart' && <th className="select-col">Compare</th>}
                  {visibleColumnDefs.map(col => (
                    <th
                      key={col.key}
                      className="sortable"
                      onClick={() => handleTableSort(col.key)}
                    >
                      {col.label}
                      {tableSortColumn === col.key && (
                        tableSortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </th>
                  ))}
                  <th></th>
                </tr>
                {showFilters && (
                  <tr className="filter-row">
                    {resultsView === 'chart' && <th className="select-col"></th>}
                    {visibleColumnDefs.map(col => (
                      <th key={`filter-${col.key}`} className="filter-cell">
                        {col.filterable && (
                          <input
                            type="text"
                            placeholder={col.format === 'text' || col.format === 'date' ? 'Filter...' : '>10, <5, 5-20'}
                            value={columnFilters[col.key] || ''}
                            onChange={(e) => updateColumnFilter(col.key, e.target.value)}
                            className="column-filter-input"
                          />
                        )}
                      </th>
                    ))}
                    <th></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filteredAndSortedResults.map(stock => {
                  const isSelected = selectedForChart.some(s => s.symbol === stock.symbol);
                  return (
                    <tr key={stock.symbol} className={isSelected ? 'selected-row' : ''}>
                      {resultsView === 'chart' && (
                        <td className="select-col">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleChartSelection(stock)}
                            disabled={!isSelected && selectedForChart.length >= 10}
                          />
                        </td>
                      )}
                      {visibleColumnDefs.map(col => {
                        const value = stock[col.key];

                        // Special rendering for symbol column
                        if (col.key === 'symbol') {
                          return (
                            <td key={col.key}>
                              <Link to={`/company/${stock.symbol}`} className="symbol-link">
                                {stock.symbol.startsWith('CIK_') ? stock.name?.split(' ').slice(0, 3).join(' ') || stock.symbol : stock.symbol}
                              </Link>
                              {stock.symbol.startsWith('CIK_') && (
                                <span className="cik-badge">{stock.symbol.replace('CIK_', '')}</span>
                              )}
                            </td>
                          );
                        }

                        // Special rendering for company name
                        if (col.key === 'name') {
                          return (
                            <td key={col.key} className="company-name">
                              {stock.symbol.startsWith('CIK_') ? '' : stock.name}
                            </td>
                          );
                        }

                        // Special rendering for fiscal period
                        if (col.key === 'fiscal_period') {
                          return (
                            <td key={col.key} className="period-cell">
                              {value?.substring(0, 7)}
                            </td>
                          );
                        }

                        // Standard rendering for other columns
                        return (
                          <td key={col.key} className={getCellClass(value, col)}>
                            {formatValue(value, col.format)}
                          </td>
                        );
                      })}
                      <td>
                        <WatchlistButton
                          symbol={stock.symbol}
                          name={stock.name}
                          sector={stock.sector}
                          size="small"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && results.length === 0 && activeScreen && (
        <div className="no-results">
          <p>No stocks match your criteria. Try adjusting the filters.</p>
        </div>
      )}
    </div>
  );
}

export default ScreeningPage;
