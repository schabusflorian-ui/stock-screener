import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { companyAPI, pricesAPI, indicesAPI } from '../services/api';
import { NLQueryBar } from '../components/nl';
import { PageHeader } from '../components/ui';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, ComposedChart, Cell, ReferenceLine
} from 'recharts';
import { PeriodToggle, WatchlistButton, AlphaCompareChart } from '../components';
import { useFormatters } from '../hooks/useFormatters';
import './ComparePage.css';

// Import from unified metrics configuration
import {
  getComparePageCategories,
  DEFAULT_COMPARE_METRICS,
  RADAR_METRICS,
  formatMetricValue
} from '../config/metrics';

// Get metrics from unified config
const METRIC_CATEGORIES = getComparePageCategories();

// Flatten all metrics for easy lookup
const ALL_METRICS = Object.values(METRIC_CATEGORIES).flatMap(cat => cat.metrics);

// Default metrics for table view
const DEFAULT_TABLE_METRICS = DEFAULT_COMPARE_METRICS;

const COMPANY_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

function ComparePage() {
  const fmt = useFormatters();

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
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [companyData, setCompanyData] = useState({});
  const [breakdownData, setBreakdownData] = useState({});
  const [priceData, setPriceData] = useState({});
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

  // Load market indices
  useEffect(() => {
    const loadIndices = async () => {
      try {
        const response = await indicesAPI.getAll();
        setMarketIndices(response.data?.data || []);
      } catch (error) {
        console.error('Error loading market indices:', error);
      }
    };
    loadIndices();
  }, []);

  // Search companies
  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    const query = searchQuery.toUpperCase();
    const results = allCompanies
      .filter(c =>
        c.symbol.toUpperCase().includes(query) ||
        c.name?.toUpperCase().includes(query)
      )
      .filter(c => !selectedCompanies.includes(c.symbol))
      .slice(0, 10);
    setSearchResults(results);
  }, [searchQuery, allCompanies, selectedCompanies]);

  // Load data for selected companies
  const loadCompanyData = useCallback(async (symbol) => {
    try {
      const [companyRes, metricsRes, breakdownRes, priceMetricsRes] = await Promise.all([
        companyAPI.getOne(symbol),
        companyAPI.getMetrics(symbol, { limit: 10, periodType }),
        companyAPI.getBreakdown(symbol, { limit: 5, periodType }),
        pricesAPI.getMetrics(symbol).catch(() => ({ data: null }))
      ]);

      // Parse price metrics
      const pm = priceMetricsRes.data;
      const priceMetrics = pm ? {
        current_price: pm.current_price,
        change_1d: pm.change_1d,
        change_1w: pm.change_1w,
        change_1m: pm.change_1m,
        change_3m: pm.change_3m,
        change_ytd: pm.change_ytd,
        change_1y: pm.change_1y,
        high_52w: pm.high_52w,
        low_52w: pm.low_52w,
        from_52w_high: pm.current_price && pm.high_52w ? ((pm.current_price - pm.high_52w) / pm.high_52w * 100) : null
      } : {};

      return {
        company: companyRes.data.company,
        latestMetrics: { ...companyRes.data.latest_metrics, ...priceMetrics },
        historicalMetrics: metricsRes.data.metrics,
        breakdown: breakdownRes.data.breakdown,
        fiscalYearEnd: metricsRes.data.fiscal_year_end,
        priceMetrics
      };
    } catch (error) {
      console.error(`Error loading data for ${symbol}:`, error);
      return null;
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
        if (data) {
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

  const addCompany = async (symbol) => {
    if (selectedCompanies.length >= 5) {
      alert('Maximum 5 companies can be compared');
      return;
    }
    if (selectedCompanies.includes(symbol)) return;

    setLoading(true);
    setSelectedCompanies(prev => [...prev, symbol]);
    setSearchQuery('');
    setSearchResults([]);

    const [data, priceRes] = await Promise.all([
      loadCompanyData(symbol),
      pricesAPI.get(symbol, { period: '1y' }).catch(() => ({ data: null }))
    ]);

    if (data) {
      setCompanyData(prev => ({ ...prev, [symbol]: data }));
      setBreakdownData(prev => ({ ...prev, [symbol]: data.breakdown }));
    }
    if (priceRes.data?.prices) {
      setCompanyPrices(prev => ({
        ...prev,
        [symbol]: priceRes.data.prices.map(p => ({ date: p.date, close: p.close }))
      }));
    }
    setLoading(false);
  };

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
      // Load price data for this index
      try {
        const priceRes = await indicesAPI.getPrices(symbol, '1y');
        const prices = priceRes.data?.data || [];
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

  // Revenue comparison chart data
  const getRevenueComparisonData = () => {
    const allDates = new Set();
    selectedCompanies.forEach(symbol => {
      breakdownData[symbol]?.forEach(b => {
        allDates.add(b.period);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    return sortedDates.map(date => {
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
        point[`${symbol}_revenue`] = bd?.revenue ? bd.revenue / 1e9 : null;
        point[`${symbol}_netIncome`] = bd?.netIncome ? bd.netIncome / 1e9 : null;
      });
      return point;
    });
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

      {/* Natural Language Query Bar */}
      <div className="nl-query-section">
        <NLQueryBar
          placeholder="Try: 'Compare AAPL to MSFT' or 'Find stocks similar to NVDA'..."
          context={{ page: 'compare', symbols: selectedCompanies }}
          onResultSelect={(symbol) => navigate(`/company/${symbol}`)}
        />
      </div>

      {/* Company Search */}
      <div className="company-search">
        <div className="search-input-wrapper">
          <input
            type="text"
            placeholder="Search by ticker or company name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map(company => (
                <div
                  key={company.symbol}
                  className="search-result"
                  onClick={() => addCompany(company.symbol)}
                >
                  <span className="result-symbol">{company.symbol}</span>
                  <span className="result-name">{company.name}</span>
                  <span className="result-sector">{company.sector}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Market Index Quick Select */}
        {marketIndices.length > 0 && (
          <div className="index-selector">
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
      </div>

      {/* Selected Companies Tags */}
      {(selectedCompanies.length > 0 || selectedIndices.length > 0) && (
        <div className="selected-companies">
          {selectedCompanies.map((symbol, idx) => {
            const fye = companyData[symbol]?.fiscalYearEnd;
            return (
              <div
                key={symbol}
                className="company-tag"
                style={{ borderColor: COMPANY_COLORS[idx] }}
              >
                <span className="tag-color" style={{ backgroundColor: COMPANY_COLORS[idx] }} />
                <Link to={`/company/${symbol}`} className="tag-symbol">{symbol}</Link>
                <span className="tag-name">{companyData[symbol]?.company?.name}</span>
                {fye?.monthName && (
                  <span className="tag-fiscal" title={`Fiscal year ends ${fye.monthName} ${fye.day}`}>
                    FYE: {fye.monthName?.substring(0, 3)}
                  </span>
                )}
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
            </div>

            <button className="export-btn" onClick={exportToCSV}>
              Export CSV
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading comparison data...</div>
          ) : (
            <>
              {/* Overview View */}
              {viewMode === 'overview' && (
                <div className="overview-section">
                  {/* Quality Score Cards */}
                  <div className="score-section">
                    <h3>Quality Score Ranking</h3>
                    <div className="score-cards">
                      {scores.map((item, idx) => (
                        <div
                          key={item.symbol}
                          className={`score-card ${idx === 0 ? 'winner' : ''}`}
                          style={{ borderColor: COMPANY_COLORS[selectedCompanies.indexOf(item.symbol)] }}
                        >
                          <div className="score-rank">#{idx + 1}</div>
                          <div className="score-symbol">{item.symbol}</div>
                          <div className="score-value">{item.score}/100</div>
                          <div className="score-bar">
                            <div
                              className="score-fill"
                              style={{
                                width: `${item.score}%`,
                                backgroundColor: COMPANY_COLORS[selectedCompanies.indexOf(item.symbol)]
                              }}
                            />
                          </div>
                          <div className="score-details">
                            <span title="ROIC">R: {item.details.roic}</span>
                            <span title="Margin">M: {item.details.margin}</span>
                            <span title="Debt">D: {item.details.debt}</span>
                            <span title="FCF">F: {item.details.fcf}</span>
                          </div>
                        </div>
                      ))}
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
                          <Bar dataKey="grossMargin" name="Gross" fill="#10b981" />
                          <Bar dataKey="operatingMargin" name="Operating" fill="#8b5cf6" />
                          <Bar dataKey="netMargin" name="Net" fill="#3b82f6" />
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

                          return (
                            <tr key={metricKey}>
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
                                  <tr key={metric.key}>
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
                              <tr key={metric.key}>
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
                    <div className="chart-card full-width">
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
                      <div className="chart-card full-width">
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
                      <div className="chart-card full-width">
                        <h4>Alpha vs S&P 500</h4>
                        <AlphaCompareChart symbols={selectedCompanies} height={320} />
                      </div>
                    )}

                    <div className="chart-card">
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
                          <Bar dataKey="roic" name="ROIC" fill="#8b5cf6" />
                          <Bar dataKey="roe" name="ROE" fill="#10b981" />
                          <Bar dataKey="roa" name="ROA" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card">
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
                    <div className="chart-card full-width">
                      <h4>Revenue Trend (in Billions)</h4>
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
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card">
                      <h4>Latest Period Breakdown</h4>
                      <div className="breakdown-cards">
                        {selectedCompanies.map((symbol, idx) => {
                          const bd = breakdownData[symbol]?.[0];
                          if (!bd) return null;
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
                                <span>${formatCurrencyShort(bd.revenue)}</span>
                              </div>
                              <div className="breakdown-item">
                                <span>Gross Profit</span>
                                <span>${formatCurrencyShort(bd.grossProfit)} ({bd.margins?.grossMargin?.toFixed(1)}%)</span>
                              </div>
                              <div className="breakdown-item">
                                <span>Operating Income</span>
                                <span>${formatCurrencyShort(bd.operatingIncome)} ({bd.margins?.operatingMargin?.toFixed(1)}%)</span>
                              </div>
                              <div className="breakdown-item highlight">
                                <span>Net Income</span>
                                <span>${formatCurrencyShort(bd.netIncome)} ({bd.margins?.netMargin?.toFixed(1)}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="chart-card">
                      <h4>Net Income Trend (in Billions)</h4>
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
            </>
          )}
        </>
      )}

      {selectedCompanies.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>Start Comparing</h3>
          <p>Search for companies above to start comparing their metrics</p>
          <div className="suggestions">
            <span>Try comparing:</span>
            <div className="suggestion-groups">
              <div className="suggestion-group">
                <span className="group-label">Mag 7</span>
                <div className="suggestion-buttons">
                  <button onClick={() => addCompany('AAPL')}>AAPL</button>
                  <button onClick={() => addCompany('MSFT')}>MSFT</button>
                  <button onClick={() => addCompany('GOOGL')}>GOOGL</button>
                  <button onClick={() => addCompany('AMZN')}>AMZN</button>
                  <button onClick={() => addCompany('NVDA')}>NVDA</button>
                  <button onClick={() => addCompany('META')}>META</button>
                  <button onClick={() => addCompany('TSLA')}>TSLA</button>
                </div>
              </div>
              <div className="suggestion-group">
                <span className="group-label">Banks</span>
                <div className="suggestion-buttons">
                  <button onClick={() => addCompany('JPM')}>JPM</button>
                  <button onClick={() => addCompany('BAC')}>BAC</button>
                  <button onClick={() => addCompany('GS')}>GS</button>
                  <button onClick={() => addCompany('MS')}>MS</button>
                </div>
              </div>
              <div className="suggestion-group">
                <span className="group-label">Pharma</span>
                <div className="suggestion-buttons">
                  <button onClick={() => addCompany('JNJ')}>JNJ</button>
                  <button onClick={() => addCompany('PFE')}>PFE</button>
                  <button onClick={() => addCompany('MRK')}>MRK</button>
                  <button onClick={() => addCompany('LLY')}>LLY</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ComparePage;
