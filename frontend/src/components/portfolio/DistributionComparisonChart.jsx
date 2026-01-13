// frontend/src/components/portfolio/DistributionComparisonChart.jsx
// Side-by-side visual comparison of Normal vs Fat-Tail distributions
import { useMemo, useState, useRef } from 'react';
import { AlertTriangle, CheckCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import './DistributionComparisonChart.css';

/**
 * Distribution Comparison Chart
 * Shows overlaid PDFs of Normal vs actual distribution
 * Highlights where they diverge (the tails!)
 * Now with interactive tooltips and zoom
 */
function DistributionComparisonChart({ moments, distributionFit, historicalReturns }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const chartRef = useRef(null);

  // Balanced dimensions for better layout
  const containerWidth = isFullscreen ? window.innerWidth - 100 : 1200;
  const containerHeight = isFullscreen ? window.innerHeight - 300 : 500;

  const width = containerWidth * zoomLevel;
  const height = containerHeight * zoomLevel;
  const padding = {
    top: 80,
    right: 120,
    bottom: 100,
    left: 110
  };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate PDFs
  const pdfData = useMemo(() => {
    if (!moments || !distributionFit) return null;
    const mean = moments.mean || 0;
    const std = moments.std || 0.01;
    const xMin = mean - 4 * std;
    const xMax = mean + 4 * std;
    const numPoints = 200;
    const step = (xMax - xMin) / numPoints;

    const points = [];

    // Normal PDF
    const normalPdf = (x) => {
      const z = (x - mean) / std;
      return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
    };

    // Student's t PDF approximation (if we have df)
    const studentTPdf = (x, df) => {
      const z = (x - mean) / std;
      const gamma1 = Math.exp(logGamma((df + 1) / 2));
      const gamma2 = Math.exp(logGamma(df / 2));
      const coefficient = gamma1 / (Math.sqrt(df * Math.PI) * std * gamma2);
      return coefficient * Math.pow(1 + z * z / df, -(df + 1) / 2);
    };

    // Simple log gamma approximation
    function logGamma(z) {
      if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
      z -= 1;
      const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
      ];
      let x = c[0];
      for (let i = 1; i < 9; i++) x += c[i] / (z + i);
      const t = z + 7.5;
      return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    }

    for (let x = xMin; x <= xMax; x += step) {
      const normal = normalPdf(x);

      let actual = normal;
      if (distributionFit.type === 'studentT' && distributionFit.params?.df) {
        actual = studentTPdf(x, distributionFit.params.df);
      } else if (distributionFit.type === 'skewedT' && distributionFit.params?.df) {
        // Simplified: use Student's t as approximation
        actual = studentTPdf(x, distributionFit.params.df);
      }

      points.push({
        x,
        normal,
        actual,
        divergence: Math.abs(actual - normal),
        divergencePct: normal > 0 ? ((actual - normal) / normal) * 100 : 0
      });
    }

    return { points, xMin, xMax, mean, std };
  }, [moments, distributionFit]);

  // Early return if no data
  if (!pdfData) return null;

  // Scales
  const maxY = Math.max(...pdfData.points.map(p => Math.max(p.normal, p.actual))) * 1.15;
  const xScale = (x) => padding.left + ((x - pdfData.xMin) / (pdfData.xMax - pdfData.xMin)) * chartWidth;
  const yScale = (y) => padding.top + chartHeight - (y / maxY) * chartHeight;

  // Generate paths
  const normalPath = pdfData.points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.normal)}`
  ).join(' ');

  const actualPath = pdfData.points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.actual)}`
  ).join(' ');

  // Highlight tail regions where distributions diverge significantly
  const leftTailZone = pdfData.mean - 2 * pdfData.std;
  const rightTailZone = pdfData.mean + 2 * pdfData.std;

  // Format percentage
  const formatPct = (val) => `${(val * 100).toFixed(1)}%`;

  // Handle mouse move for tooltip
  const handleMouseMove = (e) => {
    if (!chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;

    // Convert SVG x to data x
    const dataX = pdfData.xMin + ((svgX - padding.left) / chartWidth) * (pdfData.xMax - pdfData.xMin);

    // Find closest point
    const closestPoint = pdfData.points.reduce((closest, point) => {
      const dist = Math.abs(point.x - dataX);
      return dist < Math.abs(closest.x - dataX) ? point : closest;
    }, pdfData.points[0]);

    setHoveredPoint({
      ...closestPoint,
      screenX: mouseX,
      screenY: e.clientY - rect.top
    });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setZoomLevel(1); // Reset zoom when toggling fullscreen
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 2));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.75));
  };

  return (
    <div className={`distribution-comparison-chart ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="chart-header">
        <div className="chart-title-section">
          <h4>📊 Normal vs. Reality: Where Models Fail</h4>
          <p className="chart-subtitle">
            Red areas show where Normal distribution underestimates tail probability • Hover to explore
          </p>
        </div>
        <div className="chart-controls">
          <button onClick={handleZoomOut} className="control-btn" title="Zoom Out" disabled={zoomLevel <= 0.75}>
            <ZoomOut size={18} />
          </button>
          <span className="zoom-label">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={handleZoomIn} className="control-btn" title="Zoom In" disabled={zoomLevel >= 2}>
            <ZoomIn size={18} />
          </button>
          <button onClick={toggleFullscreen} className="control-btn" title="Toggle Fullscreen">
            <Maximize2 size={18} />
          </button>
        </div>
      </div>

      <div
        className="chart-container"
        ref={chartRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <svg
          width={containerWidth}
          height={containerHeight}
          viewBox={`0 0 ${width} ${height}`}
          className="distribution-svg"
          style={{ minWidth: containerWidth, minHeight: containerHeight }}
        >
          {/* Grid lines */}
          <g className="grid">
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
              <line
                key={i}
                x1={padding.left}
                y1={padding.top + chartHeight * pct}
                x2={width - padding.right}
                y2={padding.top + chartHeight * pct}
                className="grid-line"
              />
            ))}
          </g>

          {/* Tail zones (danger areas) */}
          <rect
            x={padding.left}
            y={padding.top}
            width={xScale(leftTailZone) - padding.left}
            height={chartHeight}
            fill="rgba(220, 38, 38, 0.08)"
            className="tail-zone left"
          />
          <rect
            x={xScale(rightTailZone)}
            y={padding.top}
            width={width - padding.right - xScale(rightTailZone)}
            height={chartHeight}
            fill="rgba(220, 38, 38, 0.08)"
            className="tail-zone right"
          />

          {/* Filled area between curves (shows divergence) */}
          <path
            d={`${actualPath} L ${xScale(pdfData.xMax)} ${yScale(0)} L ${xScale(pdfData.xMin)} ${yScale(0)} Z`}
            fill="rgba(220, 38, 38, 0.12)"
            className="divergence-area"
          />

          {/* Normal distribution curve */}
          <path
            d={normalPath}
            className="normal-curve"
          />

          {/* Actual distribution curve */}
          <path
            d={actualPath}
            className="actual-curve"
          />

          {/* Mean line */}
          <line
            x1={xScale(pdfData.mean)}
            y1={padding.top}
            x2={xScale(pdfData.mean)}
            y2={height - padding.bottom}
            className="mean-line"
          />

          {/* Hover indicator */}
          {hoveredPoint && (
            <g className="hover-indicator">
              <line
                x1={xScale(hoveredPoint.x)}
                y1={padding.top}
                x2={xScale(hoveredPoint.x)}
                y2={height - padding.bottom}
                stroke="var(--brand-primary)"
                strokeWidth="2"
                strokeDasharray="4,4"
                opacity="0.6"
              />
              <circle
                cx={xScale(hoveredPoint.x)}
                cy={yScale(hoveredPoint.normal)}
                r="5"
                fill="#10b981"
                stroke="white"
                strokeWidth="2"
              />
              <circle
                cx={xScale(hoveredPoint.x)}
                cy={yScale(hoveredPoint.actual)}
                r="5"
                fill="#dc2626"
                stroke="white"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Y Axis */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            className="axis-line"
          />

          {/* X Axis */}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            className="axis-line"
          />

          {/* X-axis labels */}
          {[-3, -2, -1, 0, 1, 2, 3].map((sigma, i) => {
            const x = pdfData.mean + sigma * pdfData.std;
            if (x < pdfData.xMin || x > pdfData.xMax) return null;
            return (
              <g key={i}>
                <line
                  x1={xScale(x)}
                  y1={height - padding.bottom}
                  x2={xScale(x)}
                  y2={height - padding.bottom + 8}
                  className="axis-tick"
                />
                <text
                  x={xScale(x)}
                  y={height - padding.bottom + 28}
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="600"
                  fill="#374151"
                  fontFamily="Inter, -apple-system, sans-serif"
                >
                  {sigma === 0 ? '0' : `${sigma}σ`}
                </text>
                <text
                  x={xScale(x)}
                  y={height - padding.bottom + 48}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#64748b"
                  fontFamily="Inter, -apple-system, sans-serif"
                >
                  {formatPct(x)}
                </text>
              </g>
            );
          })}

          {/* Y-axis label */}
          <text
            x={25}
            y={height / 2}
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fill="#374151"
            fontFamily="Inter, -apple-system, sans-serif"
            transform={`rotate(-90, 25, ${height / 2})`}
          >
            Probability Density
          </text>

          {/* X-axis label */}
          <text
            x={width / 2}
            y={height - 20}
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fill="#374151"
            fontFamily="Inter, -apple-system, sans-serif"
          >
            Return (Standard Deviations from Mean)
          </text>

          {/* Annotations */}
          <g className="annotations">
            {/* Left tail annotation */}
            <text
              x={xScale(pdfData.mean - 2.5 * pdfData.std)}
              y={padding.top + 28}
              textAnchor="middle"
              fontSize="13"
              fill="#ef4444"
              fontWeight="600"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              Fat Left Tail
            </text>
            <text
              x={xScale(pdfData.mean - 2.5 * pdfData.std)}
              y={padding.top + 46}
              textAnchor="middle"
              fontSize="11"
              fill="#9ca3af"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              (Crashes more frequent)
            </text>

            {/* Right tail annotation */}
            <text
              x={xScale(pdfData.mean + 2.5 * pdfData.std)}
              y={padding.top + 28}
              textAnchor="middle"
              fontSize="13"
              fill="#ef4444"
              fontWeight="600"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              Fat Right Tail
            </text>
            <text
              x={xScale(pdfData.mean + 2.5 * pdfData.std)}
              y={padding.top + 46}
              textAnchor="middle"
              fontSize="11"
              fill="#9ca3af"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              (Big wins more frequent)
            </text>
          </g>

          {/* Legend */}
          <g transform={`translate(${width - padding.right - 180}, ${padding.top + 15})`}>
            <rect
              x="0"
              y="0"
              width="170"
              height="95"
              fill="rgba(255, 255, 255, 0.95)"
              stroke="#e5e7eb"
              strokeWidth="1"
              rx="6"
            />

            {/* Normal line */}
            <line
              x1="14"
              y1="26"
              x2="40"
              y2="26"
              stroke="#10b981"
              strokeWidth="4"
              strokeDasharray="8,4"
            />
            <circle cx="27" cy="26" r="4" fill="#10b981" />
            <text
              x="50"
              y="30"
              fontSize="12"
              fontWeight="600"
              fill="#374151"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              Normal (Gaussian)
            </text>

            {/* Actual line */}
            <line
              x1="14"
              y1="52"
              x2="40"
              y2="52"
              stroke="#ef4444"
              strokeWidth="4"
            />
            <circle cx="27" cy="52" r="4" fill="#ef4444" />
            <text
              x="50"
              y="56"
              fontSize="12"
              fontWeight="600"
              fill="#374151"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              {distributionFit.typeName || 'Actual'}
            </text>

            {/* Mean line */}
            <line
              x1="14"
              y1="78"
              x2="40"
              y2="78"
              stroke="#6366f1"
              strokeWidth="3"
              strokeDasharray="4,4"
            />
            <text
              x="50"
              y="82"
              fontSize="12"
              fontWeight="600"
              fill="#374151"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              Mean
            </text>
          </g>
        </svg>

        {/* Interactive Tooltip */}
        {hoveredPoint && (
          <div
            className="chart-tooltip"
            style={{
              left: `${hoveredPoint.screenX + 15}px`,
              top: `${hoveredPoint.screenY - 15}px`
            }}
          >
            <div className="tooltip-header">Return: {formatPct(hoveredPoint.x)}</div>
            <div className="tooltip-row normal">
              <span className="tooltip-label">Normal:</span>
              <span className="tooltip-value">{(hoveredPoint.normal * 100).toFixed(3)}%</span>
            </div>
            <div className="tooltip-row actual">
              <span className="tooltip-label">Actual:</span>
              <span className="tooltip-value">{(hoveredPoint.actual * 100).toFixed(3)}%</span>
            </div>
            <div className="tooltip-row divergence">
              <span className="tooltip-label">Divergence:</span>
              <span className="tooltip-value">
                {hoveredPoint.divergencePct > 0 ? '+' : ''}{hoveredPoint.divergencePct.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stats comparison */}
      <div className="stats-comparison">
        <div className="stat-compare">
          <CheckCircle size={18} className="stat-icon safe" />
          <div className="stat-content">
            <span className="stat-label">Normal Model Says:</span>
            <span className="stat-value safe">1-in-100 year events happen once per century</span>
          </div>
        </div>
        <div className="stat-compare">
          <AlertTriangle size={18} className="stat-icon danger" />
          <div className="stat-content">
            <span className="stat-label">Reality With Fat Tails:</span>
            <span className="stat-value danger">
              {moments.kurtosis > 6 ? '1-in-100 year events happen every few months' :
               moments.kurtosis > 4.5 ? '1-in-100 year events happen every 1-2 years' :
               '1-in-100 year events happen every 5-10 years'}
            </span>
          </div>
        </div>
      </div>

      {/* Key insight */}
      <div className="chart-insight">
        <strong>🔑 Key Insight:</strong>
        <span>
          The red shaded areas represent "impossible" events under Normal distribution that actually occur
          regularly in financial markets. Your kurtosis of <strong>{moments.kurtosis.toFixed(2)}</strong> means
          extreme events happen <strong>
            {moments.kurtosis > 6 ? '100x' : moments.kurtosis > 5 ? '50x' : moments.kurtosis > 4 ? '20x' : '10x'}
          </strong> more often than Gaussian models predict.
        </span>
      </div>
    </div>
  );
}

export default DistributionComparisonChart;
