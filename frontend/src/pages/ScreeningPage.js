// frontend/src/pages/ScreeningPage.js
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { screeningAPI, companyAPI } from '../services/api';
import { WatchlistButton, PeriodToggle, ComparisonChart, SelectionActionBar } from '../components';
import { useWatchlist } from '../context/WatchlistContext';
import { AddToPortfolioButton } from '../components/portfolio';
import { NLQueryBar } from '../components/nl';
import { PageHeader } from '../components/ui';
import { SkeletonScreeningResults } from '../components/Skeleton';
import { ChevronUp, ChevronDown, Filter, Columns, X, PrismSparkle, Edit3, Table, TrendingUp, BarChart2 } from '../components/icons';
import { useFormatters } from '../hooks/useFormatters';
import { useAskAI, AskAIProvider } from '../hooks';
import FeatureGate from '../components/subscription/FeatureGate';
import './ScreeningPage.css';

// Screening result row with Ask AI support - memoized for large list performance
const ScreeningResultRow = memo(function ScreeningResultRow({
  stock, isSelectedForChart, isSelectedForBulk, resultsView, visibleColumnDefs,
  handleToggleSelect, toggleChartSelection, selectedForChart, getCellClass, formatValue
}) {
  // Build context with ALL visible column data, not just a few metrics
  const askAIProps = useAskAI(() => {
    const visibleData = {};
    visibleColumnDefs.forEach(col => {
      if (stock[col.key] !== undefined && stock[col.key] !== null) {
        visibleData[col.key] = stock[col.key];
      }
    });

    return {
      type: 'table_row',
      symbol: stock.symbol,
      companyName: stock.name,
      label: `${stock.symbol} - ${stock.name}`,
      sector: stock.sector,
      industry: stock.industry,
      visibleMetrics: visibleData,
      // Key metrics for quick reference
      keyMetrics: {
        roic: stock.roic,
        pe_ratio: stock.pe_ratio,
        revenue_growth_yoy: stock.revenue_growth_yoy,
        debt_to_equity: stock.debt_to_equity,
        fcf_yield: stock.fcf_yield
      }
    };
  });

  return (
    <tr className={isSelectedForChart || isSelectedForBulk ? 'selected-row' : ''} {...askAIProps}>
      <td className="select-col">
        <input
          type="checkbox"
          checked={isSelectedForBulk}
          onChange={() => handleToggleSelect(stock.symbol)}
        />
      </td>
      {resultsView === 'chart' && (
        <td className="select-col">
          <input
            type="checkbox"
            checked={isSelectedForChart}
            onChange={() => toggleChartSelection(stock)}
            disabled={!isSelectedForChart && selectedForChart.length >= 10}
          />
        </td>
      )}
      {visibleColumnDefs.map(col => {
        const value = stock[col.key];
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
        if (col.key === 'name') {
          return (
            <td key={col.key} className="company-name">
              {stock.symbol.startsWith('CIK_') ? '' : stock.name}
            </td>
          );
        }
        if (col.key === 'fiscal_period') {
          return (
            <td key={col.key} className="period-cell">
              {value?.substring(0, 7)}
            </td>
          );
        }
        return (
          <td key={col.key} className={getCellClass(value, col)}>
            {formatValue(value, col.format)}
          </td>
        );
      })}
      <td className="action-cell">
        <WatchlistButton
          symbol={stock.symbol}
          name={stock.name}
          sector={stock.sector}
          size="medium"
        />
      </td>
      <td className="action-cell">
        <AddToPortfolioButton
          symbol={stock.symbol}
          companyName={stock.name}
          currentPrice={stock.last_price}
        />
      </td>
    </tr>
  );
}, (prev, next) => {
  // Custom comparison: only re-render if stock data or selection state changes
  return prev.stock.symbol === next.stock.symbol &&
    prev.isSelectedForChart === next.isSelectedForChart &&
    prev.isSelectedForBulk === next.isSelectedForBulk &&
    prev.resultsView === next.resultsView &&
    prev.visibleColumnDefs === next.visibleColumnDefs;
});

// All available columns for the results table
const ALL_COLUMNS = [
  { key: 'symbol', label: 'Symbol', format: 'text', filterable: true, alwaysVisible: true },
  { key: 'name', label: 'Company', format: 'text', filterable: true },
  { key: 'sector', label: 'Sector', format: 'text', filterable: true },
  { key: 'industry', label: 'Industry', format: 'text', filterable: true },
  { key: 'country', label: 'Country', format: 'text', filterable: true },
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
  // PRISM Score (AI-generated investment quality)
  { key: 'prism_score', label: 'PRISM', format: 'prism', filterable: true, colorCode: { good: 4, bad: 2 } },
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
  },
  prism: {
    label: 'PRISM Score',
    metrics: [
      { key: 'PRISM Score', min: 'minPRISMScore', max: 'maxPRISMScore', format: 'prism', description: 'AI-generated investment quality score (1-5)' },
    ]
  }
};

// Templates storage key
const TEMPLATES_STORAGE_KEY = 'stock_screener_templates';

function ScreeningPage() {
  const fmt = useFormatters();
  const { addToWatchlist } = useWatchlist();

  // Format value for display using preferences
  // Memoized formatValue to prevent breaking React.memo on row components (Tier 3 optimization)
  const formatValue = useCallback((value, format) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    switch (format) {
      case 'percent': return fmt.percent(value, { decimals: 1 });
      case 'ratio': return fmt.ratio(value, { decimals: 2, suffix: '' });
      case 'currency': return fmt.currency(value, { compact: true, decimals: 2 });
      case 'currency_large': return fmt.currency(value, { compact: true, decimals: 1 });
      case 'number': return fmt.number(value, { compact: false, decimals: 0 });
      case 'prism': return value.toFixed(1);
      default: return fmt.number(value, { decimals: 2 });
    }
  }, [fmt]);
  const navigate = useNavigate();

  // View mode: 'presets' or 'custom'
  const [viewMode, setViewMode] = useState('presets');

  // Filter options from backend
  const [filterOptions, setFilterOptions] = useState({
    sectors: [],
    industriesBySector: {},
    availablePeriods: [],
    countries: []
  });

  // Region definitions for quick selection
  const REGIONS = [
    { key: 'US', label: 'US', flag: '🇺🇸', countries: ['US', 'USA'] },
    { key: 'UK', label: 'UK', flag: '🇬🇧', countries: ['GB', 'UK'] },
    { key: 'EU', label: 'Europe', flag: '🇪🇺', countries: ['DE', 'FR', 'NL', 'ES', 'IT', 'BE', 'AT', 'PT', 'IE', 'GR', 'LU', 'FI'] },
    { key: 'NORDIC', label: 'Nordic', flag: '🏔️', countries: ['SE', 'DK', 'NO', 'FI'] },
    { key: 'DACH', label: 'DACH', flag: '🇩🇪', countries: ['DE', 'AT', 'CH'] },
  ];

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
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedCountries, setSelectedCountries] = useState([]);
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

  // NL Screening criteria preview
  const [nlScreenCriteria, setNlScreenCriteria] = useState(null);

  // Bulk selection state for compare/watchlist/export actions
  const [selectedSymbols, setSelectedSymbols] = useState([]);

  // Table sorting state (client-side sorting of results)
  const [tableSortColumn, setTableSortColumn] = useState('roic');
  const [tableSortDirection, setTableSortDirection] = useState('desc');

  // Pagination state - render only visible rows for performance
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;

  // Column visibility state - load from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(COLUMN_PREFS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_COLUMNS;
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Column filters state (text/value filters for each column)
  const [columnFilters, setColumnFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  // URL search params for deep linking
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle URL parameters for sector filter (e.g., from Command Palette)
  // Note: runCustomScreen is defined later, so we trigger screen via state
  const [pendingSectorScreen, setPendingSectorScreen] = useState(false);

  useEffect(() => {
    const sectorParam = searchParams.get('sector');
    if (sectorParam && filterOptions.sectors.length > 0) {
      // Check if sector exists in available options
      if (filterOptions.sectors.includes(sectorParam)) {
        setSelectedSectors([sectorParam]);
        setViewMode('custom'); // Switch to custom mode to show the filter
        setPendingSectorScreen(true); // Flag to run screen after state updates
        // Clear the URL param after processing
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, filterOptions.sectors, setSearchParams]);

  // Save column preferences to localStorage
  useEffect(() => {
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Toggle column visibility - memoized to prevent re-renders
  const toggleColumn = useCallback((columnKey) => {
    const column = ALL_COLUMNS.find(c => c.key === columnKey);
    if (column?.alwaysVisible) return; // Can't hide always-visible columns

    setVisibleColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey]
    );
  }, []);

  // Get visible column definitions in order
  const visibleColumnDefs = useMemo(() => {
    return ALL_COLUMNS.filter(col => visibleColumns.includes(col.key));
  }, [visibleColumns]);

  // Update column filter - memoized
  const updateColumnFilter = useCallback((columnKey, value) => {
    setColumnFilters(prev => {
      if (!value || value === '') {
        const { [columnKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [columnKey]: value };
    });
    setCurrentPage(1); // Reset to first page when filtering
  }, []);

  // Clear all filters - memoized
  const clearAllFilters = useCallback(() => {
    setColumnFilters({});
    setCurrentPage(1);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = Object.keys(columnFilters).length > 0;

  // Handle table header click for sorting - memoized
  const handleTableSort = useCallback((column) => {
    if (tableSortColumn === column) {
      // Toggle direction if same column
      setTableSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - default to descending for most metrics, ascending for symbol/name
      setTableSortColumn(column);
      setTableSortDirection(['symbol', 'name', 'sector', 'industry'].includes(column) ? 'asc' : 'desc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  }, [tableSortColumn]);

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

  // Pagination: get only the rows for the current page
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredAndSortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [filteredAndSortedResults, currentPage, ROWS_PER_PAGE]);

  const totalPages = Math.ceil(filteredAndSortedResults.length / ROWS_PER_PAGE);

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
        regions: selectedRegions,
        countries: selectedCountries,
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
  }, [criteria, periodType, selectedSectors, selectedIndustries, selectedRegions, selectedCountries, sortBy, sortOrder, limit, historicalMode, lookbackYears, asOfDate]);

  // Auto-run screen when sector is set from URL params
  useEffect(() => {
    if (pendingSectorScreen && selectedSectors.length > 0) {
      setPendingSectorScreen(false);
      runCustomScreen();
    }
  }, [pendingSectorScreen, selectedSectors, runCustomScreen]);

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
      r.symbol || '',
      `"${(r.name || '').replace(/"/g, '""')}"`,
      r.sector || '',
      `"${(r.industry || '').replace(/"/g, '""')}"`,
      // Backend stores percentages as whole numbers (26 = 26%)
      r.roic != null ? r.roic.toFixed(2) : '',
      r.roe != null ? r.roe.toFixed(2) : '',
      r.net_margin != null ? r.net_margin.toFixed(2) : '',
      r.fcf_yield != null ? r.fcf_yield.toFixed(2) : '',
      r.pe_ratio != null ? r.pe_ratio.toFixed(2) : '',
      r.debt_to_equity != null ? r.debt_to_equity.toFixed(2) : '',
      r.fiscal_period || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const screenName = activeScreen?.replace(/\s+/g, '_') || 'screening_results';
    a.download = `${screenName}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  // Bulk selection handlers
  const handleToggleSelect = useCallback((symbol) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    const pageSymbols = paginatedResults.map(s => s.symbol);
    const allSelected = pageSymbols.every(s => selectedSymbols.includes(s));
    if (allSelected) {
      // Deselect all on current page
      setSelectedSymbols(prev => prev.filter(s => !pageSymbols.includes(s)));
    } else {
      // Select all on current page
      setSelectedSymbols(prev => [...new Set([...prev, ...pageSymbols])]);
    }
  }, [paginatedResults, selectedSymbols]);

  const handleClearSelection = useCallback(() => {
    setSelectedSymbols([]);
  }, []);

  const handleBulkAddToWatchlist = useCallback(() => {
    selectedSymbols.forEach(symbol => {
      const stock = results.find(r => r.symbol === symbol);
      if (stock) {
        addToWatchlist(stock.symbol, stock.name, stock.sector, stock.company_id);
      }
    });
    setSelectedSymbols([]);
  }, [selectedSymbols, results, addToWatchlist]);

  const handleExportSelected = useCallback(() => {
    if (selectedSymbols.length === 0) return;

    const selected = results.filter(r => selectedSymbols.includes(r.symbol));
    const headers = ['Symbol', 'Name', 'Sector', 'Industry', 'ROIC', 'ROE', 'Net Margin', 'FCF Yield', 'P/E', 'Debt/Equity', 'Period'];
    const rows = selected.map(r => [
      r.symbol || '',
      `"${(r.name || '').replace(/"/g, '""')}"`,
      r.sector || '',
      `"${(r.industry || '').replace(/"/g, '""')}"`,
      // Backend stores percentages as whole numbers (26 = 26%)
      r.roic != null ? r.roic.toFixed(2) : '',
      r.roe != null ? r.roe.toFixed(2) : '',
      r.net_margin != null ? r.net_margin.toFixed(2) : '',
      r.fcf_yield != null ? r.fcf_yield.toFixed(2) : '',
      r.pe_ratio != null ? r.pe_ratio.toFixed(2) : '',
      r.debt_to_equity != null ? r.debt_to_equity.toFixed(2) : '',
      r.fiscal_period || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const screenName = activeScreen?.replace(/\s+/g, '_') || 'selected_stocks';
    a.download = `${screenName}_selected_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSelectedSymbols([]);
  }, [selectedSymbols, results, activeScreen]);

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

  // Clear selections when results change
  useEffect(() => {
    setSelectedForChart([]);
    setChartData([]);
    setSelectedSymbols([]);
  }, [results]);

  // Handle NL screening criteria from the search bar
  const handleNLScreeningCriteria = useCallback(async (data) => {
    console.log('[ScreeningPage] NL criteria received:', data);

    // Store the NL criteria for preview banner
    setNlScreenCriteria(data);

    // Build criteria from the NL extraction
    const extractedCriteria = data.criteria || {};

    // Map extracted criteria to our criteria format
    const newCriteria = {};
    const criteriaMapping = {
      minROIC: 'minROIC', maxROIC: 'maxROIC',
      minROE: 'minROE', maxROE: 'maxROE',
      minPERatio: 'minPERatio', maxPERatio: 'maxPERatio',
      minPBRatio: 'minPBRatio', maxPBRatio: 'maxPBRatio',
      minDividendYield: 'minDividendYield', maxDividendYield: 'maxDividendYield',
      minRevenueGrowth: 'minRevenueGrowth', maxRevenueGrowth: 'maxRevenueGrowth',
      minDebtToEquity: 'minDebtToEquity', maxDebtToEquity: 'maxDebtToEquity',
      minMarketCap: 'minMarketCap', maxMarketCap: 'maxMarketCap',
      minProfitMargin: 'minNetMargin', maxProfitMargin: 'maxNetMargin',
      minFCFYield: 'minFCFYield', maxFCFYield: 'maxFCFYield',
    };

    for (const [nlKey, criteriaKey] of Object.entries(criteriaMapping)) {
      if (extractedCriteria[nlKey] !== undefined) {
        newCriteria[criteriaKey] = extractedCriteria[nlKey];
      }
    }

    // Apply extracted criteria
    setCriteria(newCriteria);

    // Apply sectors if specified
    if (extractedCriteria.sectors?.length > 0) {
      setSelectedSectors(extractedCriteria.sectors);
      setSelectedIndustries([]);
    }

    // Apply industries if specified
    if (extractedCriteria.industries?.length > 0) {
      setSelectedIndustries(extractedCriteria.industries);
    }

    // Apply regions if specified
    if (extractedCriteria.regions?.length > 0) {
      setSelectedRegions(extractedCriteria.regions);
    }

    // Apply countries if specified
    if (extractedCriteria.countries?.length > 0) {
      setSelectedCountries(extractedCriteria.countries);
    }

    // Apply sorting if specified
    if (extractedCriteria.sortBy) {
      setSortBy(extractedCriteria.sortBy);
    }
    if (extractedCriteria.sortOrder) {
      setSortOrder(extractedCriteria.sortOrder);
    }

    // Apply limit if specified
    if (extractedCriteria.limit) {
      setLimit(extractedCriteria.limit);
    }

    // Set the screen name
    setActiveScreen(data.naturalDescription || 'AI Screen');

    // Run the screen
    setLoading(true);
    try {
      const screenCriteria = {
        ...newCriteria,
        periodType,
        sectors: extractedCriteria.sectors || [],
        industries: extractedCriteria.industries || [],
        regions: extractedCriteria.regions || [],
        countries: extractedCriteria.countries || [],
        sortBy: extractedCriteria.sortBy || sortBy,
        sortOrder: extractedCriteria.sortOrder || sortOrder,
        limit: extractedCriteria.limit || limit,
      };

      const response = await screeningAPI.custom(screenCriteria);
      setResults(response.data.results);
      setTotalResults(response.data.total);
      setScreenDuration(response.data.duration);
    } catch (error) {
      console.error('NL Screening error:', error);
    } finally {
      setLoading(false);
    }
  }, [periodType, sortBy, sortOrder, limit]);

  // Clear NL criteria preview
  const clearNLCriteria = () => {
    setNlScreenCriteria(null);
  };

  // Edit NL criteria in custom screener
  const editNLCriteria = () => {
    setViewMode('custom');
    setNlScreenCriteria(null);
  };

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
          enableDirectScreen={true}
          onScreeningCriteria={handleNLScreeningCriteria}
        />
      </div>

      {/* NL Criteria Preview Banner */}
      {nlScreenCriteria && (
        <div className="nl-criteria-preview">
          <div className="preview-header">
            <PrismSparkle size={14} className="ai-sparkle" />
            <span className="preview-title">{nlScreenCriteria.naturalDescription || 'AI Screen'}</span>
          </div>
          <span className="preview-interpretation">
            {nlScreenCriteria.interpretation}
          </span>
          <div className="preview-actions">
            <button className="preview-edit-btn" onClick={editNLCriteria}>
              <Edit3 size={12} />
              Edit Criteria
            </button>
            <button className="preview-close-btn" onClick={clearNLCriteria}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {viewMode === 'presets' && (
        <div className="presets-section">
          {/* Saved Screens (User Templates) */}
          {savedTemplates.length > 0 && (
            <>
              <div className="presets-subsection-label">YOUR SAVED SCREENS</div>
              <div className="screen-buttons saved-screens">
                {savedTemplates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => loadTemplate(template)}
                    className="saved-screen-btn"
                  >
                    <span className="preset-name">{template.name}</span>
                    <small>Custom screen • {Object.keys(template.criteria || {}).length} criteria</small>
                    <button
                      className="delete-saved-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplate(template.id);
                      }}
                      title="Delete saved screen"
                    >
                      ×
                    </button>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* System Presets */}
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
        <FeatureGate
          feature="advanced_screener"
          showPreview={true}
          previewHeight="400px"
          title="Custom Screener"
          description="Build custom screens with advanced filtering across 50+ fundamental metrics, sector/industry filters, and historical lookback capabilities."
        >
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

          {/* Universe Filters Card */}
          <div className="universe-filters-card">
            <div className="universe-filters-header">
              <h4>Universe Selection</h4>
              {(selectedSectors.length > 0 || selectedRegions.length > 0 || selectedCountries.length > 0) && (
                <button
                  className="clear-universe-btn"
                  onClick={() => {
                    setSelectedSectors([]);
                    setSelectedIndustries([]);
                    setSelectedRegions([]);
                    setSelectedCountries([]);
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="universe-filters-grid">
              {/* Regions */}
              <div className="universe-filter-section">
                <label className="filter-section-label">Region</label>
                <div className="filter-chips">
                  {REGIONS.map(region => (
                    <button
                      key={region.key}
                      className={`filter-chip-btn ${selectedRegions.includes(region.key) ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedRegions(prev =>
                          prev.includes(region.key)
                            ? prev.filter(r => r !== region.key)
                            : [...prev, region.key]
                        );
                        setSelectedCountries([]);
                      }}
                      title={`${region.label}: ${region.countries.join(', ')}`}
                    >
                      <span className="chip-flag">{region.flag}</span>
                      <span className="chip-label">{region.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sectors */}
              <div className="universe-filter-section">
                <label className="filter-section-label">Sector</label>
                <div className="filter-chips">
                  {filterOptions.sectors.slice(0, 8).map(sector => (
                    <button
                      key={sector}
                      className={`filter-chip-btn ${selectedSectors.includes(sector) ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedSectors(prev =>
                          prev.includes(sector)
                            ? prev.filter(s => s !== sector)
                            : [...prev, sector]
                        );
                        setSelectedIndustries([]);
                      }}
                    >
                      {sector}
                    </button>
                  ))}
                  {filterOptions.sectors.length > 8 && (
                    <select
                      className="more-sectors-select"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedSectors(prev =>
                            prev.includes(e.target.value) ? prev : [...prev, e.target.value]
                          );
                          setSelectedIndustries([]);
                        }
                      }}
                    >
                      <option value="">More...</option>
                      {filterOptions.sectors.slice(8).map(sector => (
                        <option key={sector} value={sector}>{sector}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Countries (collapsed by default) */}
              {filterOptions.countries && filterOptions.countries.length > 0 && (
                <div className="universe-filter-section">
                  <label className="filter-section-label">
                    Country {selectedCountries.length > 0 && <span className="filter-count">({selectedCountries.length})</span>}
                  </label>
                  <select
                    multiple
                    value={selectedCountries}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions, opt => opt.value);
                      setSelectedCountries(values);
                      setSelectedRegions([]);
                    }}
                    className="country-multi-select"
                  >
                    {filterOptions.countries.map(c => (
                      <option key={c.country} value={c.country}>
                        {c.country} ({c.company_count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Industries (only if sectors selected) */}
              {selectedSectors.length > 0 && (
                <div className="universe-filter-section">
                  <label className="filter-section-label">
                    Industry {selectedIndustries.length > 0 && <span className="filter-count">({selectedIndustries.length})</span>}
                  </label>
                  <select
                    multiple
                    value={selectedIndustries}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions, opt => opt.value);
                      setSelectedIndustries(values);
                    }}
                    className="industry-multi-select"
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

            {/* Active Filters Summary */}
            {(selectedSectors.length > 0 || selectedRegions.length > 0 || selectedCountries.length > 0 || selectedIndustries.length > 0) && (
              <div className="active-filters-summary">
                {selectedRegions.map(r => {
                  const region = REGIONS.find(reg => reg.key === r);
                  return (
                    <span key={r} className="active-filter-tag region">
                      {region?.flag} {region?.label}
                      <button onClick={() => setSelectedRegions(prev => prev.filter(x => x !== r))}>×</button>
                    </span>
                  );
                })}
                {selectedCountries.map(c => (
                  <span key={c} className="active-filter-tag country">
                    {c}
                    <button onClick={() => setSelectedCountries(prev => prev.filter(x => x !== c))}>×</button>
                  </span>
                ))}
                {selectedSectors.map(s => (
                  <span key={s} className="active-filter-tag sector">
                    {s}
                    <button onClick={() => {
                      setSelectedSectors(prev => prev.filter(x => x !== s));
                      setSelectedIndustries([]);
                    }}>×</button>
                  </span>
                ))}
                {selectedIndustries.map(i => (
                  <span key={i} className="active-filter-tag industry">
                    {i}
                    <button onClick={() => setSelectedIndustries(prev => prev.filter(x => x !== i))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Criteria Builder */}
          <div className="criteria-builder" data-tour="filters">
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
        </FeatureGate>
      )}

      {/* Results Section */}
      {loading && (
        <div className="results-section">
          <div className="results-header">
            <h2>
              {activeScreen || 'Running Screen'}
              <span className="result-count">(loading...)</span>
            </h2>
          </div>
          <SkeletonScreeningResults rows={10} />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="results-section" data-tour="results">
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
                  <Table size={14} /> Table
                </button>
                <button
                  className={resultsView === 'chart' ? 'active' : ''}
                  onClick={() => setResultsView('chart')}
                >
                  <TrendingUp size={14} /> Chart
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
                <AskAIProvider value={{ type: 'chart', label: `${chartMetric.replace(/_/g, ' ')} Comparison`, metric: chartMetric, symbols: selectedForChart }}>
                  <ComparisonChart
                    series={chartData}
                    title={`${chartMetric.replace(/_/g, ' ').toUpperCase()} Comparison`}
                    height={400}
                    formatValue={(v) => chartMetric.includes('ratio') ? v?.toFixed(2) : `${v?.toFixed(1)}%`}
                    yAxisLabel={chartMetric.includes('ratio') ? '' : '%'}
                  />
                </AskAIProvider>
              )}

              {!loadingChartData && chartData.length === 0 && selectedForChart.length > 0 && (
                <div className="chart-empty">
                  <p>No historical data available for selected stocks</p>
                </div>
              )}

              {selectedForChart.length === 0 && (
                <div className="chart-placeholder">
                  <div className="placeholder-icon"><BarChart2 size={48} /></div>
                  <p>Select stocks from the table below to visualize their metrics over time</p>
                  <small>Click the checkbox next to any stock to add it to the comparison chart</small>
                </div>
              )}
            </div>
          )}

          {/* Selection Action Bar */}
          <SelectionActionBar
            selectedItems={selectedSymbols}
            onClear={handleClearSelection}
            showWatchlist={true}
            onAddToWatchlist={handleBulkAddToWatchlist}
            showExport={true}
            onExport={handleExportSelected}
          />

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
                  <th className="select-col">
                    <input
                      type="checkbox"
                      checked={paginatedResults.length > 0 && paginatedResults.every(s => selectedSymbols.includes(s.symbol))}
                      ref={el => {
                        if (el) {
                          const pageSymbols = paginatedResults.map(s => s.symbol);
                          const selectedOnPage = pageSymbols.filter(s => selectedSymbols.includes(s)).length;
                          el.indeterminate = selectedOnPage > 0 && selectedOnPage < pageSymbols.length;
                        }
                      }}
                      onChange={handleToggleSelectAll}
                      title="Select all on this page"
                    />
                  </th>
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
                  <th className="actions-col">Watchlist</th>
                  <th className="actions-col">Portfolio</th>
                </tr>
                {showFilters && (
                  <tr className="filter-row">
                    <th className="select-col"></th>
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
                    <th className="actions-col"></th>
                    <th className="actions-col"></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {paginatedResults.map(stock => (
                  <ScreeningResultRow
                    key={stock.symbol}
                    stock={stock}
                    isSelectedForChart={selectedForChart.some(s => s.symbol === stock.symbol)}
                    isSelectedForBulk={selectedSymbols.includes(stock.symbol)}
                    resultsView={resultsView}
                    visibleColumnDefs={visibleColumnDefs}
                    handleToggleSelect={handleToggleSelect}
                    toggleChartSelection={toggleChartSelection}
                    selectedForChart={selectedForChart}
                    getCellClass={getCellClass}
                    formatValue={formatValue}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages} ({filteredAndSortedResults.length} results)
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Last
              </button>
            </div>
          )}
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
