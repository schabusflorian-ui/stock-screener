/**
 * Signal Aggregator
 *
 * Normalizes and combines signals from multiple sources into a unified format
 * for Agent 2 (Trading Logic) to consume.
 * Works with both SQLite and PostgreSQL.
 */

const { TechnicalSignals } = require('./technicalSignals');
const { RegimeDetector } = require('./regimeDetector');
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

const SOURCE_WEIGHTS = {
  technical: 0.30,
  sentiment: 0.25,
  insider: 0.25,
  analyst: 0.20,
};

class SignalAggregator {
  constructor(_db) {
    this.technical = new TechnicalSignals();
    this.regime = new RegimeDetector();
  }

  async aggregateSignals(symbol) {
    const [technical, sentiment, insider, analyst, regime] = await Promise.all([
      this.technical.calculate(symbol),
      this.getSentimentSignal(symbol),
      this.getInsiderSignal(symbol),
      this.getAnalystSignal(symbol),
      this.regime.detectRegime(),
    ]);

    const signals = { technical, sentiment, insider, analyst };
    const summary = this.calculateSummary(signals);
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

    await this.storeAggregatedSignal(symbol, result);
    return result;
  }

  async getSentimentSignal(symbol) {
    try {
      const db = await getDatabaseAsync();
      const companyResult = await db.query(
        `SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [symbol]
      );
      const company = companyResult.rows[0];
      if (!company) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'sentiment' };
      }

      const result = await db.query(
        `SELECT signal, weighted_sentiment, confidence, total_posts FROM sentiment_summary
         WHERE company_id = $1 AND period = '7d' ORDER BY calculated_at DESC LIMIT 1`,
        [company.id]
      );
      const row = result.rows[0];
      if (!row) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'sentiment' };
      }

      return {
        score: parseFloat(row.weighted_sentiment) || 0,
        confidence: parseFloat(row.confidence) || 0,
        signal: row.signal || 'hold',
        totalPosts: row.total_posts,
        source: 'sentiment',
      };
    } catch (error) {
      console.error(`Error getting sentiment for ${symbol}:`, error.message);
      return { score: 0, confidence: 0, signal: 'hold', source: 'sentiment' };
    }
  }

  async getInsiderSignal(symbol) {
    try {
      const db = await getDatabaseAsync();
      const companyResult = await db.query(
        `SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [symbol]
      );
      const company = companyResult.rows[0];
      if (!company) {
        return { score: 0, confidence: 0, signal: 'neutral', source: 'insider' };
      }

      const result = await db.query(
        `SELECT insider_signal, signal_strength, buy_value, sell_value, unique_buyers
         FROM insider_activity_summary WHERE company_id = $1 AND period = '90d'
         ORDER BY updated_at DESC LIMIT 1`,
        [company.id]
      );
      const row = result.rows[0];
      if (!row) {
        return { score: 0, confidence: 0, signal: 'neutral', source: 'insider' };
      }

      const signalMap = {
        bullish: 0.8, slightly_bullish: 0.4, neutral: 0,
        slightly_bearish: -0.4, bearish: -0.8,
      };

      return {
        score: signalMap[row.insider_signal] || 0,
        confidence: Math.min((parseFloat(row.signal_strength) || 0) / 5, 1),
        signal: row.insider_signal || 'neutral',
        buyValue: row.buy_value,
        sellValue: row.sell_value,
        uniqueBuyers: row.unique_buyers,
        source: 'insider',
      };
    } catch (error) {
      console.error(`Error getting insider signal for ${symbol}:`, error.message);
      return { score: 0, confidence: 0, signal: 'neutral', source: 'insider' };
    }
  }

  async getAnalystSignal(symbol) {
    try {
      const db = await getDatabaseAsync();
      const companyResult = await db.query(
        `SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [symbol]
      );
      const company = companyResult.rows[0];
      if (!company) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'analyst' };
      }

      const result = await db.query(
        `SELECT signal, signal_strength, signal_confidence, recommendation_mean, upside_potential,
         strong_buy, buy, hold, sell, strong_sell, number_of_analysts
         FROM analyst_estimates WHERE company_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
        [company.id]
      );
      const row = result.rows[0];
      if (!row) {
        return { score: 0, confidence: 0, signal: 'hold', source: 'analyst' };
      }

      const recScore = row.recommendation_mean != null ? (3 - row.recommendation_mean) / 2 : 0;
      const upsideScore = row.upside_potential != null
        ? Math.max(-1, Math.min(1, row.upside_potential / 50))
        : 0;
      const score = recScore * 0.6 + upsideScore * 0.4;

      return {
        score: Math.round(score * 1000) / 1000,
        confidence: parseFloat(row.signal_confidence) || 0.5,
        signal: row.signal || 'hold',
        signalStrength: row.signal_strength,
        recommendationMean: row.recommendation_mean,
        upsidePotential: row.upside_potential,
        distribution: {
          strongBuy: row.strong_buy,
          buy: row.buy,
          hold: row.hold,
          sell: row.sell,
          strongSell: row.strong_sell,
        },
        numberOfAnalysts: row.number_of_analysts,
        source: 'analyst',
      };
    } catch (error) {
      console.error(`Error getting analyst signal for ${symbol}:`, error.message);
      return { score: 0, confidence: 0, signal: 'hold', source: 'analyst' };
    }
  }

  normalizeSignal(signal, source) {
    return {
      score: signal?.score || 0,
      confidence: signal?.confidence || 0,
      signal: signal?.signal || 'hold',
      source,
      details: { ...signal },
    };
  }

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

    let weightedSum = 0, weightTotal = 0;
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

  generateOverallSignal(signals, regime) {
    const summary = this.calculateSummary(signals);
    let adjustedScore = summary.weightedScore;
    if (regime?.regime === 'CRISIS') adjustedScore *= 0.5;
    else if (regime?.regime === 'HIGH_VOL') adjustedScore *= 0.7;
    else if (regime?.regime === 'BEAR' && adjustedScore > 0) adjustedScore *= 0.8;

    let signal, strength;
    if (adjustedScore >= 0.5) { signal = 'strong_buy'; strength = 5; }
    else if (adjustedScore >= 0.3) { signal = 'buy'; strength = 4; }
    else if (adjustedScore >= 0.1) { signal = 'lean_buy'; strength = 3; }
    else if (adjustedScore <= -0.5) { signal = 'strong_sell'; strength = 5; }
    else if (adjustedScore <= -0.3) { signal = 'sell'; strength = 4; }
    else if (adjustedScore <= -0.1) { signal = 'lean_sell'; strength = 3; }
    else { signal = 'hold'; strength = 2; }

    const avgConfidence = (
      (signals.technical?.confidence || 0) +
      (signals.sentiment?.confidence || 0) +
      (signals.insider?.confidence || 0) +
      (signals.analyst?.confidence || 0)
    ) / 4;
    let confidence = avgConfidence;
    if (summary.agreement === 'strong') confidence = Math.min(1, confidence * 1.2);
    else if (summary.agreement === 'mixed') confidence *= 0.8;

    return {
      signal,
      strength,
      score: Math.round(adjustedScore * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      regimeAdjusted: regime?.regime && regime.regime !== 'BULL' && regime.regime !== 'SIDEWAYS',
    };
  }

  generateContext(signals, regime, summary) {
    const context = {
      marketCondition: regime?.regime || 'UNKNOWN',
      marketVolatility: regime?.vix > 25 ? 'high' : regime?.vix > 18 ? 'moderate' : 'low',
      signalAgreement: summary.agreement,
      notes: [],
    };
    if (regime?.regime === 'CRISIS') context.notes.push('CRISIS regime: Minimize new positions');
    else if (regime?.regime === 'HIGH_VOL') context.notes.push('HIGH_VOL regime: Reduce position sizes');
    if (summary.agreement === 'mixed') context.notes.push('Mixed signals: Wait for clearer confirmation');
    if (signals.technical?.indicators?.rsi?.value < 30) context.notes.push('RSI oversold: Potential bounce');
    else if (signals.technical?.indicators?.rsi?.value > 70) context.notes.push('RSI overbought: Consider taking profits');
    if (signals.insider?.uniqueBuyers >= 3) context.notes.push('Cluster buying: Multiple insiders buying');
    if (signals.analyst?.upsidePotential > 30) context.notes.push(`High analyst upside: ${signals.analyst.upsidePotential?.toFixed(1)}%`);
    else if (signals.analyst?.upsidePotential < -10) context.notes.push('Negative analyst outlook');
    return context;
  }

  async storeAggregatedSignal(symbol, result) {
    try {
      const db = await getDatabaseAsync();
      const companyResult = await db.query(
        `SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [symbol]
      );
      const company = companyResult.rows[0];
      if (!company) return;

      const values = [
        company.id, symbol, result.timestamp, result.regime?.regime, result.regime?.confidence,
        result.signals.technical.score, result.signals.technical.confidence, result.signals.technical.signal,
        result.signals.sentiment.score, result.signals.sentiment.confidence, result.signals.sentiment.signal,
        result.signals.insider.score, result.signals.insider.confidence, result.signals.insider.signal,
        result.signals.analyst.score, result.signals.analyst.confidence, result.signals.analyst.signal,
        result.summary.avgScore, result.summary.weightedScore, result.summary.bullishCount, result.summary.bearishCount, result.summary.highestConfidence,
        result.overall.signal, result.overall.strength, result.overall.confidence, JSON.stringify(result.context)
      ];

      const insertSql = `INSERT INTO aggregated_signals (
        company_id, symbol, calculated_at, market_regime, regime_confidence,
        technical_score, technical_confidence, technical_signal,
        sentiment_score, sentiment_confidence, sentiment_signal,
        insider_score, insider_confidence, insider_signal,
        analyst_score, analyst_confidence, analyst_signal,
        avg_score, weighted_score, bullish_count, bearish_count, highest_confidence,
        overall_signal, overall_strength, overall_confidence, context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`;

      if (isUsingPostgres()) {
        const upsertSql = `${insertSql}
          ON CONFLICT (company_id, calculated_at) DO UPDATE SET
            market_regime = EXCLUDED.market_regime, regime_confidence = EXCLUDED.regime_confidence,
            technical_score = EXCLUDED.technical_score, technical_confidence = EXCLUDED.technical_confidence, technical_signal = EXCLUDED.technical_signal,
            sentiment_score = EXCLUDED.sentiment_score, sentiment_confidence = EXCLUDED.sentiment_confidence, sentiment_signal = EXCLUDED.sentiment_signal,
            insider_score = EXCLUDED.insider_score, insider_confidence = EXCLUDED.insider_confidence, insider_signal = EXCLUDED.insider_signal,
            analyst_score = EXCLUDED.analyst_score, analyst_confidence = EXCLUDED.analyst_confidence, analyst_signal = EXCLUDED.analyst_signal,
            avg_score = EXCLUDED.avg_score, weighted_score = EXCLUDED.weighted_score, bullish_count = EXCLUDED.bullish_count, bearish_count = EXCLUDED.bearish_count, highest_confidence = EXCLUDED.highest_confidence,
            overall_signal = EXCLUDED.overall_signal, overall_strength = EXCLUDED.overall_strength, overall_confidence = EXCLUDED.overall_confidence, context = EXCLUDED.context`;
        try {
          await db.query(upsertSql, values);
        } catch (e) {
          if (e.code === '42P10' || e.message?.includes('ON CONFLICT')) {
            await db.query(insertSql, values).catch(() => {});
          } else throw e;
        }
      } else {
        await db.query(
          `INSERT OR REPLACE INTO aggregated_signals (
            company_id, symbol, calculated_at, market_regime, regime_confidence,
            technical_score, technical_confidence, technical_signal,
            sentiment_score, sentiment_confidence, sentiment_signal,
            insider_score, insider_confidence, insider_signal,
            analyst_score, analyst_confidence, analyst_signal,
            avg_score, weighted_score, bullish_count, bearish_count, highest_confidence,
            overall_signal, overall_strength, overall_confidence, context
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
          values
        );
      }
    } catch (error) {
      console.error(`Error storing aggregated signal for ${symbol}:`, error.message);
    }
  }

  async aggregateBatch(symbols) {
    const results = [];
    for (const symbol of symbols) {
      try {
        results.push(await this.aggregateSignals(symbol));
      } catch (error) {
        console.error(`Error aggregating signals for ${symbol}:`, error.message);
        results.push({ symbol, error: error.message, timestamp: new Date().toISOString() });
      }
    }
    return results;
  }

  async getTopBullishSignals(limit = 20) {
    try {
      const db = await getDatabaseAsync();
      const dateFilter = isUsingPostgres()
        ? `DATE(calculated_at) = CURRENT_DATE`
        : `date(calculated_at) = date('now')`;
      const result = await db.query(
        `SELECT ags.*, c.name as company_name, c.sector, c.industry
         FROM aggregated_signals ags
         JOIN companies c ON ags.company_id = c.id
         WHERE ags.overall_signal IN ('strong_buy', 'buy', 'lean_buy') AND ${dateFilter}
         ORDER BY ags.weighted_score DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting top bullish signals:', error.message);
      return [];
    }
  }

  async getStoredSignal(symbol) {
    try {
      const db = await getDatabaseAsync();
      const result = await db.query(
        `SELECT * FROM aggregated_signals WHERE LOWER(symbol) = LOWER($1) ORDER BY calculated_at DESC LIMIT 1`,
        [symbol]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error fetching stored signal for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = { SignalAggregator, SOURCE_WEIGHTS };
