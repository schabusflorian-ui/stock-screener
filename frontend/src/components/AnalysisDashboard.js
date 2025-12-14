// frontend/src/components/AnalysisDashboard.js
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { companyAPI } from '../services/api';
import './AnalysisDashboard.css';

// Format helpers
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '-';
  const absValue = Math.abs(value);
  if (absValue >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (absValue >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
};

const formatRatio = (value) => {
  if (value === null || value === undefined) return '-';
  return value.toFixed(2);
};

// ============ SUB-COMPONENTS ============

// Quality Scores Section
function QualityScores({ piotroski, altmanZ }) {
  const piotroskiColor = piotroski?.score >= 7 ? '#22c55e' :
                         piotroski?.score >= 5 ? '#f59e0b' : '#ef4444';

  const altmanColor = altmanZ?.zone === 'safe' ? '#22c55e' :
                      altmanZ?.zone === 'grey' ? '#f59e0b' : '#ef4444';

  const piotroskiComponents = piotroski?.components || {};
  const componentLabels = {
    positiveNetIncome: 'Positive Net Income',
    positiveROA: 'Positive ROA',
    positiveCFO: 'Positive Operating CF',
    cfoGreaterThanNetIncome: 'CFO > Net Income',
    decreasingLeverage: 'Decreasing Debt',
    increasingCurrentRatio: 'Improving Liquidity',
    noNewShares: 'No Dilution',
    increasingGrossMargin: 'Improving Margins',
    increasingAssetTurnover: 'Improving Efficiency'
  };

  return (
    <div className="quality-scores-section">
      <h3>Quality Scores</h3>
      <div className="scores-grid">
        {/* Piotroski F-Score */}
        <div className="score-card">
          <div className="score-header">
            <h4>Piotroski F-Score</h4>
            <span className="score-badge" style={{ backgroundColor: piotroskiColor }}>
              {piotroski?.score ?? '-'}/9
            </span>
          </div>
          <p className="score-interpretation">{piotroski?.interpretation}</p>

          {piotroski?.score !== null && (
            <div className="score-components">
              <div className="component-group">
                <span className="group-label">Profitability</span>
                <div className="component-items">
                  {['positiveNetIncome', 'positiveROA', 'positiveCFO', 'cfoGreaterThanNetIncome'].map(key => (
                    <div key={key} className={`component-item ${piotroskiComponents[key] ? 'pass' : 'fail'}`}>
                      <span className="check">{piotroskiComponents[key] ? '✓' : '✗'}</span>
                      <span>{componentLabels[key]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="component-group">
                <span className="group-label">Leverage & Liquidity</span>
                <div className="component-items">
                  {['decreasingLeverage', 'increasingCurrentRatio', 'noNewShares'].map(key => (
                    <div key={key} className={`component-item ${piotroskiComponents[key] ? 'pass' : 'fail'}`}>
                      <span className="check">{piotroskiComponents[key] ? '✓' : '✗'}</span>
                      <span>{componentLabels[key]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="component-group">
                <span className="group-label">Operating Efficiency</span>
                <div className="component-items">
                  {['increasingGrossMargin', 'increasingAssetTurnover'].map(key => (
                    <div key={key} className={`component-item ${piotroskiComponents[key] ? 'pass' : 'fail'}`}>
                      <span className="check">{piotroskiComponents[key] ? '✓' : '✗'}</span>
                      <span>{componentLabels[key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Altman Z-Score */}
        <div className="score-card">
          <div className="score-header">
            <h4>Altman Z-Score</h4>
            <span className="score-badge" style={{ backgroundColor: altmanColor }}>
              {altmanZ?.score ?? '-'}
            </span>
          </div>
          <p className="score-interpretation">{altmanZ?.interpretation}</p>

          {altmanZ?.score !== null && (
            <div className="z-score-meter">
              <div className="meter-track">
                <div className="zone distress" style={{ width: '30%' }}>Distress</div>
                <div className="zone grey" style={{ width: '20%' }}>Grey</div>
                <div className="zone safe" style={{ width: '50%' }}>Safe</div>
              </div>
              <div
                className="meter-marker"
                style={{
                  left: `${Math.min(100, Math.max(0, (altmanZ.score / 5) * 100))}%`
                }}
              >
                <span>{altmanZ.score}</span>
              </div>
            </div>
          )}

          {altmanZ?.components && (
            <div className="z-components">
              <div className="z-component">
                <span className="label">Working Capital/Assets</span>
                <span className="value">{(altmanZ.components.workingCapitalRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="z-component">
                <span className="label">Retained Earnings/Assets</span>
                <span className="value">{(altmanZ.components.retainedEarningsRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="z-component">
                <span className="label">EBIT/Assets</span>
                <span className="value">{(altmanZ.components.ebitRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="z-component">
                <span className="label">Market Cap/Liabilities</span>
                <span className="value">{altmanZ.components.marketToDebtRatio.toFixed(2)}x</span>
              </div>
              <div className="z-component">
                <span className="label">Sales/Assets</span>
                <span className="value">{altmanZ.components.assetTurnover.toFixed(2)}x</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Capital Allocation Section
function CapitalAllocation({ data }) {
  if (!data || data.length === 0) {
    return <div className="no-data">No capital allocation data available</div>;
  }

  const chartData = [...data].reverse().map(d => ({
    period: d.period.substring(0, 4),
    Dividends: Math.abs(d.dividends) / 1e9,
    Buybacks: Math.abs(d.buybacks) / 1e9,
    CapEx: Math.abs(d.capex) / 1e9,
    Acquisitions: Math.abs(d.acquisitions) / 1e9,
    'Debt Repayment': Math.abs(d.debtRepayment) / 1e9
  }));

  const latestData = data[0];
  const totalReturned = Math.abs(latestData.dividends) + Math.abs(latestData.buybacks);
  const fcf = latestData.freeCashFlow;

  return (
    <div className="capital-allocation-section">
      <h3>Capital Allocation</h3>

      <div className="allocation-summary">
        <div className="summary-stat">
          <span className="label">Free Cash Flow</span>
          <span className={`value ${fcf >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(fcf)}
          </span>
        </div>
        <div className="summary-stat">
          <span className="label">Shareholder Returns</span>
          <span className="value">{formatCurrency(-totalReturned)}</span>
        </div>
        <div className="summary-stat">
          <span className="label">Payout Ratio</span>
          <span className="value">
            {fcf > 0 ? formatPercent((totalReturned / fcf) * 100) : '-'}
          </span>
        </div>
      </div>

      <div className="allocation-chart">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v.toFixed(0)}B`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value) => [`$${value.toFixed(1)}B`, '']}
            />
            <Legend />
            <Bar dataKey="Dividends" stackId="a" fill="#22c55e" />
            <Bar dataKey="Buybacks" stackId="a" fill="#3b82f6" />
            <Bar dataKey="CapEx" stackId="b" fill="#8b5cf6" />
            <Bar dataKey="Acquisitions" stackId="b" fill="#f59e0b" />
            <Bar dataKey="Debt Repayment" stackId="b" fill="#64748b" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="allocation-breakdown">
        <h4>Latest Period Breakdown</h4>
        <div className="breakdown-bars">
          {[
            { label: 'Dividends', value: latestData.dividends, color: '#22c55e' },
            { label: 'Buybacks', value: latestData.buybacks, color: '#3b82f6' },
            { label: 'CapEx', value: latestData.capex, color: '#8b5cf6' },
            { label: 'Acquisitions', value: latestData.acquisitions, color: '#f59e0b' },
            { label: 'Debt Repayment', value: latestData.debtRepayment, color: '#64748b' }
          ].map(item => {
            const absValue = Math.abs(item.value);
            const maxValue = Math.max(
              Math.abs(latestData.dividends),
              Math.abs(latestData.buybacks),
              Math.abs(latestData.capex),
              Math.abs(latestData.acquisitions),
              Math.abs(latestData.debtRepayment)
            ) || 1;
            const width = (absValue / maxValue) * 100;

            return (
              <div key={item.label} className="breakdown-row">
                <span className="breakdown-label">{item.label}</span>
                <div className="breakdown-bar-track">
                  <div
                    className="breakdown-bar-fill"
                    style={{ width: `${width}%`, backgroundColor: item.color }}
                  />
                </div>
                <span className="breakdown-value">{formatCurrency(item.value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Valuation History Section
function ValuationHistory({ data }) {
  const [selectedMetric, setSelectedMetric] = useState('pe_ratio');

  const metrics = [
    { key: 'pe_ratio', label: 'P/E Ratio' },
    { key: 'pb_ratio', label: 'P/B Ratio' },
    { key: 'ev_ebitda', label: 'EV/EBITDA' },
    { key: 'fcf_yield', label: 'FCF Yield' }
  ];

  if (!data || data.length === 0) {
    return <div className="no-data">No valuation history available</div>;
  }

  const chartData = [...data].reverse().map(d => ({
    period: d.period,
    value: d[selectedMetric]
  })).filter(d => d.value !== null);

  const values = chartData.map(d => d.value).filter(v => v !== null);
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const current = values[values.length - 1] || 0;

  return (
    <div className="valuation-history-section">
      <div className="valuation-header">
        <h3>Valuation History</h3>
        <div className="metric-selector">
          {metrics.map(m => (
            <button
              key={m.key}
              className={selectedMetric === m.key ? 'active' : ''}
              onClick={() => setSelectedMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="valuation-stats">
        <div className="stat">
          <span className="label">Current</span>
          <span className="value">{formatRatio(current)}</span>
        </div>
        <div className="stat">
          <span className="label">Average</span>
          <span className="value">{formatRatio(avg)}</span>
        </div>
        <div className="stat">
          <span className="label">vs Avg</span>
          <span className={`value ${current > avg ? 'negative' : 'positive'}`}>
            {avg > 0 ? `${((current - avg) / avg * 100).toFixed(0)}%` : '-'}
          </span>
        </div>
      </div>

      <div className="valuation-chart">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Peer Comparison Section
function PeerComparison({ peers, sectorAverage, currentCompany, latestMetrics }) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('market_cap');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  const sortedPeers = useMemo(() => {
    if (!peers) return [];
    return [...peers].sort((a, b) => {
      const aVal = a[sortBy] ?? -Infinity;
      const bVal = b[sortBy] ?? -Infinity;
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [peers, sortBy, sortDir]);

  const columns = [
    { key: 'symbol', label: 'Symbol', format: v => v },
    { key: 'market_cap', label: 'Market Cap', format: formatCurrency },
    { key: 'roic', label: 'ROIC', format: formatPercent },
    { key: 'roe', label: 'ROE', format: formatPercent },
    { key: 'net_margin', label: 'Net Margin', format: formatPercent },
    { key: 'debt_to_equity', label: 'D/E', format: formatRatio },
    { key: 'pe_ratio', label: 'P/E', format: formatRatio }
  ];

  return (
    <div className="peer-comparison-section">
      <h3>Peer Comparison</h3>

      {sectorAverage && (
        <div className="sector-comparison">
          <h4>vs Sector Average ({sectorAverage.company_count} companies)</h4>
          <div className="comparison-bars">
            {[
              { label: 'ROIC', value: latestMetrics?.roic, avg: sectorAverage.avg_roic },
              { label: 'ROE', value: latestMetrics?.roe, avg: sectorAverage.avg_roe },
              { label: 'Net Margin', value: latestMetrics?.net_margin, avg: sectorAverage.avg_net_margin },
              { label: 'P/E', value: latestMetrics?.pe_ratio, avg: sectorAverage.avg_pe, inverse: true }
            ].map(item => {
              if (item.value === null || item.avg === null) return null;
              const diff = item.inverse
                ? ((item.avg - item.value) / item.avg * 100)
                : ((item.value - item.avg) / Math.abs(item.avg) * 100);
              const isPositive = item.inverse ? diff > 0 : diff > 0;

              return (
                <div key={item.label} className="comparison-item">
                  <span className="comp-label">{item.label}</span>
                  <div className="comp-values">
                    <span className="comp-current">{formatPercent(item.value)}</span>
                    <span className="comp-vs">vs</span>
                    <span className="comp-avg">{formatPercent(item.avg)}</span>
                    <span className={`comp-diff ${isPositive ? 'positive' : 'negative'}`}>
                      {isPositive ? '+' : ''}{diff.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {sortedPeers.length > 0 && (
        <div className="peers-table-container">
          <h4>Industry Peers</h4>
          <table className="peers-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={sortBy === col.key ? 'sorted' : ''}
                  >
                    {col.label}
                    {sortBy === col.key && (
                      <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPeers.map(peer => (
                <tr
                  key={peer.symbol}
                  onClick={() => navigate(`/company/${peer.symbol}`)}
                  className="clickable"
                >
                  {columns.map(col => (
                    <td key={col.key}>
                      {col.format(peer[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(!peers || peers.length === 0) && (
        <p className="no-peers">No peer companies found in this industry</p>
      )}
    </div>
  );
}

// DCF Calculator
function DCFCalculator({ latestMetrics, companyName }) {
  const [inputs, setInputs] = useState({
    fcf: latestMetrics?.fcf || 0,
    growthRate: 10,
    terminalGrowth: 3,
    discountRate: 10,
    years: 10
  });

  const results = useMemo(() => {
    const { fcf, growthRate, terminalGrowth, discountRate, years } = inputs;
    if (fcf <= 0) return null;

    let pvCashFlows = 0;
    const projectedCashFlows = [];

    for (let i = 1; i <= years; i++) {
      const projectedFCF = fcf * Math.pow(1 + growthRate / 100, i);
      const discountFactor = Math.pow(1 + discountRate / 100, i);
      const pvFCF = projectedFCF / discountFactor;
      pvCashFlows += pvFCF;
      projectedCashFlows.push({
        year: i,
        fcf: projectedFCF,
        pv: pvFCF
      });
    }

    // Terminal value
    const terminalFCF = fcf * Math.pow(1 + growthRate / 100, years) * (1 + terminalGrowth / 100);
    const terminalValue = terminalFCF / (discountRate / 100 - terminalGrowth / 100);
    const pvTerminal = terminalValue / Math.pow(1 + discountRate / 100, years);

    const enterpriseValue = pvCashFlows + pvTerminal;

    return {
      pvCashFlows,
      pvTerminal,
      enterpriseValue,
      projectedCashFlows
    };
  }, [inputs]);

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  return (
    <div className="dcf-calculator-section">
      <h3>DCF Calculator</h3>
      <p className="dcf-disclaimer">Simple DCF model for educational purposes. Not investment advice.</p>

      <div className="dcf-inputs">
        <div className="input-group">
          <label>Base FCF ($M)</label>
          <input
            type="number"
            value={inputs.fcf / 1e6}
            onChange={(e) => handleInputChange('fcf', e.target.value * 1e6)}
          />
        </div>
        <div className="input-group">
          <label>Growth Rate (%)</label>
          <input
            type="number"
            value={inputs.growthRate}
            onChange={(e) => handleInputChange('growthRate', e.target.value)}
            min="0"
            max="50"
          />
        </div>
        <div className="input-group">
          <label>Terminal Growth (%)</label>
          <input
            type="number"
            value={inputs.terminalGrowth}
            onChange={(e) => handleInputChange('terminalGrowth', e.target.value)}
            min="0"
            max="5"
          />
        </div>
        <div className="input-group">
          <label>Discount Rate (%)</label>
          <input
            type="number"
            value={inputs.discountRate}
            onChange={(e) => handleInputChange('discountRate', e.target.value)}
            min="5"
            max="20"
          />
        </div>
        <div className="input-group">
          <label>Projection Years</label>
          <input
            type="number"
            value={inputs.years}
            onChange={(e) => handleInputChange('years', e.target.value)}
            min="5"
            max="15"
          />
        </div>
      </div>

      {results && (
        <div className="dcf-results">
          <div className="result-card primary">
            <span className="result-label">Implied Enterprise Value</span>
            <span className="result-value">{formatCurrency(results.enterpriseValue)}</span>
          </div>
          <div className="result-breakdown">
            <div className="result-item">
              <span>PV of Cash Flows</span>
              <span>{formatCurrency(results.pvCashFlows)}</span>
            </div>
            <div className="result-item">
              <span>PV of Terminal Value</span>
              <span>{formatCurrency(results.pvTerminal)}</span>
            </div>
            <div className="result-item">
              <span>Terminal Value %</span>
              <span>{((results.pvTerminal / results.enterpriseValue) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      {!results && inputs.fcf <= 0 && (
        <div className="dcf-no-fcf">
          <p>Negative or zero FCF - DCF not applicable</p>
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============

function AnalysisDashboard({ symbol, periodType = 'annual' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('quality');

  useEffect(() => {
    const loadAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await companyAPI.getAnalysis(symbol, { periodType });
        setData(response.data);
      } catch (err) {
        console.error('Failed to load analysis:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      loadAnalysis();
    }
  }, [symbol, periodType]);

  if (loading) {
    return <div className="analysis-loading">Loading analysis...</div>;
  }

  if (error) {
    return <div className="analysis-error">Failed to load analysis: {error}</div>;
  }

  if (!data) {
    return <div className="analysis-error">No analysis data available</div>;
  }

  const sections = [
    { id: 'quality', label: 'Quality Scores' },
    { id: 'capital', label: 'Capital Allocation' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'peers', label: 'Peers' },
    { id: 'dcf', label: 'DCF' }
  ];

  return (
    <div className="analysis-dashboard">
      <div className="analysis-nav">
        {sections.map(section => (
          <button
            key={section.id}
            className={activeSection === section.id ? 'active' : ''}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="analysis-content">
        {activeSection === 'quality' && (
          <QualityScores
            piotroski={data.qualityScores?.piotroski}
            altmanZ={data.qualityScores?.altmanZ}
          />
        )}

        {activeSection === 'capital' && (
          <CapitalAllocation data={data.capitalAllocation} />
        )}

        {activeSection === 'valuation' && (
          <ValuationHistory data={data.valuationHistory} />
        )}

        {activeSection === 'peers' && (
          <PeerComparison
            peers={data.peerComparison?.peers}
            sectorAverage={data.peerComparison?.sectorAverage}
            currentCompany={data.company}
            latestMetrics={data.latestMetrics}
          />
        )}

        {activeSection === 'dcf' && (
          <DCFCalculator
            latestMetrics={data.latestMetrics}
            companyName={data.company?.name}
          />
        )}
      </div>
    </div>
  );
}

export default AnalysisDashboard;
