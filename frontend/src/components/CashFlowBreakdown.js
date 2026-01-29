import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, AreaChart, Area } from 'recharts';
import { companyAPI } from '../services/api';
import { useAskAI } from '../hooks/useAskAI';
import './CashFlowBreakdown.css';

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

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
};

function CashFlowBreakdown({ symbol, periodType }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'detail', 'trends'

  useEffect(() => {
    const loadCashFlow = async () => {
      setLoading(true);
      try {
        const response = await companyAPI.getCashFlow(symbol, {
          limit: 10,
          periodType
        });
        setData(response.data.breakdown || []);
        if (response.data.breakdown?.length > 0) {
          setSelectedPeriod(response.data.breakdown[0].period);
        }
      } catch (error) {
        console.error('Error loading cash flow:', error);
      }
      setLoading(false);
    };

    if (symbol) {
      loadCashFlow();
    }
  }, [symbol, periodType]);

  // Ask AI context menu for cash flow
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'cash_flow',
    symbol,
    label: 'Cash Flow Statement',
    period: selectedPeriod,
    periodType
  }));

  if (loading) return <div className="cf-loading">Loading cash flow data...</div>;
  if (data.length === 0) return <div className="cf-empty">No cash flow data available</div>;

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
  const cashFlowTrendData = [...data].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'Operating': (item.summary.operatingCashFlow || 0) / 1e9,
    'Investing': (item.summary.investingCashFlow || 0) / 1e9,
    'Financing': (item.summary.financingCashFlow || 0) / 1e9
  }));

  // Net change in cash
  const netCashData = [...data].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'Net Change': (item.summary.netChangeInCash || 0) / 1e9
  }));

  // Free Cash Flow trend
  const fcfData = [...data].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'Operating CF': (item.summary.operatingCashFlow || 0) / 1e9,
    'CapEx': Math.abs(item.investing?.capitalExpenditures || 0) / 1e9,
    'Free Cash Flow': (item.summary?.freeCashFlow || 0) / 1e9
  }));

  // Quality metrics trend
  const qualityData = [...data].reverse().map(item => ({
    period: formatPeriodLabel(item),
    'FCF Conversion': (item.quality?.fcfConversion || 0) * 100,
    'FCF to Op CF': (item.quality?.fcfToOperatingCF || 0) * 100
  }));

  // Get health indicator class
  const getHealthClass = (value, metric) => {
    if (value === null || value === undefined) return '';
    switch(metric) {
      case 'fcfConversion':
        return value >= 0.8 ? 'healthy' : value >= 0.5 ? 'warning' : 'danger';
      case 'fcfMargin':
        return value >= 0.15 ? 'healthy' : value >= 0.05 ? 'warning' : 'danger';
      case 'cashFlow':
        return value > 0 ? 'positive' : 'negative';
      default:
        return '';
    }
  };

  return (
    <div className="cash-flow-breakdown" {...askAIProps}>
      <div className="cf-header">
        <h3>Cash Flow Statement</h3>
        <div className="cf-controls">
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
        <div className="cf-overview">
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
          <div className="cf-summary-grid">
            <div className={`cf-summary-card operating ${getHealthClass(selectedData.summary.operatingCashFlow, 'cashFlow')}`}>
              <span className="card-icon">💰</span>
              <span className="card-label">Operating Activities</span>
              <span className={`card-value ${selectedData.summary.operatingCashFlow >= 0 ? '' : 'negative'}`}>
                {formatCurrency(selectedData.summary.operatingCashFlow)}
              </span>
            </div>
            <div className={`cf-summary-card investing ${getHealthClass(selectedData.summary.investingCashFlow, 'cashFlow')}`}>
              <span className="card-icon">🏭</span>
              <span className="card-label">Investing Activities</span>
              <span className={`card-value ${selectedData.summary.investingCashFlow >= 0 ? '' : 'negative'}`}>
                {formatCurrency(selectedData.summary.investingCashFlow)}
              </span>
            </div>
            <div className={`cf-summary-card financing ${getHealthClass(selectedData.summary.financingCashFlow, 'cashFlow')}`}>
              <span className="card-icon">🏦</span>
              <span className="card-label">Financing Activities</span>
              <span className={`card-value ${selectedData.summary.financingCashFlow >= 0 ? '' : 'negative'}`}>
                {formatCurrency(selectedData.summary.financingCashFlow)}
              </span>
            </div>
            <div className="cf-summary-card net-change">
              <span className="card-icon">📊</span>
              <span className="card-label">Net Change in Cash</span>
              <span className={`card-value ${selectedData.summary.netChangeInCash >= 0 ? 'positive-text' : 'negative'}`}>
                {formatCurrency(selectedData.summary.netChangeInCash)}
              </span>
            </div>
          </div>

          {/* Cash Flow Waterfall */}
          <div className="cf-waterfall-section">
            <h4>Cash Flow Breakdown</h4>
            <div className="waterfall-visual">
              <div className="waterfall-bar">
                {selectedData.summary.operatingCashFlow > 0 && (
                  <div
                    className="waterfall-segment operating-positive"
                    style={{ flex: Math.abs(selectedData.summary.operatingCashFlow) }}
                    title={`Operating: ${formatCurrency(selectedData.summary.operatingCashFlow)}`}
                  />
                )}
                {selectedData.summary.operatingCashFlow < 0 && (
                  <div
                    className="waterfall-segment operating-negative"
                    style={{ flex: Math.abs(selectedData.summary.operatingCashFlow) }}
                    title={`Operating: ${formatCurrency(selectedData.summary.operatingCashFlow)}`}
                  />
                )}
                {selectedData.summary.investingCashFlow < 0 && (
                  <div
                    className="waterfall-segment investing-negative"
                    style={{ flex: Math.abs(selectedData.summary.investingCashFlow) }}
                    title={`Investing: ${formatCurrency(selectedData.summary.investingCashFlow)}`}
                  />
                )}
                {selectedData.summary.investingCashFlow > 0 && (
                  <div
                    className="waterfall-segment investing-positive"
                    style={{ flex: Math.abs(selectedData.summary.investingCashFlow) }}
                    title={`Investing: ${formatCurrency(selectedData.summary.investingCashFlow)}`}
                  />
                )}
                {selectedData.summary.financingCashFlow < 0 && (
                  <div
                    className="waterfall-segment financing-negative"
                    style={{ flex: Math.abs(selectedData.summary.financingCashFlow) }}
                    title={`Financing: ${formatCurrency(selectedData.summary.financingCashFlow)}`}
                  />
                )}
                {selectedData.summary.financingCashFlow > 0 && (
                  <div
                    className="waterfall-segment financing-positive"
                    style={{ flex: Math.abs(selectedData.summary.financingCashFlow) }}
                    title={`Financing: ${formatCurrency(selectedData.summary.financingCashFlow)}`}
                  />
                )}
              </div>
              <div className="waterfall-legend">
                <div className="legend-item">
                  <span className="legend-dot operating" />
                  <span>Operating</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot investing" />
                  <span>Investing</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot financing" />
                  <span>Financing</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quality Metrics */}
          <div className="cf-quality-section">
            <h4>Cash Flow Quality</h4>
            <div className="quality-grid">
              <div className={`quality-card ${getHealthClass(selectedData.quality?.fcfConversion, 'fcfConversion')}`}>
                <span className="quality-name">FCF Conversion</span>
                <span className="quality-value">{formatPercent(selectedData.quality?.fcfConversion)}</span>
                <span className="quality-desc">Free Cash Flow / Net Income</span>
              </div>
              <div className={`quality-card ${getHealthClass(selectedData.quality?.fcfToOperatingCF, 'fcfMargin')}`}>
                <span className="quality-name">FCF to Operating CF</span>
                <span className="quality-value">{formatPercent(selectedData.quality?.fcfToOperatingCF)}</span>
                <span className="quality-desc">Free Cash Flow / Operating CF</span>
              </div>
              <div className="quality-card">
                <span className="quality-name">Free Cash Flow</span>
                <span className={`quality-value ${selectedData.summary?.freeCashFlow >= 0 ? 'positive-text' : 'negative'}`}>
                  {formatCurrency(selectedData.summary?.freeCashFlow)}
                </span>
                <span className="quality-desc">Operating CF - CapEx</span>
              </div>
              <div className="quality-card">
                <span className="quality-name">Capital Expenditures</span>
                <span className="quality-value negative">
                  {formatCurrency(selectedData.investing?.capitalExpenditures)}
                </span>
                <span className="quality-desc">Investment in PP&E</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'detail' && selectedData && (
        <div className="cf-detail">
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

          <div className="cf-detail-sections">
            {/* Operating Activities */}
            <div className="cf-section operating-section">
              <h4>Operating Activities</h4>
              <table className="cf-table">
                <tbody>
                  {selectedData.operating?.netIncome !== undefined && (
                    <tr className="starting-row">
                      <td>Net Income</td>
                      <td>{formatCurrency(selectedData.operating.netIncome)}</td>
                    </tr>
                  )}
                  {selectedData.operating?.adjustments?.depreciation > 0 && (
                    <tr>
                      <td>Depreciation & Amortization</td>
                      <td className="positive">{formatCurrency(selectedData.operating.adjustments.depreciation)}</td>
                    </tr>
                  )}
                  {selectedData.operating?.adjustments?.stockBasedCompensation > 0 && (
                    <tr>
                      <td>Stock-Based Compensation</td>
                      <td className="positive">{formatCurrency(selectedData.operating.adjustments.stockBasedCompensation)}</td>
                    </tr>
                  )}
                  {selectedData.operating?.adjustments?.deferredIncomeTax !== 0 && selectedData.operating?.adjustments?.deferredIncomeTax !== undefined && (
                    <tr>
                      <td>Deferred Income Tax</td>
                      <td className={selectedData.operating.adjustments.deferredIncomeTax >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.operating.adjustments.deferredIncomeTax)}
                      </td>
                    </tr>
                  )}
                  {selectedData.operating?.workingCapitalChanges?.total !== 0 && selectedData.operating?.workingCapitalChanges?.total !== undefined && (
                    <tr>
                      <td>Change in Working Capital</td>
                      <td className={selectedData.operating.workingCapitalChanges.total >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.operating.workingCapitalChanges.total)}
                      </td>
                    </tr>
                  )}
                  {selectedData.operating?.workingCapitalChanges?.receivables !== 0 && selectedData.operating?.workingCapitalChanges?.receivables !== undefined && (
                    <tr className="indent">
                      <td>Change in Receivables</td>
                      <td className={selectedData.operating.workingCapitalChanges.receivables >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.operating.workingCapitalChanges.receivables)}
                      </td>
                    </tr>
                  )}
                  {selectedData.operating?.workingCapitalChanges?.inventory !== 0 && selectedData.operating?.workingCapitalChanges?.inventory !== undefined && (
                    <tr className="indent">
                      <td>Change in Inventory</td>
                      <td className={selectedData.operating.workingCapitalChanges.inventory >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.operating.workingCapitalChanges.inventory)}
                      </td>
                    </tr>
                  )}
                  {selectedData.operating?.workingCapitalChanges?.payables !== 0 && selectedData.operating?.workingCapitalChanges?.payables !== undefined && (
                    <tr className="indent">
                      <td>Change in Payables</td>
                      <td className={selectedData.operating.workingCapitalChanges.payables >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.operating.workingCapitalChanges.payables)}
                      </td>
                    </tr>
                  )}
                  {selectedData.operating?.adjustments?.otherNonCash !== 0 && selectedData.operating?.adjustments?.otherNonCash !== undefined && (
                    <tr>
                      <td>Other Operating Activities</td>
                      <td className={selectedData.operating.adjustments.otherNonCash >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.operating.adjustments.otherNonCash)}
                      </td>
                    </tr>
                  )}
                  <tr className="total-row">
                    <td>Net Cash from Operating</td>
                    <td className={selectedData.summary.operatingCashFlow >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(selectedData.summary.operatingCashFlow)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Investing Activities */}
            <div className="cf-section investing-section">
              <h4>Investing Activities</h4>
              <table className="cf-table">
                <tbody>
                  {selectedData.investing?.capitalExpenditures !== 0 && (
                    <tr>
                      <td>Capital Expenditures</td>
                      <td className="negative">{formatCurrency(selectedData.investing.capitalExpenditures)}</td>
                    </tr>
                  )}
                  {selectedData.investing?.acquisitions !== 0 && selectedData.investing?.acquisitions !== undefined && (
                    <tr>
                      <td>Acquisitions</td>
                      <td className={selectedData.investing.acquisitions >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.investing.acquisitions)}
                      </td>
                    </tr>
                  )}
                  {selectedData.investing?.investmentPurchases !== 0 && selectedData.investing?.investmentPurchases !== undefined && (
                    <tr>
                      <td>Purchase of Investments</td>
                      <td className="negative">{formatCurrency(selectedData.investing.investmentPurchases)}</td>
                    </tr>
                  )}
                  {selectedData.investing?.investmentSales > 0 && (
                    <tr>
                      <td>Sales of Investments</td>
                      <td className="positive">{formatCurrency(selectedData.investing.investmentSales)}</td>
                    </tr>
                  )}
                  {selectedData.investing?.other !== 0 && selectedData.investing?.other !== undefined && (
                    <tr>
                      <td>Other Investing Activities</td>
                      <td className={selectedData.investing.other >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.investing.other)}
                      </td>
                    </tr>
                  )}
                  <tr className="total-row">
                    <td>Net Cash from Investing</td>
                    <td className={selectedData.summary.investingCashFlow >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(selectedData.summary.investingCashFlow)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financing Activities */}
            <div className="cf-section financing-section">
              <h4>Financing Activities</h4>
              <table className="cf-table">
                <tbody>
                  {selectedData.financing?.debtRepayment !== 0 && selectedData.financing?.debtRepayment !== undefined && (
                    <tr>
                      <td>Debt Repayment</td>
                      <td className="negative">{formatCurrency(selectedData.financing.debtRepayment)}</td>
                    </tr>
                  )}
                  {selectedData.financing?.debtIssuance > 0 && (
                    <tr>
                      <td>Debt Issuance</td>
                      <td className="positive">{formatCurrency(selectedData.financing.debtIssuance)}</td>
                    </tr>
                  )}
                  {selectedData.financing?.stockRepurchase !== 0 && selectedData.financing?.stockRepurchase !== undefined && (
                    <tr>
                      <td>Stock Repurchase</td>
                      <td className="negative">{formatCurrency(selectedData.financing.stockRepurchase)}</td>
                    </tr>
                  )}
                  {selectedData.financing?.stockIssuance > 0 && (
                    <tr>
                      <td>Stock Issuance</td>
                      <td className="positive">{formatCurrency(selectedData.financing.stockIssuance)}</td>
                    </tr>
                  )}
                  {selectedData.financing?.dividends !== 0 && selectedData.financing?.dividends !== undefined && (
                    <tr>
                      <td>Dividends Paid</td>
                      <td className="negative">{formatCurrency(selectedData.financing.dividends)}</td>
                    </tr>
                  )}
                  {selectedData.financing?.other !== 0 && selectedData.financing?.other !== undefined && (
                    <tr>
                      <td>Other Financing Activities</td>
                      <td className={selectedData.financing.other >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(selectedData.financing.other)}
                      </td>
                    </tr>
                  )}
                  <tr className="total-row">
                    <td>Net Cash from Financing</td>
                    <td className={selectedData.summary.financingCashFlow >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(selectedData.summary.financingCashFlow)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Net Change Summary */}
            <div className="cf-section summary-section">
              <h4>Summary</h4>
              <table className="cf-table summary-table">
                <tbody>
                  <tr>
                    <td>Operating Cash Flow</td>
                    <td className={selectedData.summary.operatingCashFlow >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(selectedData.summary.operatingCashFlow)}
                    </td>
                  </tr>
                  <tr>
                    <td>Investing Cash Flow</td>
                    <td className={selectedData.summary.investingCashFlow >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(selectedData.summary.investingCashFlow)}
                    </td>
                  </tr>
                  <tr>
                    <td>Financing Cash Flow</td>
                    <td className={selectedData.summary.financingCashFlow >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(selectedData.summary.financingCashFlow)}
                    </td>
                  </tr>
                  <tr className="grand-total-row">
                    <td>Net Change in Cash</td>
                    <td className={selectedData.summary.netChangeInCash >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(selectedData.summary.netChangeInCash)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'trends' && (
        <div className="cf-trends">
          {/* Cash Flow Components Trend */}
          <div className="chart-container">
            <h4>Cash Flow by Activity (in Billions)</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cashFlowTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="period" stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fill: '#94A3B8' }} unit="B" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}
                  formatter={(value) => `$${value.toFixed(1)}B`}
                />
                <Legend />
                <Bar dataKey="Operating" fill="#059669" />
                <Bar dataKey="Investing" fill="#DC2626" />
                <Bar dataKey="Financing" fill="#7C3AED" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Free Cash Flow Breakdown */}
          <div className="chart-container">
            <h4>Free Cash Flow Breakdown (in Billions)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={fcfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="period" stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fill: '#94A3B8' }} unit="B" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}
                  formatter={(value) => `$${value.toFixed(1)}B`}
                />
                <Legend />
                <Bar dataKey="Operating CF" fill="#2563EB" />
                <Bar dataKey="CapEx" fill="#DC2626" />
                <Line type="monotone" dataKey="Free Cash Flow" stroke="#059669" strokeWidth={3} dot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Quality Metrics Trend */}
          <div className="chart-container">
            <h4>Cash Flow Quality Metrics (%)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={qualityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="period" stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fill: '#94A3B8' }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}
                  formatter={(value) => `${value.toFixed(1)}%`}
                />
                <Legend />
                <Line type="monotone" dataKey="FCF Conversion" stroke="#7C3AED" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="FCF to Op CF" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Net Change in Cash */}
          <div className="chart-container">
            <h4>Net Change in Cash (in Billions)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={netCashData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="period" stroke="#94A3B8" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fill: '#94A3B8' }} unit="B" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}
                  formatter={(value) => `$${value.toFixed(1)}B`}
                />
                <Area
                  type="monotone"
                  dataKey="Net Change"
                  fill="#2563EB"
                  stroke="#2563EB"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default CashFlowBreakdown;
