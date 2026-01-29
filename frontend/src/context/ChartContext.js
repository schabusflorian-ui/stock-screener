import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

/**
 * ChartContext - Manages state for chart comparisons and selections
 * Used by AdvancedChartsPage, ComparePage, and chart components
 */

const ChartContext = createContext(null);

// Default metrics for charts
const DEFAULT_METRICS = ['roic', 'roe', 'net_margin'];

// Chart colors for consistent styling (Prism Design System palette)
const CHART_COLORS = [
  '#2563EB', '#059669', '#7C3AED', '#D97706', '#0891B2',
  '#DC2626', '#2563EB', '#059669', '#7C3AED', '#D97706'
];

export function ChartProvider({ children }) {
  // Selected companies for comparison
  const [selectedCompanies, setSelectedCompanies] = useState([]);

  // Selected metrics to display
  const [selectedMetrics, setSelectedMetrics] = useState(DEFAULT_METRICS);

  // Time period for data
  const [periodType, setPeriodType] = useState('annual');

  // Time range for price charts
  const [timeRange, setTimeRange] = useState('1y');

  // Chart normalization mode
  const [normalization, setNormalization] = useState('absolute');

  // Price data cache
  const [priceDataCache, setPriceDataCache] = useState({});

  // Add a company to selection
  const addCompany = useCallback((company) => {
    setSelectedCompanies(prev => {
      if (prev.find(c => c.symbol === company.symbol)) return prev;
      if (prev.length >= 10) return prev; // Max 10 companies
      return [...prev, { ...company, color: CHART_COLORS[prev.length % CHART_COLORS.length] }];
    });
  }, []);

  // Remove a company from selection
  const removeCompany = useCallback((symbol) => {
    setSelectedCompanies(prev => prev.filter(c => c.symbol !== symbol));
  }, []);

  // Clear all selected companies
  const clearCompanies = useCallback(() => {
    setSelectedCompanies([]);
  }, []);

  // Toggle a metric
  const toggleMetric = useCallback((metric) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.filter(m => m !== metric);
      }
      return [...prev, metric];
    });
  }, []);

  // Set metrics directly
  const setMetrics = useCallback((metrics) => {
    setSelectedMetrics(metrics);
  }, []);

  // Cache price data for a symbol
  const cachePriceData = useCallback((symbol, data) => {
    setPriceDataCache(prev => ({
      ...prev,
      [symbol]: { data, timestamp: Date.now() }
    }));
  }, []);

  // Get cached price data if fresh (5 min TTL)
  const getCachedPriceData = useCallback((symbol) => {
    const cached = priceDataCache[symbol];
    if (!cached) return null;
    if (Date.now() - cached.timestamp > 5 * 60 * 1000) return null;
    return cached.data;
  }, [priceDataCache]);

  // Memoized context value
  const value = useMemo(() => ({
    // State
    selectedCompanies,
    selectedMetrics,
    periodType,
    timeRange,
    normalization,

    // Company actions
    addCompany,
    removeCompany,
    clearCompanies,

    // Metric actions
    toggleMetric,
    setMetrics,

    // Period/range actions
    setPeriodType,
    setTimeRange,
    setNormalization,

    // Price data cache
    cachePriceData,
    getCachedPriceData,

    // Constants
    CHART_COLORS
  }), [
    selectedCompanies,
    selectedMetrics,
    periodType,
    timeRange,
    normalization,
    addCompany,
    removeCompany,
    clearCompanies,
    toggleMetric,
    setMetrics,
    cachePriceData,
    getCachedPriceData
  ]);

  return (
    <ChartContext.Provider value={value}>
      {children}
    </ChartContext.Provider>
  );
}

ChartProvider.propTypes = {
  children: PropTypes.node.isRequired
};

// Custom hook to use chart context
export function useChart() {
  const context = useContext(ChartContext);
  if (!context) {
    throw new Error('useChart must be used within a ChartProvider');
  }
  return context;
}

export default ChartContext;
