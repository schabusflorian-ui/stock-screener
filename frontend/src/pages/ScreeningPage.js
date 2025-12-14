// frontend/src/pages/ScreeningPage.js
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { screeningAPI, companyAPI } from '../services/api';
import { WatchlistButton, PeriodToggle, ComparisonChart } from '../components';
import './ScreeningPage.css';

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
  }
};

// Templates storage key
const TEMPLATES_STORAGE_KEY = 'stock_screener_templates';

// Format value for display
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
    default: return value.toFixed(2);
  }
};

function ScreeningPage() {
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

  // Run preset screen
  const runPresetScreen = async (presetId, name) => {
    setLoading(true);
    setActiveScreen(name);

    try {
      let response;
      switch(presetId) {
        case 'buffett': response = await screeningAPI.buffett(limit); break;
        case 'value': response = await screeningAPI.value(limit); break;
        case 'magic': response = await screeningAPI.magic(limit); break;
        case 'quality': response = await screeningAPI.quality(limit); break;
        case 'growth': response = await screeningAPI.growth(limit); break;
        case 'dividend': response = await screeningAPI.dividend(limit); break;
        case 'fortress': response = await screeningAPI.fortress(limit); break;
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
      <div className="screening-header">
        <div>
          <h1>Stock Screener</h1>
          <p>Find stocks matching your investment criteria</p>
        </div>
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

          {/* Results Table */}
          <div className={`results-table ${resultsView === 'chart' ? 'with-selection' : ''}`}>
            <table>
              <thead>
                <tr>
                  {resultsView === 'chart' && <th className="select-col">Compare</th>}
                  <th>Symbol</th>
                  <th>Company</th>
                  <th>Sector</th>
                  <th>ROIC</th>
                  <th>ROE</th>
                  <th>Net Margin</th>
                  <th>FCF Yield</th>
                  <th>P/E</th>
                  <th>Debt/Eq</th>
                  <th>Growth</th>
                  <th>Period</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(stock => {
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
                      <td>
                        <Link to={`/company/${stock.symbol}`} className="symbol-link">
                          {stock.symbol}
                        </Link>
                      </td>
                      <td className="company-name">{stock.name}</td>
                      <td className="sector-cell">{stock.sector}</td>
                      <td className={stock.roic > 15 ? 'positive' : stock.roic < 5 ? 'negative' : ''}>
                        {formatValue(stock.roic, 'percent')}
                      </td>
                      <td className={stock.roe > 15 ? 'positive' : stock.roe < 5 ? 'negative' : ''}>
                        {formatValue(stock.roe, 'percent')}
                      </td>
                      <td className={stock.net_margin > 15 ? 'positive' : stock.net_margin < 0 ? 'negative' : ''}>
                        {formatValue(stock.net_margin, 'percent')}
                      </td>
                      <td className={stock.fcf_yield > 5 ? 'positive' : stock.fcf_yield < 0 ? 'negative' : ''}>
                        {formatValue(stock.fcf_yield, 'percent')}
                      </td>
                      <td className={stock.pe_ratio < 15 ? 'positive' : stock.pe_ratio > 30 ? 'negative' : ''}>
                        {formatValue(stock.pe_ratio, 'ratio')}
                      </td>
                      <td className={stock.debt_to_equity < 0.5 ? 'positive' : stock.debt_to_equity > 2 ? 'negative' : ''}>
                        {formatValue(stock.debt_to_equity, 'ratio')}
                      </td>
                      <td className={stock.revenue_growth_yoy > 10 ? 'positive' : stock.revenue_growth_yoy < 0 ? 'negative' : ''}>
                        {formatValue(stock.revenue_growth_yoy, 'percent')}
                      </td>
                      <td className="period-cell">{stock.fiscal_period?.substring(0, 7)}</td>
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
