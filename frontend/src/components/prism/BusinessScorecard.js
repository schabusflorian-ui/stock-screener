// frontend/src/components/prism/BusinessScorecard.js
// 12-factor Business Scorecard component with confidence indicators

import {
  Target,
  TrendingUp,
  DollarSign,
  Shield,
  Users,
  Building2,
  Activity,
  BarChart2,
  Briefcase,
  Globe
} from 'lucide-react';
import './BusinessScorecard.css';

const FACTOR_CONFIG = {
  // Market Factors
  marketNeed: {
    label: 'Market Need',
    category: 'market',
    icon: Target,
    description: 'Strength of underlying demand'
  },
  marketDirection: {
    label: 'Market Direction',
    category: 'market',
    icon: TrendingUp,
    description: 'Growing vs declining market'
  },
  marketSize: {
    label: 'Market Size',
    category: 'market',
    icon: Globe,
    description: 'Total addressable market'
  },

  // Competitive Factors
  competitiveStrength: {
    label: 'Competitive Strength',
    category: 'competitive',
    icon: Shield,
    description: 'Current market position'
  },
  competitiveDirection: {
    label: 'Competitive Direction',
    category: 'competitive',
    icon: Activity,
    description: 'Gaining or losing share'
  },
  moatDurability: {
    label: 'Moat Durability',
    category: 'competitive',
    icon: Building2,
    description: 'Sustainability of advantages'
  },

  // Financial Factors
  growthMomentum: {
    label: 'Growth Momentum',
    category: 'financial',
    icon: TrendingUp,
    description: 'Revenue and earnings growth'
  },
  profitability: {
    label: 'Profitability',
    category: 'financial',
    icon: DollarSign,
    description: 'Return on invested capital'
  },
  cashGeneration: {
    label: 'Cash Generation',
    category: 'financial',
    icon: BarChart2,
    description: 'Free cash flow quality'
  },
  balanceSheet: {
    label: 'Balance Sheet',
    category: 'financial',
    icon: Briefcase,
    description: 'Financial strength'
  },

  // Management Factors
  capitalAllocation: {
    label: 'Capital Allocation',
    category: 'management',
    icon: Target,
    description: 'Use of cash and capital'
  },
  leadershipQuality: {
    label: 'Leadership Quality',
    category: 'management',
    icon: Users,
    description: 'Executive track record'
  }
};

const CATEGORY_LABELS = {
  market: 'Market',
  competitive: 'Competitive',
  financial: 'Financial',
  management: 'Management'
};

export function BusinessScorecard({ scorecard }) {
  if (!scorecard || !scorecard.factors) {
    return (
      <div className="business-scorecard empty">
        <p>Scorecard data not available</p>
      </div>
    );
  }

  // Flatten the nested structure for easier rendering
  const flattenedFactors = [];
  const categories = ['market', 'competitive', 'financial', 'management'];

  for (const category of categories) {
    const categoryFactors = scorecard.factors[category];
    if (categoryFactors) {
      for (const [key, value] of Object.entries(categoryFactors)) {
        const config = FACTOR_CONFIG[key];
        if (config) {
          flattenedFactors.push({
            key,
            ...config,
            score: value?.score,
            confidence: value?.confidence,
            justification: value?.justification
          });
        }
      }
    }
  }

  // Group by category for rendering
  const groupedFactors = categories.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    factors: flattenedFactors.filter(f => f.category === category)
  }));

  // Calculate category averages
  const categoryAverages = groupedFactors.map(group => {
    const scores = group.factors.filter(f => f.score != null).map(f => f.score);
    return {
      category: group.category,
      average: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    };
  });

  return (
    <div className="business-scorecard">
      {/* Overall Score Summary */}
      <div className="scorecard-summary">
        <div className="overall-score">
          <span className="label">Overall Score</span>
          <span className="value">{scorecard.overallScore?.toFixed(1) || '—'}</span>
          <span className="max">/ 5</span>
        </div>
        <div className="category-averages">
          {categoryAverages.map(({ category, average }) => (
            <div key={category} className={`category-avg ${category}`}>
              <span className="cat-label">{CATEGORY_LABELS[category]}</span>
              <ScoreBar score={average} maxScore={5} size="small" />
              <span className="cat-score">{average?.toFixed(1) || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Factors */}
      <div className="scorecard-details">
        {groupedFactors.map(group => (
          <div key={group.category} className={`scorecard-category ${group.category}`}>
            <div className="category-header">
              <h4>{group.label}</h4>
            </div>
            <div className="category-factors">
              {group.factors.map(factor => (
                <FactorRow key={factor.key} factor={factor} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Confidence Legend */}
      <div className="confidence-legend">
        <div className="legend-item">
          <ConfidenceDots level="HIGH" />
          <span>High Confidence (data-driven)</span>
        </div>
        <div className="legend-item">
          <ConfidenceDots level="MEDIUM" />
          <span>Medium Confidence (data + AI)</span>
        </div>
        <div className="legend-item">
          <ConfidenceDots level="LOW" />
          <span>Lower Confidence (AI inference)</span>
        </div>
      </div>
    </div>
  );
}

function FactorRow({ factor }) {
  const Icon = factor.icon;

  return (
    <div className="factor-row">
      <div className="factor-icon">
        <Icon size={16} />
      </div>
      <div className="factor-info">
        <div className="factor-header">
          <span className="factor-label">{factor.label}</span>
          <ConfidenceDots level={factor.confidence} />
        </div>
        <div className="factor-description">{factor.description}</div>
      </div>
      <div className="factor-score">
        <ScoreBar score={factor.score} maxScore={5} />
        <span className="score-value">{factor.score?.toFixed(0) || '—'}/5</span>
      </div>
    </div>
  );
}

function ScoreBar({ score, maxScore = 5, size = 'normal' }) {
  const percentage = score != null ? (score / maxScore) * 100 : 0;

  const getColor = (pct) => {
    if (pct >= 80) return 'var(--color-success)';
    if (pct >= 60) return 'var(--color-primary)';
    if (pct >= 40) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  return (
    <div className={`score-bar ${size}`}>
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: getColor(percentage)
          }}
        />
      </div>
    </div>
  );
}

function ConfidenceDots({ level }) {
  const levels = ['LOW', 'MEDIUM', 'HIGH'];
  const levelIndex = levels.indexOf(level?.toUpperCase()) + 1;

  return (
    <div className="confidence-dots" title={`${level} confidence`}>
      {[1, 2, 3].map(i => (
        <span
          key={i}
          className={`dot ${i <= levelIndex ? 'filled' : ''}`}
        />
      ))}
    </div>
  );
}

export default BusinessScorecard;
