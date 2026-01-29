// frontend/src/components/agent/MarketContextCard.js
// Market regime and context display for trading decisions

import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  BarChart3,
  Percent,
  Gauge,
  IconButton
} from '../icons';
import './MarketContextCard.css';

// Map color names to IconButton colorSchemes
const COLOR_TO_SCHEME = {
  success: 'growth',
  danger: 'decline',
  warning: 'risk',
  primary: 'analytics',
  default: 'default'
};

// Market regime configuration - using neutral language for regulatory compliance
const REGIME_CONFIG = {
  BULL: {
    icon: TrendingUp,
    color: 'success',
    label: 'Bull Market',
    description: 'Bullish market indicators detected'
  },
  BEAR: {
    icon: TrendingDown,
    color: 'danger',
    label: 'Bear Market',
    description: 'Bearish market indicators detected'
  },
  HIGH_VOL: {
    icon: AlertTriangle,
    color: 'warning',
    label: 'High Volatility',
    description: 'Elevated volatility detected - model suggests caution'
  },
  LOW_VOL: {
    icon: Minus,
    color: 'primary',
    label: 'Low Volatility',
    description: 'Stable market conditions detected'
  },
  NEUTRAL: {
    icon: Activity,
    color: 'default',
    label: 'Neutral',
    description: 'Mixed signals - no clear trend identified'
  },
  CRISIS: {
    icon: AlertTriangle,
    color: 'danger',
    label: 'Crisis Mode',
    description: 'Extreme market stress indicators detected'
  }
};

function MetricRow({ icon: Icon, label, value, subvalue, color }) {
  const colorScheme = COLOR_TO_SCHEME[color] || 'default';
  return (
    <div className="market-context__metric">
      <IconButton
        icon={Icon}
        colorScheme={colorScheme}
        size="small"
        className="market-context__metric-icon-btn"
      />
      <div className="market-context__metric-content">
        <span className="market-context__metric-label">{label}</span>
        <div className="market-context__metric-values">
          <span className={`market-context__metric-value market-context__metric-value--${color || 'default'}`}>
            {value}
          </span>
          {subvalue && (
            <span className="market-context__metric-subvalue">{subvalue}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalStrengthBar({ positive, negative, neutral }) {
  const total = positive + negative + neutral;
  if (total === 0) return null;

  const posPercent = (positive / total) * 100;
  const negPercent = (negative / total) * 100;
  const neuPercent = (neutral / total) * 100;

  return (
    <div className="market-context__signal-strength">
      <div className="market-context__signal-strength-label">
        <span>Signal Strength</span>
        <span>{positive}/{total} bullish</span>
      </div>
      <div className="market-context__signal-strength-bar">
        <div
          className="market-context__signal-strength-segment market-context__signal-strength-segment--positive"
          style={{ width: `${posPercent}%` }}
        />
        <div
          className="market-context__signal-strength-segment market-context__signal-strength-segment--neutral"
          style={{ width: `${neuPercent}%` }}
        />
        <div
          className="market-context__signal-strength-segment market-context__signal-strength-segment--negative"
          style={{ width: `${negPercent}%` }}
        />
      </div>
    </div>
  );
}

function MarketContextCard({
  regime = 'NEUTRAL',
  regimeConfidence = 0,
  vix,
  vixLevel,
  breadth,
  breadthLevel,
  signalStrength = { positive: 0, negative: 0, neutral: 0 },
  positionAdjustment = 'Normal',
  loading = false
}) {
  const regimeConfig = REGIME_CONFIG[regime] || REGIME_CONFIG.NEUTRAL;
  const RegimeIcon = regimeConfig.icon;

  const getVixColor = (level) => {
    if (!level) return 'default';
    if (level === 'Low') return 'success';
    if (level === 'High' || level === 'Extreme') return 'danger';
    return 'warning';
  };

  const getBreadthColor = (level) => {
    if (!level) return 'default';
    if (level === 'Healthy' || level === 'Strong') return 'success';
    if (level === 'Weak' || level === 'Poor') return 'danger';
    return 'warning';
  };

  return (
    <div className={`market-context market-context--${regimeConfig.color}`}>
      {/* Regime header */}
      <div className="market-context__header">
        <div className={`market-context__regime-badge market-context__regime-badge--${regimeConfig.color}`}>
          <RegimeIcon size={18} />
          <span>{regimeConfig.label}</span>
        </div>
        {regimeConfidence > 0 && (
          <span className="market-context__confidence">
            {Math.round(regimeConfidence * 100)}% confidence
          </span>
        )}
      </div>

      <p className="market-context__description">{regimeConfig.description}</p>

      {/* Metrics */}
      <div className="market-context__metrics">
        {vix !== undefined && (
          <MetricRow
            icon={Gauge}
            label="VIX"
            value={typeof vix === 'number' ? vix.toFixed(1) : vix}
            subvalue={vixLevel}
            color={getVixColor(vixLevel)}
          />
        )}

        {breadth !== undefined && (
          <MetricRow
            icon={BarChart3}
            label="Breadth"
            value={typeof breadth === 'number' ? `${breadth}%` : breadth}
            subvalue={breadthLevel}
            color={getBreadthColor(breadthLevel)}
          />
        )}

        <MetricRow
          icon={Percent}
          label="Position Sizing"
          value={positionAdjustment}
          color={positionAdjustment === 'Reduced' ? 'warning' : positionAdjustment === 'Increased' ? 'success' : 'default'}
        />
      </div>

      {/* Signal strength */}
      <SignalStrengthBar
        positive={signalStrength.positive}
        negative={signalStrength.negative}
        neutral={signalStrength.neutral}
      />
    </div>
  );
}

export default MarketContextCard;
