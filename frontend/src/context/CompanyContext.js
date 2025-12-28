import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { companyAPI, trendsAPI, pricesAPI } from '../services/api';

/**
 * CompanyContext - Manages state for company detail pages
 * Centralizes data fetching and state for CompanyPage and its sub-components
 */

const CompanyContext = createContext(null);

export function CompanyProvider({ symbol, children }) {
  // Core company data
  const [company, setCompany] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [trends, setTrends] = useState(null);
  const [priceData, setPriceData] = useState(null);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [periodType, setPeriodType] = useState('annual');
  const [mainTab, setMainTab] = useState('overview');
  const [financialTab, setFinancialTab] = useState('income');
  const [analysisSection, setAnalysisSection] = useState('quality');
  const [sentimentView, setSentimentView] = useState('combined');

  // Available periods from API
  const [availablePeriods, setAvailablePeriods] = useState([]);

  // Load core company data
  useEffect(() => {
    if (!symbol) return;

    const loadCompanyData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [companyRes, trendsRes] = await Promise.all([
          companyAPI.getOne(symbol),
          trendsAPI.getCompanyTrend(symbol).catch(() => ({ data: null }))
        ]);

        setCompany(companyRes.data);
        setTrends(trendsRes.data);

        // Load price data separately (non-blocking)
        pricesAPI.getMetrics(symbol)
          .then(res => {
            if (res.data.success && res.data.data) {
              setPriceData(res.data.data);
            }
          })
          .catch(() => {});

      } catch (err) {
        setError(err.message || 'Failed to load company data');
      } finally {
        setLoading(false);
      }
    };

    loadCompanyData();
  }, [symbol]);

  // Load metrics when period type changes
  useEffect(() => {
    if (!symbol) return;

    const loadMetrics = async () => {
      try {
        const metricsRes = await companyAPI.getMetrics(symbol, {
          limit: 20,
          periodType
        });
        setMetrics(metricsRes.data.metrics || []);
        setAvailablePeriods(metricsRes.data.available_periods || []);
      } catch (err) {
        console.error('Error loading metrics:', err);
      }
    };

    loadMetrics();
  }, [symbol, periodType]);

  // Get latest metrics
  const latestMetrics = useMemo(() => {
    if (!metrics || metrics.length === 0) return null;
    return metrics[0];
  }, [metrics]);

  // Refresh company data
  const refresh = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    try {
      const [companyRes, metricsRes] = await Promise.all([
        companyAPI.getOne(symbol),
        companyAPI.getMetrics(symbol, { limit: 20, periodType })
      ]);

      setCompany(companyRes.data);
      setMetrics(metricsRes.data.metrics || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, periodType]);

  // Memoized context value
  const value = useMemo(() => ({
    // Core data
    symbol,
    company,
    metrics,
    latestMetrics,
    trends,
    priceData,
    availablePeriods,

    // Status
    loading,
    error,

    // UI state
    periodType,
    mainTab,
    financialTab,
    analysisSection,
    sentimentView,

    // UI setters
    setPeriodType,
    setMainTab,
    setFinancialTab,
    setAnalysisSection,
    setSentimentView,

    // Actions
    refresh
  }), [
    symbol,
    company,
    metrics,
    latestMetrics,
    trends,
    priceData,
    availablePeriods,
    loading,
    error,
    periodType,
    mainTab,
    financialTab,
    analysisSection,
    sentimentView,
    refresh
  ]);

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

CompanyProvider.propTypes = {
  symbol: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired
};

// Custom hook to use company context
export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}

export default CompanyContext;
