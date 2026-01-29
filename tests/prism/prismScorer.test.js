// tests/prism/prismScorer.test.js
// Unit tests for PRISM Scorer - pure function tests to avoid database dependencies

describe('PRISMScorer', () => {
  // ============================================
  // SCORING FUNCTIONS (Pure Logic Tests)
  // ============================================

  describe('Growth Momentum Scoring', () => {
    /**
     * Score growth momentum based on revenue growth, EPS growth, analyst momentum
     * 1-5 scale where:
     * 5 = Exceptional (>20% revenue growth)
     * 4 = Strong (10-20%)
     * 3 = Moderate (5-10%)
     * 2 = Below average (0-5%)
     * 1 = Declining (<0%)
     */
    const scoreGrowthFromRevenue = (revenueGrowth) => {
      if (revenueGrowth >= 20) return 5;
      if (revenueGrowth >= 10) return 4;
      if (revenueGrowth >= 5) return 3;
      if (revenueGrowth >= 0) return 2;
      return 1;
    };

    const scoreGrowthFromEarnings = (earningsGrowth) => {
      if (earningsGrowth >= 25) return 5;
      if (earningsGrowth >= 15) return 4;
      if (earningsGrowth >= 5) return 3;
      if (earningsGrowth >= 0) return 2;
      return 1;
    };

    it('should score exceptional revenue growth as 5', () => {
      expect(scoreGrowthFromRevenue(25)).toBe(5);
      expect(scoreGrowthFromRevenue(50)).toBe(5);
    });

    it('should score strong revenue growth as 4', () => {
      expect(scoreGrowthFromRevenue(15)).toBe(4);
      expect(scoreGrowthFromRevenue(19.9)).toBe(4);
    });

    it('should score moderate revenue growth as 3', () => {
      expect(scoreGrowthFromRevenue(7)).toBe(3);
      expect(scoreGrowthFromRevenue(5)).toBe(3);
    });

    it('should score flat growth as 2', () => {
      expect(scoreGrowthFromRevenue(2)).toBe(2);
      expect(scoreGrowthFromRevenue(0)).toBe(2);
    });

    it('should score declining revenue as 1', () => {
      expect(scoreGrowthFromRevenue(-5)).toBe(1);
      expect(scoreGrowthFromRevenue(-20)).toBe(1);
    });

    it('should score exceptional earnings growth as 5', () => {
      expect(scoreGrowthFromEarnings(30)).toBe(5);
    });

    it('should score strong earnings growth as 4', () => {
      expect(scoreGrowthFromEarnings(20)).toBe(4);
    });
  });

  describe('Profitability Scoring', () => {
    /**
     * Score ROIC (Return on Invested Capital)
     * 5 = Elite (≥20%)
     * 4 = Strong (15-20%)
     * 3 = Good (10-15%)
     * 2 = Average (5-10%)
     * 1 = Poor (<5%)
     */
    const scoreROIC = (roic) => {
      if (roic >= 20) return 5;
      if (roic >= 15) return 4;
      if (roic >= 10) return 3;
      if (roic >= 5) return 2;
      return 1;
    };

    const scoreROE = (roe) => {
      if (roe >= 25) return 5;
      if (roe >= 18) return 4;
      if (roe >= 12) return 3;
      if (roe >= 6) return 2;
      return 1;
    };

    const scoreNetMargin = (margin) => {
      if (margin >= 20) return 5;
      if (margin >= 12) return 4;
      if (margin >= 6) return 3;
      if (margin >= 2) return 2;
      return 1;
    };

    const scoreOperatingMargin = (margin) => {
      if (margin >= 25) return 5;
      if (margin >= 18) return 4;
      if (margin >= 12) return 3;
      if (margin >= 5) return 2;
      return 1;
    };

    it('should score elite ROIC correctly', () => {
      expect(scoreROIC(25)).toBe(5);
      expect(scoreROIC(111)).toBe(5); // AAPL-level ROIC
    });

    it('should score strong ROIC correctly', () => {
      expect(scoreROIC(17)).toBe(4);
    });

    it('should score good ROIC correctly', () => {
      expect(scoreROIC(12)).toBe(3);
    });

    it('should score average ROIC correctly', () => {
      expect(scoreROIC(7)).toBe(2);
    });

    it('should score poor ROIC correctly', () => {
      expect(scoreROIC(3)).toBe(1);
    });

    it('should score ROE correctly', () => {
      expect(scoreROE(30)).toBe(5);
      expect(scoreROE(20)).toBe(4);
      expect(scoreROE(15)).toBe(3);
      expect(scoreROE(8)).toBe(2);
      expect(scoreROE(4)).toBe(1);
    });

    it('should score net margin correctly', () => {
      expect(scoreNetMargin(25)).toBe(5);
      expect(scoreNetMargin(15)).toBe(4);
      expect(scoreNetMargin(8)).toBe(3);
      expect(scoreNetMargin(3)).toBe(2);
      expect(scoreNetMargin(1)).toBe(1);
    });

    it('should score operating margin correctly', () => {
      expect(scoreOperatingMargin(30)).toBe(5);
      expect(scoreOperatingMargin(20)).toBe(4);
      expect(scoreOperatingMargin(14)).toBe(3);
      expect(scoreOperatingMargin(7)).toBe(2);
      expect(scoreOperatingMargin(3)).toBe(1);
    });
  });

  describe('Cash Generation Scoring', () => {
    const scoreFCFYield = (fcfYield) => {
      if (fcfYield >= 8) return 5;
      if (fcfYield >= 5) return 4;
      if (fcfYield >= 3) return 3;
      if (fcfYield >= 1) return 2;
      return 1;
    };

    const scoreFCFMargin = (fcfMargin) => {
      if (fcfMargin >= 20) return 5;
      if (fcfMargin >= 12) return 4;
      if (fcfMargin >= 6) return 3;
      if (fcfMargin >= 2) return 2;
      return 1;
    };

    it('should score high FCF yield correctly', () => {
      expect(scoreFCFYield(10)).toBe(5);
      expect(scoreFCFYield(6)).toBe(4);
      expect(scoreFCFYield(4)).toBe(3);
      expect(scoreFCFYield(1.5)).toBe(2);
      expect(scoreFCFYield(0.5)).toBe(1);
    });

    it('should score FCF margin correctly', () => {
      expect(scoreFCFMargin(25)).toBe(5);
      expect(scoreFCFMargin(15)).toBe(4);
      expect(scoreFCFMargin(8)).toBe(3);
      expect(scoreFCFMargin(3)).toBe(2);
      expect(scoreFCFMargin(1)).toBe(1);
    });
  });

  describe('Balance Sheet Scoring', () => {
    const scoreDebtToEquity = (debtEquity) => {
      if (debtEquity <= 0.3) return 5;
      if (debtEquity <= 0.7) return 4;
      if (debtEquity <= 1.2) return 3;
      if (debtEquity <= 2.0) return 2;
      return 1;
    };

    const scoreCurrentRatio = (currentRatio) => {
      if (currentRatio >= 2.0) return 5;
      if (currentRatio >= 1.5) return 4;
      if (currentRatio >= 1.2) return 3;
      if (currentRatio >= 1.0) return 2;
      return 1;
    };

    it('should score low debt correctly', () => {
      expect(scoreDebtToEquity(0.1)).toBe(5);
      expect(scoreDebtToEquity(0.5)).toBe(4);
      expect(scoreDebtToEquity(1.0)).toBe(3);
      expect(scoreDebtToEquity(1.5)).toBe(2);
      expect(scoreDebtToEquity(3.0)).toBe(1);
    });

    it('should score current ratio correctly', () => {
      expect(scoreCurrentRatio(2.5)).toBe(5);
      expect(scoreCurrentRatio(1.7)).toBe(4);
      expect(scoreCurrentRatio(1.3)).toBe(3);
      expect(scoreCurrentRatio(1.0)).toBe(2);
      expect(scoreCurrentRatio(0.8)).toBe(1);
    });
  });

  describe('Competitive Strength Scoring', () => {
    const scoreGrossMargin = (grossMargin) => {
      if (grossMargin >= 60) return 5;
      if (grossMargin >= 45) return 4;
      if (grossMargin >= 30) return 3;
      if (grossMargin >= 20) return 2;
      return 1;
    };

    const scoreRevenueScale = (revenue) => {
      if (revenue >= 100e9) return 5; // $100B+
      if (revenue >= 20e9) return 4;  // $20B+
      if (revenue >= 5e9) return 3;   // $5B+
      return 2;
    };

    it('should score high gross margin as strong competitive position', () => {
      expect(scoreGrossMargin(70)).toBe(5); // Premium pricing power
      expect(scoreGrossMargin(50)).toBe(4);
      expect(scoreGrossMargin(35)).toBe(3);
      expect(scoreGrossMargin(25)).toBe(2);
      expect(scoreGrossMargin(15)).toBe(1);
    });

    it('should score revenue scale correctly', () => {
      expect(scoreRevenueScale(400e9)).toBe(5); // AAPL-level
      expect(scoreRevenueScale(50e9)).toBe(4);
      expect(scoreRevenueScale(10e9)).toBe(3);
      expect(scoreRevenueScale(2e9)).toBe(2);
    });
  });

  // ============================================
  // OVERALL SCORE CALCULATION
  // ============================================

  describe('Overall Score Calculation', () => {
    const weights = {
      // Financial (40% weight)
      growthMomentum: 0.12,
      profitability: 0.12,
      cashGeneration: 0.10,
      balanceSheet: 0.06,
      // Competitive (25% weight)
      competitiveStrength: 0.10,
      competitiveDirection: 0.08,
      moatDurability: 0.07,
      // Management (15% weight)
      capitalAllocation: 0.10,
      leadershipQuality: 0.05,
      // Market (20% weight)
      marketNeed: 0.07,
      marketDirection: 0.07,
      marketSize: 0.06
    };

    const calculateOverallScore = (factors) => {
      let weightedSum = 0;
      let totalWeight = 0;

      for (const [key, score] of Object.entries(factors)) {
        if (score != null && weights[key]) {
          weightedSum += score * weights[key];
          totalWeight += weights[key];
        }
      }

      const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) : 3;
      return Math.round(rawScore * 2 * 10) / 10; // Scale 1-5 to 1-10
    };

    it('should calculate weighted overall score', () => {
      const perfectScores = {
        growthMomentum: 5,
        profitability: 5,
        cashGeneration: 5,
        balanceSheet: 5,
        competitiveStrength: 5,
        competitiveDirection: 5,
        moatDurability: 5,
        capitalAllocation: 5,
        leadershipQuality: 5,
        marketNeed: 5,
        marketDirection: 5,
        marketSize: 5
      };

      expect(calculateOverallScore(perfectScores)).toBe(10);
    });

    it('should handle mixed scores correctly', () => {
      const mixedScores = {
        growthMomentum: 4,
        profitability: 5,
        cashGeneration: 4,
        balanceSheet: 3,
        competitiveStrength: 4,
        competitiveDirection: 3,
        moatDurability: 4,
        capitalAllocation: 4,
        leadershipQuality: 3,
        marketNeed: 3,
        marketDirection: 3,
        marketSize: 3
      };

      const score = calculateOverallScore(mixedScores);
      expect(score).toBeGreaterThan(6);
      expect(score).toBeLessThan(8);
    });

    it('should handle partial data correctly', () => {
      const partialScores = {
        growthMomentum: 4,
        profitability: 5,
        cashGeneration: 4
      };

      const score = calculateOverallScore(partialScores);
      expect(score).toBeGreaterThan(7);
      expect(score).toBeLessThan(10);
    });

    it('should return neutral score with no data', () => {
      const emptyScores = {};
      expect(calculateOverallScore(emptyScores)).toBe(6); // 3 * 2 = 6
    });
  });

  // ============================================
  // CONFIDENCE LEVEL DETERMINATION
  // ============================================

  describe('Confidence Level Determination', () => {
    const determineConfidence = (factorType, hasData, dataQuality) => {
      const highConfidenceFactors = [
        'growthMomentum', 'profitability', 'cashGeneration',
        'balanceSheet', 'capitalAllocation'
      ];

      const mediumConfidenceFactors = [
        'competitiveStrength', 'competitiveDirection',
        'moatDurability', 'leadershipQuality'
      ];

      const lowConfidenceFactors = [
        'marketNeed', 'marketDirection', 'marketSize'
      ];

      if (!hasData) return 'LOW';

      if (highConfidenceFactors.includes(factorType)) {
        return dataQuality >= 0.8 ? 'HIGH' : 'MEDIUM';
      }

      if (mediumConfidenceFactors.includes(factorType)) {
        return dataQuality >= 0.8 ? 'MEDIUM' : 'LOW';
      }

      if (lowConfidenceFactors.includes(factorType)) {
        return 'LOW';
      }

      return 'MEDIUM';
    };

    it('should assign HIGH confidence to financial factors with good data', () => {
      expect(determineConfidence('profitability', true, 0.9)).toBe('HIGH');
      expect(determineConfidence('cashGeneration', true, 0.85)).toBe('HIGH');
    });

    it('should assign MEDIUM confidence to competitive factors', () => {
      expect(determineConfidence('competitiveStrength', true, 0.9)).toBe('MEDIUM');
      expect(determineConfidence('moatDurability', true, 0.85)).toBe('MEDIUM');
    });

    it('should assign LOW confidence to market factors', () => {
      expect(determineConfidence('marketNeed', true, 0.9)).toBe('LOW');
      expect(determineConfidence('marketSize', true, 0.85)).toBe('LOW');
    });

    it('should assign LOW confidence when data is missing', () => {
      expect(determineConfidence('profitability', false, 0)).toBe('LOW');
    });
  });

  // ============================================
  // JUSTIFICATION GENERATION
  // ============================================

  describe('Justification Generation', () => {
    const getGrowthJustification = (score, dataPoints) => {
      const levels = {
        5: 'Exceptional growth momentum',
        4: 'Strong growth trajectory',
        3: 'Moderate growth',
        2: 'Below-average growth',
        1: 'Weak or declining growth'
      };
      return `${levels[score] || 'Growth assessed'}: ${dataPoints.join(', ')}`;
    };

    const getProfitabilityJustification = (score, dataPoints) => {
      const levels = {
        5: 'Elite profitability',
        4: 'Strong profitability',
        3: 'Average profitability',
        2: 'Below-average profitability',
        1: 'Weak profitability'
      };
      return `${levels[score] || 'Profitability assessed'}: ${dataPoints.join(', ')}`;
    };

    it('should generate growth justification correctly', () => {
      const justification = getGrowthJustification(5, ['Revenue growth: 25%', 'EPS growth: 30%']);
      expect(justification).toContain('Exceptional growth momentum');
      expect(justification).toContain('Revenue growth: 25%');
      expect(justification).toContain('EPS growth: 30%');
    });

    it('should generate profitability justification correctly', () => {
      const justification = getProfitabilityJustification(5, ['ROIC: 111%', 'ROE: 179%']);
      expect(justification).toContain('Elite profitability');
      expect(justification).toContain('ROIC: 111%');
    });

    it('should handle weak scores correctly', () => {
      const justification = getGrowthJustification(1, ['Revenue growth: -5%']);
      expect(justification).toContain('Weak or declining growth');
    });
  });

  // ============================================
  // DATA POINT FORMATTING
  // ============================================

  describe('Data Point Formatting', () => {
    const formatPercentage = (value) => {
      return `${value.toFixed(1)}%`;
    };

    const formatCurrency = (value) => {
      if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
      if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toFixed(0)}`;
    };

    const formatRatio = (value) => {
      return `${value.toFixed(2)}x`;
    };

    it('should format percentages correctly', () => {
      expect(formatPercentage(15.234)).toBe('15.2%');
      expect(formatPercentage(-5.5)).toBe('-5.5%');
    });

    it('should format large currency values correctly', () => {
      expect(formatCurrency(400e9)).toBe('$400.0B');
      expect(formatCurrency(3.5e12)).toBe('$3.50T');
      expect(formatCurrency(50e6)).toBe('$50.0M');
    });

    it('should format ratios correctly', () => {
      expect(formatRatio(1.12)).toBe('1.12x');
      expect(formatRatio(0.5)).toBe('0.50x');
    });
  });
});

// ============================================
// SCORECARD STRUCTURE TESTS
// ============================================

describe('Scorecard Structure', () => {
  const createEmptyScorecard = () => ({
    overallScore: 0,
    scoredAt: new Date().toISOString(),
    factors: {
      market: {
        marketNeed: { score: null, confidence: 'LOW', justification: '' },
        marketDirection: { score: null, confidence: 'LOW', justification: '' },
        marketSize: { score: null, confidence: 'LOW', justification: '' }
      },
      competitive: {
        competitiveStrength: { score: null, confidence: 'MEDIUM', justification: '' },
        competitiveDirection: { score: null, confidence: 'MEDIUM', justification: '' },
        moatDurability: { score: null, confidence: 'MEDIUM', justification: '' }
      },
      financial: {
        growthMomentum: { score: null, confidence: 'HIGH', justification: '' },
        profitability: { score: null, confidence: 'HIGH', justification: '' },
        cashGeneration: { score: null, confidence: 'HIGH', justification: '' },
        balanceSheet: { score: null, confidence: 'HIGH', justification: '' }
      },
      management: {
        capitalAllocation: { score: null, confidence: 'HIGH', justification: '' },
        leadershipQuality: { score: null, confidence: 'MEDIUM', justification: '' }
      }
    }
  });

  it('should have correct structure with all 12 factors', () => {
    const scorecard = createEmptyScorecard();

    // Check categories
    expect(scorecard.factors).toHaveProperty('market');
    expect(scorecard.factors).toHaveProperty('competitive');
    expect(scorecard.factors).toHaveProperty('financial');
    expect(scorecard.factors).toHaveProperty('management');

    // Check market factors (3)
    expect(scorecard.factors.market).toHaveProperty('marketNeed');
    expect(scorecard.factors.market).toHaveProperty('marketDirection');
    expect(scorecard.factors.market).toHaveProperty('marketSize');

    // Check competitive factors (3)
    expect(scorecard.factors.competitive).toHaveProperty('competitiveStrength');
    expect(scorecard.factors.competitive).toHaveProperty('competitiveDirection');
    expect(scorecard.factors.competitive).toHaveProperty('moatDurability');

    // Check financial factors (4)
    expect(scorecard.factors.financial).toHaveProperty('growthMomentum');
    expect(scorecard.factors.financial).toHaveProperty('profitability');
    expect(scorecard.factors.financial).toHaveProperty('cashGeneration');
    expect(scorecard.factors.financial).toHaveProperty('balanceSheet');

    // Check management factors (2)
    expect(scorecard.factors.management).toHaveProperty('capitalAllocation');
    expect(scorecard.factors.management).toHaveProperty('leadershipQuality');
  });

  it('should have correct factor structure', () => {
    const scorecard = createEmptyScorecard();
    const factor = scorecard.factors.financial.profitability;

    expect(factor).toHaveProperty('score');
    expect(factor).toHaveProperty('confidence');
    expect(factor).toHaveProperty('justification');
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(factor.confidence);
  });

  it('should have scoredAt timestamp', () => {
    const scorecard = createEmptyScorecard();
    expect(scorecard.scoredAt).toBeDefined();
    expect(new Date(scorecard.scoredAt)).toBeInstanceOf(Date);
  });
});

// ============================================
// EDGE CASES AND VALIDATION
// ============================================

describe('Edge Cases and Validation', () => {
  describe('Score Bounds', () => {
    const clampScore = (score) => {
      if (score < 1) return 1;
      if (score > 5) return 5;
      return Math.round(score);
    };

    it('should clamp scores below 1', () => {
      expect(clampScore(0)).toBe(1);
      expect(clampScore(-5)).toBe(1);
    });

    it('should clamp scores above 5', () => {
      expect(clampScore(6)).toBe(5);
      expect(clampScore(10)).toBe(5);
    });

    it('should round intermediate scores', () => {
      expect(clampScore(3.4)).toBe(3);
      expect(clampScore(3.6)).toBe(4);
    });
  });

  describe('Null/Missing Data Handling', () => {
    const safeGetValue = (obj, path, defaultValue = null) => {
      const keys = path.split('.');
      let value = obj;
      for (const key of keys) {
        if (value == null) return defaultValue;
        value = value[key];
      }
      return value ?? defaultValue;
    };

    it('should handle null metrics gracefully', () => {
      const metrics = null;
      expect(safeGetValue(metrics, 'roic')).toBeNull();
    });

    it('should handle missing nested properties', () => {
      const metrics = { financial: {} };
      expect(safeGetValue(metrics, 'financial.roic')).toBeNull();
    });

    it('should return default value for missing data', () => {
      const metrics = {};
      expect(safeGetValue(metrics, 'roic', 0)).toBe(0);
    });
  });

  describe('Division by Zero Prevention', () => {
    const safeRatio = (numerator, denominator, defaultValue = 0) => {
      if (!denominator || denominator === 0) return defaultValue;
      return numerator / denominator;
    };

    it('should handle zero denominator', () => {
      expect(safeRatio(100, 0)).toBe(0);
    });

    it('should handle null denominator', () => {
      expect(safeRatio(100, null)).toBe(0);
    });

    it('should calculate ratio correctly with valid inputs', () => {
      expect(safeRatio(50, 100)).toBe(0.5);
    });
  });
});
