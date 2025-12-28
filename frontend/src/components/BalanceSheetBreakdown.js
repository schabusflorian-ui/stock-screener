import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from 'recharts';
import { companyAPI } from '../services/api';
import './BalanceSheetBreakdown.css';

// Format large numbers
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '-';
  const absValue = Math.abs(value);
  if (absValue >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (absValue >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const formatRatio = (value) => {
  if (value === null || value === undefined) return '-';
  return value.toFixed(2);
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
};

function BalanceSheetBreakdown({ symbol, periodType }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'detail', 'trends'

  useEffect(() => {
    const loadBalanceSheet = async () => {
      setLoading(true);
      try {
        const response = await companyAPI.getBalanceSheet(symbol, {
          limit: 10,
          periodType
        });
        setData(response.data.breakdown || []);
        if (response.data.breakdown?.length > 0) {
          setSelectedPeriod(response.data.breakdown[0].period);
        }
      } catch (error) {
        console.error('Error loading balance sheet:', error);
      }
      setLoading(false);
    };

    if (symbol) {
      loadBalanceSheet();
    }
  }, [symbol, periodType]);

  if (loading) return <div className="bs-loading">Loading balance sheet data...</div>;
  if (data.length === 0) return <div className="bs-empty">No balance sheet data available</div>;

  // Get selected period data
  const selectedData = data.find(d => d.period === selectedPeriod);

  // Helper to format period label - use fiscal label if available
  const formatPeriodLabel = (item) => {
    // Prefer fiscal_label (e.g., "FY2024 Q1") if available
    if (item.fiscal_label) return item.fiscal_label;
    // Fall back to fiscal_year for annual reports
    if (item.fiscal_year) return `FY${item.fiscal_year}`;
    // Fall back to period date
    if (item.period) return item.period.substring(0, 4);
    return item.fiscal_period || 'N/A';
  };

  // Prepare trend chart data
  const trendData = [...data].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'Total Assets': item.summary.totalAssets / 1e9,
    'Total Liabilities': item.summary.totalLiabilities / 1e9,
    'Shareholders Equity': item.summary.shareholderEquity / 1e9
  }));

  // Asset composition over time
  const assetCompositionData = [...data].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'Current Assets': (item.assets?.current?.total || 0) / 1e9,
    'Non-Current Assets': (item.assets?.noncurrent?.total || 0) / 1e9
  }));

  // Ratio trends
  const ratioTrendData = [...data].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'Current Ratio': item.ratios?.currentRatio,
    'Quick Ratio': item.ratios?.quickRatio,
    'Debt to Equity': item.ratios?.debtToEquity
  }));

  // Get health indicators for a value
  const getHealthClass = (value, metric) => {
    if (value === null || value === undefined) return '';
    switch(metric) {
      case 'currentRatio':
        return value >= 2 ? 'healthy' : value >= 1 ? 'warning' : 'danger';
      case 'quickRatio':
        return value >= 1 ? 'healthy' : value >= 0.5 ? 'warning' : 'danger';
      case 'debtToEquity':
        return value <= 0.5 ? 'healthy' : value <= 1.5 ? 'warning' : 'danger';
      case 'debtToAssets':
        return value <= 0.3 ? 'healthy' : value <= 0.6 ? 'warning' : 'danger';
      default:
        return '';
    }
  };

  return (
    <div className="balance-sheet-breakdown">
      <div className="bs-header">
        <h3>Balance Sheet</h3>
        <div className="bs-controls">
          <div className="view-toggle">
            <button
              className={viewMode === 'overview' ? 'active' : ''}
              onClick={() => setViewMode('overview')}
            >
              Overview
            </button>
            <button
              className={viewMode === 'detail' ? 'active' : ''}
              onClick={() => setViewMode('detail')}
            >
              Detail
            </button>
            <button
              className={viewMode === 'trends' ? 'active' : ''}
              onClick={() => setViewMode('trends')}
            >
              Trends
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'overview' && selectedData && (
        <div className="bs-overview">
          {/* Period Selector */}
          <div className="period-selector">
            <label>Period:</label>
            <select
              value={selectedPeriod || ''}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              {data.map(d => (
                <option key={d.period} value={d.period}>
                  {formatPeriodLabel(d)}
                </option>
              ))}
            </select>
          </div>

          {/* Summary Cards */}
          <div className="bs-summary-grid">
            <div className="bs-summary-card assets">
              <span className="card-label">Total Assets</span>
              <span className="card-value">{formatCurrency(selectedData.summary.totalAssets)}</span>
            </div>
            <div className="bs-summary-card liabilities">
              <span className="card-label">Total Liabilities</span>
              <span className="card-value">{formatCurrency(selectedData.summary.totalLiabilities)}</span>
            </div>
            <div className="bs-summary-card equity">
              <span className="card-label">Shareholders' Equity</span>
              <span className="card-value">{formatCurrency(selectedData.summary.shareholderEquity)}</span>
            </div>
          </div>

          {/* Balance Sheet Equation Visualization */}
          <div className="bs-equation-section">
            <h4>Balance Sheet Structure</h4>
            {(() => {
              // Calculate the right side total (Liabilities + Equity)
              const currentLiab = selectedData.liabilities?.current?.total || 0;
              const noncurrentLiab = selectedData.liabilities?.noncurrent?.total || 0;
              const equity = selectedData.summary.shareholderEquity || 0;
              const rightSideTotal = currentLiab + noncurrentLiab + Math.max(0, equity);

              // Use totalAssets as the reference for both sides to ensure visual balance
              const totalAssets = selectedData.summary.totalAssets;
              const currentAssets = selectedData.assets?.current?.total || 0;
              const noncurrentAssets = selectedData.assets?.noncurrent?.total || 0;

              return (
                <div className="bs-visual">
                  <div className="bs-left-side">
                    <div className="bs-bar assets-bar">
                      <div
                        className="bs-segment current-assets"
                        style={{ height: `${(currentAssets / totalAssets) * 100}%` }}
                        title={`Current Assets: ${formatCurrency(currentAssets)}`}
                      >
                        <span>Current</span>
                      </div>
                      <div
                        className="bs-segment noncurrent-assets"
                        style={{ height: `${(noncurrentAssets / totalAssets) * 100}%` }}
                        title={`Non-Current Assets: ${formatCurrency(noncurrentAssets)}`}
                      >
                        <span>Non-Current</span>
                      </div>
                    </div>
                    <span className="bar-label">Assets</span>
                    <span className="bar-total">{formatCurrency(totalAssets)}</span>
                  </div>
                  <div className="bs-equals">=</div>
                  <div className="bs-right-side">
                    <div className="bs-bar liabilities-equity-bar">
                      <div
                        className="bs-segment current-liab"
                        style={{ height: `${(currentLiab / rightSideTotal) * 100}%` }}
                        title={`Current Liabilities: ${formatCurrency(currentLiab)}`}
                      >
                        <span>Current Liab.</span>
                      </div>
                      <div
                        className="bs-segment noncurrent-liab"
                        style={{ height: `${(noncurrentLiab / rightSideTotal) * 100}%` }}
                        title={`Non-Current Liabilities: ${formatCurrency(noncurrentLiab)}`}
                      >
                        <span>Long-term Debt</span>
                      </div>
                      {equity > 0 && (
                        <div
                          className="bs-segment equity-segment"
                          style={{ height: `${(equity / rightSideTotal) * 100}%` }}
                          title={`Shareholders' Equity: ${formatCurrency(equity)}`}
                        >
                          <span>Equity</span>
                        </div>
                      )}
                    </div>
                    <span className="bar-label">Liabilities + Equity</span>
                    <span className="bar-total">{formatCurrency(rightSideTotal)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Key Ratios */}
          <div className="bs-ratios-section">
            <h4>Financial Health Ratios</h4>
            <div className="ratios-grid">
              <div className={`ratio-card ${getHealthClass(selectedData.ratios?.currentRatio, 'currentRatio')}`}>
                <span className="ratio-name">Current Ratio</span>
                <span className="ratio-value">{formatRatio(selectedData.ratios?.currentRatio)}</span>
                <span className="ratio-desc">Current Assets / Current Liabilities</span>
              </div>
              <div className={`ratio-card ${getHealthClass(selectedData.ratios?.quickRatio, 'quickRatio')}`}>
                <span className="ratio-name">Quick Ratio</span>
                <span className="ratio-value">{formatRatio(selectedData.ratios?.quickRatio)}</span>
                <span className="ratio-desc">(Current Assets - Inventory) / Current Liabilities</span>
              </div>
              <div className={`ratio-card ${getHealthClass(selectedData.ratios?.debtToEquity, 'debtToEquity')}`}>
                <span className="ratio-name">Debt to Equity</span>
                <span className="ratio-value">{formatRatio(selectedData.ratios?.debtToEquity)}</span>
                <span className="ratio-desc">Total Debt / Shareholders' Equity</span>
              </div>
              <div className={`ratio-card ${getHealthClass(selectedData.ratios?.debtToAssets, 'debtToAssets')}`}>
                <span className="ratio-name">Debt to Assets</span>
                <span className="ratio-value">{formatPercent(selectedData.ratios?.debtToAssets)}</span>
                <span className="ratio-desc">Total Liabilities / Total Assets</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'detail' && selectedData && (
        <div className="bs-detail">
          {/* Period Selector */}
          <div className="period-selector">
            <label>Period:</label>
            <select
              value={selectedPeriod || ''}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              {data.map(d => (
                <option key={d.period} value={d.period}>
                  {formatPeriodLabel(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="bs-detail-grid">
            {/* Assets Section */}
            <div className="bs-section assets-section">
              <h4>Assets</h4>

              {/* Current Assets */}
              <div className="bs-subsection">
                <h5>Current Assets</h5>
                <table className="bs-table">
                  <tbody>
                    {selectedData.assets?.current?.cashAndEquivalents > 0 && (
                      <tr>
                        <td>Cash & Equivalents</td>
                        <td>{formatCurrency(selectedData.assets.current.cashAndEquivalents)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.current?.shortTermInvestments > 0 && (
                      <tr>
                        <td>Short-term Investments</td>
                        <td>{formatCurrency(selectedData.assets.current.shortTermInvestments)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.current?.accountsReceivable > 0 && (
                      <tr>
                        <td>Accounts Receivable</td>
                        <td>{formatCurrency(selectedData.assets.current.accountsReceivable)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.current?.inventory > 0 && (
                      <tr>
                        <td>Inventory</td>
                        <td>{formatCurrency(selectedData.assets.current.inventory)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.current?.other > 0 && (
                      <tr>
                        <td>Other Current Assets</td>
                        <td>{formatCurrency(selectedData.assets.current.other)}</td>
                      </tr>
                    )}
                    <tr className="subtotal-row">
                      <td>Total Current Assets</td>
                      <td>{formatCurrency(selectedData.assets?.current?.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Non-Current Assets */}
              <div className="bs-subsection">
                <h5>Non-Current Assets</h5>
                <table className="bs-table">
                  <tbody>
                    {selectedData.assets?.noncurrent?.propertyPlantEquipment > 0 && (
                      <tr>
                        <td>Property, Plant & Equipment</td>
                        <td>{formatCurrency(selectedData.assets.noncurrent.propertyPlantEquipment)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.noncurrent?.goodwill > 0 && (
                      <tr>
                        <td>Goodwill</td>
                        <td>{formatCurrency(selectedData.assets.noncurrent.goodwill)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.noncurrent?.intangibleAssets > 0 && (
                      <tr>
                        <td>Intangible Assets</td>
                        <td>{formatCurrency(selectedData.assets.noncurrent.intangibleAssets)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.noncurrent?.longTermInvestments > 0 && (
                      <tr>
                        <td>Long-term Investments</td>
                        <td>{formatCurrency(selectedData.assets.noncurrent.longTermInvestments)}</td>
                      </tr>
                    )}
                    {selectedData.assets?.noncurrent?.other > 0 && (
                      <tr>
                        <td>Other Non-Current Assets</td>
                        <td>{formatCurrency(selectedData.assets.noncurrent.other)}</td>
                      </tr>
                    )}
                    <tr className="subtotal-row">
                      <td>Total Non-Current Assets</td>
                      <td>{formatCurrency(selectedData.assets?.noncurrent?.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bs-total">
                <span>Total Assets</span>
                <span>{formatCurrency(selectedData.summary.totalAssets)}</span>
              </div>
            </div>

            {/* Liabilities & Equity Section */}
            <div className="bs-section liabilities-section">
              <h4>Liabilities & Equity</h4>

              {/* Current Liabilities */}
              <div className="bs-subsection">
                <h5>Current Liabilities</h5>
                <table className="bs-table">
                  <tbody>
                    {selectedData.liabilities?.current?.accountsPayable > 0 && (
                      <tr>
                        <td>Accounts Payable</td>
                        <td>{formatCurrency(selectedData.liabilities.current.accountsPayable)}</td>
                      </tr>
                    )}
                    {selectedData.liabilities?.current?.shortTermDebt > 0 && (
                      <tr>
                        <td>Short-term Debt</td>
                        <td>{formatCurrency(selectedData.liabilities.current.shortTermDebt)}</td>
                      </tr>
                    )}
                    {selectedData.liabilities?.current?.deferredRevenue > 0 && (
                      <tr>
                        <td>Deferred Revenue</td>
                        <td>{formatCurrency(selectedData.liabilities.current.deferredRevenue)}</td>
                      </tr>
                    )}
                    {selectedData.liabilities?.current?.other > 0 && (
                      <tr>
                        <td>Other Current Liabilities</td>
                        <td>{formatCurrency(selectedData.liabilities.current.other)}</td>
                      </tr>
                    )}
                    <tr className="subtotal-row">
                      <td>Total Current Liabilities</td>
                      <td>{formatCurrency(selectedData.liabilities?.current?.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Non-Current Liabilities */}
              <div className="bs-subsection">
                <h5>Non-Current Liabilities</h5>
                <table className="bs-table">
                  <tbody>
                    {selectedData.liabilities?.noncurrent?.longTermDebt > 0 && (
                      <tr>
                        <td>Long-term Debt</td>
                        <td>{formatCurrency(selectedData.liabilities.noncurrent.longTermDebt)}</td>
                      </tr>
                    )}
                    {selectedData.liabilities?.noncurrent?.deferredTaxLiabilities > 0 && (
                      <tr>
                        <td>Deferred Tax Liabilities</td>
                        <td>{formatCurrency(selectedData.liabilities.noncurrent.deferredTaxLiabilities)}</td>
                      </tr>
                    )}
                    {selectedData.liabilities?.noncurrent?.other > 0 && (
                      <tr>
                        <td>Other Non-Current Liabilities</td>
                        <td>{formatCurrency(selectedData.liabilities.noncurrent.other)}</td>
                      </tr>
                    )}
                    <tr className="subtotal-row">
                      <td>Total Non-Current Liabilities</td>
                      <td>{formatCurrency(selectedData.liabilities?.noncurrent?.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bs-subtotal liab-subtotal">
                <span>Total Liabilities</span>
                <span>{formatCurrency(selectedData.summary.totalLiabilities)}</span>
              </div>

              {/* Shareholders' Equity */}
              <div className="bs-subsection">
                <h5>Shareholders' Equity</h5>
                <table className="bs-table">
                  <tbody>
                    {selectedData.equity?.commonStock > 0 && (
                      <tr>
                        <td>Common Stock</td>
                        <td>{formatCurrency(selectedData.equity.commonStock)}</td>
                      </tr>
                    )}
                    {selectedData.equity?.retainedEarnings !== 0 && (
                      <tr>
                        <td>Retained Earnings</td>
                        <td className={selectedData.equity?.retainedEarnings < 0 ? 'negative' : ''}>
                          {formatCurrency(selectedData.equity?.retainedEarnings)}
                        </td>
                      </tr>
                    )}
                    {selectedData.equity?.accumulatedOCI !== 0 && (
                      <tr>
                        <td>Accumulated OCI</td>
                        <td className={selectedData.equity?.accumulatedOCI < 0 ? 'negative' : ''}>
                          {formatCurrency(selectedData.equity?.accumulatedOCI)}
                        </td>
                      </tr>
                    )}
                    {selectedData.equity?.treasuryStock !== 0 && (
                      <tr>
                        <td>Treasury Stock</td>
                        <td className="negative">{formatCurrency(selectedData.equity?.treasuryStock)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bs-subtotal equity-subtotal">
                <span>Total Equity</span>
                <span>{formatCurrency(selectedData.summary.shareholderEquity)}</span>
              </div>

              <div className="bs-total">
                <span>Total Liabilities + Equity</span>
                <span>{formatCurrency(selectedData.summary.totalLiabilities + selectedData.summary.shareholderEquity)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'trends' && (
        <div className="bs-trends">
          {/* Assets, Liabilities, Equity Trend */}
          <div className="chart-container">
            <h4>Balance Sheet Composition (in Billions)</h4>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} unit="B" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem' }}
                  formatter={(value) => `$${value.toFixed(1)}B`}
                />
                <Legend />
                <Area type="monotone" dataKey="Total Assets" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.3} />
                <Area type="monotone" dataKey="Total Liabilities" fill="#ef4444" stroke="#ef4444" fillOpacity={0.3} />
                <Area type="monotone" dataKey="Shareholders Equity" fill="#22c55e" stroke="#22c55e" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Asset Composition */}
          <div className="chart-container">
            <h4>Asset Composition (in Billions)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={assetCompositionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} unit="B" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem' }}
                  formatter={(value) => `$${value.toFixed(1)}B`}
                />
                <Legend />
                <Bar dataKey="Current Assets" stackId="a" fill="#60a5fa" />
                <Bar dataKey="Non-Current Assets" stackId="a" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Financial Health Ratios Trend */}
          <div className="chart-container">
            <h4>Financial Health Ratios</h4>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={ratioTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem' }}
                  formatter={(value) => value?.toFixed(2)}
                />
                <Legend />
                <Line type="monotone" dataKey="Current Ratio" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Quick Ratio" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Debt to Equity" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default BalanceSheetBreakdown;
