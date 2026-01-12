// frontend/src/components/portfolio/DistributionPanel.js
// Standalone panel for analyzing return distributions

import { useState, useEffect, useMemo } from 'react';
import { Loader, AlertTriangle, BarChart3, Info, RefreshCw } from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './DistributionPanel.css';

function DistributionPanel({ portfolioId, symbol }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [selectedType, setSelectedType] = useState('auto');

  const fetchDistributionAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await simulateAPI.analyzeDistribution({
        portfolioId: portfolioId ? parseInt(portfolioId) : undefined,
        symbol,
        distributionType: selectedType
      });

      setAnalysisData(response.data.data || response.data);
    } catch (err) {
      console.error('Distribution analysis failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (portfolioId || symbol) {
      fetchDistributionAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId, symbol]);

  // Generate histogram bins from returns
  const histogramData = useMemo(() => {
    if (!analysisData?.returns || analysisData.returns.length === 0) return null;

    const returns = analysisData.returns;
    const numBins = Math.min(30, Math.ceil(Math.sqrt(returns.length)));

    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const binWidth = (max - min) / numBins;

    const bins = Array.from({ length: numBins }, (_, i) => ({
      start: min + i * binWidth,
      end: min + (i + 1) * binWidth,
      count: 0,
      midpoint: min + (i + 0.5) * binWidth
    }));

    returns.forEach(r => {
      const binIndex = Math.min(Math.floor((r - min) / binWidth), numBins - 1);
      if (binIndex >= 0 && binIndex < bins.length) {
        bins[binIndex].count++;
      }
    });

    // Normalize to density
    const totalCount = returns.length;
    bins.forEach(bin => {
      bin.density = bin.count / (totalCount * binWidth);
    });

    return bins;
  }, [analysisData?.returns]);

  // Generate Q-Q plot data
  const qqData = useMemo(() => {
    if (!analysisData?.returns || analysisData.returns.length === 0) return null;

    const returns = [...analysisData.returns].sort((a, b) => a - b);
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n);

    // Standard normal quantiles
    const normalQuantile = (p) => {
      // Approximation of inverse normal CDF
      const a1 = -3.969683028665376e+01;
      const a2 = 2.209460984245205e+02;
      const a3 = -2.759285104469687e+02;
      const a4 = 1.383577518672690e+02;
      const a5 = -3.066479806614716e+01;
      const a6 = 2.506628277459239e+00;
      const b1 = -5.447609879822406e+01;
      const b2 = 1.615858368580409e+02;
      const b3 = -1.556989798598866e+02;
      const b4 = 6.680131188771972e+01;
      const b5 = -1.328068155288572e+01;

      const pLow = 0.02425;
      const pHigh = 1 - pLow;

      let q, r;
      if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((a1 * q + a2) * q + a3) * q + a4) * q + a5) * q + a6) /
               ((((b1 * q + b2) * q + b3) * q + b4) * q + b5 + 1);
      } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
               (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
      } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((a1 * q + a2) * q + a3) * q + a4) * q + a5) * q + a6) /
                ((((b1 * q + b2) * q + b3) * q + b4) * q + b5 + 1);
      }
    };

    // Generate Q-Q points
    const qqPoints = returns.map((r, i) => {
      const p = (i + 0.5) / n;
      const theoretical = normalQuantile(p);
      const standardized = (r - mean) / std;
      return { theoretical, empirical: standardized, original: r };
    });

    return qqPoints;
  }, [analysisData?.returns]);

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(2)}%`;
  };

  const getKurtosisInterpretation = (kurtosis) => {
    if (kurtosis > 6) return { label: 'Extreme Fat Tails', color: 'var(--danger-color)', icon: '!!!' };
    if (kurtosis > 4) return { label: 'Fat Tails', color: 'var(--warning-color)', icon: '!' };
    if (kurtosis > 3.5) return { label: 'Slightly Fat Tails', color: 'var(--accent-primary)', icon: '' };
    return { label: 'Normal-like', color: 'var(--success-color)', icon: '' };
  };

  const getSkewnessInterpretation = (skewness) => {
    if (skewness < -0.5) return { label: 'Left Skewed', description: 'More downside risk' };
    if (skewness > 0.5) return { label: 'Right Skewed', description: 'More upside potential' };
    return { label: 'Symmetric', description: 'Balanced distribution' };
  };

  return (
    <div className="simulation-panel distribution-panel">
      <div className="panel-header">
        <div className="header-content">
          <BarChart3 size={20} className="header-icon" />
          <div>
            <h3>Return Distribution Analysis</h3>
            <p className="panel-description">
              Analyze the statistical properties of historical returns
            </p>
          </div>
        </div>
        <div className="header-controls">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="dist-type-select"
          >
            <option value="auto">Auto-fit Best</option>
            <option value="normal">Normal</option>
            <option value="studentT">Student's t</option>
            <option value="skewedT">Skewed t</option>
          </select>
          <button
            className="btn btn-secondary refresh-btn"
            onClick={fetchDistributionAnalysis}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            {loading ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="panel-content">
        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {loading && !analysisData && (
          <div className="loading-state">
            <Loader className="spinning" size={24} />
            <span>Analyzing distribution...</span>
          </div>
        )}

        {analysisData && (
          <>
            {/* Key Statistics */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Distribution Type</span>
                <span className="stat-value">{analysisData.distributionFit?.name || 'Unknown'}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Mean Return</span>
                <span className="stat-value">{formatPercent(analysisData.moments?.mean)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Std Deviation</span>
                <span className="stat-value">{formatPercent(analysisData.moments?.std)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Observations</span>
                <span className="stat-value">{analysisData.returns?.length || 0}</span>
              </div>
            </div>

            {/* Skewness & Kurtosis */}
            {analysisData.moments && (
              <div className="shape-metrics">
                <div className="shape-card">
                  <div className="shape-header">
                    <span className="shape-label">Skewness</span>
                    <span className="shape-value">{analysisData.moments.skewness?.toFixed(3)}</span>
                  </div>
                  <div className="shape-interpretation">
                    <span className="interp-label">
                      {getSkewnessInterpretation(analysisData.moments.skewness).label}
                    </span>
                    <span className="interp-desc">
                      {getSkewnessInterpretation(analysisData.moments.skewness).description}
                    </span>
                  </div>
                  <div className="skew-visual">
                    <div
                      className="skew-indicator"
                      style={{
                        left: `${50 + (analysisData.moments.skewness * 25)}%`,
                        background: analysisData.moments.skewness < 0 ? 'var(--danger-color)' :
                                   analysisData.moments.skewness > 0 ? 'var(--success-color)' : 'var(--accent-primary)'
                      }}
                    />
                    <div className="skew-track" />
                    <span className="skew-label left">Left</span>
                    <span className="skew-label center">0</span>
                    <span className="skew-label right">Right</span>
                  </div>
                </div>

                <div className="shape-card">
                  <div className="shape-header">
                    <span className="shape-label">Kurtosis</span>
                    <span className="shape-value" style={{ color: getKurtosisInterpretation(analysisData.moments.kurtosis).color }}>
                      {analysisData.moments.kurtosis?.toFixed(3)}
                      {getKurtosisInterpretation(analysisData.moments.kurtosis).icon && (
                        <span className="kurtosis-warning">{getKurtosisInterpretation(analysisData.moments.kurtosis).icon}</span>
                      )}
                    </span>
                  </div>
                  <div className="shape-interpretation">
                    <span className="interp-label" style={{ color: getKurtosisInterpretation(analysisData.moments.kurtosis).color }}>
                      {getKurtosisInterpretation(analysisData.moments.kurtosis).label}
                    </span>
                    <span className="interp-desc">
                      Normal = 3.0 | Yours = {analysisData.moments.kurtosis?.toFixed(2)}
                    </span>
                  </div>
                  <div className="kurtosis-bar">
                    <div
                      className="kurtosis-fill"
                      style={{
                        width: `${Math.min((analysisData.moments.kurtosis / 10) * 100, 100)}%`,
                        background: getKurtosisInterpretation(analysisData.moments.kurtosis).color
                      }}
                    />
                    <div className="kurtosis-normal-marker" style={{ left: '30%' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Histogram */}
            {histogramData && (
              <div className="chart-section">
                <h5>Return Distribution Histogram</h5>
                <div className="histogram-container">
                  <HistogramChart
                    data={histogramData}
                    fittedParams={analysisData.distributionFit}
                    moments={analysisData.moments}
                  />
                </div>
              </div>
            )}

            {/* Q-Q Plot */}
            {qqData && (
              <div className="chart-section">
                <h5>Q-Q Plot (Normal Comparison)</h5>
                <p className="chart-description">
                  Points above/below the diagonal indicate heavier/lighter tails than normal
                </p>
                <div className="qq-container">
                  <QQPlot data={qqData} />
                </div>
              </div>
            )}

            {/* VaR Comparison */}
            {analysisData.varComparison && (
              <div className="var-section">
                <h5>Value at Risk Comparison</h5>
                <div className="var-grid">
                  <div className="var-item">
                    <span className="var-label">Normal VaR (95%)</span>
                    <span className="var-value">{formatPercent(analysisData.varComparison.normalVaR)}</span>
                  </div>
                  <div className="var-item">
                    <span className="var-label">Cornish-Fisher VaR (95%)</span>
                    <span className="var-value">{formatPercent(analysisData.varComparison.adjustedVaR)}</span>
                  </div>
                  <div className="var-item highlight">
                    <span className="var-label">Normal Underestimates By</span>
                    <span className="var-value" style={{
                      color: analysisData.varComparison.underestimationPct > 20 ? 'var(--danger-color)' :
                             analysisData.varComparison.underestimationPct > 10 ? 'var(--warning-color)' : 'var(--text-primary)'
                    }}>
                      {analysisData.varComparison.underestimationPct?.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Distribution Parameters */}
            {analysisData.distributionFit?.params && (
              <div className="params-section">
                <h5>Fitted Parameters</h5>
                <div className="params-grid">
                  {Object.entries(analysisData.distributionFit.params).map(([key, value]) => (
                    <div key={key} className="param-item">
                      <span className="param-name">{key}</span>
                      <span className="param-value">{typeof value === 'number' ? value.toFixed(4) : value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="info-box">
              <Info size={16} />
              <div>
                <strong>Understanding Your Returns:</strong>
                {analysisData.moments?.kurtosis > 4 && (
                  <> Your returns exhibit <em>fat tails</em>, meaning extreme events occur more frequently than a normal distribution predicts. This is typical for financial returns.</>
                )}
                {analysisData.moments?.kurtosis <= 4 && analysisData.moments?.kurtosis > 3 && (
                  <> Your returns are close to normally distributed, with slightly heavier tails.</>
                )}
                {analysisData.moments?.skewness < -0.3 && (
                  <> The negative skewness indicates larger losses occur more frequently than large gains.</>
                )}
                {' '}Use parametric simulations to capture these characteristics in your projections.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Histogram Chart Component
function HistogramChart({ data, fittedParams, moments }) {
  const width = 500;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxDensity = Math.max(...data.map(d => d.density)) * 1.1;
  const minX = data[0].start;
  const maxX = data[data.length - 1].end;

  const xScale = (x) => padding.left + ((x - minX) / (maxX - minX)) * chartWidth;
  const yScale = (y) => padding.top + chartHeight - (y / maxDensity) * chartHeight;

  // Generate normal PDF curve for comparison
  const normalPdf = (x, mean, std) => {
    const z = (x - mean) / std;
    return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
  };

  const normalCurve = useMemo(() => {
    if (!moments) return '';
    const points = [];
    const step = (maxX - minX) / 100;
    for (let x = minX; x <= maxX; x += step) {
      const y = normalPdf(x, moments.mean, moments.std);
      points.push(`${xScale(x)},${yScale(y)}`);
    }
    return `M ${points.join(' L ')}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments, minX, maxX, chartWidth, chartHeight]);

  const barWidth = chartWidth / data.length - 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="histogram-svg">
      {/* Grid lines */}
      <g className="grid">
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={padding.top + chartHeight * (1 - pct)}
            x2={width - padding.right}
            y2={padding.top + chartHeight * (1 - pct)}
            stroke="var(--border-color)"
            strokeDasharray="3,3"
            opacity="0.5"
          />
        ))}
      </g>

      {/* Histogram bars */}
      {data.map((bin, i) => (
        <rect
          key={i}
          x={xScale(bin.start) + 1}
          y={yScale(bin.density)}
          width={barWidth}
          height={chartHeight - (yScale(bin.density) - padding.top)}
          fill="rgba(99, 102, 241, 0.6)"
          stroke="rgba(99, 102, 241, 0.8)"
          strokeWidth="1"
        />
      ))}

      {/* Normal PDF curve */}
      {normalCurve && (
        <path
          d={normalCurve}
          fill="none"
          stroke="var(--danger-color)"
          strokeWidth="2"
          strokeDasharray="5,3"
          opacity="0.8"
        />
      )}

      {/* Axes */}
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="var(--border-color)"
      />
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="var(--border-color)"
      />

      {/* X-axis labels */}
      {[-0.1, -0.05, 0, 0.05, 0.1].filter(v => v >= minX && v <= maxX).map((tick, i) => (
        <text
          key={i}
          x={xScale(tick)}
          y={height - padding.bottom + 15}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-tertiary)"
        >
          {(tick * 100).toFixed(0)}%
        </text>
      ))}

      {/* Legend */}
      <g transform={`translate(${width - padding.right - 120}, ${padding.top})`}>
        <rect x="0" y="0" width="12" height="12" fill="rgba(99, 102, 241, 0.6)" />
        <text x="16" y="10" fontSize="10" fill="var(--text-secondary)">Actual Returns</text>
        <line x1="0" y1="22" x2="12" y2="22" stroke="var(--danger-color)" strokeWidth="2" strokeDasharray="5,3" />
        <text x="16" y="26" fontSize="10" fill="var(--text-secondary)">Normal PDF</text>
      </g>
    </svg>
  );
}

// Q-Q Plot Component
function QQPlot({ data }) {
  const width = 300;
  const height = 300;
  const padding = 40;
  const chartSize = width - 2 * padding;

  const minVal = Math.min(
    Math.min(...data.map(d => d.theoretical)),
    Math.min(...data.map(d => d.empirical))
  ) - 0.5;
  const maxVal = Math.max(
    Math.max(...data.map(d => d.theoretical)),
    Math.max(...data.map(d => d.empirical))
  ) + 0.5;

  const scale = (val) => padding + ((val - minVal) / (maxVal - minVal)) * chartSize;
  const yScale = (val) => height - scale(val) + padding;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="qq-svg">
      {/* Grid */}
      <g className="grid">
        {[-2, -1, 0, 1, 2].filter(v => v >= minVal && v <= maxVal).map((tick, i) => (
          <g key={i}>
            <line
              x1={scale(tick)}
              y1={padding}
              x2={scale(tick)}
              y2={height - padding}
              stroke="var(--border-color)"
              strokeDasharray="3,3"
              opacity="0.3"
            />
            <line
              x1={padding}
              y1={yScale(tick)}
              x2={width - padding}
              y2={yScale(tick)}
              stroke="var(--border-color)"
              strokeDasharray="3,3"
              opacity="0.3"
            />
          </g>
        ))}
      </g>

      {/* Reference line (y = x) */}
      <line
        x1={scale(minVal)}
        y1={yScale(minVal)}
        x2={scale(maxVal)}
        y2={yScale(maxVal)}
        stroke="var(--danger-color)"
        strokeWidth="2"
        opacity="0.8"
      />

      {/* Data points */}
      {data.map((point, i) => (
        <circle
          key={i}
          cx={scale(point.theoretical)}
          cy={yScale(point.empirical)}
          r="3"
          fill="var(--accent-primary)"
          opacity="0.6"
        />
      ))}

      {/* Axes */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-color)" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border-color)" />

      {/* Labels */}
      <text x={width / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
        Theoretical Quantiles
      </text>
      <text
        x={12}
        y={height / 2}
        textAnchor="middle"
        fontSize="11"
        fill="var(--text-secondary)"
        transform={`rotate(-90, 12, ${height / 2})`}
      >
        Sample Quantiles
      </text>
    </svg>
  );
}

export default DistributionPanel;
