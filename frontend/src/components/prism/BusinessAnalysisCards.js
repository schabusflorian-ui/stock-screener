// frontend/src/components/prism/BusinessAnalysisCards.js
// Business Analysis - Enhanced Accordion with Professional Scoring
// Premium row-based layout with overall score header and animated transitions

import { useState, useRef, useEffect } from 'react';
import {
  DollarSign,
  Shield,
  Globe,
  Users,
  ChevronDown
} from 'lucide-react';
import './BusinessAnalysisCards.css';

const CATEGORY_CONFIG = {
  financial: {
    label: 'Financial Strength',
    icon: DollarSign,
    color: 'emerald',
    factors: ['growthMomentum', 'profitability', 'cashGeneration', 'balanceSheet']
  },
  competitive: {
    label: 'Competitive Position',
    icon: Shield,
    color: 'blue',
    factors: ['competitiveStrength', 'competitiveDirection', 'moatDurability']
  },
  market: {
    label: 'Market Dynamics',
    icon: Globe,
    color: 'violet',
    factors: ['marketNeed', 'marketDirection', 'marketSize']
  },
  management: {
    label: 'Management Quality',
    icon: Users,
    color: 'gold',
    factors: ['capitalAllocation', 'leadershipQuality']
  }
};

const FACTOR_NAMES = {
  growthMomentum: 'Growth Momentum',
  profitability: 'Profitability',
  cashGeneration: 'Cash Generation',
  balanceSheet: 'Balance Sheet',
  competitiveStrength: 'Competitive Strength',
  competitiveDirection: 'Competitive Trend',
  moatDurability: 'Moat Durability',
  marketNeed: 'Market Need',
  marketDirection: 'Market Direction',
  marketSize: 'Market Size',
  capitalAllocation: 'Capital Allocation',
  leadershipQuality: 'Leadership Quality'
};

// Get quality rating from score
function getScoreRating(score) {
  if (score >= 4) return { label: 'Strong', class: 'strong' };
  if (score >= 3) return { label: 'Average', class: 'average' };
  if (score >= 2) return { label: 'Weak', class: 'weak' };
  return { label: 'Poor', class: 'poor' };
}

// Render score dots (●●●●○)
function ScoreDots({ score, maxScore = 5, color }) {
  const filled = Math.round(score || 0);
  const dots = [];

  for (let i = 0; i < maxScore; i++) {
    dots.push(
      <span
        key={i}
        className={`score-dot ${i < filled ? 'filled' : 'empty'} ${color}`}
      />
    );
  }

  return <div className="score-dots">{dots}</div>;
}

// Animated collapsible content
function AnimatedCollapse({ isOpen, children }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0);
    }
  }, [isOpen, children]);

  return (
    <div
      className="animated-collapse"
      style={{
        height: isOpen ? height : 0,
        opacity: isOpen ? 1 : 0
      }}
    >
      <div ref={contentRef}>
        {children}
      </div>
    </div>
  );
}

export function BusinessAnalysisCards({ scorecard, analysis, overallScore }) {
  const [expandedRows, setExpandedRows] = useState({});

  const toggleRow = (category) => {
    setExpandedRows(prev => ({ ...prev, [category]: !prev[category] }));
  };

  if (!scorecard?.factors) {
    return null;
  }

  const categories = ['financial', 'competitive', 'market', 'management'];

  // Calculate overall composite score
  const categoryScores = categories.map(catKey => {
    const factors = scorecard.factors[catKey];
    if (!factors) return null;
    return calculateAvgScore(factors);
  }).filter(Boolean);

  const compositeScore = categoryScores.length > 0
    ? (categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length) * 2 // Scale to 10
    : 0;

  const compositeRating = getCompositeRating(compositeScore);

  return (
    <section className="business-analysis-section">
      {/* Overall Score Header */}
      <div className="analysis-overview-header">
        <div className="overview-score-gauge">
          <div className={`gauge-circle ${compositeRating.class}`}>
            <span className="gauge-value">{compositeScore.toFixed(1)}</span>
            <span className="gauge-max">/10</span>
          </div>
        </div>
        <div className="overview-info">
          <div className="overview-title-row">
            <h4>Business Quality Score</h4>
            <span className={`quality-badge ${compositeRating.class}`}>
              {compositeRating.label}
            </span>
          </div>
          <p className="overview-summary">
            Based on {categoryScores.length} categories and 12 fundamental factors
          </p>
          <div className="category-summary-bar">
            {categories.map(catKey => {
              const factors = scorecard.factors[catKey];
              if (!factors) return null;
              const avg = calculateAvgScore(factors);
              const rating = getScoreRating(avg);
              return (
                <div key={catKey} className={`category-pip ${rating.class}`}>
                  <span className="pip-label">{CATEGORY_CONFIG[catKey].label.split(' ')[0]}</span>
                  <span className="pip-score">{avg.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category Rows */}
      <div className="analysis-rows">
        {categories.map(catKey => {
          const config = CATEGORY_CONFIG[catKey];
          const categoryFactors = scorecard.factors[catKey];
          const categoryAnalysis = analysis?.[catKey];
          const Icon = config.icon;

          if (!categoryFactors) return null;

          const avgScore = calculateAvgScore(categoryFactors);
          const rating = getScoreRating(avgScore);
          const isExpanded = expandedRows[catKey];
          const hasDetails = categoryAnalysis?.narrative ||
            config.factors.some(f => categoryFactors[f]?.justification);

          return (
            <div key={catKey} className={`analysis-row ${config.color} ${isExpanded ? 'expanded' : ''}`}>
              {/* Row Header */}
              <div
                className="row-header"
                onClick={() => hasDetails && toggleRow(catKey)}
                role={hasDetails ? "button" : undefined}
                tabIndex={hasDetails ? 0 : undefined}
                onKeyDown={(e) => {
                  if (hasDetails && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    toggleRow(catKey);
                  }
                }}
              >
                {/* Category Info */}
                <div className="row-category">
                  <div className="category-icon">
                    <Icon size={18} />
                  </div>
                  <div className="category-text">
                    <span className="category-label">{config.label}</span>
                    <span className={`category-rating ${rating.class}`}>{rating.label}</span>
                  </div>
                </div>

                {/* Score Badge */}
                <div className={`category-score-badge ${rating.class}`}>
                  <span className="score-number">{avgScore.toFixed(1)}</span>
                  <span className="score-max">/5</span>
                </div>

                {/* Factor Scores - Dot visualization */}
                <div className="row-factors">
                  {config.factors.map(factorKey => {
                    const factor = categoryFactors[factorKey];
                    if (!factor) return null;

                    return (
                      <div key={factorKey} className="factor-chip">
                        <span className="factor-label">{FACTOR_NAMES[factorKey].split(' ')[0]}</span>
                        <ScoreDots score={factor.score} color={config.color} />
                      </div>
                    );
                  })}
                </div>

                {/* Expand Toggle */}
                {hasDetails && (
                  <div className={`row-toggle ${isExpanded ? 'rotated' : ''}`}>
                    <ChevronDown size={20} />
                  </div>
                )}
              </div>

              {/* Expanded Details with Animation */}
              <AnimatedCollapse isOpen={isExpanded}>
                <div className="row-details">
                  {/* Narrative */}
                  {categoryAnalysis?.narrative && (
                    <div className="row-narrative">
                      <p>{categoryAnalysis.narrative}</p>
                    </div>
                  )}

                  {/* Factor Analysis Grid */}
                  <div className="factor-analysis-grid">
                    {config.factors.map(factorKey => {
                      const factor = categoryFactors[factorKey];
                      if (!factor) return null;
                      const factorRating = getScoreRating(factor.score);

                      return (
                        <div key={factorKey} className="factor-card">
                          <div className="factor-card-header">
                            <span className="factor-name">{FACTOR_NAMES[factorKey]}</span>
                            <div className="factor-score-group">
                              <span className={`factor-score-value ${factorRating.class}`}>
                                {factor.score}
                              </span>
                              <ScoreDots score={factor.score} color={config.color} />
                            </div>
                          </div>
                          {factor.justification && (
                            <p className="factor-justification">{factor.justification}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Key Insights - Simple list */}
                  {categoryAnalysis?.keyPoints && categoryAnalysis.keyPoints.length > 0 && (
                    <div className="row-insights">
                      <span className="insights-header">Key Takeaways</span>
                      <div className="insights-list">
                        {categoryAnalysis.keyPoints.map((point, i) => {
                          const sentiment = detectSentiment(point);
                          return (
                            <div key={i} className={`insight-item ${sentiment}`}>
                              <span className={`insight-dot ${sentiment}`} />
                              <span className="insight-text">{point}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </AnimatedCollapse>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function calculateAvgScore(factors) {
  const scores = Object.values(factors)
    .filter(f => f?.score != null)
    .map(f => f.score);

  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function getCompositeRating(score) {
  if (score >= 8) return { label: 'Excellent', class: 'excellent' };
  if (score >= 6.5) return { label: 'Strong', class: 'strong' };
  if (score >= 5) return { label: 'Average', class: 'average' };
  if (score >= 3.5) return { label: 'Below Average', class: 'weak' };
  return { label: 'Poor', class: 'poor' };
}

function detectSentiment(text) {
  const lowerText = text.toLowerCase();
  const positiveWords = ['strong', 'excellent', 'growth', 'improving', 'leading', 'advantage', 'robust', 'solid', 'healthy', 'outperform', 'high', 'increase'];
  const negativeWords = ['risk', 'concern', 'weak', 'decline', 'pressure', 'challenge', 'threat', 'low', 'poor', 'slow'];

  if (positiveWords.some(word => lowerText.includes(word))) return 'positive';
  if (negativeWords.some(word => lowerText.includes(word))) return 'warning';
  return 'neutral';
}

export default BusinessAnalysisCards;
