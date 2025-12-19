import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { companyAPI, pricesAPI } from '../services/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, ComposedChart, Cell, ReferenceLine
} from 'recharts';
import { PeriodToggle, WatchlistButton } from '../components';
import './ComparePage.css';

// Organized metrics by category
const METRIC_CATEGORIES = {
  profitability: {
    label: 'Profitability',
    metrics: [
      { key: 'roic', label: 'ROIC', format: 'percent', description: 'Return on Invested Capital', higherBetter: true },
      { key: 'roe', label: 'ROE', format: 'percent', description: 'Return on Equity', higherBetter: true },
      { key: 'roa', label: 'ROA', format: 'percent', description: 'Return on Assets', higherBetter: true },
    ]
  },
  margins: {
    label: 'Margins',
    metrics: [
      { key: 'gross_margin', label: 'Gross Margin', format: 'percent', description: 'Gross Profit / Revenue', higherBetter: true },
      { key: 'operating_margin', label: 'Operating Margin', format: 'percent', description: 'Operating Income / Revenue', higherBetter: true },
      { key: 'net_margin', label: 'Net Margin', format: 'percent', description: 'Net Income / Revenue', higherBetter: true },
    ]
  },
  cashFlow: {
    label: 'Cash Flow',
    metrics: [
      { key: 'fcf_yield', label: 'FCF Yield', format: 'percent', description: 'Free Cash Flow / Market Cap', higherBetter: true },
      { key: 'fcf_margin', label: 'FCF Margin', format: 'percent', description: 'FCF / Revenue', higherBetter: true },
    ]
  },
  valuation: {
    label: 'Valuation',
    metrics: [
      { key: 'pe_ratio', label: 'P/E Ratio', format: 'ratio', description: 'Price / Earnings', higherBetter: false },
      { key: 'pb_ratio', label: 'P/B Ratio', format: 'ratio', description: 'Price / Book Value', higherBetter: false },
      { key: 'ps_ratio', label: 'P/S Ratio', format: 'ratio', description: 'Price / Sales', higherBetter: false },
      { key: 'ev_ebitda', label: 'EV/EBITDA', format: 'ratio', description: 'Enterprise Value / EBITDA', higherBetter: false },
    ]
  },
  financialHealth: {
    label: 'Financial Health',
    metrics: [
      { key: 'debt_to_equity', label: 'Debt/Equity', format: 'ratio', description: 'Total Debt / Equity', higherBetter: false },
      { key: 'debt_to_assets', label: 'Debt/Assets', format: 'ratio', description: 'Total Debt / Assets', higherBetter: false },
      { key: 'current_ratio', label: 'Current Ratio', format: 'ratio', description: 'Current Assets / Liabilities', higherBetter: true },
      { key: 'quick_ratio', label: 'Quick Ratio', format: 'ratio', description: 'Liquid Assets / Liabilities', higherBetter: true },
      { key: 'interest_coverage', label: 'Interest Coverage', format: 'ratio', description: 'EBIT / Interest Expense', higherBetter: true },
    ]
  },
  growth: {
    label: 'Growth',
    metrics: [
      { key: 'revenue_growth_yoy', label: 'Revenue Growth', format: 'percent', description: 'YoY Revenue Growth', higherBetter: true },
      { key: 'earnings_growth_yoy', label: 'Earnings Growth', format: 'percent', description: 'YoY Earnings Growth', higherBetter: true },
      { key: 'fcf_growth_yoy', label: 'FCF Growth', format: 'percent', description: 'YoY FCF Growth', higherBetter: true },
    ]
  },
  efficiency: {
    label: 'Efficiency',
    metrics: [
      { key: 'asset_turnover', label: 'Asset Turnover', format: 'ratio', description: 'Revenue / Assets', higherBetter: true },
    ]
  },
  price: {
    label: 'Price Performance',
    metrics: [
      { key: 'current_price', label: 'Current Price', format: 'currency_price', description: 'Latest stock price', higherBetter: null },
      { key: 'change_1d', label: '1D Change', format: 'percent', description: '1 day price change', higherBetter: true },
      { key: 'change_1w', label: '1W Change', format: 'percent', description: '1 week price change', higherBetter: true },
      { key: 'change_1m', label: '1M Change', format: 'percent', description: '1 month price change', higherBetter: true },
      { key: 'change_3m', label: '3M Change', format: 'percent', description: '3 month price change', higherBetter: true },
      { key: 'change_ytd', label: 'YTD Change', format: 'percent', description: 'Year-to-date price change', higherBetter: true },
      { key: 'change_1y', label: '1Y Change', format: 'percent', description: '1 year price change', higherBetter: true },
      { key: 'high_52w', label: '52W High', format: 'currency_price', description: '52 week high', higherBetter: null },
      { key: 'low_52w', label: '52W Low', format: 'currency_price', description: '52 week low', higherBetter: null },
      { key: 'from_52w_high', label: 'From 52W High', format: 'percent', description: 'Distance from 52 week high', higherBetter: false },
    ]
  }
};

// Flatten all metrics for easy lookup
const ALL_METRICS = Object.values(METRIC_CATEGORIES).flatMap(cat => cat.metrics);

// Default metrics for different views
const DEFAULT_TABLE_METRICS = ['roic', 'roe', 'gross_margin', 'net_margin', 'fcf_yield', 'debt_to_equity', 'current_ratio', 'revenue_growth_yoy'];
const RADAR_METRICS = ['roic', 'roe', 'gross_margin', 'net_margin', 'fcf_yield', 'current_ratio'];

const COMPANY_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

const formatValue = (value, format) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  switch (format) {
    case 'percent': return `${value.toFixed(1)}%`;
    case 'ratio': return value.toFixed(2);
    case 'currency':
      if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toFixed(0)}`;
    case 'currency_price': return `$${value.toFixed(2)}`;
    default: return value.toFixed(2);
  }
};

const formatCurrencyShort = (value) => {
  if (value === null || value === undefined) return '-';
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return value.toFixed(0);
};

function ComparePage() {
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

    const data = await loadCompanyData(symbol);
    if (data) {
      setCompanyData(prev => ({ ...prev, [symbol]: data }));
      setBreakdownData(prev => ({ ...prev, [symbol]: data.breakdown }));
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
      <div className="compare-header">
        <h1>Company Comparison</h1>
        <p>Compare up to 5 companies with detailed metrics and analysis</p>
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
      </div>

      {/* Selected Companies Tags */}
      {selectedCompanies.length > 0 && (
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis type="number" stroke="#94a3b8" unit="%" />
                          <YAxis dataKey="symbol" type="category" stroke="#94a3b8" width={60} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="symbol" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" unit="%" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
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
                          <PolarGrid stroke="#334155" />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                          <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem' }}
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

                    <div className="chart-card">
                      <h4>Profitability Comparison</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={getProfitabilityData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="symbol" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" unit="%" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
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
                          <PolarGrid stroke="#334155" />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="date" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" unit="B" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="date" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" unit="B" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
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
                <span className="group-label">Tech Giants</span>
                <div className="suggestion-buttons">
                  <button onClick={() => addCompany('AAPL')}>AAPL</button>
                  <button onClick={() => addCompany('MSFT')}>MSFT</button>
                  <button onClick={() => addCompany('GOOGL')}>GOOGL</button>
                </div>
              </div>
              <div className="suggestion-group">
                <span className="group-label">Banks</span>
                <div className="suggestion-buttons">
                  <button onClick={() => addCompany('JPM')}>JPM</button>
                  <button onClick={() => addCompany('BAC')}>BAC</button>
                  <button onClick={() => addCompany('WFC')}>WFC</button>
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
