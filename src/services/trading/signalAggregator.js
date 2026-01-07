/**
 * Signal Aggregator
 *
 * Normalizes and combines signals from multiple sources into a unified format
 * for Agent 2 (Trading Logic) to consume.
 *
 * Sources:
 * - Technical signals (RSI, MACD, SMAs, etc.)
 * - Sentiment signals (Reddit, StockTwits, News)
 * - Insider activity signals
 * - Analyst signals (price targets, ratings)
 * - Market regime context
 */

const { TechnicalSignals } = require('./technicalSignals');
const { RegimeDetector } = require('./regimeDetector');

// Signal source weights for overall score
const SOURCE_WEIGHTS = {
  technical: 0.30,
  sentiment: 0.25,
  insider: 0.25,
  analyst: 0.20,
};

class SignalAggregator {
  constructor(db) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this.technical = new TechnicalSignals(this.db);
    this.regime = new RegimeDetector(this.db);
  }

  /**
   * Aggregate all signals for a symbol
   * Returns unified signal object for Agent 2
   */
  async aggregateSignals(symbol) {
    // Fetch all signals in parallel
    const [technical, sentiment, insider, analyst, regime] = await Promise.all([
      this.technical.calculate(symbol),
      this.getSentimentSignal(symbol),
      this.getInsiderSignal(symbol),
      this.getAnalystSignal(symbol),
      this.regime.detectRegime(),
    ]);

    // Calculate summary metrics
    const signals = { technical, sentiment, insider, analyst };
    const summary = this.calculateSummary(signals);

    // Generate overall signal
    const overall = this.generateOverallSignal(signals, regime);

    const result = {
      symbol,
      timestamp: new Date().toISOString(),
      regime,
      signals: {
        technical: this.normalizeSignal(technical, 'technical'),
        sentiment: this.normalizeSignal(sentiment, 'sentiment'),
        insider: this.normalizeSignal(insider, 'insider'),
        analyst: this.normalizeSignal(analyst, 'analyst'),
      },
      summary,
      overall,
      context: this.generateContext(signals, regime, summary),
    };

    // Store aggregated signal
    await this.storeAggregatedSignal(symbol, result);

    return result;
  }

  /**
   * Get sentiment signal from sentiment_summary table
   */
  async getSentimentSignal(symbol) {
    try {
      const company = this.db.prepare(`
        SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);

      if (!company) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'sentiment' };
      }

      const result = this.db.prepare(`
        SELECT signal, weighted_sentiment, confidence, total_posts
        FROM sentiment_summary
        WHERE company_id = ?
        AND period = '7d'
        ORDER BY calculated_at DESC
        LIMIT 1
      `).get(company.id);

      if (!result) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'sentiment' };
      }

      return {
        score: result.weighted_sentiment || 0,
        confidence: result.confidence || 0,
        signal: result.signal || 'hold',
        totalPosts: result.total_posts,
        source: 'sentiment',
      };
    } catch (error) {
      console.error(`Error getting sentiment for ${symbol}:`, error.message);
      return { score: 0, confidence: 0, signal: 'hold', source: 'sentiment' };
    }
  }

  /**
   * Get insider signal from insider_activity_summary table
   */
  async getInsiderSignal(symbol) {
    try {
      const company = this.db.prepare(`
        SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);

      if (!company) {
        return { score: 0, confidence: 0, signal: 'neutral', source: 'insider' };
      }

      const result = this.db.prepare(`
        SELECT insider_signal, signal_strength, buy_value, sell_value, unique_buyers
        FROM insider_activity_summary
        WHERE company_id = ?
        AND period = '90d'
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(company.id);

      if (!result) {
        return { score: 0, confidence: 0, signal: 'neutral', source: 'insider' };
      }

      // Convert categorical signal to score
      const signalMap = {
        'bullish': 0.8,
        'slightly_bullish': 0.4,
        'neutral': 0,
        'slightly_bearish': -0.4,
        'bearish': -0.8,
      };

      return {
        score: signalMap[result.insider_signal] || 0,
        confidence: Math.min((result.signal_strength || 0) / 5, 1),
        signal: result.insider_signal || 'neutral',
        buyValue: result.buy_value,
        sellValue: result.sell_value,
        uniqueBuyers: result.unique_buyers,
        source: 'insider',
      };
    } catch (error) {
      console.error(`Error getting insider signal for ${symbol}:`, error.message);
      return { score: 0, confidence: 0, signal: 'neutral', source: 'insider' };
    }
  }

  /**
   * Get analyst signal from analyst_estimates table
   */
  async getAnalystSignal(symbol) {
    try {
      const company = this.db.prepare(`
        SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);

      if (!company) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'analyst' };
      }

      const result = this.db.prepare(`
        SELECT
          signal, signal_strength, signal_confidence,
          recommendation_mean, upside_potential,
          strong_buy, buy, hold, sell, strong_sell,
          number_of_analysts
        FROM analyst_estimates
        WHERE company_id = ?
        ORDER BY fetched_at DESC
        LIMIT 1
      `).get(company.id);

      if (!result) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'analyst' };
      }

      // Convert recommendation (1-5 scale where 1=strong buy, 5=strong sell) to -1 to +1
      // 1 -> +1, 3 -> 0, 5 -> -1
      const recScore = result.recommendation_mean
        ? (3 - result.recommendation_mean) / 2
        : 0;

      // Also consider upside potential
      const upsideScore = result.upside_potential
        ? Math.max(-1, Math.min(1, result.upside_potential / 50))
        : 0;

      // Blend recommendation and upside
      const score = recScore * 0.6 + upsideScore * 0.4;

      return {
        score: Math.round(score * 1000) / 1000,
        confidence: result.signal_confidence || 0.5,
        signal: result.signal || 'hold',
        signalStrength: result.signal_strength,
        recommendationMean: result.recommendation_mean,
        upsidePotential: result.upside_potential,
        distribution: {
          strongBuy: result.strong_buy,
          buy: result.buy,
          hold: result.hold,
          sell: result.sell,
          strongSell: result.strong_sell,
        },
        numberOfAnalysts: result.number_of_analysts,
        source: 'analyst',
      };
    } catch (error) {
      console.error(`Error getting analyst signal for ${symbol}:`, error.message);
      return { score: 0, confidence: 0, signal: 'hold', source: 'analyst' };
    }
  }

  /**
   * Normalize signal to consistent format
   */
  normalizeSignal(signal, source) {
    return {
      score: signal.score || 0,
      confidence: signal.confidence || 0,
      signal: signal.signal || 'hold',
      source,
      details: { ...signal },
    };
  }

  /**
   * Calculate summary metrics
   */
  calculateSummary(signals) {
    const scores = [
      signals.technical?.score || 0,
      signals.sentiment?.score || 0,
      signals.insider?.score || 0,
      signals.analyst?.score || 0,
    ];

    const confidences = [
      signals.technical?.confidence || 0,
      signals.sentiment?.confidence || 0,
      signals.insider?.confidence || 0,
      signals.analyst?.confidence || 0,
    ];

    const bullishCount = scores.filter(s => s > 0.2).length;
    const bearishCount = scores.filter(s => s < -0.2).length;
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highestConfidence = Math.max(...confidences);

    // Weighted score (by confidence)
    let weightedSum = 0;
    let weightTotal = 0;
    const sources = ['technical', 'sentiment', 'insider', 'analyst'];

    sources.forEach((source, i) => {
      const weight = SOURCE_WEIGHTS[source] * confidences[i];
      weightedSum += scores[i] * weight;
      weightTotal += weight;
    });

    const weightedScore = weightTotal > 0 ? weightedSum / weightTotal : avgScore;

    return {
      bullishCount,
      bearishCount,
      avgScore: Math.round(avgScore * 1000) / 1000,
      weightedScore: Math.round(weightedScore * 1000) / 1000,
      highestConfidence: Math.round(highestConfidence * 100) / 100,
      agreement: bullishCount >= 3 || bearishCount >= 3 ? 'strong' :
                 bullishCount >= 2 || bearishCount >= 2 ? 'moderate' : 'mixed',
    };
  }

  /**
   * Generate overall signal from all sources
   */
  generateOverallSignal(signals, regime) {
    const summary = this.calculateSummary(signals);

    // Adjust score based on regime
    let adjustedScore = summary.weightedScore;

    // In crisis/high-vol regimes, be more conservative
    if (regime.regime === 'CRISIS') {
      adjustedScore *= 0.5;
    } else if (regime.regime === 'HIGH_VOL') {
      adjustedScore *= 0.7;
    } else if (regime.regime === 'BEAR') {
      // In bear markets, bullish signals should be weaker
      if (adjustedScore > 0) {
        adjustedScore *= 0.8;
      }
    }

    // Convert to signal
    let signal, strength;
    if (adjustedScore >= 0.5) {
      signal = 'strong_buy'; strength = 5;
    } else if (adjustedScore >= 0.3) {
      signal = 'buy'; strength = 4;
    } else if (adjustedScore >= 0.1) {
      signal = 'lean_buy'; strength = 3;
    } else if (adjustedScore <= -0.5) {
      signal = 'strong_sell'; strength = 5;
    } else if (adjustedScore <= -0.3) {
      signal = 'sell'; strength = 4;
    } else if (adjustedScore <= -0.1) {
      signal = 'lean_sell'; strength = 3;
    } else {
      signal = 'hold'; strength = 2;
    }

    // Calculate overall confidence
    const avgConfidence = (
      (signals.technical?.confidence || 0) +
      (signals.sentiment?.confidence || 0) +
      (signals.insider?.confidence || 0) +
      (signals.analyst?.confidence || 0)
    ) / 4;

    // Boost confidence if signals agree
    let confidence = avgConfidence;
    if (summary.agreement === 'strong') {
      confidence = Math.min(1, confidence * 1.2);
    } else if (summary.agreement === 'mixed') {
      confidence *= 0.8;
    }

    return {
      signal,
      strength,
      score: Math.round(adjustedScore * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      regimeAdjusted: regime.regime !== 'BULL' && regime.regime !== 'SIDEWAYS',
    };
  }

  /**
   * Generate context object for Agent 2
   */
  generateContext(signals, regime, summary) {
    const context = {
      marketCondition: regime.regime,
      marketVolatility: regime.vix > 25 ? 'high' : regime.vix > 18 ? 'moderate' : 'low',
      signalAgreement: summary.agreement,

      // Specific warnings/notes
      notes: [],
    };

    // Add relevant notes
    if (regime.regime === 'CRISIS') {
      context.notes.push('CRISIS regime: Minimize new positions, prioritize capital preservation');
    } else if (regime.regime === 'HIGH_VOL') {
      context.notes.push('HIGH_VOL regime: Reduce position sizes, widen stops');
    }

    if (summary.agreement === 'mixed') {
      context.notes.push('Mixed signals: Wait for clearer confirmation');
    }

    // Technical-specific notes
    if (signals.technical?.indicators?.rsi?.value < 30) {
      context.notes.push('RSI oversold: Potential bounce opportunity');
    } else if (signals.technical?.indicators?.rsi?.value > 70) {
      context.notes.push('RSI overbought: Consider taking profits');
    }

    // Insider-specific notes
    if (signals.insider?.uniqueBuyers >= 3) {
      context.notes.push('Cluster buying: Multiple insiders buying recently');
    }

    // Analyst-specific notes
    if (signals.analyst?.upsidePotential > 30) {
      context.notes.push(`High analyst upside: ${signals.analyst.upsidePotential.toFixed(1)}% to target`);
    } else if (signals.analyst?.upsidePotential < -10) {
      context.notes.push(`Negative analyst outlook: Stock above price targets`);
    }

    return context;
  }

  /**
   * Store aggregated signal in database
   */
  async storeAggregatedSignal(symbol, result) {
    try {
      const company = this.db.prepare(`
        SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);

      if (!company) return;

      this.db.prepare(`
        INSERT OR REPLACE INTO aggregated_signals (
          company_id, symbol, calculated_at,
          market_regime, regime_confidence,
          technical_score, technical_confidence, technical_signal,
          sentiment_score, sentiment_confidence, sentiment_signal,
          insider_score, insider_confidence, insider_signal,
          analyst_score, analyst_confidence, analyst_signal,
          avg_score, weighted_score, bullish_count, bearish_count, highest_confidence,
          overall_signal, overall_strength, overall_confidence,
          context
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        company.id,
        symbol,
        result.timestamp,
        result.regime.regime,
        result.regime.confidence,
        result.signals.technical.score,
        result.signals.technical.confidence,
        result.signals.technical.signal,
        result.signals.sentiment.score,
        result.signals.sentiment.confidence,
        result.signals.sentiment.signal,
        result.signals.insider.score,
        result.signals.insider.confidence,
        result.signals.insider.signal,
        result.signals.analyst.score,
        result.signals.analyst.confidence,
        result.signals.analyst.signal,
        result.summary.avgScore,
        result.summary.weightedScore,
        result.summary.bullishCount,
        result.summary.bearishCount,
        result.summary.highestConfidence,
        result.overall.signal,
        result.overall.strength,
        result.overall.confidence,
        JSON.stringify(result.context)
      );
    } catch (error) {
      console.error(`Error storing aggregated signal for ${symbol}:`, error.message);
    }
  }

  /**
   * Batch aggregate for multiple symbols
   */
  async aggregateBatch(symbols) {
    const results = [];
    for (const symbol of symbols) {
      try {
        const result = await this.aggregateSignals(symbol);
        results.push(result);
      } catch (error) {
        console.error(`Error aggregating signals for ${symbol}:`, error.message);
        results.push({
          symbol,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return results;
  }

  /**
   * Get top bullish signals
   */
  getTopBullishSignals(limit = 20) {
    try {
      return this.db.prepare(`
        SELECT
          ags.*,
          c.name as company_name,
          c.sector,
          c.industry
        FROM aggregated_signals ags
        JOIN companies c ON ags.company_id = c.id
        WHERE ags.overall_signal IN ('strong_buy', 'buy', 'lean_buy')
          AND date(ags.calculated_at) = date('now')
        ORDER BY ags.weighted_score DESC
        LIMIT ?
      `).all(limit);
    } catch (error) {
      console.error('Error getting top bullish signals:', error.message);
      return [];
    }
  }

  /**
   * Get stored signal for a symbol
   */
  getStoredSignal(symbol) {
    try {
      return this.db.prepare(`
        SELECT * FROM aggregated_signals
        WHERE symbol = ? COLLATE NOCASE
        ORDER BY calculated_at DESC
        LIMIT 1
      `).get(symbol);
    } catch (error) {
      console.error(`Error fetching stored signal for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = { SignalAggregator, SOURCE_WEIGHTS };
