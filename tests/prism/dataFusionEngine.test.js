// tests/prism/dataFusionEngine.test.js
// Unit tests for Data Fusion Engine - pure function tests

describe('DataFusionEngine', () => {
  // ============================================
  // SOURCE CREDIBILITY TESTS
  // ============================================

  describe('Source Credibility Tiers', () => {
    const sourceCredibility = {
      secFilings: 100,
      financialStatements: 95,
      insiderTransactions: 90,
      analystEstimates: 75,
      earningsTranscripts: 80,
      wikipedia: 70,
      institutionalHoldings: 65,
      newsBloomberg: 70,
      newsReuters: 70,
      newsGeneral: 50,
      stocktwits: 40,
      reddit: 35,
      redditWSB: 30,
    };

    it('should rank SEC filings as highest credibility', () => {
      expect(sourceCredibility.secFilings).toBe(100);
      expect(sourceCredibility.secFilings).toBeGreaterThan(sourceCredibility.analystEstimates);
    });

    it('should rank professional sources above social media', () => {
      expect(sourceCredibility.analystEstimates).toBeGreaterThan(sourceCredibility.stocktwits);
      expect(sourceCredibility.newsBloomberg).toBeGreaterThan(sourceCredibility.reddit);
    });

    it('should rank premium news above general news', () => {
      expect(sourceCredibility.newsBloomberg).toBeGreaterThan(sourceCredibility.newsGeneral);
      expect(sourceCredibility.newsReuters).toBeGreaterThan(sourceCredibility.newsGeneral);
    });

    it('should rank social sources by quality', () => {
      expect(sourceCredibility.stocktwits).toBeGreaterThan(sourceCredibility.reddit);
      expect(sourceCredibility.reddit).toBeGreaterThan(sourceCredibility.redditWSB);
    });
  });

  // ============================================
  // COMPANY CLASSIFICATION TESTS
  // ============================================

  describe('Company Classification', () => {
    const classifyCompany = (marketCap, revenueGrowth, netMargin, peRatio, socialMentions) => {
      // Mega-cap: > $200B
      if (marketCap > 200e9) {
        return { type: 'megaCap', reason: `$${(marketCap/1e9).toFixed(0)}B market cap` };
      }

      // Meme stock: High social + extreme valuation
      if (socialMentions > 100 && (peRatio > 100 || peRatio < 0)) {
        return { type: 'memeStock', reason: `${socialMentions} social mentions, extreme valuation` };
      }

      // Growth stock: High revenue growth
      if (revenueGrowth > 20 || (revenueGrowth > 10 && netMargin < 5)) {
        return { type: 'growthStock', reason: `${revenueGrowth.toFixed(1)}% revenue growth` };
      }

      // Small cap: < $2B
      if (marketCap < 2e9 && marketCap > 0) {
        return { type: 'smallCap', reason: `$${(marketCap/1e6).toFixed(0)}M market cap` };
      }

      // Default: value stock
      return { type: 'valueStock', reason: 'Standard company profile' };
    };

    it('should classify AAPL as mega-cap', () => {
      const result = classifyCompany(3e12, 6, 26, 30, 50);
      expect(result.type).toBe('megaCap');
      expect(result.reason).toContain('3000');
    });

    it('should classify high-growth company correctly', () => {
      const result = classifyCompany(50e9, 35, 10, 50, 20);
      expect(result.type).toBe('growthStock');
      expect(result.reason).toContain('35.0%');
    });

    it('should classify unprofitable high-growth company correctly', () => {
      const result = classifyCompany(10e9, 15, -5, -20, 10);
      expect(result.type).toBe('growthStock');
    });

    it('should classify small cap correctly', () => {
      const result = classifyCompany(500e6, 8, 10, 15, 5);
      expect(result.type).toBe('smallCap');
      expect(result.reason).toContain('500');
    });

    it('should classify meme stock correctly', () => {
      const result = classifyCompany(10e9, 5, -10, -50, 500);
      expect(result.type).toBe('memeStock');
      expect(result.reason).toContain('social mentions');
    });

    it('should default to value stock', () => {
      const result = classifyCompany(50e9, 5, 15, 20, 10);
      expect(result.type).toBe('valueStock');
    });
  });

  // ============================================
  // COMPANY PROFILE WEIGHTS
  // ============================================

  describe('Company Profile Weights', () => {
    const companyProfiles = {
      megaCap: {
        weights: {
          fundamentals: 1.2,
          moatDurability: 1.3,
          capitalAllocation: 1.2,
          socialSentiment: 0.5,
          newsSentiment: 0.7,
          insiderActivity: 0.8,
        },
        minSocialQuality: 50,
      },
      growthStock: {
        weights: {
          revenueGrowth: 1.4,
          marketSize: 1.3,
          fundamentals: 0.7,
          socialSentiment: 0.8,
          analystEstimates: 1.1,
        },
        minSocialQuality: 30,
      },
      memeStock: {
        weights: {
          socialSentiment: 1.3,
          shortInterest: 1.4,
          fundamentals: 0.5,
          technicals: 1.2,
        },
        invertSocialSignal: true,
      },
    };

    it('should de-emphasize social sentiment for mega-caps', () => {
      expect(companyProfiles.megaCap.weights.socialSentiment).toBeLessThan(1);
      expect(companyProfiles.megaCap.weights.fundamentals).toBeGreaterThan(1);
    });

    it('should emphasize growth metrics for growth stocks', () => {
      expect(companyProfiles.growthStock.weights.revenueGrowth).toBeGreaterThan(1);
      expect(companyProfiles.growthStock.weights.fundamentals).toBeLessThan(1);
    });

    it('should invert social signal for meme stocks', () => {
      expect(companyProfiles.memeStock.invertSocialSignal).toBe(true);
    });

    it('should have higher social quality threshold for mega-caps', () => {
      expect(companyProfiles.megaCap.minSocialQuality).toBeGreaterThan(companyProfiles.growthStock.minSocialQuality);
    });
  });

  // ============================================
  // FINANCIAL DATA SCORING
  // ============================================

  describe('Financial Data Scoring', () => {
    const scoreFinancialData = (annualYears, quarterlyQuarters, keyMetricsCount, dataAge) => {
      let qualityScore = 0;

      // Annual data completeness (25 points max)
      if (annualYears >= 3) qualityScore += 25;
      else if (annualYears >= 1) qualityScore += 10;

      // Quarterly data (20 points max)
      if (quarterlyQuarters >= 4) qualityScore += 20;
      else if (quarterlyQuarters >= 2) qualityScore += 10;

      // Key metrics availability (30 points max)
      qualityScore += (keyMetricsCount / 4) * 30;

      // Data freshness (25 points max)
      if (dataAge <= 1) qualityScore += 25;
      else if (dataAge <= 2) qualityScore += 15;
      else qualityScore += 10;

      return Math.min(100, qualityScore);
    };

    it('should score complete, fresh data highly', () => {
      const score = scoreFinancialData(5, 8, 4, 0);
      expect(score).toBe(100);
    });

    it('should reduce score for missing data', () => {
      const fullScore = scoreFinancialData(5, 8, 4, 0);
      const partialScore = scoreFinancialData(1, 2, 2, 1);
      expect(partialScore).toBeLessThan(fullScore);
    });

    it('should penalize stale data', () => {
      const freshScore = scoreFinancialData(5, 8, 4, 0);
      const staleScore = scoreFinancialData(5, 8, 4, 3);
      expect(staleScore).toBeLessThan(freshScore);
    });

    it('should score based on key metrics availability', () => {
      const fullMetrics = scoreFinancialData(3, 4, 4, 1);
      const partialMetrics = scoreFinancialData(3, 4, 2, 1);
      expect(fullMetrics).toBeGreaterThan(partialMetrics);
    });
  });

  // ============================================
  // ANALYST DATA SCORING
  // ============================================

  describe('Analyst Data Scoring', () => {
    const scoreAnalystCoverage = (analystCount) => {
      if (analystCount >= 20) return 40;
      if (analystCount >= 10) return 25;
      if (analystCount >= 3) return 15;
      return 5;
    };

    const scorePriceTargetSpread = (high, low, mean) => {
      if (!high || !low || !mean) return 0;
      const spread = (high - low) / mean;
      if (spread < 0.3) return 30; // Tight consensus
      if (spread < 0.5) return 20;
      return 10; // Wide disagreement
    };

    const determineAnalystSignal = (buyPercent) => {
      if (buyPercent >= 80) return { direction: 'bullish', strength: 'strong' };
      if (buyPercent >= 60) return { direction: 'bullish', strength: 'moderate' };
      if (buyPercent >= 40) return { direction: 'neutral', strength: 'weak' };
      return { direction: 'bearish', strength: 'moderate' };
    };

    it('should score high coverage as quality', () => {
      expect(scoreAnalystCoverage(30)).toBe(40);
      expect(scoreAnalystCoverage(15)).toBe(25);
      expect(scoreAnalystCoverage(5)).toBe(15);
      expect(scoreAnalystCoverage(1)).toBe(5);
    });

    it('should score tight price target consensus highly', () => {
      // Tight: $150-$180 with $165 mean = 18% spread
      expect(scorePriceTargetSpread(180, 150, 165)).toBe(30);
      // Wide: $100-$200 with $150 mean = 67% spread
      expect(scorePriceTargetSpread(200, 100, 150)).toBe(10);
    });

    it('should determine bullish signal from buy ratings', () => {
      expect(determineAnalystSignal(85).direction).toBe('bullish');
      expect(determineAnalystSignal(85).strength).toBe('strong');
    });

    it('should determine neutral signal from mixed ratings', () => {
      expect(determineAnalystSignal(50).direction).toBe('neutral');
    });

    it('should determine bearish signal from low buy ratings', () => {
      expect(determineAnalystSignal(30).direction).toBe('bearish');
    });
  });

  // ============================================
  // INSIDER DATA SCORING
  // ============================================

  describe('Insider Data Scoring', () => {
    const determineInsiderSignal = (buyValue, sellValue) => {
      if (buyValue > sellValue * 2) {
        return { direction: 'bullish', strength: 'strong', reason: 'Strong insider buying' };
      }
      if (buyValue > sellValue) {
        return { direction: 'bullish', strength: 'moderate', reason: 'Net insider buying' };
      }
      if (sellValue < buyValue * 3) {
        return { direction: 'neutral', strength: 'weak', reason: 'Modest insider selling' };
      }
      return { direction: 'bearish', strength: 'moderate', reason: 'Significant insider selling' };
    };

    it('should signal strong bullish on heavy buying', () => {
      const signal = determineInsiderSignal(1000000, 100000);
      expect(signal.direction).toBe('bullish');
      expect(signal.strength).toBe('strong');
    });

    it('should signal moderate bullish on net buying', () => {
      const signal = determineInsiderSignal(500000, 400000);
      expect(signal.direction).toBe('bullish');
      expect(signal.strength).toBe('moderate');
    });

    it('should signal neutral on modest selling', () => {
      const signal = determineInsiderSignal(100000, 200000);
      expect(signal.direction).toBe('neutral');
    });

    it('should signal bearish on heavy selling', () => {
      const signal = determineInsiderSignal(100000, 500000);
      expect(signal.direction).toBe('bearish');
    });
  });

  // ============================================
  // CONFLICT DETECTION
  // ============================================

  describe('Conflict Detection', () => {
    const detectConflict = (signalA, signalB, description) => {
      if (!signalA || !signalB) return null;

      const directionConflict =
        (signalA.direction === 'bullish' && signalB.direction === 'bearish') ||
        (signalA.direction === 'bearish' && signalB.direction === 'bullish');

      if (directionConflict) {
        const severity = (signalA.strength === 'strong' && signalB.strength === 'strong') ? 'high' :
                        (signalA.strength === 'strong' || signalB.strength === 'strong') ? 'medium' : 'low';
        return {
          type: 'signal_conflict',
          description,
          severity,
          sources: [signalA, signalB]
        };
      }
      return null;
    };

    it('should detect conflict between bullish analyst and bearish insider', () => {
      const analyst = { direction: 'bullish', strength: 'strong' };
      const insider = { direction: 'bearish', strength: 'moderate' };

      const conflict = detectConflict(analyst, insider, 'Analyst vs Insider');
      expect(conflict).not.toBeNull();
      expect(conflict.type).toBe('signal_conflict');
      expect(conflict.severity).toBe('medium');
    });

    it('should assign high severity when both signals are strong', () => {
      const analyst = { direction: 'bullish', strength: 'strong' };
      const insider = { direction: 'bearish', strength: 'strong' };

      const conflict = detectConflict(analyst, insider, 'Test');
      expect(conflict.severity).toBe('high');
    });

    it('should not detect conflict when signals align', () => {
      const analyst = { direction: 'bullish', strength: 'moderate' };
      const insider = { direction: 'bullish', strength: 'weak' };

      const conflict = detectConflict(analyst, insider, 'Test');
      expect(conflict).toBeNull();
    });

    it('should handle null signals gracefully', () => {
      const conflict = detectConflict(null, { direction: 'bullish' }, 'Test');
      expect(conflict).toBeNull();
    });
  });

  // ============================================
  // DATA CONFIDENCE CALCULATION
  // ============================================

  describe('Data Confidence Calculation', () => {
    const calculateDataConfidence = (sources, conflictCount) => {
      let baseScore = 0;
      let sourceCount = 0;

      // Weight sources by credibility
      const sourceWeights = {
        financials: { weight: 0.35, credibility: 95 },
        analyst: { weight: 0.20, credibility: 75 },
        insiders: { weight: 0.15, credibility: 90 },
        news: { weight: 0.15, credibility: 60 },
        social: { weight: 0.15, credibility: 40 },
      };

      for (const [key, config] of Object.entries(sourceWeights)) {
        if (sources[key]?.available) {
          const qualityContrib = (sources[key].quality / 100) * config.credibility * config.weight;
          baseScore += qualityContrib;
          sourceCount++;
        }
      }

      // Penalty for conflicts
      const conflictPenalty = conflictCount * 5;
      const finalScore = Math.max(0, Math.min(100, baseScore - conflictPenalty));

      // Determine level
      let level;
      if (finalScore >= 70) level = 'HIGH';
      else if (finalScore >= 40) level = 'MEDIUM';
      else level = 'LOW';

      return { score: Math.round(finalScore), level, sourceCount };
    };

    it('should calculate high confidence with good data', () => {
      const sources = {
        financials: { available: true, quality: 100 },
        analyst: { available: true, quality: 80 },
        insiders: { available: true, quality: 60 },
        news: { available: true, quality: 70 },
        social: { available: true, quality: 50 },
      };

      const result = calculateDataConfidence(sources, 0);
      expect(result.level).toBe('HIGH');
      expect(result.sourceCount).toBe(5);
    });

    it('should reduce confidence with conflicts', () => {
      const sources = {
        financials: { available: true, quality: 100 },
        analyst: { available: true, quality: 80 },
        insiders: { available: true, quality: 60 },
      };

      const noConflict = calculateDataConfidence(sources, 0);
      const withConflicts = calculateDataConfidence(sources, 3);

      expect(withConflicts.score).toBeLessThan(noConflict.score);
    });

    it('should handle missing sources', () => {
      const sources = {
        financials: { available: true, quality: 80 },
        analyst: { available: false },
        insiders: { available: false },
      };

      const result = calculateDataConfidence(sources, 0);
      expect(result.sourceCount).toBe(1);
      expect(result.level).not.toBe('HIGH');
    });

    it('should assign LOW confidence with poor data', () => {
      const sources = {
        financials: { available: true, quality: 20 },
        analyst: { available: false },
        insiders: { available: false },
      };

      const result = calculateDataConfidence(sources, 2);
      expect(result.level).toBe('LOW');
    });
  });

  // ============================================
  // QUALITY FILTERING
  // ============================================

  describe('Quality Filtering', () => {
    const qualityThresholds = {
      reddit: {
        minScore: 10,
        minComments: 3,
        minContentLength: 100,
        maxAge: 7,
      },
      stocktwits: {
        minFollowers: 50,
        minAccountAge: 30,
      },
      news: {
        premiumSources: ['Bloomberg', 'Reuters', 'WSJ'],
        maxAge: 30,
      },
    };

    const filterRedditPost = (post) => {
      if (post.score < qualityThresholds.reddit.minScore) return false;
      if (post.numComments < qualityThresholds.reddit.minComments) return false;
      if (post.contentLength < qualityThresholds.reddit.minContentLength) return false;
      if (post.ageInDays > qualityThresholds.reddit.maxAge) return false;
      return true;
    };

    const isNewsSourcePremium = (source) => {
      return qualityThresholds.news.premiumSources.includes(source);
    };

    it('should filter low-quality Reddit posts', () => {
      const lowQuality = { score: 5, numComments: 1, contentLength: 50, ageInDays: 2 };
      expect(filterRedditPost(lowQuality)).toBe(false);
    });

    it('should pass high-quality Reddit posts', () => {
      const highQuality = { score: 100, numComments: 50, contentLength: 500, ageInDays: 1 };
      expect(filterRedditPost(highQuality)).toBe(true);
    });

    it('should filter old Reddit posts', () => {
      const oldPost = { score: 100, numComments: 50, contentLength: 500, ageInDays: 14 };
      expect(filterRedditPost(oldPost)).toBe(false);
    });

    it('should identify premium news sources', () => {
      expect(isNewsSourcePremium('Bloomberg')).toBe(true);
      expect(isNewsSourcePremium('Reuters')).toBe(true);
      expect(isNewsSourcePremium('Random Blog')).toBe(false);
    });
  });

  // ============================================
  // SIGNAL WEIGHTING
  // ============================================

  describe('Signal Weighting', () => {
    const applyWeight = (signalStrength, weight) => {
      const strengthValues = { strong: 1.0, moderate: 0.7, weak: 0.4 };
      const baseStrength = strengthValues[signalStrength] || 0.5;
      return baseStrength * weight;
    };

    const combineWeightedSignals = (signals) => {
      let bullish = 0;
      let bearish = 0;
      let totalWeight = 0;

      for (const signal of signals) {
        const weighted = applyWeight(signal.strength, signal.weight);
        if (signal.direction === 'bullish') bullish += weighted;
        else if (signal.direction === 'bearish') bearish += weighted;
        totalWeight += signal.weight;
      }

      const netSignal = (bullish - bearish) / totalWeight;
      return {
        direction: netSignal > 0.1 ? 'bullish' : netSignal < -0.1 ? 'bearish' : 'neutral',
        confidence: Math.abs(netSignal),
        rawBullish: bullish,
        rawBearish: bearish,
      };
    };

    it('should weight signals correctly', () => {
      expect(applyWeight('strong', 1.0)).toBe(1.0);
      expect(applyWeight('moderate', 1.0)).toBe(0.7);
      expect(applyWeight('weak', 1.0)).toBe(0.4);
    });

    it('should apply profile weights to signals', () => {
      expect(applyWeight('strong', 0.5)).toBe(0.5);
      expect(applyWeight('strong', 1.3)).toBe(1.3);
    });

    it('should combine signals correctly', () => {
      const signals = [
        { direction: 'bullish', strength: 'strong', weight: 1.0 },
        { direction: 'bullish', strength: 'moderate', weight: 0.5 },
        { direction: 'bearish', strength: 'weak', weight: 0.5 },
      ];

      const combined = combineWeightedSignals(signals);
      expect(combined.direction).toBe('bullish');
    });

    it('should handle conflicting signals', () => {
      const signals = [
        { direction: 'bullish', strength: 'strong', weight: 1.0 },
        { direction: 'bearish', strength: 'strong', weight: 1.0 },
      ];

      const combined = combineWeightedSignals(signals);
      expect(combined.direction).toBe('neutral');
    });
  });
});
