// frontend/src/pages/CompanyPage.js
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  TrendingUp,
  BarChart3,
  Building2,
  Calendar,
  ExternalLink,
  Activity,
  Target,
  Shield,
  DollarSign,
  Percent,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { companyAPI, trendsAPI } from '../services/api';
import {
  PeriodToggle,
  MetricSelector,
  FinancialBreakdown,
  BalanceSheetBreakdown,
  CashFlowBreakdown,
  WatchlistButton,
  MultiMetricChart,
  ClassificationEditor,
  AnalysisDashboard,
  NewsAndEvents,
  AVAILABLE_METRICS,
  DEFAULT_CHART_METRICS,
  DEFAULT_TABLE_METRICS
} from '../components';
import { SnowflakeChart } from '../components/charts';
import './CompanyPage.css';

// Format metric value based on type
const formatValue = (value, format) => {
  if (value === null || value === undefined) return '-';
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'currency':
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toFixed(0)}`;
    default:
      return value.toFixed(2);
  }
};

// Metric card component with icon
const MetricCard = ({ icon: Icon, label, value, format, trend, color = 'primary' }) => {
  const formattedValue = formatValue(value, format);
  const isPositiveTrend = trend > 0;

  return (
    <div className={`metric-card-new ${color}`}>
      <div className="metric-card-header">
        <div className="metric-icon">
          <Icon size={16} />
        </div>
        <span className="metric-card-label">{label}</span>
      </div>
      <div className="metric-card-value">{formattedValue}</div>
      {trend !== undefined && trend !== null && (
        <div className={`metric-trend ${isPositiveTrend ? 'positive' : 'negative'}`}>
          {isPositiveTrend ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          <span>{Math.abs(trend).toFixed(1)}% YoY</span>
        </div>
      )}
    </div>
  );
};

function CompanyPage() {
  const { symbol } = useParams();
  const [company, setCompany] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);

  // New state for period and metric selection
  const [periodType, setPeriodType] = useState('annual');
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [chartMetrics, setChartMetrics] = useState(DEFAULT_CHART_METRICS);
  const [tableMetrics, setTableMetrics] = useState(DEFAULT_TABLE_METRICS);
  const [financialTab, setFinancialTab] = useState('income');
  const [mainTab, setMainTab] = useState('overview');

  const loadMetrics = useCallback(async () => {
    try {
      const metricsRes = await companyAPI.getMetrics(symbol, {
        limit: 20,
        periodType: periodType
      });
      setMetrics(metricsRes.data.metrics);
      setAvailablePeriods(metricsRes.data.available_periods || []);
    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  }, [symbol, periodType]);

  useEffect(() => {
    const loadCompanyData = async () => {
      try {
        const [companyRes, trendsRes] = await Promise.all([
          companyAPI.getOne(symbol),
          trendsAPI.getCompanyTrend(symbol)
        ]);

        setCompany(companyRes.data);
        setTrends(trendsRes.data);
        setLoading(false);
      } catch (error) {
        console.error('Error loading company:', error);
        setLoading(false);
      }
    };

    loadCompanyData();
  }, [symbol]);

  useEffect(() => {
    if (symbol) {
      loadMetrics();
    }
  }, [symbol, periodType, loadMetrics]);

  if (loading) {
    return (
      <div className="company-page">
        <div className="company-loading">
          <div className="skeleton-header" />
          <div className="skeleton-metrics">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card" />)}
          </div>
          <div className="skeleton-chart" />
        </div>
      </div>
    );
  }

  if (!company) return <div className="error-state">Company not found</div>;

  const chartData = [...metrics].reverse().map(m => {
    const dataPoint = { date: m.fiscal_period };
    chartMetrics.forEach(key => {
      dataPoint[key] = m[key];
    });
    return dataPoint;
  });

  const healthStatus = trends?.health?.health;
  const healthColor =
    healthStatus === 'IMPROVING' ? 'positive' :
    healthStatus === 'STABLE_POSITIVE' ? 'info' :
    healthStatus === 'STABLE' ? 'neutral' :
    healthStatus === 'DETERIORATING' ? 'warning' : 'negative';

  const latestMetrics = company.latest_metrics || {};

  return (
    <div className="company-page">
      {/* Company Header */}
      <header className="company-header-new">
        <div className="company-identity">
          <div className="company-symbol-large">{company.company.symbol}</div>
          <div className="company-details">
            <h1 className="company-name-large">{company.company.name}</h1>
            <div className="company-meta-row">
              <Link to={`/sectors?sector=${encodeURIComponent(company.company.sector)}`} className="meta-link">
                <Building2 size={14} />
                {company.company.sector}
              </Link>
              <span className="meta-separator">-</span>
              <span className="meta-industry">{company.company.industry}</span>
            </div>
          </div>
        </div>

        <div className="company-header-actions">
          <WatchlistButton
            symbol={company.company.symbol}
            name={company.company.name}
            sector={company.company.sector}
            size="large"
          />
          {healthStatus && (
            <div className={`health-badge-new ${healthColor}`}>
              <Activity size={14} />
              <span>{healthStatus.replace('_', ' ')}</span>
            </div>
          )}
        </div>
      </header>

      {/* Quick Stats Bar */}
      <div className="quick-stats-bar">
        <div className="quick-stat">
          <span className="quick-stat-label">ROIC</span>
          <span className={`quick-stat-value ${latestMetrics.roic > 15 ? 'positive' : latestMetrics.roic > 10 ? 'neutral' : 'negative'}`}>
            {formatValue(latestMetrics.roic, 'percent')}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-label">ROE</span>
          <span className={`quick-stat-value ${latestMetrics.roe > 15 ? 'positive' : latestMetrics.roe > 10 ? 'neutral' : 'negative'}`}>
            {formatValue(latestMetrics.roe, 'percent')}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-label">Net Margin</span>
          <span className={`quick-stat-value ${latestMetrics.net_margin > 15 ? 'positive' : latestMetrics.net_margin > 5 ? 'neutral' : 'negative'}`}>
            {formatValue(latestMetrics.net_margin, 'percent')}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-label">Debt/Equity</span>
          <span className={`quick-stat-value ${latestMetrics.debt_to_equity < 0.5 ? 'positive' : latestMetrics.debt_to_equity < 1 ? 'neutral' : 'negative'}`}>
            {formatValue(latestMetrics.debt_to_equity, 'ratio')}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-label">FCF Yield</span>
          <span className={`quick-stat-value ${latestMetrics.fcf_yield > 5 ? 'positive' : latestMetrics.fcf_yield > 3 ? 'neutral' : 'negative'}`}>
            {formatValue(latestMetrics.fcf_yield, 'percent')}
          </span>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <nav className="main-tabs-new">
        {['overview', 'analysis', 'financials', 'history', 'news'].map(tab => (
          <button
            key={tab}
            className={mainTab === tab ? 'active' : ''}
            onClick={() => setMainTab(tab)}
          >
            {tab === 'overview' && <BarChart3 size={16} />}
            {tab === 'analysis' && <Target size={16} />}
            {tab === 'financials' && <DollarSign size={16} />}
            {tab === 'history' && <Calendar size={16} />}
            {tab === 'news' && <ExternalLink size={16} />}
            <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </button>
        ))}
      </nav>

      {/* Period Toggle - shown on all tabs */}
      <div className="controls-section-new">
        <PeriodToggle
          value={periodType}
          onChange={setPeriodType}
          availablePeriods={availablePeriods}
        />
      </div>

      {/* OVERVIEW TAB */}
      {mainTab === 'overview' && (
        <div className="overview-content">
          {/* Two Column Layout */}
          <div className="overview-grid">
            {/* Left Column - Metrics & Chart */}
            <div className="overview-main">
              {/* Key Metrics Cards */}
              <div className="metrics-grid-new">
                <MetricCard
                  icon={Target}
                  label="ROIC"
                  value={latestMetrics.roic}
                  format="percent"
                  color="purple"
                />
                <MetricCard
                  icon={Percent}
                  label="FCF Yield"
                  value={latestMetrics.fcf_yield}
                  format="percent"
                  color="blue"
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Net Margin"
                  value={latestMetrics.net_margin}
                  format="percent"
                  color="green"
                />
                <MetricCard
                  icon={Shield}
                  label="Current Ratio"
                  value={latestMetrics.current_ratio}
                  format="ratio"
                  color="orange"
                />
              </div>

              {/* Chart Section */}
              <section className="chart-section-new">
                <div className="section-header-new">
                  <h3>Historical Performance</h3>
                  <MetricSelector
                    selectedMetrics={chartMetrics}
                    onChange={setChartMetrics}
                    maxSelection={6}
                    mode="chart"
                  />
                </div>
                {chartData.length > 0 ? (
                  <MultiMetricChart
                    data={chartData}
                    metrics={chartMetrics.map(key => ({
                      key,
                      label: AVAILABLE_METRICS[key]?.label || key,
                      format: AVAILABLE_METRICS[key]?.format || 'number'
                    }))}
                    height={400}
                    title=""
                    periodType={periodType}
                  />
                ) : (
                  <div className="no-data-new">
                    <BarChart3 size={32} />
                    <p>No {periodType} data available</p>
                  </div>
                )}
              </section>

              {/* Trend Signals */}
              {trends?.health?.signals && trends.health.signals.length > 0 && (
                <section className="signals-section-new">
                  <h3>Trend Signals</h3>
                  <div className="signals-grid">
                    {trends.health.signals.map((signal, i) => (
                      <div key={i} className="signal-item">
                        <Activity size={14} />
                        <span>{signal}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Right Column - Snowflake & Classifications */}
            <div className="overview-sidebar">
              {/* Snowflake Chart */}
              <section className="snowflake-section">
                <h3>Quality Snapshot</h3>
                <SnowflakeChart
                  metrics={latestMetrics}
                  size="medium"
                  showLegend={true}
                />
              </section>

              {/* Classifications */}
              <ClassificationEditor
                symbol={company.company.symbol}
                companyName={company.company.name}
              />

              {/* Key Ratios Quick View */}
              <section className="ratios-section">
                <h3>Key Ratios</h3>
                <div className="ratio-list">
                  <div className="ratio-item">
                    <span className="ratio-label">P/E Ratio</span>
                    <span className="ratio-value">{formatValue(latestMetrics.pe_ratio, 'ratio')}</span>
                  </div>
                  <div className="ratio-item">
                    <span className="ratio-label">P/B Ratio</span>
                    <span className="ratio-value">{formatValue(latestMetrics.pb_ratio, 'ratio')}</span>
                  </div>
                  <div className="ratio-item">
                    <span className="ratio-label">EV/EBITDA</span>
                    <span className="ratio-value">{formatValue(latestMetrics.ev_to_ebitda, 'ratio')}</span>
                  </div>
                  <div className="ratio-item">
                    <span className="ratio-label">ROE</span>
                    <span className="ratio-value">{formatValue(latestMetrics.roe, 'percent')}</span>
                  </div>
                  <div className="ratio-item">
                    <span className="ratio-label">ROCE</span>
                    <span className="ratio-value">{formatValue(latestMetrics.roce, 'percent')}</span>
                  </div>
                  <div className="ratio-item">
                    <span className="ratio-label">Asset Turnover</span>
                    <span className="ratio-value">{formatValue(latestMetrics.asset_turnover, 'ratio')}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS TAB */}
      {mainTab === 'analysis' && (
        <AnalysisDashboard symbol={symbol} periodType={periodType} />
      )}

      {/* FINANCIALS TAB */}
      {mainTab === 'financials' && (
        <div className="financials-content">
          <div className="financial-tabs-new">
            <button
              className={financialTab === 'income' ? 'active' : ''}
              onClick={() => setFinancialTab('income')}
            >
              <DollarSign size={14} />
              Income Statement
            </button>
            <button
              className={financialTab === 'balance' ? 'active' : ''}
              onClick={() => setFinancialTab('balance')}
            >
              <Shield size={14} />
              Balance Sheet
            </button>
            <button
              className={financialTab === 'cashflow' ? 'active' : ''}
              onClick={() => setFinancialTab('cashflow')}
            >
              <Activity size={14} />
              Cash Flow
            </button>
          </div>

          {financialTab === 'income' && (
            <FinancialBreakdown symbol={symbol} periodType={periodType} />
          )}
          {financialTab === 'balance' && (
            <BalanceSheetBreakdown symbol={symbol} periodType={periodType} />
          )}
          {financialTab === 'cashflow' && (
            <CashFlowBreakdown symbol={symbol} periodType={periodType} />
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {mainTab === 'history' && (
        <section className="history-content">
          <div className="section-header-new">
            <h3>Historical Metrics ({metrics.length} periods)</h3>
            <MetricSelector
              selectedMetrics={tableMetrics}
              onChange={setTableMetrics}
              maxSelection={10}
              mode="table"
            />
          </div>
          {metrics.length > 0 ? (
            <div className="metrics-table-new">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    {tableMetrics.map(key => (
                      <th key={key} title={AVAILABLE_METRICS[key]?.description}>
                        {AVAILABLE_METRICS[key]?.label || key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(m => (
                    <tr key={m.fiscal_period}>
                      <td className="period-cell-new">
                        <span className="period-text">{m.fiscal_period}</span>
                        {m.period_type === 'quarterly' && (
                          <span className="period-badge-new">Q</span>
                        )}
                      </td>
                      {tableMetrics.map(key => (
                        <td key={key} className={getValueClass(m[key], key)}>
                          {formatValue(m[key], AVAILABLE_METRICS[key]?.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-data-new">
              <Calendar size={32} />
              <p>No {periodType} metrics available</p>
            </div>
          )}
        </section>
      )}

      {/* NEWS & EVENTS TAB */}
      {mainTab === 'news' && (
        <NewsAndEvents symbol={symbol} />
      )}
    </div>
  );
}

// Helper function to determine value color class
function getValueClass(value, metricKey) {
  if (value === null || value === undefined) return '';

  const metric = AVAILABLE_METRICS[metricKey];
  if (!metric) return '';

  // For ratios where lower is better (like D/E, P/E)
  const lowerIsBetter = ['debt_to_equity', 'pe_ratio', 'pb_ratio', 'ev_to_ebitda'].includes(metricKey);

  if (metric.format === 'percent') {
    if (lowerIsBetter) {
      return value < 0.5 ? 'value-positive' : value > 1 ? 'value-negative' : '';
    }
    return value > 15 ? 'value-positive' : value < 5 ? 'value-negative' : '';
  }

  return '';
}

export default CompanyPage;
