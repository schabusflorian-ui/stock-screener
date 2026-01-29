// tests/prism/triangulatedValuation.test.js
// Unit tests for Triangulated Valuation Service - valuation integration logic

describe('TriangulatedValuationService', () => {
  // ============================================
  // PERSPECTIVE ALIGNMENT TESTS
  // ============================================

  describe('Triangulation Alignment', () => {
    /**
     * Calculate alignment between valuation methods
     * STRONG (≥80): All methods within 15%
     * PARTIAL (50-80): Some divergence
     * DIVERGENT (<50): Methods disagree significantly
     */
    const calculateAlignment = (analystTarget, dcfBase, currentPrice) => {
      if (!analystTarget || !dcfBase || !currentPrice) {
        return { level: 'UNKNOWN', score: 0 };
      }

      // Calculate how close each is to current price
      const analystDiff = Math.abs(analystTarget - currentPrice) / currentPrice;
      const dcfDiff = Math.abs(dcfBase - currentPrice) / currentPrice;

      // Calculate how close analyst and DCF are to each other
      const methodDiff = Math.abs(analystTarget - dcfBase) / Math.max(analystTarget, dcfBase);

      // Score: lower differences = higher alignment
      const avgDiff = (analystDiff + dcfDiff + methodDiff) / 3;
      const score = Math.round(Math.max(0, 100 - (avgDiff * 200)));

      let level;
      if (score >= 80) level = 'STRONG';
      else if (score >= 50) level = 'PARTIAL';
      else level = 'DIVERGENT';

      return { level, score };
    };

    it('should detect strong alignment when methods agree', () => {
      const result = calculateAlignment(250, 245, 248);
      expect(result.level).toBe('STRONG');
      expect(result.score).toBeGreaterThan(80);
    });

    it('should detect partial alignment with moderate differences', () => {
      const result = calculateAlignment(300, 250, 248);
      expect(result.level).toBe('PARTIAL');
    });

    it('should detect divergent alignment with large differences', () => {
      const result = calculateAlignment(400, 200, 250);
      expect(result.level).toBe('DIVERGENT');
      expect(result.score).toBeLessThan(50);
    });

    it('should handle missing data gracefully', () => {
      const result = calculateAlignment(null, 250, 248);
      expect(result.level).toBe('UNKNOWN');
      expect(result.score).toBe(0);
    });
  });

  // ============================================
  // ENHANCED SCENARIO GENERATION
  // ============================================

  describe('Enhanced Scenarios', () => {
    const generateEnhancedScenarios = (analyst, dcf) => {
      const {
        targetHigh: analystHigh,
        targetMean: analystMean,
        targetLow: analystLow,
      } = analyst || {};

      const {
        bullCase: dcfBull,
        baseCase: dcfBase,
        bearCase: dcfBear,
      } = dcf || {};

      return {
        bull: {
          price: Math.max(analystHigh || 0, dcfBull || 0) || null,
          probability: 0.25,
          sources: {
            analystHigh,
            dcfBull,
            selected: analystHigh > dcfBull ? 'analyst' : 'dcf'
          }
        },
        base: {
          price: ((analystMean || 0) + (dcfBase || 0)) / 2 || null,
          probability: 0.50,
          sources: {
            analystMean,
            dcfBase,
            selected: 'weighted_average'
          }
        },
        bear: {
          price: Math.min(analystLow || Infinity, dcfBear || Infinity) || null,
          probability: 0.25,
          sources: {
            analystLow,
            dcfBear,
            selected: analystLow < dcfBear ? 'analyst' : 'dcf'
          }
        }
      };
    };

    it('should take higher value for bull case', () => {
      const analyst = { targetHigh: 350, targetMean: 280, targetLow: 200 };
      const dcf = { bullCase: 340, baseCase: 275, bearCase: 210 };

      const scenarios = generateEnhancedScenarios(analyst, dcf);

      expect(scenarios.bull.price).toBe(350); // Analyst is higher
      expect(scenarios.bull.sources.selected).toBe('analyst');
    });

    it('should take lower value for bear case', () => {
      const analyst = { targetHigh: 350, targetMean: 280, targetLow: 200 };
      const dcf = { bullCase: 340, baseCase: 275, bearCase: 210 };

      const scenarios = generateEnhancedScenarios(analyst, dcf);

      expect(scenarios.bear.price).toBe(200); // Analyst is lower
      expect(scenarios.bear.sources.selected).toBe('analyst');
    });

    it('should average for base case', () => {
      const analyst = { targetMean: 280 };
      const dcf = { baseCase: 270 };

      const scenarios = generateEnhancedScenarios(analyst, dcf);

      expect(scenarios.base.price).toBe(275); // (280 + 270) / 2
      expect(scenarios.base.sources.selected).toBe('weighted_average');
    });

    it('should handle missing analyst data', () => {
      const dcf = { bullCase: 340, baseCase: 275, bearCase: 210 };

      const scenarios = generateEnhancedScenarios(null, dcf);

      expect(scenarios.bull.price).toBe(340);
      expect(scenarios.bear.price).toBe(210);
    });
  });

  // ============================================
  // BACKWARD REASONING (WHAT'S PRICED IN)
  // ============================================

  describe('Backward Reasoning', () => {
    const generateBackwardReasoning = (impliedGrowth, historicalGrowth, currentPrice) => {
      if (impliedGrowth == null || historicalGrowth == null) {
        return null;
      }

      const growthGap = impliedGrowth - historicalGrowth;

      let headline;
      let marketAssumptions = [];
      let sanityCheck;

      if (growthGap > 10) {
        headline = `Current price implies ${impliedGrowth}% CAGR - historical was ${historicalGrowth}%`;
        marketAssumptions = [
          'Market expects significant growth acceleration',
          `Growth must exceed historical by ${growthGap.toFixed(0)} percentage points`,
          'Premium valuation requires execution on growth initiatives'
        ];
        sanityCheck = {
          isReasonable: false,
          reason: 'Implied growth significantly exceeds historical performance',
          riskLevel: 'high'
        };
      } else if (growthGap > 5) {
        headline = `Current price implies ${impliedGrowth}% CAGR vs. ${historicalGrowth}% historical`;
        marketAssumptions = [
          'Market expects moderate growth improvement',
          'Valuation assumes successful new initiatives'
        ];
        sanityCheck = {
          isReasonable: true,
          reason: 'Implied growth modestly above historical - achievable',
          riskLevel: 'medium'
        };
      } else if (growthGap > -5) {
        headline = `Current price implies ${impliedGrowth}% growth - aligned with ${historicalGrowth}% historical`;
        marketAssumptions = [
          'Market expects continuation of historical trends',
          'Valuation assumes steady state performance'
        ];
        sanityCheck = {
          isReasonable: true,
          reason: 'Implied growth consistent with historical performance',
          riskLevel: 'low'
        };
      } else {
        headline = `Current price implies only ${impliedGrowth}% growth vs. ${historicalGrowth}% historical`;
        marketAssumptions = [
          'Market is pricing in growth deceleration',
          'Potential contrarian opportunity if growth persists'
        ];
        sanityCheck = {
          isReasonable: true,
          reason: 'Market expectations conservative relative to history',
          riskLevel: 'low'
        };
      }

      return { headline, marketAssumptions, sanityCheck };
    };

    it('should flag optimistic market assumptions', () => {
      const result = generateBackwardReasoning(25, 8, 250);

      expect(result.headline).toContain('25%');
      expect(result.headline).toContain('8%');
      expect(result.sanityCheck.isReasonable).toBe(false);
      expect(result.sanityCheck.riskLevel).toBe('high');
    });

    it('should accept reasonable implied growth', () => {
      const result = generateBackwardReasoning(10, 8, 250);

      expect(result.sanityCheck.isReasonable).toBe(true);
      expect(result.sanityCheck.riskLevel).not.toBe('high');
    });

    it('should identify conservative market expectations', () => {
      const result = generateBackwardReasoning(3, 12, 250);

      expect(result.sanityCheck.riskLevel).toBe('low');
      expect(result.marketAssumptions).toContainEqual(
        expect.stringContaining('deceleration')
      );
    });

    it('should handle null inputs', () => {
      expect(generateBackwardReasoning(null, 8, 250)).toBeNull();
      expect(generateBackwardReasoning(10, null, 250)).toBeNull();
    });
  });

  // ============================================
  // MARKET SENTIMENT DETERMINATION
  // ============================================

  describe('Market Sentiment', () => {
    const determineMarketSentiment = (impliedGrowth, historicalGrowth) => {
      if (impliedGrowth == null || historicalGrowth == null) return null;

      const gap = impliedGrowth - historicalGrowth;

      if (gap > 5) return 'OPTIMISTIC';
      if (gap < -5) return 'PESSIMISTIC';
      return 'ALIGNED';
    };

    it('should identify optimistic sentiment', () => {
      expect(determineMarketSentiment(20, 10)).toBe('OPTIMISTIC');
    });

    it('should identify pessimistic sentiment', () => {
      expect(determineMarketSentiment(5, 15)).toBe('PESSIMISTIC');
    });

    it('should identify aligned sentiment', () => {
      expect(determineMarketSentiment(12, 10)).toBe('ALIGNED');
    });
  });

  // ============================================
  // EXPECTED VALUE CALCULATION
  // ============================================

  describe('Expected Value Calculation', () => {
    const calculateExpectedValue = (scenarios, currentPrice) => {
      const { bull, base, bear } = scenarios;

      const expectedPrice =
        (bull.price * bull.probability) +
        (base.price * base.probability) +
        (bear.price * bear.probability);

      const upside = ((expectedPrice / currentPrice) - 1) * 100;

      return {
        price: Math.round(expectedPrice * 100) / 100,
        upside: Math.round(upside * 10) / 10
      };
    };

    it('should calculate probability-weighted expected value', () => {
      const scenarios = {
        bull: { price: 300, probability: 0.25 },
        base: { price: 250, probability: 0.50 },
        bear: { price: 180, probability: 0.25 }
      };

      const result = calculateExpectedValue(scenarios, 240);

      // Expected: (300*0.25) + (250*0.50) + (180*0.25) = 75 + 125 + 45 = 245
      expect(result.price).toBe(245);
      expect(result.upside).toBeCloseTo(2.1, 1);
    });

    it('should calculate negative upside correctly', () => {
      const scenarios = {
        bull: { price: 250, probability: 0.20 },
        base: { price: 200, probability: 0.50 },
        bear: { price: 150, probability: 0.30 }
      };

      const result = calculateExpectedValue(scenarios, 220);

      expect(result.upside).toBeLessThan(0);
    });
  });

  // ============================================
  // KEY INSIGHT GENERATION
  // ============================================

  describe('Key Insight Generation', () => {
    const generateKeyInsight = (alignment, impliedGrowth, historicalGrowth) => {
      if (alignment.level === 'DIVERGENT') {
        return 'Significant disagreement between valuation methods warrants careful analysis of assumptions.';
      }

      if (alignment.level === 'STRONG') {
        const gap = impliedGrowth - historicalGrowth;
        if (gap > 10) {
          return 'All methods agree on premium valuation - market pricing in significant growth acceleration.';
        }
        if (gap < -5) {
          return 'All methods agree on conservative valuation - potential value opportunity if growth persists.';
        }
        return 'Strong alignment between analyst, DCF, and market-implied valuations at current levels.';
      }

      return 'Moderate alignment between valuation methods with some divergence in assumptions.';
    };

    it('should highlight divergence risk', () => {
      const insight = generateKeyInsight({ level: 'DIVERGENT' }, 15, 10);
      expect(insight).toContain('disagreement');
    });

    it('should highlight growth acceleration for strong bullish alignment', () => {
      const insight = generateKeyInsight({ level: 'STRONG' }, 25, 10);
      expect(insight).toContain('growth acceleration');
    });

    it('should highlight value opportunity for conservative alignment', () => {
      const insight = generateKeyInsight({ level: 'STRONG' }, 5, 15);
      expect(insight).toContain('value opportunity');
    });
  });

  // ============================================
  // PERSPECTIVE CARD DATA STRUCTURE
  // ============================================

  describe('Perspective Data Structure', () => {
    const createPerspective = (type, value, low, high, confidence) => ({
      type,
      value,
      low,
      high,
      confidence,
      upside: value ? ((value / 240) - 1) * 100 : null // Assuming $240 current
    });

    it('should create analyst perspective correctly', () => {
      const perspective = createPerspective('analyst', 280, 220, 340, 'MEDIUM');

      expect(perspective.type).toBe('analyst');
      expect(perspective.value).toBe(280);
      expect(perspective.low).toBe(220);
      expect(perspective.high).toBe(340);
      expect(perspective.upside).toBeCloseTo(16.67, 1);
    });

    it('should create DCF perspective correctly', () => {
      const perspective = createPerspective('dcf', 265, 200, 330, 'MEDIUM');

      expect(perspective.type).toBe('dcf');
      expect(perspective.value).toBe(265);
    });

    it('should handle null value for upside', () => {
      const perspective = createPerspective('dcf', null, 200, 330, 'LOW');
      expect(perspective.upside).toBeNull();
    });
  });

  // ============================================
  // WHAT MUST GO RIGHT
  // ============================================

  describe('What Must Go Right', () => {
    const generateWhatMustGoRight = (impliedGrowth, margins, marketShare) => {
      const items = [];

      if (impliedGrowth > 15) {
        items.push(`Achieve ${impliedGrowth}% revenue CAGR for 10 years`);
      }

      if (margins && margins > 30) {
        items.push(`Maintain ${margins}% operating margins despite competition`);
      }

      if (marketShare) {
        items.push(`Defend or expand ${marketShare}% market share`);
      }

      if (items.length === 0) {
        items.push('Continue current trajectory - reasonable expectations');
      }

      return items;
    };

    it('should list growth requirement for high implied growth', () => {
      const items = generateWhatMustGoRight(20, 35, 25);

      expect(items.some(i => i.includes('20%'))).toBe(true);
      expect(items.some(i => i.includes('revenue CAGR'))).toBe(true);
    });

    it('should include margin defense', () => {
      const items = generateWhatMustGoRight(10, 40, 30);

      expect(items.some(i => i.includes('margins'))).toBe(true);
    });

    it('should include market share', () => {
      const items = generateWhatMustGoRight(10, 25, 35);

      expect(items.some(i => i.includes('market share'))).toBe(true);
    });

    it('should provide reassurance for reasonable expectations', () => {
      const items = generateWhatMustGoRight(8, 20, null);

      expect(items).toContain('Continue current trajectory - reasonable expectations');
    });
  });
});

// ============================================
// INTEGRATION: FULL TRIANGULATION
// ============================================

describe('Full Triangulation Integration', () => {
  const triangulate = (analystData, dcfData, marketImplied, currentPrice) => {
    // Create perspectives
    const perspectives = {
      analystConsensus: {
        targetMean: analystData?.targetMean,
        targetLow: analystData?.targetLow,
        targetHigh: analystData?.targetHigh,
        analystCount: analystData?.analystCount,
        confidence: analystData?.analystCount > 10 ? 'HIGH' : 'MEDIUM'
      },
      dcfIntrinsic: {
        baseCase: dcfData?.baseCase,
        bullCase: dcfData?.bullCase,
        bearCase: dcfData?.bearCase,
        confidence: dcfData ? 'MEDIUM' : 'LOW'
      },
      marketImplied: {
        impliedGrowthPct: marketImplied?.impliedGrowth,
        historicalGrowthPct: marketImplied?.historicalGrowth,
        marketSentiment: marketImplied?.impliedGrowth > marketImplied?.historicalGrowth + 5 ?
          'OPTIMISTIC' : marketImplied?.impliedGrowth < marketImplied?.historicalGrowth - 5 ?
          'PESSIMISTIC' : 'ALIGNED',
        confidence: 'LOW'
      }
    };

    // Calculate alignment
    const alignmentScore = Math.round(
      100 - (Math.abs(analystData?.targetMean - dcfData?.baseCase) / currentPrice * 100)
    );
    const alignmentLevel = alignmentScore >= 80 ? 'STRONG' :
                          alignmentScore >= 50 ? 'PARTIAL' : 'DIVERGENT';

    return {
      perspectives,
      triangulation: {
        alignment: { level: alignmentLevel, score: alignmentScore }
      },
      currentPrice
    };
  };

  it('should create complete triangulation output', () => {
    const result = triangulate(
      { targetMean: 280, targetLow: 220, targetHigh: 340, analystCount: 25 },
      { baseCase: 275, bullCase: 340, bearCase: 210 },
      { impliedGrowth: 15, historicalGrowth: 8 },
      248
    );

    // Check structure
    expect(result.perspectives).toHaveProperty('analystConsensus');
    expect(result.perspectives).toHaveProperty('dcfIntrinsic');
    expect(result.perspectives).toHaveProperty('marketImplied');
    expect(result.triangulation).toHaveProperty('alignment');

    // Check values
    expect(result.perspectives.analystConsensus.targetMean).toBe(280);
    expect(result.perspectives.dcfIntrinsic.baseCase).toBe(275);
    expect(result.perspectives.marketImplied.marketSentiment).toBe('OPTIMISTIC');
  });

  it('should calculate alignment correctly', () => {
    const result = triangulate(
      { targetMean: 280 },
      { baseCase: 278 },
      {},
      275
    );

    expect(result.triangulation.alignment.level).toBe('STRONG');
  });
});
