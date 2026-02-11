/**
 * Combined Sentiment Aggregator
 *
 * Aggregates sentiment signals from multiple sources:
 * - Reddit (social sentiment)
 * - StockTwits (social sentiment with user tags)
 * - News (Google News, Yahoo Finance RSS)
 * - Market Indicators (Fear & Greed, VIX)
 *
 * Produces a combined sentiment score with weighted signals.
 */

const { sentiment: logger } = require('../utils/logger');
const { getDatabaseAsync } = require('../lib/db');

// Weighting configuration for each source
const SOURCE_WEIGHTS = {
  reddit: 0.20, // Social media - less reliable but high volume
  stocktwits: 0.20, // Social with user-tagged sentiment
  news: 0.25, // Professional news sources
  market: 0.15, // Market indicators (Fear & Greed, VIX)
  analyst: 0.20, // Professional analyst recommendations
};

// Confidence thresholds
const CONFIDENCE_THRESHOLDS = {
  high: 0.7,
  medium: 0.5,
  low: 0.3,
};

class SentimentAggregator {
  constructor(services = {}) {
    // No database parameter needed - using getDatabaseAsync()
    this.redditFetcher = services.reddit || null;
    this.stocktwitsFetcher = services.stocktwits || null;
    this.newsFetcher = services.news || null;
    this.fearGreedFetcher = services.fearGreed || null;
    this.analystFetcher = services.analyst || null;
  }

  /**
   * Set service instances (for lazy initialization)
   */
  setServices(services) {
    if (services.reddit) this.redditFetcher = services.reddit;
    if (services.stocktwits) this.stocktwitsFetcher = services.stocktwits;
    if (services.news) this.newsFetcher = services.news;
    if (services.fearGreed) this.fearGreedFetcher = services.fearGreed;
    if (services.analyst) this.analystFetcher = services.analyst;
  }

  /**
   * Fetch and aggregate all sentiment sources for a symbol
   */
  async aggregateSentiment(symbol, companyId, options = {}) {
    const { skipCache = false, maxAge = 60 * 60 * 1000, region = 'US' } = options; // 1 hour default cache

    logger.info('Aggregating sentiment', { symbol, region });

    // Check cache first
    if (!skipCache) {
      const cached = await this.getCachedSentiment(companyId, maxAge);
      if (cached) {
        logger.debug('Using cached sentiment', { symbol });
        return cached;
      }
    }

    // Fetch from all sources in parallel with region
    const results = await this.fetchAllSources(symbol, companyId, { region });

    // Calculate combined sentiment
    const combined = this.calculateCombinedSentiment(results);

    // Store in database with region
    await this.storeCombinedSentiment(companyId, combined, results, region);

    return {
      symbol,
      companyId,
      combined,
      sources: results,
      region,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Fetch sentiment from all available sources
   */
  async fetchAllSources(symbol, companyId, options = {}) {
    const { region = 'US' } = options;

    const results = {
      reddit: null,
      stocktwits: null,
      news: null,
      market: null,
      analyst: null,
    };

    const promises = [];

    // Reddit sentiment (with region support)
    if (this.redditFetcher) {
      promises.push(
        this.fetchRedditSentiment(symbol, companyId, { region })
          .then((data) => {
            results.reddit = data;
          })
          .catch((e) => {
            console.error('Reddit sentiment error:', e.message);
            results.reddit = { error: e.message };
          })
      );
    }

    // StockTwits sentiment (US only - skip for EU companies)
    if (this.stocktwitsFetcher && region === 'US') {
      promises.push(
        this.stocktwitsFetcher
          .fetchSymbolSentiment(symbol, companyId)
          .then((data) => {
            results.stocktwits = data?.sentiment || null;
          })
          .catch((e) => {
            console.error('StockTwits sentiment error:', e.message);
            results.stocktwits = { error: e.message };
          })
      );
    }

    // News sentiment (with region support)
    if (this.newsFetcher) {
      promises.push(
        this.newsFetcher
          .fetchAllNews(symbol, companyId, { region })
          .then((data) => {
            results.news = data?.sentiment || null;
          })
          .catch((e) => {
            console.error('News sentiment error:', e.message);
            results.news = { error: e.message };
          })
      );
    }

    // Market indicators
    if (this.fearGreedFetcher) {
      promises.push(
        this.fearGreedFetcher
          .fetchAllIndicators()
          .then((data) => {
            results.market = data?.overall || null;
          })
          .catch((e) => {
            console.error('Market sentiment error:', e.message);
            results.market = { error: e.message };
          })
      );
    }

    // Analyst sentiment
    if (this.analystFetcher) {
      promises.push(
        this.fetchAnalystSentiment(symbol)
          .then((data) => {
            results.analyst = data;
          })
          .catch((e) => {
            console.error('Analyst sentiment error:', e.message);
            results.analyst = { error: e.message };
          })
      );
    }

    await Promise.all(promises);

    return results;
  }

  /**
   * Fetch and normalize analyst sentiment data
   */
  async fetchAnalystSentiment(symbol) {
    const data = await this.analystFetcher.fetchAnalystData(symbol);
    if (!data || !data.priceTargets) return null;

    const { priceTargets, recommendations, signal } = data;

    // Convert recommendationMean (1-5 scale) to sentiment (-1 to 1)
    // 1 = Strong Buy → 1.0, 3 = Hold → 0, 5 = Strong Sell → -1.0
    let sentiment = 0;
    if (priceTargets.recommendationMean) {
      sentiment = (3 - priceTargets.recommendationMean) / 2; // Inverts and scales to -1 to 1
    }

    // Determine signal based on recommendation key
    let analystSignal = 'hold';
    if (priceTargets.recommendationKey) {
      analystSignal = priceTargets.recommendationKey;
    }

    // Calculate confidence based on number of analysts
    let confidence = 0.5;
    const numAnalysts = priceTargets.numberOfAnalysts || 0;
    if (numAnalysts >= 20) confidence = 0.9;
    else if (numAnalysts >= 10) confidence = 0.75;
    else if (numAnalysts >= 5) confidence = 0.6;
    else if (numAnalysts >= 1) confidence = 0.4;

    return {
      sentiment: Math.round(sentiment * 1000) / 1000,
      confidence,
      signal: analystSignal,
      stats: {
        numAnalysts,
        targetMean: priceTargets.targetMean,
        upsidePotential: priceTargets.upsidePotential,
        buyPercent: recommendations?.buyPercent,
        holdPercent: recommendations?.holdPercent,
        sellPercent: recommendations?.sellPercent,
      },
    };
  }

  /**
   * Fetch Reddit sentiment (from existing data or fresh)
   */
  async fetchRedditSentiment(symbol, companyId, options = {}) {
    const { region = 'US' } = options;

    // If we have a reddit fetcher and need fresh data for EU, fetch it
    if (this.redditFetcher && (region === 'EU' || region === 'UK')) {
      try {
        await this.redditFetcher.fetchTickerSentiment(symbol, companyId, { region });
      } catch (e) {
        console.warn(`Failed to fetch fresh Reddit data for ${symbol}:`, e.message);
      }
    }

    // Try to get from database first (recent posts)
    const database = await getDatabaseAsync();
    const result = await database.query(
      `SELECT
        COUNT(*) as total_posts,
        AVG(rp.sentiment_score) as avg_sentiment,
        SUM(CASE WHEN rp.sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN rp.sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN rp.sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(rp.upvotes) as total_upvotes
       FROM reddit_posts rp
       JOIN reddit_ticker_mentions rtm ON rp.id = rtm.post_id
       WHERE rtm.company_id = $1
         AND rp.created_at >= datetime('now', '-7 days')`,
      [companyId]
    );
    const recent = result.rows?.[0];

    if (!recent || recent.total_posts === 0) {
      return null;
    }

    // Calculate sentiment metrics
    const total = recent.positive + recent.negative + recent.neutral;
    const sentiment = recent.avg_sentiment || 0;

    let signal;
    if (sentiment >= 0.3) signal = 'strong_buy';
    else if (sentiment >= 0.15) signal = 'buy';
    else if (sentiment >= 0.05) signal = 'lean_buy';
    else if (sentiment <= -0.3) signal = 'strong_sell';
    else if (sentiment <= -0.15) signal = 'sell';
    else if (sentiment <= -0.05) signal = 'lean_sell';
    else signal = 'hold';

    // Confidence based on post count
    let confidence;
    if (recent.total_posts >= 20) confidence = 0.85;
    else if (recent.total_posts >= 10) confidence = 0.7;
    else if (recent.total_posts >= 5) confidence = 0.5;
    else confidence = 0.3;

    return {
      sentiment: Math.round(sentiment * 1000) / 1000,
      confidence,
      signal,
      totalPosts: recent.total_posts,
      positiveCount: recent.positive,
      negativeCount: recent.negative,
      neutralCount: recent.neutral,
      totalUpvotes: recent.total_upvotes,
      bullishRatio: total > 0 ? Math.round((recent.positive / total) * 100) : null,
    };
  }

  /**
   * Calculate combined sentiment from all sources
   */
  calculateCombinedSentiment(sources) {
    const scores = [];
    const weights = [];
    const contributions = {};

    // Process each source
    for (const [source, data] of Object.entries(sources)) {
      if (!data || data.error) continue;

      const weight = SOURCE_WEIGHTS[source] || 0.1;
      let score = null;
      let confidence = 0.5;

      // Extract sentiment score from each source format
      if (source === 'reddit' && data.sentiment !== undefined) {
        score = data.sentiment;
        confidence = data.confidence || 0.5;
      } else if (source === 'stocktwits' && data.sentiment !== undefined) {
        score = data.sentiment;
        confidence = data.confidence || 0.5;
      } else if (source === 'news' && data.sentiment !== undefined) {
        score = data.sentiment;
        confidence = data.confidence || 0.5;
      } else if (source === 'market' && data.sentiment !== undefined) {
        score = data.sentiment;
        confidence = data.confidence || 0.5;
      } else if (source === 'analyst' && data.sentiment !== undefined) {
        score = data.sentiment;
        confidence = data.confidence || 0.5;
      }

      if (score !== null && !isNaN(score)) {
        // Weight by confidence
        const effectiveWeight = weight * confidence;
        scores.push(score);
        weights.push(effectiveWeight);

        contributions[source] = {
          score: Math.round(score * 1000) / 1000,
          weight: Math.round(effectiveWeight * 1000) / 1000,
          confidence: Math.round(confidence * 100) / 100,
          signal: data.signal || this.getSignalFromScore(score),
        };
      }
    }

    // No valid sources
    if (scores.length === 0) {
      return {
        sentiment: 0,
        confidence: 0,
        signal: 'unknown',
        sourcesUsed: 0,
        contributions: {},
      };
    }

    // Calculate weighted average
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0);
    const combinedSentiment = weightedSum / totalWeight;

    // Calculate combined confidence
    const avgConfidence =
      Object.values(contributions).reduce((sum, c) => sum + c.confidence, 0) / scores.length;
    const sourceCountBonus = Math.min(scores.length / 4, 0.15); // Bonus for multiple sources
    const combinedConfidence = Math.min(avgConfidence + sourceCountBonus, 1);

    // Determine signal
    const signal = this.getSignalFromScore(combinedSentiment);

    // Agreement analysis
    const signals = Object.values(contributions).map((c) => c.signal);
    const agreementScore = this.calculateAgreement(signals);

    return {
      sentiment: Math.round(combinedSentiment * 1000) / 1000,
      confidence: Math.round(combinedConfidence * 100) / 100,
      signal,
      sourcesUsed: scores.length,
      contributions,
      agreement: agreementScore,
    };
  }

  /**
   * Get trading signal from sentiment score
   */
  getSignalFromScore(score) {
    if (score >= 0.4) return 'strong_buy';
    if (score >= 0.2) return 'buy';
    if (score >= 0.05) return 'lean_buy';
    if (score <= -0.4) return 'strong_sell';
    if (score <= -0.2) return 'sell';
    if (score <= -0.05) return 'lean_sell';
    return 'hold';
  }

  /**
   * Calculate agreement between sources
   */
  calculateAgreement(signals) {
    if (signals.length < 2) return { score: 1, label: 'single_source' };

    // Map signals to direction
    const directions = signals.map((s) => {
      if (s.includes('buy')) return 1;
      if (s.includes('sell')) return -1;
      return 0;
    });

    // Count direction agreement
    const bullish = directions.filter((d) => d === 1).length;
    const bearish = directions.filter((d) => d === -1).length;
    const neutral = directions.filter((d) => d === 0).length;

    const maxAgreement = Math.max(bullish, bearish, neutral);
    const agreementRatio = maxAgreement / signals.length;

    let label;
    if (agreementRatio >= 0.8) label = 'strong_agreement';
    else if (agreementRatio >= 0.6) label = 'moderate_agreement';
    else if (agreementRatio >= 0.4) label = 'mixed_signals';
    else label = 'conflicting';

    return {
      score: Math.round(agreementRatio * 100) / 100,
      label,
      distribution: { bullish, bearish, neutral },
    };
  }

  /**
   * Store combined sentiment in database
   * @param {number} companyId - Company ID
   * @param {object} combined - Combined sentiment data
   * @param {object} sources - Source-specific sentiment data
   * @param {string} region - Region code (US, EU, UK)
   */
  async storeCombinedSentiment(companyId, combined, sources, region = 'US') {
    try {
      const database = await getDatabaseAsync();

      await database.query(`
        INSERT INTO combined_sentiment (
          company_id, combined_score, combined_signal, confidence,
          reddit_sentiment, reddit_signal, reddit_confidence,
          stocktwits_sentiment, stocktwits_signal, stocktwits_confidence,
          news_sentiment, news_signal, news_confidence,
          market_sentiment, market_signal, market_confidence,
          sources_used, agreement_score, region, calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
      `, [
        companyId,
        combined.sentiment,
        combined.signal,
        combined.confidence,
        sources.reddit?.sentiment || null,
        sources.reddit?.signal || null,
        sources.reddit?.confidence || null,
        sources.stocktwits?.sentiment || null,
        sources.stocktwits?.signal || null,
        sources.stocktwits?.confidence || null,
        sources.news?.sentiment || null,
        sources.news?.signal || null,
        sources.news?.confidence || null,
        sources.market?.sentiment || null,
        sources.market?.label || null,
        sources.market?.confidence || null,
        combined.sourcesUsed,
        combined.agreement?.score || null,
        region
      ]);

      // Update company's combined sentiment
      await database.query(`
        UPDATE companies SET
          combined_sentiment = $1,
          sentiment_signal = $2,
          sentiment_confidence = $3,
          sentiment_updated_at = NOW()
        WHERE id = $4
      `, [combined.sentiment, combined.signal, combined.confidence, companyId]);
    } catch (error) {
      console.error('Error storing combined sentiment:', error.message);
    }
  }

  /**
   * Get cached sentiment from database
   */
  async getCachedSentiment(companyId, maxAge) {
    const database = await getDatabaseAsync();
    const cutoff = new Date(Date.now() - maxAge).toISOString();

    const result = await database.query(`
      SELECT * FROM combined_sentiment
      WHERE company_id = $1
        AND calculated_at >= $2
      ORDER BY calculated_at DESC
      LIMIT 1
    `, [companyId, cutoff]);

    const row = result.rows[0];
    if (!row) return null;

    return {
      companyId,
      combined: {
        sentiment: row.combined_score,
        signal: row.combined_signal,
        confidence: row.confidence,
        sourcesUsed: row.sources_used,
        agreement: { score: row.agreement_score },
      },
      sources: {
        reddit: row.reddit_sentiment
          ? {
              sentiment: row.reddit_sentiment,
              signal: row.reddit_signal,
              confidence: row.reddit_confidence,
            }
          : null,
        stocktwits: row.stocktwits_sentiment
          ? {
              sentiment: row.stocktwits_sentiment,
              signal: row.stocktwits_signal,
              confidence: row.stocktwits_confidence,
            }
          : null,
        news: row.news_sentiment
          ? {
              sentiment: row.news_sentiment,
              signal: row.news_signal,
              confidence: row.news_confidence,
            }
          : null,
        market: row.market_sentiment
          ? {
              sentiment: row.market_sentiment,
              label: row.market_signal,
              confidence: row.market_confidence,
            }
          : null,
      },
      timestamp: row.calculated_at,
      cached: true,
    };
  }

  /**
   * Get sentiment history for a company
   */
  async getSentimentHistory(companyId, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const database = await getDatabaseAsync();
    const result = await database.query(
      `SELECT
        DATE(calculated_at) as date,
        AVG(combined_score) as avg_sentiment,
        AVG(confidence) as avg_confidence,
        GROUP_CONCAT(DISTINCT combined_signal) as signals,
        COUNT(*) as data_points
       FROM combined_sentiment
       WHERE company_id = $1
         AND calculated_at >= $2
       GROUP BY DATE(calculated_at)
       ORDER BY date DESC`,
      [companyId, cutoff.toISOString()]
    );
    return result.rows || [];
  }

  /**
   * Get top sentiment movers
   */
  async getTopMovers(limit = 10) {
    const database = await getDatabaseAsync();
    const result = await database.query(
      `SELECT
        c.symbol,
        c.name,
        cs.combined_score,
        cs.combined_signal,
        cs.confidence,
        cs.sources_used,
        cs.calculated_at,
        (
          SELECT combined_score FROM combined_sentiment cs2
          WHERE cs2.company_id = c.id
            AND cs2.calculated_at < cs.calculated_at
          ORDER BY cs2.calculated_at DESC
          LIMIT 1
        ) as previous_score
       FROM companies c
       JOIN combined_sentiment cs ON c.id = cs.company_id
       WHERE cs.calculated_at >= datetime('now', '-24 hours')
       GROUP BY c.id
       HAVING cs.calculated_at = MAX(cs.calculated_at)
       ORDER BY ABS(cs.combined_score - COALESCE(previous_score, 0)) DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows || [];
  }

}

module.exports = SentimentAggregator;
