/**
 * Analyst Estimates Fetcher
 *
 * Uses Yahoo Finance API (via yahoo-finance2) to fetch:
 * - Price targets (high, low, mean, median)
 * - Analyst recommendations (strong buy, buy, hold, sell, strong sell)
 * - Earnings estimates and actuals (beat/miss analysis)
 * - Revenue estimates
 *
 * FREE API - No authentication required!
 */

const YahooFinance = require('yahoo-finance2').default;
const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');

class AnalystEstimatesFetcher {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    this.cache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes cache
    this.lastRequest = 0;
    this.minDelay = 500; // 500ms between requests to be respectful
  }

  /**
   * Rate-limited request wrapper
   */
  async rateLimitedRequest(fn) {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await new Promise(r => setTimeout(r, this.minDelay - elapsed));
    }
    this.lastRequest = Date.now();
    return fn();
  }

  /**
   * Fetch all analyst data for a symbol
   */
  async fetchAnalystData(symbol) {
    // Check cache first
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const result = await this.rateLimitedRequest(() =>
        this.yahooFinance.quoteSummary(symbol, {
          modules: ['financialData', 'recommendationTrend', 'earningsTrend', 'earnings']
        })
      );

      const data = this.parseAnalystData(symbol, result);

      // Cache the result
      this.cache.set(symbol, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      console.error(`Error fetching analyst data for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Parse the raw Yahoo Finance response into a clean structure
   */
  parseAnalystData(symbol, result) {
    const financialData = result.financialData || {};
    const recommendationTrend = result.recommendationTrend?.trend || [];
    const earningsTrend = result.earningsTrend?.trend || [];
    const earningsChart = result.earnings?.earningsChart || {};

    // Price targets
    const priceTargets = {
      current: financialData.currentPrice,
      targetHigh: financialData.targetHighPrice,
      targetLow: financialData.targetLowPrice,
      targetMean: financialData.targetMeanPrice,
      targetMedian: financialData.targetMedianPrice,
      numberOfAnalysts: financialData.numberOfAnalystOpinions,
      recommendationKey: financialData.recommendationKey, // 'strong_buy', 'buy', etc.
      recommendationMean: financialData.recommendationMean, // 1.0 = Strong Buy, 5.0 = Strong Sell
    };

    // Calculate upside/downside potential
    if (priceTargets.current && priceTargets.targetMean) {
      priceTargets.upsidePotential = ((priceTargets.targetMean - priceTargets.current) / priceTargets.current) * 100;
    }

    // Recommendation distribution (current month)
    const currentRecs = recommendationTrend.find(t => t.period === '0m') || {};
    const recommendations = {
      strongBuy: currentRecs.strongBuy || 0,
      buy: currentRecs.buy || 0,
      hold: currentRecs.hold || 0,
      sell: currentRecs.sell || 0,
      strongSell: currentRecs.strongSell || 0,
      total: (currentRecs.strongBuy || 0) + (currentRecs.buy || 0) +
             (currentRecs.hold || 0) + (currentRecs.sell || 0) + (currentRecs.strongSell || 0),
    };

    // Calculate recommendation percentages
    if (recommendations.total > 0) {
      recommendations.buyPercent = ((recommendations.strongBuy + recommendations.buy) / recommendations.total) * 100;
      recommendations.holdPercent = (recommendations.hold / recommendations.total) * 100;
      recommendations.sellPercent = ((recommendations.sell + recommendations.strongSell) / recommendations.total) * 100;
    }

    // Recommendation trend over time
    const recommendationHistory = recommendationTrend.map(t => ({
      period: t.period,
      strongBuy: t.strongBuy,
      buy: t.buy,
      hold: t.hold,
      sell: t.sell,
      strongSell: t.strongSell,
    }));

    // Earnings estimates
    const earningsEstimates = earningsTrend.map(t => ({
      period: t.period,
      endDate: t.endDate,
      earningsEstimate: {
        avg: t.earningsEstimate?.avg,
        low: t.earningsEstimate?.low,
        high: t.earningsEstimate?.high,
        numberOfAnalysts: t.earningsEstimate?.numberOfAnalysts,
        growth: t.earningsEstimate?.growth,
      },
      revenueEstimate: {
        avg: t.revenueEstimate?.avg,
        low: t.revenueEstimate?.low,
        high: t.revenueEstimate?.high,
        numberOfAnalysts: t.revenueEstimate?.numberOfAnalysts,
        growth: t.revenueEstimate?.growth,
      },
    }));

    // Earnings history (actuals vs estimates)
    const earningsHistory = (earningsChart.quarterly || []).map(q => {
      const surprise = q.actual && q.estimate
        ? ((q.actual - q.estimate) / Math.abs(q.estimate)) * 100
        : null;
      return {
        quarter: q.date,
        actual: q.actual,
        estimate: q.estimate,
        surprise: surprise,
        beat: q.actual > q.estimate,
      };
    });

    // Calculate earnings beat rate
    const beatsCount = earningsHistory.filter(e => e.beat).length;
    const earningsBeatRate = earningsHistory.length > 0
      ? (beatsCount / earningsHistory.length) * 100
      : null;

    // Generate analyst signal based on data
    const signal = this.generateAnalystSignal(priceTargets, recommendations, earningsHistory);

    return {
      symbol,
      fetchedAt: new Date().toISOString(),
      priceTargets,
      recommendations,
      recommendationHistory,
      earningsEstimates,
      earningsHistory,
      earningsBeatRate,
      signal,
    };
  }

  /**
   * Generate a buy/sell signal based on analyst data
   */
  generateAnalystSignal(priceTargets, recommendations, earningsHistory) {
    let score = 0;
    let confidence = 0;
    const factors = [];

    // Factor 1: Recommendation consensus (weight: 40%)
    if (recommendations.total >= 5) {
      const recScore = (recommendations.buyPercent || 0) - (recommendations.sellPercent || 0);
      score += recScore * 0.4;
      confidence += 0.3;
      factors.push({
        name: 'Analyst Consensus',
        value: `${Math.round(recommendations.buyPercent || 0)}% Buy`,
        impact: recScore > 0 ? 'positive' : recScore < 0 ? 'negative' : 'neutral',
      });
    }

    // Factor 2: Price target upside (weight: 35%)
    if (priceTargets.upsidePotential !== undefined) {
      const upside = priceTargets.upsidePotential;
      // Scale: +20% upside = +35 points, -20% = -35 points
      const upsideScore = Math.min(Math.max(upside / 20, -1), 1) * 35;
      score += upsideScore;
      confidence += 0.35;
      factors.push({
        name: 'Price Target',
        value: `${upside > 0 ? '+' : ''}${upside.toFixed(1)}% upside`,
        impact: upside > 10 ? 'positive' : upside < -10 ? 'negative' : 'neutral',
      });
    }

    // Factor 3: Earnings track record (weight: 25%)
    if (earningsHistory.length >= 2) {
      const recentBeats = earningsHistory.slice(0, 4).filter(e => e.beat).length;
      const beatScore = ((recentBeats / Math.min(earningsHistory.length, 4)) - 0.5) * 50;
      score += beatScore;
      confidence += 0.25;
      factors.push({
        name: 'Earnings Track Record',
        value: `${recentBeats}/${Math.min(earningsHistory.length, 4)} beats`,
        impact: recentBeats >= 3 ? 'positive' : recentBeats <= 1 ? 'negative' : 'neutral',
      });
    }

    // Determine signal
    let signal, strength;
    if (score >= 40) {
      signal = 'strong_buy';
      strength = 5;
    } else if (score >= 20) {
      signal = 'buy';
      strength = 4;
    } else if (score >= 5) {
      signal = 'lean_buy';
      strength = 3;
    } else if (score <= -40) {
      signal = 'strong_sell';
      strength = 5;
    } else if (score <= -20) {
      signal = 'sell';
      strength = 4;
    } else if (score <= -5) {
      signal = 'lean_sell';
      strength = 3;
    } else {
      signal = 'hold';
      strength = 2;
    }

    return {
      signal,
      strength,
      confidence: Math.round(confidence * 100) / 100,
      score: Math.round(score),
      factors,
    };
  }

  /**
   * Store analyst data in database
   */
  async storeAnalystData(companyId, data) {
    if (!data) return;

    const database = await getDatabaseAsync();
    const params = [
      companyId,
      data.fetchedAt,
      data.priceTargets.current,
      data.priceTargets.targetHigh,
      data.priceTargets.targetLow,
      data.priceTargets.targetMean,
      data.priceTargets.targetMedian,
      data.priceTargets.numberOfAnalysts,
      data.priceTargets.recommendationKey,
      data.priceTargets.recommendationMean,
      data.priceTargets.upsidePotential,
      data.recommendations.strongBuy,
      data.recommendations.buy,
      data.recommendations.hold,
      data.recommendations.sell,
      data.recommendations.strongSell,
      data.recommendations.buyPercent,
      data.recommendations.holdPercent,
      data.recommendations.sellPercent,
      data.earningsBeatRate,
      data.signal.signal,
      data.signal.strength,
      data.signal.confidence,
      data.signal.score,
      JSON.stringify(data)
    ];

    try {
      if (isUsingPostgres()) {
        await database.query(`
          INSERT INTO analyst_estimates (
            company_id, fetched_at,
            current_price, target_high, target_low, target_mean, target_median,
            number_of_analysts, recommendation_key, recommendation_mean,
            upside_potential,
            strong_buy, buy, hold, sell, strong_sell,
            buy_percent, hold_percent, sell_percent,
            earnings_beat_rate,
            signal, signal_strength, signal_confidence, signal_score,
            raw_data
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25
          )
          ON CONFLICT (company_id) DO UPDATE SET
            fetched_at = EXCLUDED.fetched_at,
            current_price = EXCLUDED.current_price,
            target_high = EXCLUDED.target_high,
            target_low = EXCLUDED.target_low,
            target_mean = EXCLUDED.target_mean,
            target_median = EXCLUDED.target_median,
            number_of_analysts = EXCLUDED.number_of_analysts,
            recommendation_key = EXCLUDED.recommendation_key,
            recommendation_mean = EXCLUDED.recommendation_mean,
            upside_potential = EXCLUDED.upside_potential,
            strong_buy = EXCLUDED.strong_buy,
            buy = EXCLUDED.buy,
            hold = EXCLUDED.hold,
            sell = EXCLUDED.sell,
            strong_sell = EXCLUDED.strong_sell,
            buy_percent = EXCLUDED.buy_percent,
            hold_percent = EXCLUDED.hold_percent,
            sell_percent = EXCLUDED.sell_percent,
            earnings_beat_rate = EXCLUDED.earnings_beat_rate,
            signal = EXCLUDED.signal,
            signal_strength = EXCLUDED.signal_strength,
            signal_confidence = EXCLUDED.signal_confidence,
            signal_score = EXCLUDED.signal_score,
            raw_data = EXCLUDED.raw_data
        `, params);
      } else {
        await database.query(`
          INSERT OR REPLACE INTO analyst_estimates (
            company_id, fetched_at,
            current_price, target_high, target_low, target_mean, target_median,
            number_of_analysts, recommendation_key, recommendation_mean,
            upside_potential,
            strong_buy, buy, hold, sell, strong_sell,
            buy_percent, hold_percent, sell_percent,
            earnings_beat_rate,
            signal, signal_strength, signal_confidence, signal_score,
            raw_data
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25
          )
        `, params);
      }
    } catch (error) {
      console.error(`Error storing analyst data for company ${companyId}:`, error.message);
    }
  }

  /**
   * Get stored analyst data for a company
   */
  async getStoredAnalystData(companyId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM analyst_estimates
      WHERE company_id = $1
      ORDER BY fetched_at DESC
      LIMIT 1
    `, [companyId]);
    return result.rows[0];
  }

  /**
   * Fetch and store analyst data for a symbol
   */
  async fetchAndStore(symbol, companyId) {
    console.log(`Fetching analyst estimates for ${symbol}...`);
    const data = await this.fetchAnalystData(symbol);

    if (data) {
      await this.storeAnalystData(companyId, data);
      console.log(`  ✓ Stored analyst data for ${symbol}`);
    }

    return data;
  }

  /**
   * Get analyst data, fetching fresh if stale
   */
  async getAnalystData(symbol, companyId, maxAgeMinutes = 60) {
    // Check stored data first
    const stored = await this.getStoredAnalystData(companyId);

    if (stored) {
      const age = (Date.now() - new Date(stored.fetched_at).getTime()) / (1000 * 60);
      if (age < maxAgeMinutes) {
        // Return stored data, parsing the raw_data JSON
        try {
          return JSON.parse(stored.raw_data);
        } catch {
          // If raw_data is corrupted, fall through to fetch fresh
        }
      }
    }

    // Fetch fresh data
    return this.fetchAndStore(symbol, companyId);
  }
}

module.exports = AnalystEstimatesFetcher;
