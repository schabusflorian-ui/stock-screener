// frontend/src/components/portfolio/DistributionPanel.js
// Standalone panel for analyzing return distributions

import { useState, useEffect, useMemo } from 'react';
import { Loader, AlertTriangle, BarChart3, Info, RefreshCw, HelpCircle, TrendingDown, TrendingUp, CheckCircle, AlertCircle } from '../icons';
import { simulateAPI } from '../../services/api';
import { useAskAI } from '../../hooks/useAskAI';
import './DistributionPanel.css';

// User-friendly labels for distribution types
const DISTRIBUTION_LABELS = {
  auto: {
    label: 'Auto-detect Best Fit',
    description: 'Automatically selects the distribution that best matches your data'
  },
  normal: {
    label: 'Normal (Bell Curve)',
    description: 'Standard bell curve - assumes symmetric returns with no fat tails'
  },
  studentT: {
    label: 'Student\'s t',
    description: 'Accounts for fat tails (extreme events) - common for stocks'
  },
  skewedT: {
    label: 'Skewed t',
    description: 'Captures both fat tails and asymmetry in returns'
  }
};

// Tooltips for key concepts
const TOOLTIPS = {
  kurtosis: 'Measures how often extreme returns occur. Higher values mean more "black swan" events. Normal distribution = 3.',
  skewness: 'Measures asymmetry. Negative = more large losses; Positive = more large gains; Zero = symmetric.',
  normalVaR: 'Value at Risk assuming normal distribution - often underestimates risk for stocks.',
  cornishFisher: 'Value at Risk adjusted for fat tails and skewness - more realistic for most stocks.',
  qqPlot: 'If points follow the diagonal line, returns are normally distributed. Deviations indicate fat tails.',
  observations: 'More data points = more reliable analysis. Recommend 250+ trading days (1 year).'
};

function DistributionPanel({ portfolioId, symbol }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [selectedType, setSelectedType] = useState('auto');

  // Ask AI context menu for distribution analysis
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'distribution',
    portfolioId,
    symbol,
    label: 'Return Distribution',
    bestFit: analysisData?.bestFit,
    kurtosis: analysisData?.stats?.kurtosis,
    skewness: analysisData?.stats?.skewness
  }));

  const fetchDistributionAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      let response;
      if (portfolioId) {
        // Use the GET endpoint for existing portfolios
        response = await simulateAPI.getPortfolioDistribution(
          parseInt(portfolioId),
          selectedType
        );
      } else if (symbol) {
        // Use the POST endpoint with symbol allocation
        response = await simulateAPI.analyzeDistribution({
          allocations: [{ symbol, weight: 1 }],
          distributionType: selectedType
        });
      } else {
        throw new Error('Either portfolioId or symbol is required');
      }

      const data = response.data.data ?? response.data;
      const returns = Array.isArray(data?.returns) ? data.returns : [];
      setAnalysisData(data ? { ...data, returns } : null);
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
    const returns = Array.isArray(analysisData?.returns) ? analysisData.returns : [];
    if (returns.length === 0) return null;
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
    const rawReturns = Array.isArray(analysisData?.returns) ? analysisData.returns : [];
    if (rawReturns.length === 0) return null;

    const returns = [...rawReturns].sort((a, b) => a - b);
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
    if (kurtosis > 6) return {
      label: 'Extreme Fat Tails',
      color: 'var(--danger-color)',
      icon: AlertTriangle,
      advice: 'Use conservative position sizing. Standard risk models significantly underestimate your risk.'
    };
    if (kurtosis > 4) return {
      label: 'Fat Tails',
      color: 'var(--warning-color)',
      icon: AlertCircle,
      advice: 'Consider using Student\'s t distribution for simulations. Normal VaR underestimates risk.'
    };
    if (kurtosis > 3.5) return {
      label: 'Slightly Fat Tails',
      color: 'var(--accent-primary)',
      icon: null,
      advice: 'Typical for stocks. Use Cornish-Fisher adjusted VaR for more accurate risk estimates.'
    };
    return {
      label: 'Normal-like',
      color: 'var(--success-color)',
      icon: CheckCircle,
      advice: 'Returns are well-behaved. Standard risk models should be reliable.'
    };
  };

  const getSkewnessInterpretation = (skewness) => {
    if (skewness < -0.5) return {
      label: 'Left Skewed',
      description: 'Larger losses occur more often than large gains',
      icon: TrendingDown,
      color: 'var(--danger-color)'
    };
    if (skewness > 0.5) return {
      label: 'Right Skewed',
      description: 'Larger gains occur more often than large losses',
      icon: TrendingUp,
      color: 'var(--success-color)'
    };
    return {
      label: 'Symmetric',
      description: 'Gains and losses are roughly balanced',
      icon: null,
      color: 'var(--text-secondary)'
    };
  };

  const getDataQuality = (observationCount) => {
    if (observationCount >= 500) return { label: 'Excellent', color: 'var(--success-color)', description: '2+ years of data' };
    if (observationCount >= 250) return { label: 'Good', color: 'var(--accent-primary)', description: '1+ year of data' };
    if (observationCount >= 100) return { label: 'Adequate', color: 'var(--warning-color)', description: 'Limited historical data' };
    return { label: 'Low', color: 'var(--danger-color)', description: 'Results may be unreliable' };
  };

  return (
    <div className="simulation-panel distribution-panel" {...askAIProps}>
      <div className="panel-header">
        <BarChart3 size={20} className="header-icon" />
        <div className="header-text">
          <h3>Return Distribution Analysis</h3>
          <p className="panel-description">
            Analyze the statistical properties of historical returns
          </p>
        </div>
        <div className="header-controls">
          <div className="dist-type-wrapper">
            <label className="dist-type-label">Distribution Model</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="dist-type-select"
              title={DISTRIBUTION_LABELS[selectedType]?.description}
            >
              {Object.entries(DISTRIBUTION_LABELS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <span className="dist-type-hint">{DISTRIBUTION_LABELS[selectedType]?.description}</span>
          </div>
          <button
            className="btn btn-secondary refresh-btn"
            onClick={fetchDistributionAnalysis}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            {loading ? 'Analyzing...' : 'Analyze'}
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
                <span className="stat-label">Best Fit Distribution</span>
                <span className="stat-value">{analysisData.distributionFit?.name || 'Unknown'}</span>
                <span className="stat-hint">Model that best matches your data</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Average Daily Return</span>
                <span className="stat-value">{formatPercent(analysisData.moments?.mean)}</span>
                <span className="stat-hint">Mean of daily returns</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Daily Volatility</span>
                <span className="stat-value">{formatPercent(analysisData.moments?.std)}</span>
                <span className="stat-hint">Standard deviation (risk)</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">
                  Data Quality
                  <HelpCircle size={12} className="help-icon" title={TOOLTIPS.observations} />
                </span>
                <span className="stat-value" style={{ color: getDataQuality(analysisData.returns?.length || 0).color }}>
                  {getDataQuality(analysisData.returns?.length || 0).label}
                </span>
                <span className="stat-hint">
                  {analysisData.returns?.length || 0} days • {getDataQuality(analysisData.returns?.length || 0).description}
                </span>
              </div>
            </div>

            {/* Skewness & Kurtosis - Distribution Shape */}
            {analysisData.moments && (
              <div className="shape-section">
                <h5 className="section-title">
                  Distribution Shape
                  <span className="section-subtitle">How your returns deviate from normal</span>
                </h5>
                <div className="shape-metrics">
                  <div className="shape-card">
                    <div className="shape-header">
                      <span className="shape-label">
                        Skewness
                        <HelpCircle size={12} className="help-icon" title={TOOLTIPS.skewness} />
                      </span>
                      <span className="shape-value" style={{ color: getSkewnessInterpretation(analysisData.moments.skewness).color }}>
                        {analysisData.moments.skewness?.toFixed(3)}
                      </span>
                    </div>
                    <div className="shape-interpretation">
                      <span className="interp-label" style={{ color: getSkewnessInterpretation(analysisData.moments.skewness).color }}>
                        {getSkewnessInterpretation(analysisData.moments.skewness).icon && (
                          <span className="interp-icon">
                            {(() => {
                              const Icon = getSkewnessInterpretation(analysisData.moments.skewness).icon;
                              return Icon ? <Icon size={14} /> : null;
                            })()}
                          </span>
                        )}
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
                          left: `${Math.max(5, Math.min(95, 50 + (analysisData.moments.skewness * 25)))}%`,
                          background: getSkewnessInterpretation(analysisData.moments.skewness).color
                        }}
                      />
                      <div className="skew-track" />
                      <span className="skew-label left">More Losses</span>
                      <span className="skew-label center">Balanced</span>
                      <span className="skew-label right">More Gains</span>
                    </div>
                  </div>

                  <div className="shape-card">
                    <div className="shape-header">
                      <span className="shape-label">
                        Kurtosis (Tail Risk)
                        <HelpCircle size={12} className="help-icon" title={TOOLTIPS.kurtosis} />
                      </span>
                      <span className="shape-value" style={{ color: getKurtosisInterpretation(analysisData.moments.kurtosis).color }}>
                        {analysisData.moments.kurtosis?.toFixed(2)}
                        {getKurtosisInterpretation(analysisData.moments.kurtosis).icon && (
                          <span className="kurtosis-icon">
                            {(() => {
                              const Icon = getKurtosisInterpretation(analysisData.moments.kurtosis).icon;
                              return Icon ? <Icon size={16} /> : null;
                            })()}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="shape-interpretation">
                      <span className="interp-label" style={{ color: getKurtosisInterpretation(analysisData.moments.kurtosis).color }}>
                        {getKurtosisInterpretation(analysisData.moments.kurtosis).label}
                      </span>
                      <span className="interp-desc">
                        Normal = 3.0 • Higher = more extreme events
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
                      <div className="kurtosis-normal-marker" style={{ left: '30%' }} title="Normal distribution (3.0)" />
                    </div>
                    <div className="kurtosis-advice">
                      <Info size={14} />
                      <span>{getKurtosisInterpretation(analysisData.moments.kurtosis).advice}</span>
                    </div>
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
                    returns={Array.isArray(analysisData.returns) ? analysisData.returns : []}
                  />
                </div>
              </div>
            )}

            {/* Q-Q Plot */}
            {qqData && (
              <div className="chart-section">
                <h5 className="section-title">
                  Q-Q Plot (Normality Check)
                  <HelpCircle size={14} className="help-icon" title={TOOLTIPS.qqPlot} />
                </h5>
                <p className="chart-description">
                  <strong>How to read:</strong> If points follow the green diagonal line, your returns are normally distributed.
                  Points curving away at the ends indicate fat tails (more extreme events than expected).
                </p>
                <div className="qq-container">
                  <QQPlot data={qqData} />
                </div>
              </div>
            )}

            {/* VaR Comparison */}
            {analysisData.varComparison && (
              <div className="var-section">
                <h5 className="section-title">
                  Risk Measurement (Value at Risk)
                  <span className="section-subtitle">Expected maximum daily loss at 95% confidence</span>
                </h5>
                <div className="var-grid">
                  <div className="var-item">
                    <span className="var-label">
                      Standard VaR
                      <HelpCircle size={12} className="help-icon" title={TOOLTIPS.normalVaR} />
                    </span>
                    <span className="var-value">{formatPercent(analysisData.varComparison.normalVaR)}</span>
                    <span className="var-hint">Assumes bell curve</span>
                  </div>
                  <div className="var-item recommended">
                    <span className="var-label">
                      Adjusted VaR
                      <HelpCircle size={12} className="help-icon" title={TOOLTIPS.cornishFisher} />
                    </span>
                    <span className="var-value">{formatPercent(analysisData.varComparison.adjustedVaR)}</span>
                    <span className="var-hint">Accounts for fat tails</span>
                    <span className="var-badge">Recommended</span>
                  </div>
                  <div className={`var-item ${analysisData.varComparison.underestimationPct > 10 ? 'highlight' : ''}`}>
                    <span className="var-label">Risk Underestimation</span>
                    <span className="var-value" style={{
                      color: analysisData.varComparison.underestimationPct > 20 ? 'var(--danger-color)' :
                             analysisData.varComparison.underestimationPct > 10 ? 'var(--warning-color)' : 'var(--success-color)'
                    }}>
                      {analysisData.varComparison.underestimationPct?.toFixed(1)}%
                    </span>
                    <span className="var-hint">
                      {analysisData.varComparison.underestimationPct > 20
                        ? 'Standard models miss significant risk'
                        : analysisData.varComparison.underestimationPct > 10
                        ? 'Moderate risk underestimation'
                        : 'Risk models are reasonably accurate'}
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

// Histogram Chart Component - Enhanced with larger size and interactivity
function HistogramChart({ data, fittedParams, moments, returns }) {
  const [hoveredBin, setHoveredBin] = useState(null);

  const width = 700;
  const height = 350;
  const padding = { top: 30, right: 30, bottom: 60, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxDensity = Math.max(...data.map(d => d.density)) * 1.15;
  const minX = data[0].start;
  const maxX = data[data.length - 1].end;

  const xScale = (x) => padding.left + ((x - minX) / (maxX - minX)) * chartWidth;
  const yScale = (y) => padding.top + chartHeight - (y / maxDensity) * chartHeight;

  // Calculate mean and std directly from the returns data (daily, not annualized)
  const dailyMoments = useMemo(() => {
    if (!returns || returns.length === 0) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const std = Math.sqrt(variance);
    return { mean, std };
  }, [returns]);

  // Generate normal PDF curve for comparison using daily moments
  const normalPdf = (x, mean, std) => {
    const z = (x - mean) / std;
    return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
  };

  const normalCurve = useMemo(() => {
    if (!dailyMoments) return '';
    const points = [];
    const step = (maxX - minX) / 100;
    for (let x = minX; x <= maxX; x += step) {
      const y = normalPdf(x, dailyMoments.mean, dailyMoments.std);
      points.push(`${xScale(x)},${yScale(y)}`);
    }
    return `M ${points.join(' L ')}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyMoments, minX, maxX, chartWidth, chartHeight]);

  const barWidth = Math.max(chartWidth / data.length - 2, 4);

  // Generate dynamic X-axis ticks
  const generateXTicks = () => {
    const range = maxX - minX;
    let step;
    if (range <= 0.1) step = 0.02;
    else if (range <= 0.2) step = 0.05;
    else if (range <= 0.5) step = 0.1;
    else step = 0.2;

    const ticks = [];
    const start = Math.ceil(minX / step) * step;
    for (let tick = start; tick <= maxX; tick += step) {
      ticks.push(tick);
    }
    return ticks;
  };

  const xTicks = generateXTicks();

  return (
    <div className="histogram-wrapper">
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
              opacity="0.4"
            />
          ))}
          {xTicks.map((tick, i) => (
            <line
              key={`v-${i}`}
              x1={xScale(tick)}
              y1={padding.top}
              x2={xScale(tick)}
              y2={height - padding.bottom}
              stroke="var(--border-color)"
              strokeDasharray="3,3"
              opacity="0.3"
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
            height={Math.max(0, chartHeight - (yScale(bin.density) - padding.top))}
            fill={hoveredBin === i ? "rgba(212, 175, 55, 0.9)" : "rgba(212, 175, 55, 0.65)"} /* Prism: --color-gold-400 */
            stroke="rgba(212, 175, 55, 1)" /* Prism: --color-gold-400 */
            strokeWidth="1"
            style={{ cursor: 'pointer', transition: 'fill 0.15s ease' }}
            onMouseEnter={() => setHoveredBin(i)}
            onMouseLeave={() => setHoveredBin(null)}
          />
        ))}

        {/* Normal PDF curve */}
        {normalCurve && (
          <path
            d={normalCurve}
            fill="none"
            stroke="#059669" /* Prism: --positive */
            strokeWidth="3"
            strokeDasharray="8,4"
            opacity="0.9"
          />
        )}

        {/* Mean line */}
        {moments && (
          <g>
            <line
              x1={xScale(moments.mean)}
              y1={padding.top}
              x2={xScale(moments.mean)}
              y2={height - padding.bottom}
              stroke="var(--accent-primary)"
              strokeWidth="2"
              strokeDasharray="4,4"
            />
            <text
              x={xScale(moments.mean)}
              y={padding.top - 8}
              textAnchor="middle"
              fontSize="11" /* Prism: --text-xs */
              fontWeight="600"
              fill="var(--accent-primary)"
            >
              Mean: {(moments.mean * 100).toFixed(2)}%
            </text>
          </g>
        )}

        {/* Axes */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="var(--text-tertiary)"
          strokeWidth="1.5"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="var(--text-tertiary)"
          strokeWidth="1.5"
        />

        {/* X-axis labels */}
        {xTicks.map((tick, i) => (
          <text
            key={i}
            x={xScale(tick)}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            fontSize="12" /* Prism: --text-sm */
            fill="var(--text-secondary)"
          >
            {(tick * 100).toFixed(0)}%
          </text>
        ))}

        {/* X-axis title */}
        <text
          x={padding.left + chartWidth / 2}
          y={height - 10}
          textAnchor="middle"
          fontSize="13" /* Prism: --text-sm */
          fontWeight="500"
          fill="var(--text-secondary)"
        >
          Daily Return
        </text>

        {/* Y-axis title */}
        <text
          x={20}
          y={padding.top + chartHeight / 2}
          textAnchor="middle"
          fontSize="13" /* Prism: --text-sm */
          fontWeight="500"
          fill="var(--text-secondary)"
          transform={`rotate(-90, 20, ${padding.top + chartHeight / 2})`}
        >
          Density
        </text>

        {/* Legend */}
        <g transform={`translate(${width - padding.right - 150}, ${padding.top + 10})`}>
          <rect x="0" y="0" width="100" height="55" fill="white" rx="6" stroke="#E2E8F0" strokeWidth="1" /> {/* Prism: white bg with border */}
          <rect x="8" y="8" width="14" height="14" fill="rgba(212, 175, 55, 0.65)" stroke="rgba(212, 175, 55, 1)" rx="2" /> {/* Prism: --color-gold-400 */}
          <text x="28" y="19" fontSize="11" fill="#64748B">Actual</text> {/* Prism: --text-secondary */}
          <line x1="8" y1="36" x2="22" y2="36" stroke="#059669" strokeWidth="2.5" strokeDasharray="5,3" /> {/* Prism: --positive */}
          <text x="28" y="40" fontSize="11" fill="#64748B">Normal</text> {/* Prism: --text-secondary */}
        </g>
      </svg>

      {/* Tooltip */}
      {hoveredBin !== null && data[hoveredBin] && (
        <div className="histogram-tooltip" style={{
          position: 'absolute',
          left: `${(xScale(data[hoveredBin].midpoint) / width) * 100}%`,
          top: `${(yScale(data[hoveredBin].density) / height) * 100 - 15}%`,
          transform: 'translate(-50%, -100%)'
        }}>
          <div className="tooltip-row">
            <span>Range:</span>
            <span>{(data[hoveredBin].start * 100).toFixed(2)}% to {(data[hoveredBin].end * 100).toFixed(2)}%</span>
          </div>
          <div className="tooltip-row">
            <span>Count:</span>
            <span>{data[hoveredBin].count} days</span>
          </div>
          <div className="tooltip-row">
            <span>Frequency:</span>
            <span>{((data[hoveredBin].count / data.reduce((s, b) => s + b.count, 0)) * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Q-Q Plot Component - Enhanced with larger size and hover
function QQPlot({ data }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const width = 400;
  const height = 400;
  const padding = { top: 30, right: 30, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const minVal = Math.min(
    Math.min(...data.map(d => d.theoretical)),
    Math.min(...data.map(d => d.empirical))
  ) - 0.3;
  const maxVal = Math.max(
    Math.max(...data.map(d => d.theoretical)),
    Math.max(...data.map(d => d.empirical))
  ) + 0.3;

  const xScale = (val) => padding.left + ((val - minVal) / (maxVal - minVal)) * chartWidth;
  const yScale = (val) => height - padding.bottom - ((val - minVal) / (maxVal - minVal)) * chartHeight;

  // Generate tick values
  const ticks = [-3, -2, -1, 0, 1, 2, 3].filter(v => v >= minVal && v <= maxVal);

  return (
    <div className="qq-wrapper">
      <svg viewBox={`0 0 ${width} ${height}`} className="qq-svg">
        {/* Grid */}
        <g className="grid">
          {ticks.map((tick, i) => (
            <g key={i}>
              <line
                x1={xScale(tick)}
                y1={padding.top}
                x2={xScale(tick)}
                y2={height - padding.bottom}
                stroke="var(--border-color)"
                strokeDasharray="3,3"
                opacity="0.3"
              />
              <line
                x1={padding.left}
                y1={yScale(tick)}
                x2={width - padding.right}
                y2={yScale(tick)}
                stroke="var(--border-color)"
                strokeDasharray="3,3"
                opacity="0.3"
              />
            </g>
          ))}
        </g>

        {/* Reference line (y = x) - if normal, points should fall on this */}
        <line
          x1={xScale(minVal)}
          y1={yScale(minVal)}
          x2={xScale(maxVal)}
          y2={yScale(maxVal)}
          stroke="#059669" /* Prism: --positive */
          strokeWidth="2.5"
          opacity="0.9"
        />

        {/* Confidence bands (approximate 95% CI) */}
        <path
          d={`M ${xScale(minVal)} ${yScale(minVal + 0.5)}
              L ${xScale(maxVal)} ${yScale(maxVal + 0.5)}
              L ${xScale(maxVal)} ${yScale(maxVal - 0.5)}
              L ${xScale(minVal)} ${yScale(minVal - 0.5)} Z`}
          fill="rgba(16, 185, 129, 0.1)" /* Prism: --positive-pastel */
          stroke="none"
        />

        {/* Data points - violet for normal, red for outliers */}
        {data.map((point, i) => {
          const isOutlier = Math.abs(point.empirical - point.theoretical) > 0.5;
          return (
            <circle
              key={i}
              cx={xScale(point.theoretical)}
              cy={yScale(point.empirical)}
              r={hoveredPoint === i ? 6 : 4}
              fill={isOutlier ? "#DC2626" : "#7C3AED"} /* Prism: --negative / --color-ai-violet */
              opacity={hoveredPoint === i ? 1 : 0.7}
              style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={() => setHoveredPoint(i)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          );
        })}

        {/* Axes */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="var(--text-tertiary)"
          strokeWidth="1.5"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="var(--text-tertiary)"
          strokeWidth="1.5"
        />

        {/* Tick labels */}
        {ticks.map((tick, i) => (
          <g key={`label-${i}`}>
            <text
              x={xScale(tick)}
              y={height - padding.bottom + 18}
              textAnchor="middle"
              fontSize="11" /* Prism: --text-xs */
              fill="var(--text-secondary)"
            >
              {tick}σ
            </text>
            <text
              x={padding.left - 10}
              y={yScale(tick)}
              textAnchor="end"
              alignmentBaseline="middle"
              fontSize="11" /* Prism: --text-xs */
              fill="var(--text-secondary)"
            >
              {tick}σ
            </text>
          </g>
        ))}

        {/* Axis Labels */}
        <text
          x={padding.left + chartWidth / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize="12" /* Prism: --text-sm */
          fontWeight="500"
          fill="var(--text-secondary)"
        >
          Theoretical Quantiles (Normal)
        </text>
        <text
          x={15}
          y={padding.top + chartHeight / 2}
          textAnchor="middle"
          fontSize="12" /* Prism: --text-sm */
          fontWeight="500"
          fill="var(--text-secondary)"
          transform={`rotate(-90, 15, ${padding.top + chartHeight / 2})`}
        >
          Sample Quantiles
        </text>

        {/* Legend */}
        <g transform={`translate(${width - padding.right - 120}, ${padding.top + 5})`}>
          <rect x="0" y="0" width="115" height="50" fill="white" rx="6" stroke="#E2E8F0" strokeWidth="1" /> {/* Prism: white bg with border */}
          <line x1="8" y1="15" x2="28" y2="15" stroke="#059669" strokeWidth="2.5" /> {/* Prism: --positive */}
          <text x="34" y="18" fontSize="10" fill="#64748B">Normal fit</text> {/* Prism: --text-secondary */}
          <circle cx="18" cy="35" r="4" fill="#7C3AED" /> {/* Prism: --color-ai-violet */}
          <text x="34" y="38" fontSize="10" fill="#64748B">Data points</text> {/* Prism: --text-secondary */}
        </g>
      </svg>

      {/* Tooltip */}
      {hoveredPoint !== null && data[hoveredPoint] && (
        <div className="qq-tooltip" style={{
          position: 'absolute',
          left: `${(xScale(data[hoveredPoint].theoretical) / width) * 100}%`,
          top: `${(yScale(data[hoveredPoint].empirical) / height) * 100 - 5}%`,
          transform: 'translate(-50%, -100%)'
        }}>
          <div className="tooltip-row">
            <span>Theoretical:</span>
            <span>{data[hoveredPoint].theoretical.toFixed(2)}σ</span>
          </div>
          <div className="tooltip-row">
            <span>Actual:</span>
            <span>{data[hoveredPoint].empirical.toFixed(2)}σ</span>
          </div>
          <div className="tooltip-row">
            <span>Return:</span>
            <span>{(data[hoveredPoint].original * 100).toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default DistributionPanel;
