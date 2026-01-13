// frontend/src/components/portfolio/FatTailWarningBanner.jsx
// Prominent warning banner for fat-tail detection - Taleb-informed
import { AlertTriangle, AlertOctagon, Info, TrendingDown, Zap } from 'lucide-react';
import './FatTailWarningBanner.css';

/**
 * Fat Tail Warning Banner
 * Displays prominent warnings when fat tails are detected in return distributions
 * Based on Nassim Taleb's "Statistical Consequences of Fat Tails"
 */
function FatTailWarningBanner({ distributionFit, moments, varComparison }) {
  if (!moments) return null;

  const kurtosis = moments.kurtosis || 3;
  const skewness = moments.skewness || 0;
  const excessKurtosis = kurtosis - 3;

  // Determine severity level
  const getSeverity = () => {
    if (kurtosis > 6) return 'critical';
    if (kurtosis > 4.5) return 'high';
    if (kurtosis > 3.5) return 'moderate';
    return 'low';
  };

  const severity = getSeverity();

  // Don't show banner for near-normal distributions
  if (severity === 'low') return null;

  const getSeverityConfig = () => {
    switch (severity) {
      case 'critical':
        return {
          icon: AlertOctagon,
          color: '#dc2626',
          bgColor: 'rgba(220, 38, 38, 0.1)',
          borderColor: 'rgba(220, 38, 38, 0.4)',
          title: 'Extreme tail risk detected',
          message: 'Your returns exhibit heavy tails. Standard normal models may significantly underestimate risk.',
          iconSize: 28
        };
      case 'high':
        return {
          icon: AlertTriangle,
          color: '#ea580c',
          bgColor: 'rgba(234, 88, 12, 0.1)',
          borderColor: 'rgba(234, 88, 12, 0.4)',
          title: 'Significant tail risk detected',
          message: 'Extreme events occur more frequently than normal distribution predicts.',
          iconSize: 24
        };
      case 'moderate':
        return {
          icon: Info,
          color: '#f59e0b',
          bgColor: 'rgba(245, 158, 11, 0.1)',
          borderColor: 'rgba(245, 158, 11, 0.4)',
          title: 'Non-normal distribution detected',
          message: 'Returns show moderately heavy tails. Consider using parametric distributions.',
          iconSize: 20
        };
      default:
        return null;
    }
  };

  const config = getSeverityConfig();
  if (!config) return null;

  const Icon = config.icon;

  // Calculate risk amplification
  const riskAmplification = varComparison?.underestimationPct || 0;

  return (
    <div className={`fat-tail-banner severity-${severity}`}>
      <div className="banner-icon">
        <Icon size={config.iconSize} />
      </div>

      <div className="banner-content">
        <h4 className="banner-title">
          {config.title}
        </h4>
        <p className="banner-message">{config.message}</p>

        <div className="banner-metrics">
          <div className="metric-item">
            <span className="metric-label">Kurtosis:</span>
            <span className="metric-value">{kurtosis.toFixed(2)}</span>
            <span className="metric-hint">(Normal = 3.0)</span>
          </div>

          {Math.abs(skewness) > 0.5 && (
            <div className="metric-item">
              <span className="metric-label">Skewness:</span>
              <span className="metric-value">{skewness.toFixed(2)}</span>
              <span className="metric-hint">
                {skewness < -0.5 ? '(More downside)' : '(More upside)'}
              </span>
            </div>
          )}

          {riskAmplification > 10 && (
            <div className="metric-item">
              <TrendingDown size={14} />
              <span className="metric-label">VaR Underestimation:</span>
              <span className="metric-value">{riskAmplification.toFixed(1)}%</span>
            </div>
          )}
        </div>

        {/* Key Impact */}
        <div className="taleb-insight">
          <Zap size={14} />
          <div className="insight-content">
            <strong>Impact:</strong>
            <span>
              {severity === 'critical' && ' In distributions with very heavy tails, rare extreme events have disproportionate impact on outcomes.'}
              {severity === 'high' && ' With heavy-tailed distributions, extreme events happen significantly more often than normal models predict.'}
              {severity === 'moderate' && ' Mean and standard deviation alone may not fully capture risk in non-normal distributions.'}
            </span>
          </div>
        </div>

        {/* Recommendations */}
        <div className="banner-recommendations">
          <strong>Recommendations:</strong>
          <ul>
            {severity === 'critical' && (
              <>
                <li>Use Student's t or other heavy-tailed distributions for modeling</li>
                <li>Focus on percentiles (median, 10th, 90th) rather than mean</li>
                <li>Consider more conservative position sizing</li>
                <li>Monitor tail risk metrics (CVaR, max drawdown, stress tests)</li>
              </>
            )}
            {severity === 'high' && (
              <>
                <li>Use parametric distributions that capture tail behavior</li>
                <li>Focus on percentiles rather than mean values</li>
                <li>Apply tail-adjusted risk metrics (Cornish-Fisher VaR)</li>
                <li>Consider reducing position sizes by 20-30%</li>
              </>
            )}
            {severity === 'moderate' && (
              <>
                <li>Use parametric simulations for better accuracy</li>
                <li>Monitor tail-sensitive metrics (CVaR, max drawdown)</li>
                <li>Consider modest position size adjustments</li>
              </>
            )}
          </ul>
        </div>

        {/* Distribution info */}
        {distributionFit && (
          <div className="banner-footer">
            <span className="footer-label">Fitted Distribution:</span>
            <span className="footer-value">{distributionFit.name || distributionFit.type}</span>
            {distributionFit.params?.df && (
              <>
                <span className="footer-separator">•</span>
                <span className="footer-label">df =</span>
                <span className="footer-value">{distributionFit.params.df.toFixed(1)}</span>
                <span className="footer-hint">(Lower = fatter tails)</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FatTailWarningBanner;