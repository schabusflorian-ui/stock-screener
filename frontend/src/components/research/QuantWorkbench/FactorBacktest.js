// frontend/src/components/research/QuantWorkbench/FactorBacktest.js
// Factor Backtest Visualization - Historical performance simulation

import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend, Area
} from 'recharts';
import {
  Loader, AlertTriangle, CheckCircle, Activity, Calendar, Layers, TrendingUp, RefreshCw, Database
} from '../../icons';

// Default backtest configuration
const DEFAULT_CONFIG = {
  startYear: 2015,
  endYear: 2025,
  rebalanceFrequency: 'monthly',
  longShortRatio: { long: 20, short: 20 },
  transactionCost: 0.001
};

// Helper function to add business days
const addBusinessDays = (date, days) => {
  const result = new Date(date);
  let daysAdded = 0;
  while (daysAdded < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }
  return result.toISOString().split('T')[0];
};

// Generate monthly returns from equity curve
const generateMonthlyReturns = (equity) => {
  const monthlyReturns = [];
  let currentMonth = null;
  let monthStart = null;

  equity.forEach(point => {
    const date = new Date(point.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (currentMonth !== monthKey) {
      if (currentMonth && monthStart) {
        const monthEnd = equity.find(p => p.date === point.date);
        const ret = (monthEnd.value - monthStart.value) / monthStart.value;
        monthlyReturns.push({
          month: currentMonth,
          return: ret
        });
      }
      currentMonth = monthKey;
      monthStart = point;
    }
  });

  return monthlyReturns;
};

// Generate yearly returns from equity curve
const generateYearlyReturns = (equity, startYear, endYear) => {
  const yearlyReturns = [];

  for (let year = startYear; year <= endYear; year++) {
    const yearData = equity.filter(p => new Date(p.date).getFullYear() === year);
    if (yearData.length > 1) {
      const yearStart = yearData[0].value;
      const yearEnd = yearData[yearData.length - 1].value;
      const yearReturn = (yearEnd - yearStart) / yearStart;
      const yearMaxDD = Math.min(...yearData.map(p => p.drawdown));

      yearlyReturns.push({
        year,
        return: yearReturn,
        maxDD: yearMaxDD
      });
    }
  }

  return yearlyReturns;
};

// Mock data generation function
const generateMockBacktestResults = (config = DEFAULT_CONFIG) => {
  const { startYear, endYear } = config;
  const equity = [];
  let cumReturn = 1.0;
  const tradingDays = (endYear - startYear) * 252;

  // Generate quality metric (simulates factor IC)
  const factorQuality = Math.random();
  const qualityTier = factorQuality > 0.7 ? 'strong' :
                      factorQuality > 0.4 ? 'moderate' : 'weak';

  // Quality determines return characteristics
  const annualizedReturn = factorQuality > 0.7 ? 0.15 :
                           factorQuality > 0.4 ? 0.10 : 0.05;
  const volatility = factorQuality > 0.7 ? 0.12 :
                     factorQuality > 0.4 ? 0.18 : 0.25;

  // Generate daily equity curve with quality-based characteristics
  for (let i = 0; i < tradingDays; i++) {
    const drift = annualizedReturn / 252;
    const vol = volatility / Math.sqrt(252);
    const dailyReturn = drift + vol * (Math.random() - 0.5) * 2;
    cumReturn *= (1 + dailyReturn);

    // Calculate running max and drawdown
    const runningMax = i === 0 ? cumReturn : Math.max(
      ...equity.map(e => e.value),
      cumReturn
    );
    const drawdown = (cumReturn - runningMax) / runningMax;

    equity.push({
      date: addBusinessDays(new Date(startYear, 0, 1), i),
      value: cumReturn,
      drawdown: drawdown
    });
  }

  // Calculate summary metrics from equity curve
  const totalReturn = cumReturn - 1;
  const years = endYear - startYear;
  const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;

  const returns = equity.map((e, i) =>
    i > 0 ? e.value / equity[i - 1].value - 1 : 0
  );
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
  const calculatedVolatility = Math.sqrt(variance) * Math.sqrt(252);
  const sharpe = (cagr - 0.02) / calculatedVolatility; // Assuming 2% risk-free rate
  const maxDrawdown = Math.min(...equity.map(e => e.drawdown));

  // Win rate calculation
  const positiveReturns = returns.filter(r => r > 0).length;
  const winRate = positiveReturns / returns.length;

  // Calmar ratio
  const calmarRatio = cagr / Math.abs(maxDrawdown);

  // Period-based returns
  const yearlyReturns = generateYearlyReturns(equity, startYear, endYear);
  const monthlyReturns = generateMonthlyReturns(equity);

  return {
    equity,
    summary: {
      totalReturn,
      cagr,
      sharpe,
      maxDrawdown,
      winRate,
      volatility: calculatedVolatility,
      calmarRatio
    },
    periodReturns: {
      yearly: yearlyReturns,
      monthly: monthlyReturns.slice(-36) // Last 3 years
    },
    // Mock metadata
    _mock: true,
    _mockQuality: qualityTier,
    _mockMessage: `Generated with ${qualityTier} factor characteristics for demonstration`
  };
};

export default function FactorBacktest({ factor, triggerAnalysis = 0 }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [config] = useState(DEFAULT_CONFIG);
  const [hasRun, setHasRun] = useState(false);
  const [dataSource, setDataSource] = useState(null); // 'real' | 'mock' | null
  const [apiError, setApiError] = useState(null);

  // Auto-run when triggered centrally
  useEffect(() => {
    if (triggerAnalysis > 0 && factor?.formula) {
      runBacktest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerAnalysis]);

  // Run backtest
  const runBacktest = async () => {
    if (!factor?.formula) return;

    setLoading(true);
    setError(null);
    setApiError(null);
    setDataSource(null);

    try {
      const response = await fetch('/api/factors/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factorId: factor.id,
          formula: factor.formula,
          config
        })
      });

      const data = await response.json();

      // Check standardized response format
      if (!data.success) {
        throw new Error(data.error || 'Backtest failed');
      }

      setResults(data.data);
      setDataSource('real');
      setHasRun(true);

    } catch (err) {
      console.error('Backtest API error:', err.message);
      setApiError(err.message);

      // Fallback to mock data with clear indication
      const mockResults = generateMockBacktestResults(config);
      setResults(mockResults);
      setDataSource('mock');
      setHasRun(true);

    } finally {
      setLoading(false);
    }
  };

  // No factor selected - show empty state
  if (!factor) {
    return (
      <div className="factor-backtest">
        <div className="test-empty-state">
          <Layers size={32} className="empty-icon" />
          <h4>Select a Factor</h4>
          <p>Choose a factor from the repository to run a historical backtest.</p>
        </div>
      </div>
    );
  }

  // Before run - show empty state with benefits
  if (!hasRun && !loading) {
    return (
      <div className="factor-backtest">
        <div className="bt-empty-state">
          <Activity size={48} />
          <h4>Test Your Factor with Historical Backtest</h4>
          <p>
            Simulate historical performance of your factor by going long the top performers
            and short the bottom performers. See equity curves, Sharpe ratio, and drawdown analysis.
          </p>
          <ul className="benefits-list">
            <li>
              <CheckCircle size={14} />
              Equity curve showing cumulative returns over time
            </li>
            <li>
              <CheckCircle size={14} />
              Risk-adjusted metrics (Sharpe, Calmar, Sortino)
            </li>
            <li>
              <CheckCircle size={14} />
              Period-by-period returns breakdown
            </li>
            <li>
              <CheckCircle size={14} />
              Maximum drawdown and recovery analysis
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="factor-backtest">
      {/* Loading State */}
      {loading && (
        <div className="analysis-loading-bar">
          <div className="loading-content">
            <Loader size={16} className="spin" />
            <span>Running backtest...</span>
          </div>
          <div className="loading-progress" />
        </div>
      )}

      {/* Error banner (if any) */}
      {error && (
        <div className="bt-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Mock Data Warning Banner */}
      {dataSource === 'mock' && apiError && (
        <div className="mock-data-warning">
          <div className="warning-icon">
            <AlertTriangle size={20} />
          </div>
          <div className="warning-content">
            <div className="warning-title">Showing Simulated Results</div>
            <div className="warning-message">
              Unable to fetch real data: {apiError}
            </div>
            <div className="warning-note">
              The results below are computer-generated for demonstration purposes only.
              They do not represent actual factor performance.
            </div>
            <button onClick={runBacktest} className="warning-retry-btn">
              <RefreshCw size={14} />
              Retry with Real Data
            </button>
          </div>
        </div>
      )}

      {/* Data Source Badge */}
      {dataSource && results && (
        <div className={`data-source-badge badge-${dataSource}`}>
          {dataSource === 'real' ? (
            <>
              <CheckCircle size={14} />
              <span>Real Data</span>
            </>
          ) : (
            <>
              <AlertTriangle size={14} />
              <span>Simulated Data</span>
            </>
          )}
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Summary Cards */}
          <SummaryCards summary={results.summary} />

          {/* Universe Information */}
          {results.universe && <UniverseInfo universe={results.universe} />}

          {/* Equity Curve Chart */}
          <EquityCurveChart equity={results.equity} />

          {/* Yearly Returns */}
          <YearlyReturnsChart yearlyData={results.periodReturns.yearly} />

          {/* Monthly Heatmap */}
          <MonthlyHeatmap monthlyData={results.periodReturns.monthly} />
        </>
      )}
    </div>
  );
}

// Summary Cards Component
function SummaryCards({ summary }) {
  const metrics = [
    {
      label: 'CAGR',
      value: `${(summary.cagr * 100).toFixed(1)}%`,
      description: 'Annualized return',
      colorClass: summary.cagr > 0 ? 'positive' : 'negative'
    },
    {
      label: 'Sharpe Ratio',
      value: summary.sharpe.toFixed(2),
      description: 'Risk-adjusted return',
      colorClass: summary.sharpe > 1 ? 'positive' : summary.sharpe > 0.5 ? 'warning' : 'negative'
    },
    {
      label: 'Max Drawdown',
      value: `${(summary.maxDrawdown * 100).toFixed(1)}%`,
      description: 'Largest peak-to-trough',
      colorClass: 'negative'
    },
    {
      label: 'Win Rate',
      value: `${(summary.winRate * 100).toFixed(0)}%`,
      description: 'Profitable periods',
      colorClass: summary.winRate > 0.55 ? 'positive' : 'warning'
    },
    {
      label: 'Volatility',
      value: `${(summary.volatility * 100).toFixed(1)}%`,
      description: 'Annual volatility',
      colorClass: ''
    },
    {
      label: 'Calmar Ratio',
      value: summary.calmarRatio.toFixed(2),
      description: 'CAGR / Max DD',
      colorClass: summary.calmarRatio > 1 ? 'positive' : 'warning'
    }
  ];

  return (
    <div className="bt-summary">
      {metrics.map((metric, idx) => (
        <div key={idx} className="summary-card">
          <span className="card-label">{metric.label}</span>
          <span className={`card-value ${metric.colorClass}`}>{metric.value}</span>
          <span className="card-description">{metric.description}</span>
        </div>
      ))}
    </div>
  );
}

// Universe Information Component
function UniverseInfo({ universe }) {
  const stats = [
    {
      label: 'Universe',
      value: universe.filter || 'ALL',
      description: 'Stock universe filter'
    },
    {
      label: 'Avg Eligible',
      value: universe.avgEligible?.toLocaleString() || '—',
      description: 'Stocks with factor data'
    },
    {
      label: 'Long Positions',
      value: universe.avgLongPositions || '—',
      description: `Top ${universe.longShortRatio?.long || 20}% by factor`
    },
    {
      label: 'Short Positions',
      value: universe.avgShortPositions || '—',
      description: `Bottom ${universe.longShortRatio?.short || 20}% by factor`
    },
    {
      label: 'Sectors',
      value: universe.avgSectors || '—',
      description: 'Avg sectors represented'
    },
    {
      label: 'Rebalances',
      value: universe.rebalanceCount || '—',
      description: 'Total rebalance events'
    }
  ];

  return (
    <div className="bt-universe-info">
      <h5>
        <Database size={14} />
        Backtest Universe
      </h5>
      <div className="universe-stats">
        {stats.map((stat, idx) => (
          <div key={idx} className="universe-stat">
            <span className="stat-label">{stat.label}</span>
            <span className="stat-value">{stat.value}</span>
            <span className="stat-description">{stat.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Equity Curve Chart Component
function EquityCurveChart({ equity }) {
  // Downsample for performance if needed
  const chartData = useMemo(() => {
    if (!equity || equity.length === 0) return [];

    const maxPoints = 500;
    const step = Math.max(1, Math.floor(equity.length / maxPoints));

    // Get initial value for normalization (handle both dollar amounts and multipliers)
    const initialValue = equity[0].value;
    const isNormalized = initialValue < 10; // If < 10, assume already normalized (multiplier form)

    return equity.filter((_, idx) => idx % step === 0).map(point => ({
      date: point.date,
      // Normalize: convert to percentage return from start
      cumReturn: isNormalized
        ? (point.value - 1) * 100           // Already normalized (1.0 = 0%)
        : ((point.value / initialValue) - 1) * 100, // Dollar amounts (100000 -> 0%)
      drawdown: point.drawdown * 100
    }));
  }, [equity]);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bt-chart-tooltip">
        <div className="tooltip-header">{formatDate(payload[0].payload.date)}</div>
        <div className="tooltip-row">
          <span className="tooltip-label">Return:</span>
          <span className={`tooltip-value ${payload[0].value > 0 ? 'positive' : 'negative'}`}>
            {payload[0].value.toFixed(1)}%
          </span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Drawdown:</span>
          <span className="tooltip-value negative">
            {payload[1]?.value.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bt-chart-section">
      <h4>
        <TrendingUp size={18} />
        Equity Curve
      </h4>
      <p className="chart-description">
        Cumulative return from long-short portfolio rebalanced monthly
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
            domain={['dataMin', 0]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="drawdown"
            fill="var(--negative)"
            fillOpacity={0.2}
            stroke="var(--negative)"
            strokeWidth={1}
            name="Drawdown"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="cumReturn"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            name="Cumulative Return"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Yearly Returns Chart Component
function YearlyReturnsChart({ yearlyData }) {
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    return (
      <div className="bt-chart-tooltip">
        <div className="tooltip-header">{data.year}</div>
        <div className="tooltip-row">
          <span className="tooltip-label">Return:</span>
          <span className={`tooltip-value ${data.return > 0 ? 'positive' : 'negative'}`}>
            {(data.return * 100).toFixed(1)}%
          </span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Max DD:</span>
          <span className="tooltip-value negative">
            {(data.maxDD * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bt-chart-section">
      <h4>
        <Calendar size={18} />
        Returns by Year
      </h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={yearlyData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
          />
          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeWidth={1} />
          <Bar dataKey="return" radius={[4, 4, 0, 0]}>
            {yearlyData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.return > 0 ? 'var(--positive)' : 'var(--negative)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Monthly Heatmap Component
function MonthlyHeatmap({ monthlyData }) {
  // Transform monthly data into heatmap structure
  const heatmapData = useMemo(() => {
    const dataByYear = {};

    monthlyData.forEach(item => {
      const [year, month] = item.month.split('-');
      if (!dataByYear[year]) {
        dataByYear[year] = { year, months: Array(12).fill(null) };
      }
      dataByYear[year].months[parseInt(month) - 1] = item.return;
    });

    // Calculate YTD for each year
    Object.values(dataByYear).forEach(yearData => {
      const validMonths = yearData.months.filter(m => m !== null);
      if (validMonths.length > 0) {
        yearData.ytd = validMonths.reduce((acc, m) => (1 + acc) * (1 + m) - 1, 0);
      } else {
        yearData.ytd = 0;
      }
    });

    return Object.values(dataByYear).sort((a, b) => b.year - a.year);
  }, [monthlyData]);

  const getReturnClass = (ret) => {
    if (ret === null) return 'neutral';
    if (ret > 0.05) return 'strong-positive';
    if (ret > 0) return 'positive';
    if (ret < -0.05) return 'strong-negative';
    if (ret < 0) return 'negative';
    return 'neutral';
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="bt-table-section">
      <h4>Monthly Returns Heatmap</h4>
      <div className="table-container">
        <table className="bt-returns-table">
          <thead>
            <tr>
              <th>Year</th>
              {months.map(m => (
                <th key={m}>{m}</th>
              ))}
              <th>YTD</th>
            </tr>
          </thead>
          <tbody>
            {heatmapData.map(row => (
              <tr key={row.year}>
                <td className="year-cell">{row.year}</td>
                {row.months.map((ret, idx) => (
                  <td key={idx} className={`return-cell ${getReturnClass(ret)}`}>
                    {ret !== null ? `${(ret * 100).toFixed(1)}%` : '-'}
                  </td>
                ))}
                <td className={`ytd-cell return-cell ${getReturnClass(row.ytd)}`}>
                  {(row.ytd * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
