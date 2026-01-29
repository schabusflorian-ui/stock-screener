// frontend/src/components/prism/ValuationScenarios.js
// Valuation Analysis - Redesigned with unified hero, compact scenarios, and integrated triangulation
// Tier-1 bank report aesthetic with clear visual hierarchy

import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Minus,
  TrendingDown,
  Target,
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  BarChart2,
  Zap,
  ArrowRight,
  ChevronDown,
  Calculator,
  Triangle
} from 'lucide-react';
import { PrismSparkle } from '../icons';
import './ValuationScenarios.css';

// Simple markdown bold parser - converts **text** to <strong>text</strong>
function parseMarkdownBold(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

export function ValuationScenarios({ scenarios, currentPrice, triangulatedValuation, onNavigateToDCF }) {
  const {
    bull = {},
    base = {},
    bear = {}
  } = scenarios || {};

  const hasTriangulation = triangulatedValuation != null;

  // Get pure DCF scenarios from triangulated valuation (matches DCF tab exactly)
  const pureDCF = triangulatedValuation?.pureDCFScenarios;
  const hasPureDCF = pureDCF?.weightedTarget != null;

  // Calculate probability-weighted price target (this is the triangulated/blended target)
  const weightedTarget = useMemo(() => {
    const bullContrib = (bull.price || 0) * (bull.probability || 0);
    const baseContrib = (base.price || 0) * (base.probability || 0);
    const bearContrib = (bear.price || 0) * (bear.probability || 0);
    return bullContrib + baseContrib + bearContrib;
  }, [bull, base, bear]);

  // Calculate upside/downside
  const calculateChange = (targetPrice) => {
    if (!currentPrice || !targetPrice) return null;
    return ((targetPrice - currentPrice) / currentPrice) * 100;
  };

  const bullChange = calculateChange(bull.price);
  const baseChange = calculateChange(base.price);
  const bearChange = calculateChange(bear.price);
  const weightedChange = calculateChange(weightedTarget);

  // Pure DCF changes
  const pureDCFChange = calculateChange(pureDCF?.weightedTarget);

  // Calculate positions on the range bar (0% = bear price, 100% = bull price)
  const rangeMin = bear.price || 0;
  const rangeMax = bull.price || 100;
  const rangeSize = rangeMax - rangeMin;

  const getPosition = (price) => {
    if (!price || rangeSize === 0) return 50;
    const pos = ((price - rangeMin) / rangeSize) * 100;
    return Math.max(0, Math.min(100, pos));
  };

  const basePosition = getPosition(base.price);
  const currentPosition = getPosition(currentPrice);
  const targetPosition = getPosition(weightedTarget);

  return (
    <div className="valuation-scenarios unified">
      {/* HEADER: Side-by-Side Comparison (Pure DCF vs Triangulated) */}
      {hasPureDCF ? (
        <div className="valuation-comparison">
          {/* Pure DCF Column (matches DCF tab) */}
          <div className="valuation-column dcf">
            <span className="column-label">
              <Calculator size={14} />
              Pure DCF Model
            </span>
            <span className="column-target">
              ${pureDCF.weightedTarget?.toFixed(2) || '—'}
            </span>
            {pureDCFChange != null && (
              <span className={`column-change ${pureDCFChange >= 0 ? 'positive' : 'negative'}`}>
                {pureDCFChange >= 0 ? '+' : ''}{pureDCFChange.toFixed(1)}%
              </span>
            )}
            <span className="column-probabilities">25% / 50% / 25%</span>
          </div>

          {/* Triangulated Column (blended with analyst) */}
          <div className="valuation-column triangulated">
            <span className="column-label">
              <Triangle size={14} />
              Triangulated
            </span>
            <span className="column-target">
              ${weightedTarget > 0 ? weightedTarget.toFixed(2) : '—'}
            </span>
            {weightedChange != null && (
              <span className={`column-change ${weightedChange >= 0 ? 'positive' : 'negative'}`}>
                {weightedChange >= 0 ? '+' : ''}{weightedChange.toFixed(1)}%
              </span>
            )}
            <span className="column-probabilities">20% / 55% / 25%</span>
          </div>
        </div>
      ) : (
        /* Fallback: Single header when no pure DCF available */
        <div className="valuation-header">
          <span className="header-label">Probability-Weighted Target</span>
          <div className="header-value-row">
            <span className="header-price">
              {weightedTarget > 0 ? `$${weightedTarget.toFixed(2)}` : '—'}
            </span>
            {weightedChange != null && (
              <span className={`header-change ${weightedChange >= 0 ? 'positive' : 'negative'}`}>
                {weightedChange >= 0 ? '+' : ''}{weightedChange.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* UNIFIED RANGE BAR WITH SCENARIOS */}
      <div className="unified-range">
        {/* Scenario Labels (positioned above bar) */}
        <div className="scenario-labels">
          <div className="scenario-label bear" style={{ left: '0%' }}>
            <span className="scenario-case">
              <TrendingDown size={12} />
              BEAR ({bull.probability != null ? `${((bear.probability || 0) * 100).toFixed(0)}%` : '—'})
            </span>
            <span className="scenario-price">
              ${bear.price?.toFixed(0) || '—'}
              <span className={`scenario-change ${bearChange >= 0 ? 'positive' : 'negative'}`}>
                {bearChange != null ? `${bearChange >= 0 ? '+' : ''}${bearChange.toFixed(0)}%` : ''}
              </span>
            </span>
          </div>
          <div className="scenario-label base" style={{ left: `${basePosition}%` }}>
            <span className="scenario-case">
              <Minus size={12} />
              BASE ({base.probability != null ? `${((base.probability || 0) * 100).toFixed(0)}%` : '—'})
            </span>
            <span className="scenario-price">
              ${base.price?.toFixed(0) || '—'}
              <span className={`scenario-change ${baseChange >= 0 ? 'positive' : 'negative'}`}>
                {baseChange != null ? `${baseChange >= 0 ? '+' : ''}${baseChange.toFixed(0)}%` : ''}
              </span>
            </span>
          </div>
          <div className="scenario-label bull" style={{ left: '100%' }}>
            <span className="scenario-case">
              <TrendingUp size={12} />
              BULL ({bull.probability != null ? `${((bull.probability || 0) * 100).toFixed(0)}%` : '—'})
            </span>
            <span className="scenario-price">
              ${bull.price?.toFixed(0) || '—'}
              <span className={`scenario-change ${bullChange >= 0 ? 'positive' : 'negative'}`}>
                {bullChange != null ? `${bullChange >= 0 ? '+' : ''}${bullChange.toFixed(0)}%` : ''}
              </span>
            </span>
          </div>
        </div>

        {/* The Range Bar Track */}
        <div className="range-track unified">
          {/* Zone gradients */}
          <div className="zone bear" />
          <div className="zone bull" />

          {/* Scenario position markers (vertical lines) */}
          <div className="scenario-marker bear" style={{ left: '0%' }} />
          <div className="scenario-marker base" style={{ left: `${basePosition}%` }} />
          <div className="scenario-marker bull" style={{ left: '100%' }} />

          {/* Current Price Marker (circle) */}
          {currentPrice && (
            <div className="current-marker-unified" style={{ left: `${currentPosition}%` }}>
              <div className="marker-dot" />
            </div>
          )}

          {/* Weighted Target Marker (diamond) */}
          {weightedTarget > 0 && (
            <div className="target-marker-unified" style={{ left: `${targetPosition}%` }}>
              <div className="marker-diamond" />
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="range-legend">
          <div className="legend-item">
            <span className="legend-marker current" />
            <span className="legend-text">Current Price (${currentPrice?.toFixed(0) || '—'})</span>
          </div>
          <div className="legend-item">
            <svg className="legend-marker-svg" width="10" height="10" viewBox="0 0 10 10">
              <rect x="2" y="2" width="6" height="6" fill="var(--color-gold-500)" transform="rotate(45 5 5)" />
            </svg>
            <span className="legend-text">Weighted Target (${weightedTarget > 0 ? weightedTarget.toFixed(0) : '—'})</span>
          </div>
        </div>
      </div>

      {/* TRIANGULATION SECTION */}
      {hasTriangulation && (
        <div className="triangulation-connected">
          <div className="triangulation-header">
            <span className="section-label">
              <PrismSparkle size={14} className="ai-sparkle-icon" />
              Triangulated Valuation
            </span>
            <AlignmentBadge alignment={triangulatedValuation.triangulation?.alignment} />
          </div>

          <div className="perspectives-row">
            <PerspectiveCardCompact
              title="Wall Street"
              subtitle="Analyst Consensus"
              value={triangulatedValuation.perspectives?.analystConsensus?.targetMean}
              confidence={triangulatedValuation.perspectives?.analystConsensus?.confidence}
              currentPrice={currentPrice}
              icon={<BarChart2 size={18} />}
              iconColor="blue"
              analystCount={triangulatedValuation.perspectives?.analystConsensus?.analystCount}
            />
            <div className="perspective-divider" />
            <PerspectiveCardCompact
              title="Fundamentals"
              subtitle="DCF Intrinsic"
              value={triangulatedValuation.perspectives?.dcfIntrinsic?.baseCase}
              confidence={triangulatedValuation.perspectives?.dcfIntrinsic?.confidence}
              currentPrice={currentPrice}
              icon={<Target size={18} />}
              iconColor="violet"
              warnings={triangulatedValuation.perspectives?.dcfIntrinsic?.warnings}
            />
            <div className="perspective-divider" />
            <PerspectiveCardCompact
              title="Market Implied"
              subtitle="Reverse DCF"
              impliedGrowth={triangulatedValuation.perspectives?.marketImplied?.impliedGrowthPct}
              historicalGrowth={triangulatedValuation.perspectives?.marketImplied?.historicalGrowthPct}
              sentiment={triangulatedValuation.perspectives?.marketImplied?.marketSentiment}
              confidence={triangulatedValuation.perspectives?.marketImplied?.confidence}
              icon={<Zap size={18} />}
              iconColor="gold"
              isReverseDCF
              sanityFlags={triangulatedValuation.backwardReasoning?.sanityCheck?.flags}
              requiresReview={triangulatedValuation.backwardReasoning?.sanityCheck?.requiresManualReview}
              impliedHitBounds={triangulatedValuation.perspectives?.marketImplied?.impliedHitCeiling || triangulatedValuation.perspectives?.marketImplied?.impliedHitFloor}
              impliedGrowthNote={triangulatedValuation.perspectives?.marketImplied?.impliedGrowthNote}
            />
          </div>

          {triangulatedValuation.triangulation?.keyInsight && (
            <p className="key-insight-inline">{triangulatedValuation.triangulation.keyInsight}</p>
          )}
        </div>
      )}

      {/* MARKET EXPECTATIONS - Merged Section */}
      {hasTriangulation && (triangulatedValuation.reverseDCF || triangulatedValuation.backwardReasoning) && (
        <MarketExpectationsSection
          reverseDCF={triangulatedValuation.reverseDCF}
          backwardReasoning={triangulatedValuation.backwardReasoning}
        />
      )}

      {/* LINK TO FULL DCF ANALYSIS */}
      {onNavigateToDCF && (
        <button className="view-dcf-link" onClick={onNavigateToDCF}>
          <span>View Full DCF Analysis</span>
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

// Compact Scenario Cards - Replaces verbose table
function ScenarioCompactCards({ bull, base, bear, bullChange, baseChange, bearChange }) {
  const scenarios = [
    { key: 'bear', label: 'Bear', data: bear, change: bearChange, Icon: TrendingDown },
    { key: 'base', label: 'Base', data: base, change: baseChange, Icon: Minus },
    { key: 'bull', label: 'Bull', data: bull, change: bullChange, Icon: TrendingUp }
  ];

  return (
    <div className="scenario-compact-grid">
      {scenarios.map(({ key, label, data, change, Icon }) => (
        <div key={key} className={`scenario-cell ${key}`}>
          <div className="scenario-header">
            <Icon size={14} />
            <span className="case-name">{label}</span>
            <span className="probability">
              {data.probability != null ? `${(data.probability * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
          <div className="scenario-price">
            <span className="price">${data.price?.toFixed(0) || '—'}</span>
            {change != null && (
              <span className={`change ${change >= 0 ? 'positive' : 'negative'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Alignment Badge - Compact inline version
function AlignmentBadge({ alignment }) {
  if (!alignment) return null;

  const config = {
    STRONG: { className: 'positive', icon: <CheckCircle size={14} />, label: 'Strong' },
    PARTIAL: { className: 'warning', icon: <Info size={14} />, label: 'Partial' },
    DIVERGENT: { className: 'negative', icon: <AlertTriangle size={14} />, label: 'Divergent' }
  };

  const { className, icon, label } = config[alignment.level] || config.PARTIAL;

  return (
    <div className={`alignment-badge-compact ${className}`}>
      {icon}
      <span>{label}</span>
      {alignment.score != null && <span className="score">{alignment.score}</span>}
    </div>
  );
}

// Compact Perspective Card - Slimmer triangulation cards
function PerspectiveCardCompact({
  title,
  subtitle,
  value,
  confidence,
  currentPrice,
  icon,
  iconColor,
  analystCount,
  warnings,
  impliedGrowth,
  historicalGrowth,
  sentiment,
  isReverseDCF,
  sanityFlags,
  requiresReview,
  impliedHitBounds,
  impliedGrowthNote
}) {
  const upside = value && currentPrice ? ((value / currentPrice) - 1) * 100 : null;
  const hasNegativeGrowth = sanityFlags?.includes('NEGATIVE_GROWTH');
  const hasGrowthDisconnect = sanityFlags?.includes('GROWTH_DISCONNECT');

  return (
    <div className={`perspective-compact ${iconColor || 'blue'} ${requiresReview ? 'requires-review' : ''}`}>
      <div className="perspective-top">
        <div className="perspective-icon">{icon}</div>
        <div className="perspective-info">
          <span className="title">{title}</span>
          <span className="subtitle">{subtitle}</span>
        </div>
        {requiresReview ? (
          <span className="review-badge" title="Requires manual review">
            <AlertTriangle size={14} /> Review
          </span>
        ) : confidence && (
          <span className={`confidence-tag ${confidence.toLowerCase()}`}>{confidence}</span>
        )}
      </div>

      <div className="perspective-bottom">
        {isReverseDCF ? (
          <div className="implied-data">
            <div className={`implied-row ${hasNegativeGrowth ? 'negative-growth' : ''} ${impliedHitBounds ? 'hit-bounds' : ''}`}>
              <span className="metric-label">Implied</span>
              <span className={`metric-value ${hasNegativeGrowth ? 'warning' : ''} ${impliedHitBounds ? 'extreme' : ''}`}
                title={impliedGrowthNote || undefined}>
                {impliedGrowth != null ? (impliedHitBounds ? `>${Number(impliedGrowth).toFixed(0)}%` : `${Number(impliedGrowth).toFixed(1)}%`) : '—'}
              </span>
            </div>
            <div className="implied-row muted">
              <span className="metric-label">Historical</span>
              <span className="metric-value">
                {historicalGrowth != null ? `${Number(historicalGrowth).toFixed(1)}%` : '—'}
              </span>
            </div>
            {impliedHitBounds && (
              <span className="bounds-warning-badge" title={impliedGrowthNote || 'Growth at model bounds'}>
                <AlertTriangle size={10} /> Extreme
              </span>
            )}
            {hasGrowthDisconnect && !impliedHitBounds && (
              <span className="growth-disconnect-badge">
                <AlertTriangle size={10} /> Gap
              </span>
            )}
            {sentiment && !hasGrowthDisconnect && !impliedHitBounds && (
              <span className={`sentiment-tag ${sentiment.toLowerCase()}`}>
                {sentiment === 'OPTIMISTIC' && <><TrendingUp size={10} /> Optimistic</>}
                {sentiment === 'PESSIMISTIC' && <><TrendingDown size={10} /> Pessimistic</>}
                {sentiment === 'ALIGNED' && <><Minus size={10} /> Aligned</>}
              </span>
            )}
          </div>
        ) : (
          <div className="value-data">
            <span className="value">${value?.toFixed(0) || '—'}</span>
            {upside !== null && (
              <span className={`upside ${upside >= 0 ? 'positive' : 'negative'}`}>
                {upside >= 0 ? '+' : ''}{upside.toFixed(0)}%
              </span>
            )}
            {analystCount && (
              <span className="analyst-count">{analystCount} analysts</span>
            )}
            {warnings && warnings.length > 0 && (
              <span className="warning-indicator">
                <AlertTriangle size={12} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Unified Market Expectations Section - Merges backward reasoning + reverse DCF
function MarketExpectationsSection({ reverseDCF, backwardReasoning }) {
  const [showSensitivity, setShowSensitivity] = useState(false);

  const { interpretation, sensitivityTable, flags } = reverseDCF || {};
  const { headline, sanityCheck } = backwardReasoning || {};

  // Don't render if no meaningful data
  if (!interpretation && !headline && (!sensitivityTable || sensitivityTable.length === 0)) {
    return null;
  }

  return (
    <div className="market-expectations-section">
      {/* Header Row */}
      <div className="expectations-header">
        <div className="expectations-title">
          <Lightbulb size={16} className="expectations-icon" />
          <span className="section-label">Market Expectations</span>
        </div>
        {sanityCheck && (
          <div className={`sanity-badge ${sanityCheck.riskLevel?.toLowerCase() || 'medium'}`}>
            {sanityCheck.isReasonable ? (
              <CheckCircle size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
            <span>{sanityCheck.isReasonable ? 'Reasonable' : 'Caution'}</span>
          </div>
        )}
        {!sanityCheck && interpretation?.riskLevel && interpretation.riskLevel !== 'LOW' && (
          <span className={`risk-badge ${interpretation.riskLevel.toLowerCase()}`}>
            {interpretation.riskLevel} RISK
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="expectations-content">
        {/* Primary text: Use headline if available, else interpretation summary */}
        {headline ? (
          <p className="expectations-headline">{headline}</p>
        ) : interpretation?.summary ? (
          <p className="expectations-headline">{parseMarkdownBold(interpretation.summary)}</p>
        ) : null}

        {/* Additional details from interpretation (if headline was used as primary) */}
        {headline && interpretation?.summary && (
          <p className="expectations-detail">{parseMarkdownBold(interpretation.summary)}</p>
        )}

        {/* Flags */}
        {flags && flags.length > 0 && (
          <div className="expectations-flags">
            {flags.map((flag, i) => (
              <span key={i} className={`flag ${flag.severity?.toLowerCase() || 'medium'}`}>
                {flag.icon} {flag.message}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sensitivity Table Toggle */}
      {sensitivityTable && sensitivityTable.length > 0 && (
        <div className="sensitivity-section">
          <button
            className={`sensitivity-toggle ${showSensitivity ? 'expanded' : ''}`}
            onClick={() => setShowSensitivity(!showSensitivity)}
          >
            <span>Growth Rate Sensitivity</span>
            <ChevronDown size={16} className={`toggle-icon ${showSensitivity ? 'rotated' : ''}`} />
          </button>

          {showSensitivity && (
            <div className="sensitivity-content">
              <table className="sensitivity-table">
                <thead>
                  <tr>
                    <th>Growth Rate</th>
                    <th>DCF Value</th>
                    <th>vs Current</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityTable.map((row, i) => (
                    <tr
                      key={i}
                      className={`
                        ${row.isImplied ? 'is-implied' : ''}
                        ${row.isBase ? 'is-base' : ''}
                      `}
                    >
                      <td className="growth-rate">
                        {row.growthRatePct}
                        {row.isImplied && <span className="marker implied">Market</span>}
                        {row.isBase && !row.isImplied && <span className="marker base">Model</span>}
                      </td>
                      <td className="dcf-value">{row.dcfValueFormatted}</td>
                      <td className={`upside ${row.upside >= 0 ? 'positive' : 'negative'}`}>
                        {row.upsideFormatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ValuationScenarios;
