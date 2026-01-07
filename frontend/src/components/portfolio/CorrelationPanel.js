// frontend/src/components/portfolio/CorrelationPanel.js
import { useState, useEffect } from 'react';
import {
  Loader, AlertTriangle, RefreshCw, Grid3X3, TrendingUp,
  Layers, PieChart, AlertCircle, ChevronDown, Info
} from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './SimulationPanels.css';

const PERIODS = [
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' },
  { value: '3y', label: '3 Years' }
];

function CorrelationPanel({ portfolioId }) {
  const [activeTab, setActiveTab] = useState('matrix');
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataErrors, setDataErrors] = useState({}); // Track errors per data source

  // Data states
  const [correlationData, setCorrelationData] = useState(null);
  const [covarianceData, setCovarianceData] = useState(null);
  const [riskContribution, setRiskContribution] = useState(null);
  const [rollingData, setRollingData] = useState(null);
  const [clusterData, setClusterData] = useState(null);

  // UI states
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId, period]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      setDataErrors({});

      // Helper to safely fetch and extract data/error
      const safeFetch = async (fetchFn, name) => {
        try {
          const res = await fetchFn();
          const data = res.data?.data || res.data;
          // Check for error inside the data object (backend pattern)
          if (data?.error) {
            return { error: data.error, data: null };
          }
          return { error: null, data };
        } catch (e) {
          return { error: e.response?.data?.error || e.message, data: null };
        }
      };

      const [corrResult, covResult, riskResult, rollingResult, clusterResult] = await Promise.all([
        safeFetch(() => simulateAPI.getCorrelation(parseInt(portfolioId), period), 'correlation'),
        safeFetch(() => simulateAPI.getCovariance(parseInt(portfolioId), period), 'covariance'),
        safeFetch(() => simulateAPI.getRiskContribution(parseInt(portfolioId), period), 'risk'),
        safeFetch(() => simulateAPI.getRollingCorrelation(parseInt(portfolioId), period, 60), 'rolling'),
        safeFetch(() => simulateAPI.getClusterAnalysis(parseInt(portfolioId), period), 'clusters')
      ]);

      // Track individual errors
      const errors = {};
      if (corrResult.error) errors.correlation = corrResult.error;
      if (covResult.error) errors.covariance = covResult.error;
      if (riskResult.error) errors.risk = riskResult.error;
      if (rollingResult.error) errors.rolling = rollingResult.error;
      if (clusterResult.error) errors.clusters = clusterResult.error;
      setDataErrors(errors);

      // Set main error if correlation (primary data) failed
      if (corrResult.error) {
        setError(corrResult.error);
      }

      // Set data (null if error)
      setCorrelationData(corrResult.data);
      setCovarianceData(covResult.data);
      setRiskContribution(riskResult.data);
      setRollingData(rollingResult.data);
      setClusterData(clusterResult.data);
    } catch (err) {
      console.error('Failed to load correlation data:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Color scale for correlation values (-1 to 1)
  const getCorrelationColor = (value) => {
    if (value === null || value === undefined) return 'var(--bg-tertiary)';
    if (value >= 0.8) return '#ef4444'; // High positive - red (risky)
    if (value >= 0.5) return '#f97316'; // Medium positive - orange
    if (value >= 0.2) return '#eab308'; // Low positive - yellow
    if (value >= -0.2) return '#22c55e'; // Uncorrelated - green (good)
    if (value >= -0.5) return '#14b8a6'; // Low negative - teal
    return '#06b6d4'; // Negative correlation - cyan (excellent)
  };

  // Correlation Matrix Heatmap
  const CorrelationMatrix = () => {
    if (!correlationData?.matrix || !correlationData?.symbols) {
      return <div className="no-data">Insufficient data for correlation matrix</div>;
    }

    const { matrix, symbols, avgCorrelation, highlyCorrelated } = correlationData;
    const n = symbols.length;
    const cellSize = Math.min(50, Math.max(30, 400 / n));

    return (
      <div className="correlation-matrix-section">
        <div className="matrix-header">
          <div className="matrix-stats">
            <div className="stat-item">
              <span className="stat-label">Avg Correlation</span>
              <span className="stat-value" style={{ color: getCorrelationColor(avgCorrelation) }}>
                {avgCorrelation?.toFixed(2) || '-'}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">High Corr Pairs</span>
              <span className="stat-value">{highlyCorrelated?.length || 0}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Diversification</span>
              <span className="stat-value positive">
                {correlationData.diversificationBenefit?.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <div className="matrix-container">
          {/* Y-axis labels */}
          <div className="matrix-y-labels">
            <div className="matrix-corner" />
            {symbols.map((sym, i) => (
              <div key={sym} className="matrix-label y-label" style={{ height: cellSize }}>
                {sym}
              </div>
            ))}
          </div>

          {/* Matrix grid */}
          <div className="matrix-grid-wrapper">
            {/* X-axis labels */}
            <div className="matrix-x-labels">
              {symbols.map((sym, i) => (
                <div key={sym} className="matrix-label x-label" style={{ width: cellSize }}>
                  {sym}
                </div>
              ))}
            </div>

            {/* The actual matrix */}
            <div
              className="matrix-grid"
              style={{
                gridTemplateColumns: `repeat(${n}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${n}, ${cellSize}px)`
              }}
            >
              {matrix.map((row, i) =>
                row.map((value, j) => {
                  const isHovered = hoveredCell?.i === i && hoveredCell?.j === j;
                  const isDiagonal = i === j;
                  return (
                    <div
                      key={`${i}-${j}`}
                      className={`matrix-cell ${isDiagonal ? 'diagonal' : ''} ${isHovered ? 'hovered' : ''}`}
                      style={{
                        backgroundColor: isDiagonal ? 'var(--bg-tertiary)' : getCorrelationColor(value),
                        width: cellSize,
                        height: cellSize
                      }}
                      onMouseEnter={() => setHoveredCell({ i, j, value, sym1: symbols[i], sym2: symbols[j] })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {cellSize >= 35 && !isDiagonal && value !== null && (
                        <span className="cell-value">{value.toFixed(2)}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Hover tooltip */}
        {hoveredCell && hoveredCell.i !== hoveredCell.j && (
          <div className="matrix-tooltip">
            <strong>{hoveredCell.sym1} ↔ {hoveredCell.sym2}</strong>
            <span style={{ color: getCorrelationColor(hoveredCell.value) }}>
              Correlation: {hoveredCell.value?.toFixed(3) || 'N/A'}
            </span>
            <span className="tooltip-hint">
              {hoveredCell.value > 0.7 ? 'High - Consider reducing one' :
               hoveredCell.value > 0.3 ? 'Moderate correlation' :
               hoveredCell.value > -0.2 ? 'Low - Good diversification' :
               'Negative - Excellent hedge'}
            </span>
          </div>
        )}

        {/* Color legend */}
        <div className="matrix-legend">
          <span className="legend-label">Correlation:</span>
          <div className="legend-scale">
            <div className="legend-item" style={{ background: '#06b6d4' }}>-1</div>
            <div className="legend-item" style={{ background: '#14b8a6' }}>-0.5</div>
            <div className="legend-item" style={{ background: '#22c55e' }}>0</div>
            <div className="legend-item" style={{ background: '#eab308' }}>0.3</div>
            <div className="legend-item" style={{ background: '#f97316' }}>0.6</div>
            <div className="legend-item" style={{ background: '#ef4444' }}>1</div>
          </div>
          <span className="legend-hint">Low = Better diversification</span>
        </div>

        {/* Highly correlated pairs warning */}
        {highlyCorrelated && highlyCorrelated.length > 0 && (
          <div className="correlated-pairs-warning">
            <AlertCircle size={16} />
            <div>
              <strong>Highly Correlated Pairs ({highlyCorrelated.length})</strong>
              <div className="pairs-list">
                {highlyCorrelated.slice(0, 5).map((pair, i) => (
                  <span key={i} className={`pair-badge ${pair.level}`}>
                    {pair.pair[0]} ↔ {pair.pair[1]}: {pair.correlation.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Risk Contribution Chart
  const RiskContributionChart = () => {
    if (!riskContribution?.riskContributions) {
      return <div className="no-data">Risk contribution data unavailable</div>;
    }

    const { riskContributions, portfolioVolatility, riskBalanceScore, suggestions } = riskContribution;
    const maxRisk = Math.max(...riskContributions.map(r => r.percentOfTotalRisk));

    return (
      <div className="risk-contribution-section">
        <div className="risk-header">
          <div className="risk-stats">
            <div className="stat-card primary">
              <span className="stat-label">Portfolio Volatility</span>
              <span className="stat-value">{portfolioVolatility?.toFixed(1)}%</span>
              <span className="stat-hint">Annualized</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Risk Balance Score</span>
              <span className="stat-value" style={{
                color: riskBalanceScore > 70 ? 'var(--success-color)' :
                       riskBalanceScore > 40 ? 'var(--warning-color)' : 'var(--danger-color)'
              }}>
                {riskBalanceScore}/100
              </span>
              <span className="stat-hint">Higher = More balanced</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Top 3 Risk</span>
              <span className="stat-value">{riskContribution.top3RiskConcentration?.toFixed(1)}%</span>
              <span className="stat-hint">Of total portfolio risk</span>
            </div>
          </div>
        </div>

        <div className="risk-bars">
          <div className="risk-bars-header">
            <span>Position</span>
            <span>Weight</span>
            <span>Risk Contribution</span>
            <span>Efficiency</span>
          </div>
          {riskContributions.map((rc, i) => {
            const efficiency = rc.riskEfficiency;
            const efficiencyColor = efficiency > 1.3 ? 'var(--danger-color)' :
                                    efficiency > 1.1 ? 'var(--warning-color)' :
                                    efficiency < 0.7 ? 'var(--success-color)' : 'var(--text-secondary)';
            return (
              <div key={rc.symbol} className="risk-bar-row">
                <span className="risk-symbol">{rc.symbol}</span>
                <span className="risk-weight">{rc.weight.toFixed(1)}%</span>
                <div className="risk-bar-container">
                  <div
                    className="risk-bar-fill"
                    style={{
                      width: `${(rc.percentOfTotalRisk / maxRisk) * 100}%`,
                      backgroundColor: efficiency > 1.2 ? 'var(--danger-color)' :
                                       efficiency < 0.8 ? 'var(--success-color)' : 'var(--accent-primary)'
                    }}
                  />
                  <span className="risk-bar-value">{rc.percentOfTotalRisk.toFixed(1)}%</span>
                </div>
                <span className="risk-efficiency" style={{ color: efficiencyColor }}>
                  {efficiency.toFixed(2)}x
                </span>
              </div>
            );
          })}
        </div>

        {suggestions && suggestions.length > 0 && (
          <div className="risk-suggestions">
            <h5>Recommendations</h5>
            {suggestions.map((sug, i) => (
              <div key={i} className={`suggestion-item ${sug.type}`}>
                <span className="suggestion-symbol">{sug.symbol}</span>
                <span className="suggestion-message">{sug.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Rolling Correlation Chart
  const RollingCorrelationChart = () => {
    if (!rollingData?.rollingData || rollingData.rollingData.length === 0) {
      return <div className="no-data">Insufficient data for rolling correlation</div>;
    }

    const { rollingData: data, statistics, warning, trend } = rollingData;
    const chartWidth = 600;
    const chartHeight = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    // Scale values
    const minCorr = Math.min(...data.map(d => d.avgCorrelation), -0.2);
    const maxCorr = Math.max(...data.map(d => d.avgCorrelation), 0.8);
    const range = maxCorr - minCorr;

    const points = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * plotWidth,
      y: padding.top + plotHeight - ((d.avgCorrelation - minCorr) / range) * plotHeight,
      date: d.date,
      value: d.avgCorrelation
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Average line
    const avgY = padding.top + plotHeight - ((statistics.average - minCorr) / range) * plotHeight;

    return (
      <div className="rolling-correlation-section">
        <div className="rolling-header">
          <div className="rolling-stats">
            <div className="stat-item">
              <span className="stat-label">Current</span>
              <span className="stat-value" style={{ color: getCorrelationColor(statistics.current) }}>
                {statistics.current.toFixed(2)}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average</span>
              <span className="stat-value">{statistics.average.toFixed(2)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Range</span>
              <span className="stat-value">{statistics.min.toFixed(2)} - {statistics.max.toFixed(2)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Trend</span>
              <span className={`stat-value ${trend === 'increasing' ? 'negative' : 'positive'}`}>
                {trend === 'increasing' ? '↑ Rising' : '↓ Falling'}
              </span>
            </div>
          </div>
        </div>

        <div className="rolling-chart">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(pct => {
              const y = padding.top + pct * plotHeight;
              const value = maxCorr - pct * range;
              return (
                <g key={pct}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="var(--border-color)"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--text-tertiary)"
                  >
                    {value.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* Average line */}
            <line
              x1={padding.left}
              y1={avgY}
              x2={chartWidth - padding.right}
              y2={avgY}
              stroke="var(--text-secondary)"
              strokeDasharray="6,3"
              strokeWidth="1"
            />
            <text
              x={chartWidth - padding.right + 4}
              y={avgY + 4}
              fontSize="9"
              fill="var(--text-secondary)"
            >
              avg
            </text>

            {/* Correlation line */}
            <path
              d={pathD}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth="2"
            />

            {/* Fill area */}
            <path
              d={`${pathD} L ${points[points.length-1].x} ${padding.top + plotHeight} L ${points[0].x} ${padding.top + plotHeight} Z`}
              fill="var(--accent-primary)"
              opacity="0.1"
            />

            {/* Data points (show fewer for readability) */}
            {points.filter((_, i) => i % Math.ceil(points.length / 15) === 0 || i === points.length - 1).map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="4"
                fill={getCorrelationColor(p.value)}
                stroke="white"
                strokeWidth="1"
              />
            ))}
          </svg>
        </div>

        {warning && (
          <div className="rolling-warning">
            <AlertTriangle size={16} />
            {warning}
          </div>
        )}

        {rollingData.correlationSpikes && rollingData.correlationSpikes.length > 0 && (
          <div className="correlation-spikes">
            <h5>Recent Correlation Spikes</h5>
            <div className="spikes-list">
              {rollingData.correlationSpikes.map((spike, i) => (
                <span key={i} className="spike-badge">
                  {spike.date}: {spike.correlation.toFixed(2)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Cluster Analysis
  const ClusterAnalysis = () => {
    if (!clusterData?.clusters) {
      return <div className="no-data">Cluster analysis unavailable</div>;
    }

    const { clusters, concentrationRisk, hiddenRisks, recommendations } = clusterData;
    const clusterColors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#06b6d4'];

    return (
      <div className="cluster-analysis-section">
        <div className="cluster-header">
          <div className="cluster-stats">
            <div className="stat-card">
              <span className="stat-label">Clusters Found</span>
              <span className="stat-value">{clusterData.clusterCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Effective Clusters</span>
              <span className="stat-value">{concentrationRisk.effectiveClusters}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Max Cluster Weight</span>
              <span className="stat-value" style={{
                color: concentrationRisk.maxClusterWeight > 50 ? 'var(--danger-color)' :
                       concentrationRisk.maxClusterWeight > 35 ? 'var(--warning-color)' : 'var(--success-color)'
              }}>
                {concentrationRisk.maxClusterWeight.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Cluster visualization */}
        <div className="cluster-visual">
          {clusters.map((cluster, i) => (
            <div
              key={cluster.id}
              className={`cluster-bubble ${selectedCluster === i ? 'selected' : ''}`}
              style={{
                borderColor: clusterColors[i % clusterColors.length],
                width: `${Math.max(100, cluster.combinedWeight * 3)}px`
              }}
              onClick={() => setSelectedCluster(selectedCluster === i ? null : i)}
            >
              <div className="cluster-header-mini" style={{ color: clusterColors[i % clusterColors.length] }}>
                Cluster {cluster.id}
              </div>
              <div className="cluster-weight">{cluster.combinedWeight.toFixed(1)}%</div>
              <div className="cluster-members">
                {cluster.members.slice(0, 4).join(', ')}
                {cluster.members.length > 4 && ` +${cluster.members.length - 4}`}
              </div>
              {cluster.riskLevel !== 'low' && (
                <span className={`cluster-risk-badge ${cluster.riskLevel}`}>
                  {cluster.riskLevel}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Selected cluster details */}
        {selectedCluster !== null && clusters[selectedCluster] && (
          <div className="cluster-details" style={{ borderColor: clusterColors[selectedCluster % clusterColors.length] }}>
            <h5>Cluster {clusters[selectedCluster].id} Details</h5>
            <div className="cluster-details-grid">
              <div className="detail-item">
                <span>Members:</span>
                <span>{clusters[selectedCluster].members.join(', ')}</span>
              </div>
              <div className="detail-item">
                <span>Avg Intra-Correlation:</span>
                <span style={{ color: getCorrelationColor(clusters[selectedCluster].avgIntraCorrelation) }}>
                  {clusters[selectedCluster].avgIntraCorrelation?.toFixed(2)}
                </span>
              </div>
              <div className="detail-item">
                <span>Sectors:</span>
                <span>
                  {clusters[selectedCluster].sectors.map(s => `${s.sector} (${s.count})`).join(', ')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Hidden risks */}
        {hiddenRisks && hiddenRisks.length > 0 && (
          <div className="hidden-risks">
            <h5><AlertCircle size={16} /> Hidden Concentration Risks</h5>
            {hiddenRisks.map((risk, i) => (
              <div key={i} className={`risk-alert ${risk.severity}`}>
                <span className="risk-type">{risk.type.replace('_', ' ')}</span>
                <span className="risk-message">{risk.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="cluster-recommendations">
            <h5>Recommendations</h5>
            {recommendations.map((rec, i) => (
              <div key={i} className={`recommendation-item ${rec.priority}`}>
                <span className="rec-priority">{rec.priority}</span>
                <span className="rec-message">{rec.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Covariance & Variance Tab
  const CovarianceAnalysis = () => {
    if (!covarianceData) {
      return <div className="no-data">Covariance data unavailable</div>;
    }

    const {
      portfolioVolatility, weightedAvgVolatility, diversificationBenefit,
      individualVolatilities
    } = covarianceData;

    // Sort by volatility for the chart
    const sortedVols = [...(individualVolatilities || [])].sort((a, b) => (b.volatility || 0) - (a.volatility || 0));
    const maxVol = Math.max(...sortedVols.map(v => v.volatility || 0), portfolioVolatility || 0);

    return (
      <div className="covariance-section">
        <div className="covariance-header">
          <div className="cov-stats">
            <div className="stat-card highlight">
              <span className="stat-label">Portfolio Volatility</span>
              <span className="stat-value">{portfolioVolatility?.toFixed(2)}%</span>
              <span className="stat-hint">Thanks to diversification</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Weighted Avg Volatility</span>
              <span className="stat-value">{weightedAvgVolatility?.toFixed(2)}%</span>
              <span className="stat-hint">If no diversification</span>
            </div>
            <div className="stat-card positive">
              <span className="stat-label">Diversification Benefit</span>
              <span className="stat-value">{diversificationBenefit?.toFixed(1)}%</span>
              <span className="stat-hint">Risk reduction</span>
            </div>
          </div>
        </div>

        {/* Volatility comparison chart */}
        <div className="volatility-comparison">
          <h5>Individual vs Portfolio Volatility</h5>
          <div className="vol-chart">
            {sortedVols.map((v, i) => (
              <div key={v.symbol} className="vol-bar-row">
                <span className="vol-symbol">{v.symbol}</span>
                <div className="vol-bar-container">
                  <div
                    className="vol-bar-fill individual"
                    style={{ width: `${((v.volatility || 0) / maxVol) * 100}%` }}
                  />
                  <span className="vol-value">{v.volatility?.toFixed(1)}%</span>
                </div>
                <span className="vol-weight">({v.weight.toFixed(1)}%)</span>
              </div>
            ))}
            {/* Portfolio bar */}
            <div className="vol-bar-row portfolio-row">
              <span className="vol-symbol">Portfolio</span>
              <div className="vol-bar-container">
                <div
                  className="vol-bar-fill portfolio"
                  style={{ width: `${((portfolioVolatility || 0) / maxVol) * 100}%` }}
                />
                <span className="vol-value">{portfolioVolatility?.toFixed(1)}%</span>
              </div>
              <span className="vol-weight">(100%)</span>
            </div>
          </div>
        </div>

        <div className="diversification-visual">
          <div className="div-benefit-bar">
            <div className="div-bar-bg">
              <div
                className="div-bar-reduced"
                style={{ width: `${100 - (diversificationBenefit || 0)}%` }}
              />
            </div>
            <div className="div-labels">
              <span>Portfolio Risk: {portfolioVolatility?.toFixed(1)}%</span>
              <span className="benefit-label">
                -{diversificationBenefit?.toFixed(1)}% saved through diversification
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="simulation-panel correlation-panel">
      <div className="panel-header">
        <div className="header-content">
          <h3>Correlation & Risk Analysis</h3>
          <p className="panel-description">
            Analyze portfolio correlations, risk contributions, and hidden concentration risks
          </p>
        </div>
        <div className="header-controls">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button className="btn-icon" onClick={loadAllData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      <div className="panel-content">
        {/* Tab Navigation */}
        <div className="correlation-tabs">
          <button
            className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''} ${dataErrors.correlation ? 'has-error' : ''}`}
            onClick={() => setActiveTab('matrix')}
            title={dataErrors.correlation || 'Correlation Matrix'}
          >
            <Grid3X3 size={16} />
            Correlation Matrix
            {dataErrors.correlation && <AlertCircle size={12} className="tab-error-icon" />}
          </button>
          <button
            className={`tab-btn ${activeTab === 'risk' ? 'active' : ''} ${dataErrors.risk ? 'has-error' : ''}`}
            onClick={() => setActiveTab('risk')}
            title={dataErrors.risk || 'Risk Contribution'}
          >
            <PieChart size={16} />
            Risk Contribution
            {dataErrors.risk && <AlertCircle size={12} className="tab-error-icon" />}
          </button>
          <button
            className={`tab-btn ${activeTab === 'rolling' ? 'active' : ''} ${dataErrors.rolling ? 'has-error' : ''}`}
            onClick={() => setActiveTab('rolling')}
            title={dataErrors.rolling || 'Rolling Correlation'}
          >
            <TrendingUp size={16} />
            Rolling Correlation
            {dataErrors.rolling && <AlertCircle size={12} className="tab-error-icon" />}
          </button>
          <button
            className={`tab-btn ${activeTab === 'clusters' ? 'active' : ''} ${dataErrors.clusters ? 'has-error' : ''}`}
            onClick={() => setActiveTab('clusters')}
            title={dataErrors.clusters || 'Cluster Analysis'}
          >
            <Layers size={16} />
            Cluster Analysis
            {dataErrors.clusters && <AlertCircle size={12} className="tab-error-icon" />}
          </button>
        </div>

        {loading && (
          <div className="loading-state">
            <Loader className="spinning" size={24} />
            <span>Analyzing portfolio correlations...</span>
          </div>
        )}

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {activeTab === 'matrix' && <CorrelationMatrix />}
            {activeTab === 'risk' && <RiskContributionChart />}
            {activeTab === 'rolling' && <RollingCorrelationChart />}
            {activeTab === 'clusters' && <ClusterAnalysis />}

            {/* Advanced toggle for covariance */}
            <div className="advanced-section">
              <button
                className={`section-toggle ${showAdvanced ? 'expanded' : ''}`}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <span className="toggle-title">
                  <Info size={16} />
                  Covariance & Variance Decomposition
                </span>
                <ChevronDown size={16} className="toggle-icon" />
              </button>
              {showAdvanced && <CovarianceAnalysis />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CorrelationPanel;
