import { useState, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { companyAPI } from '../services/api';
import { useAskAI } from '../hooks/useAskAI';
import './FinancialBreakdown.css';

// Format large numbers with currency symbol
const formatCurrency = (value, currencySymbol = '$') => {
  if (value === null || value === undefined) return '-';
  const absValue = Math.abs(value);
  if (absValue >= 1e12) return `${currencySymbol}${(value / 1e12).toFixed(1)}T`;
  if (absValue >= 1e9) return `${currencySymbol}${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `${currencySymbol}${(value / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `${currencySymbol}${(value / 1e3).toFixed(1)}K`;
  return `${currencySymbol}${value.toFixed(0)}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
};

const FinancialBreakdown = memo(function FinancialBreakdown({ symbol, periodType }) {
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'waterfall'
  const [currency, setCurrency] = useState({ reporting: 'USD', symbol: '$', isUSD: true });

  useEffect(() => {
    const loadBreakdown = async () => {
      setLoading(true);
      try {
        const response = await companyAPI.getBreakdown(symbol, {
          limit: 10,
          periodType
        });
        setBreakdown(response.data.breakdown || []);
        if (response.data.currency) {
          setCurrency(response.data.currency);
        }
        if (response.data.breakdown?.length > 0) {
          setSelectedPeriod(response.data.breakdown[0].period);
        }
      } catch (error) {
        console.error('Error loading breakdown:', error);
      }
      setLoading(false);
    };

    if (symbol) {
      loadBreakdown();
    }
  }, [symbol, periodType]);

  // Local formatting function using component's currency state
  const fmtCurrency = (value) => formatCurrency(value, currency.symbol);

  // Ask AI context menu for financial breakdown
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'financial_breakdown',
    symbol,
    label: 'Income Statement',
    period: selectedPeriod,
    periodType
  }));

  if (loading) return <div className="breakdown-loading">Loading financial data...</div>;
  if (breakdown.length === 0) return <div className="breakdown-empty">No financial breakdown data available</div>;

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

  // Prepare chart data for margin trends
  const marginChartData = [...breakdown].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'Gross Margin': item.margins?.grossMargin || 0,
    'Operating Margin': item.margins?.operatingMargin || 0,
    'Net Margin': item.margins?.netMargin || 0
  }));

  // Prepare revenue/cost evolution data
  const revenueChartData = [...breakdown].reverse().map(item => ({
    period: formatPeriodLabel(item),
    Revenue: (item.revenue || 0) / 1e9,
    'Cost of Revenue': (item.costOfRevenue || 0) / 1e9,
    'Gross Profit': (item.grossProfit || 0) / 1e9,
    'Operating Income': (item.operatingIncome || 0) / 1e9,
    'Net Income': (item.netIncome || 0) / 1e9
  }));

  // Get selected period data for detailed view
  const selectedData = breakdown.find(b => b.period === selectedPeriod);

  // Cost breakdown for pie-like visualization
  const getCostBreakdown = () => {
    if (!selectedData) return [];
    const total = selectedData.revenue;
    return [
      { name: 'Cost of Revenue', value: selectedData.costs.costOfRevenue, percent: (selectedData.costs.costOfRevenue / total) * 100, fill: '#DC2626' },
      { name: 'R&D', value: selectedData.costs.researchAndDevelopment, percent: (selectedData.costs.researchAndDevelopment / total) * 100, fill: '#D97706' },
      { name: 'SG&A', value: selectedData.costs.sellingGeneralAdmin, percent: (selectedData.costs.sellingGeneralAdmin / total) * 100, fill: '#7C3AED' },
      { name: 'Taxes', value: selectedData.costs.incomeTaxExpense, percent: (selectedData.costs.incomeTaxExpense / total) * 100, fill: '#0891B2' },
      { name: 'Other', value: selectedData.costs.otherExpenses, percent: (selectedData.costs.otherExpenses / total) * 100, fill: '#94A3B8' },
      { name: 'Net Income', value: selectedData.netIncome, percent: (selectedData.netIncome / total) * 100, fill: '#059669' }
    ].filter(item => item.value > 0);
  };

  return (
    <div className="financial-breakdown" {...askAIProps}>
      <div className="breakdown-header">
        <h3>
          Financial Breakdown
          {!currency.isUSD && (
            <span className="currency-badge" title={`Reported in ${currency.name}`}>
              {currency.symbol} {currency.reporting}
            </span>
          )}
        </h3>
        <div className="breakdown-controls">
          <div className="view-toggle">
            <button
              className={viewMode === 'chart' ? 'active' : ''}
              onClick={() => setViewMode('chart')}
            >
              Trends
            </button>
            <button
              className={viewMode === 'waterfall' ? 'active' : ''}
              onClick={() => setViewMode('waterfall')}
            >
              Period Detail
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="breakdown-charts">
          {/* Margin Trends */}
          <div className="chart-container">
            <h4>Margin Trends</h4>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={marginChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="period" stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fill: '#94A3B8' }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}
                  formatter={(value) => `${value.toFixed(1)}%`}
                />
                <Legend />
                <Line type="monotone" dataKey="Gross Margin" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Operating Margin" stroke="#7C3AED" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Net Margin" stroke="#0891B2" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue & Profitability Evolution */}
          <div className="chart-container">
            <h4>Revenue & Profitability (in Billions)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="period" stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fill: '#94A3B8' }} unit="B" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}
                  formatter={(value) => `${currency.symbol}${value.toFixed(1)}B`}
                />
                <Legend />
                <Bar dataKey="Revenue" fill="#2563EB" />
                <Bar dataKey="Gross Profit" fill="#059669" />
                <Bar dataKey="Operating Income" fill="#7C3AED" />
                <Bar dataKey="Net Income" fill="#0891B2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="breakdown-detail">
          {/* Period Selector */}
          <div className="period-selector">
            <label>Select Period:</label>
            <select
              value={selectedPeriod || ''}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              {breakdown.map(b => (
                <option key={b.period} value={b.period}>
                  {formatPeriodLabel(b)}
                </option>
              ))}
            </select>
          </div>

          {selectedData && (
            <>
              {/* Summary Cards */}
              <div className="breakdown-summary">
                <div className="summary-card revenue">
                  <span className="label">Revenue</span>
                  <span className="value">{fmtCurrency(selectedData.revenue)}</span>
                </div>
                <div className="summary-card">
                  <span className="label">Gross Profit</span>
                  <span className="value">{fmtCurrency(selectedData.grossProfit)}</span>
                  <span className="percent">{formatPercent(selectedData.margins.grossMargin)}</span>
                </div>
                <div className="summary-card">
                  <span className="label">Operating Income</span>
                  <span className="value">{fmtCurrency(selectedData.operatingIncome)}</span>
                  <span className="percent">{formatPercent(selectedData.margins.operatingMargin)}</span>
                </div>
                <div className="summary-card profit">
                  <span className="label">Net Income</span>
                  <span className="value">{fmtCurrency(selectedData.netIncome)}</span>
                  <span className="percent">{formatPercent(selectedData.margins.netMargin)}</span>
                </div>
              </div>

              {/* Cost Breakdown Bar */}
              <div className="cost-breakdown-section">
                <h4>Revenue Breakdown</h4>
                <div className="stacked-bar">
                  {getCostBreakdown().map((item, idx) => (
                    <div
                      key={idx}
                      className="bar-segment"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: item.fill
                      }}
                      title={`${item.name}: ${fmtCurrency(item.value)} (${item.percent.toFixed(1)}%)`}
                    />
                  ))}
                </div>
                <div className="breakdown-legend">
                  {getCostBreakdown().map((item, idx) => (
                    <div key={idx} className="legend-item">
                      <span className="legend-color" style={{ backgroundColor: item.fill }} />
                      <span className="legend-label">{item.name}</span>
                      <span className="legend-value">{formatPercent(item.percent)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Cost Table */}
              <div className="cost-table-section">
                <h4>Detailed Breakdown</h4>
                <table className="cost-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Amount</th>
                      <th>% of Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="highlight-row">
                      <td>Revenue</td>
                      <td>{fmtCurrency(selectedData.revenue)}</td>
                      <td>100.0%</td>
                    </tr>
                    <tr className="expense-row">
                      <td>Cost of Revenue</td>
                      <td>{fmtCurrency(selectedData.costs.costOfRevenue)}</td>
                      <td>{formatPercent(selectedData.margins.costOfRevenuePercent)}</td>
                    </tr>
                    <tr className="subtotal-row">
                      <td>Gross Profit</td>
                      <td>{fmtCurrency(selectedData.grossProfit)}</td>
                      <td>{formatPercent(selectedData.margins.grossMargin)}</td>
                    </tr>
                    {selectedData.costs.researchAndDevelopment > 0 && (
                      <tr className="expense-row">
                        <td>Research & Development</td>
                        <td>{fmtCurrency(selectedData.costs.researchAndDevelopment)}</td>
                        <td>{formatPercent(selectedData.margins.rdPercent)}</td>
                      </tr>
                    )}
                    {selectedData.costs.sellingGeneralAdmin > 0 && (
                      <tr className="expense-row">
                        <td>Selling, General & Admin</td>
                        <td>{fmtCurrency(selectedData.costs.sellingGeneralAdmin)}</td>
                        <td>{formatPercent(selectedData.margins.sgaPercent)}</td>
                      </tr>
                    )}
                    <tr className="subtotal-row">
                      <td>Operating Income</td>
                      <td>{fmtCurrency(selectedData.operatingIncome)}</td>
                      <td>{formatPercent(selectedData.margins.operatingMargin)}</td>
                    </tr>
                    {selectedData.costs.interestExpense > 0 && (
                      <tr className="expense-row">
                        <td>Interest Expense</td>
                        <td>{fmtCurrency(selectedData.costs.interestExpense)}</td>
                        <td>{formatPercent((selectedData.costs.interestExpense / selectedData.revenue) * 100)}</td>
                      </tr>
                    )}
                    <tr className="expense-row">
                      <td>Income Tax</td>
                      <td>{fmtCurrency(selectedData.costs.incomeTaxExpense)}</td>
                      <td>{formatPercent(selectedData.margins.taxRate)} (eff. rate)</td>
                    </tr>
                    <tr className="total-row">
                      <td>Net Income</td>
                      <td>{fmtCurrency(selectedData.netIncome)}</td>
                      <td>{formatPercent(selectedData.margins.netMargin)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* EPS if available */}
              {(selectedData.eps.basic || selectedData.eps.diluted) && (
                <div className="eps-section">
                  <h4>Earnings Per Share</h4>
                  <div className="eps-cards">
                    {selectedData.eps.basic && (
                      <div className="eps-card">
                        <span className="label">Basic EPS</span>
                        <span className="value">${selectedData.eps.basic.toFixed(2)}</span>
                      </div>
                    )}
                    {selectedData.eps.diluted && (
                      <div className="eps-card">
                        <span className="label">Diluted EPS</span>
                        <span className="value">${selectedData.eps.diluted.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

FinancialBreakdown.propTypes = {
  symbol: PropTypes.string.isRequired,
  periodType: PropTypes.oneOf(['annual', 'quarterly'])
};

FinancialBreakdown.defaultProps = {
  periodType: 'annual'
};

export default FinancialBreakdown;
