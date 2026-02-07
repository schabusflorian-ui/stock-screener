// src/services/agent/recommendationTracker.js
// Tracks recommendation outcomes and calculates performance metrics

class RecommendationTracker {
  constructor(db) {
    this.db = db;
    this.OUTCOME_HORIZONS = [1, 5, 21, 63]; // Days to track
    this.WIN_THRESHOLD = 0.0; // > 0% return = WIN
    this.BENCHMARK_SYMBOL = 'SPY';
  }

  /**
   * Track a new recommendation
   */
  async trackRecommendation(recommendation, portfolioId = null) {
    const {
      symbol,
      companyId,
      action,
      score,
      confidence,
      regime,
      signals,
      price,
      originalRecommendationId,
    } = recommendation;

    const result = await this.db.query(
      `INSERT INTO recommendation_outcomes (
        portfolio_id, symbol, company_id, action, signal_score, confidence,
        regime, signal_breakdown, recommended_at, price_at_recommendation,
        original_recommendation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10)
      RETURNING id`,
      [
        portfolioId,
        symbol,
        companyId,
        action,
        score,
        confidence,
        regime,
        signals ? JSON.stringify(signals) : null,
        price,
        originalRecommendationId,
      ]
    );

    return {
      id: result.rows[0].id,
      symbol,
      action,
      trackedAt: new Date().toISOString(),
    };
  }

  /**
   * Mark a recommendation as executed
   */
  async markExecuted(recommendationId, executedPrice, executedAt = null) {
    await this.db.query(
      `UPDATE recommendation_outcomes
      SET was_executed = true,
          executed_at = $1,
          executed_price = $2
      WHERE id = $3`,
      [executedAt || new Date().toISOString(), executedPrice, recommendationId]
    );

    return { success: true, recommendationId };
  }

  /**
   * Update all pending outcomes with forward returns
   * Called daily by scheduler
   */
  async updateAllOutcomes() {
    const result = await this.db.query(
      `SELECT ro.*, c.symbol
      FROM recommendation_outcomes ro
      LEFT JOIN companies c ON ro.company_id = c.id
      WHERE ro.outcome = 'PENDING'
        AND ro.recommended_at <= CURRENT_TIMESTAMP - INTERVAL '1 day'`
    );

    const pendingRecommendations = result.rows;
    console.log(`Updating outcomes for ${pendingRecommendations.length} recommendations...`);

    let updated = 0;
    let errors = 0;

    for (const rec of pendingRecommendations) {
      try {
        await this.updateSingleOutcome(rec);
        updated++;
      } catch (error) {
        console.error(`Error updating outcome for ${rec.symbol}:`, error.message);
        errors++;
      }
    }

    // Also update signal performance metrics
    await this.recalculateSignalPerformance();

    return { updated, errors, total: pendingRecommendations.length };
  }

  /**
   * Update forward returns for a single recommendation
   */
  async updateSingleOutcome(recommendation) {
    const { id, symbol, company_id, recommended_at, price_at_recommendation } = recommendation;

    // Get current and historical prices
    const priceResult = await this.db.query(
      `SELECT date, close
      FROM daily_prices
      WHERE company_id = $1
        AND date >= $2::date
      ORDER BY date ASC`,
      [company_id, recommended_at]
    );

    const priceData = priceResult.rows;

    if (priceData.length === 0) {
      return; // No price data yet
    }

    // Get benchmark (SPY) prices
    const benchmarkPrices = await this.getBenchmarkPrices(recommended_at);

    // Calculate returns for each horizon
    const returns = {};
    const benchmarkReturns = {};
    const alphas = {};

    for (const horizon of this.OUTCOME_HORIZONS) {
      const targetDate = this.addBusinessDays(new Date(recommended_at), horizon);
      const priceAtHorizon = this.findPriceAtDate(priceData, targetDate);
      const benchmarkAtHorizon = this.findPriceAtDate(benchmarkPrices, targetDate);

      if (priceAtHorizon && price_at_recommendation > 0) {
        returns[`return_${horizon}d`] = ((priceAtHorizon - price_at_recommendation) / price_at_recommendation) * 100;
      }

      if (benchmarkAtHorizon && benchmarkPrices.length > 0) {
        const benchmarkStart = benchmarkPrices[0]?.close;
        if (benchmarkStart > 0) {
          benchmarkReturns[`benchmark_return_${horizon}d`] = ((benchmarkAtHorizon - benchmarkStart) / benchmarkStart) * 100;
        }
      }

      // Calculate alpha
      if (returns[`return_${horizon}d`] !== undefined && benchmarkReturns[`benchmark_return_${horizon}d`] !== undefined) {
        alphas[`alpha_${horizon}d`] = returns[`return_${horizon}d`] - benchmarkReturns[`benchmark_return_${horizon}d`];
      }
    }

    // Determine outcome based on 21-day return
    let outcome = 'PENDING';
    if (returns.return_21d !== undefined) {
      const action = recommendation.action?.toLowerCase();
      const isLongAction = ['buy', 'strong_buy'].includes(action);
      const effectiveReturn = isLongAction ? returns.return_21d : -returns.return_21d;
      outcome = effectiveReturn > this.WIN_THRESHOLD ? 'WIN' : 'LOSS';
    }

    // Update the record
    await this.db.query(
      `UPDATE recommendation_outcomes
      SET return_1d = $1,
          return_5d = $2,
          return_21d = $3,
          return_63d = $4,
          benchmark_return_1d = $5,
          benchmark_return_5d = $6,
          benchmark_return_21d = $7,
          benchmark_return_63d = $8,
          alpha_1d = $9,
          alpha_5d = $10,
          alpha_21d = $11,
          alpha_63d = $12,
          outcome = $13,
          outcome_updated_at = CURRENT_TIMESTAMP
      WHERE id = $14`,
      [
        returns.return_1d ?? null,
        returns.return_5d ?? null,
        returns.return_21d ?? null,
        returns.return_63d ?? null,
        benchmarkReturns.benchmark_return_1d ?? null,
        benchmarkReturns.benchmark_return_5d ?? null,
        benchmarkReturns.benchmark_return_21d ?? null,
        benchmarkReturns.benchmark_return_63d ?? null,
        alphas.alpha_1d ?? null,
        alphas.alpha_5d ?? null,
        alphas.alpha_21d ?? null,
        alphas.alpha_63d ?? null,
        outcome,
        id,
      ]
    );

    return { id, outcome, returns };
  }

  /**
   * Get benchmark prices starting from a date
   */
  async getBenchmarkPrices(startDate) {
    const spyResult = await this.db.query(
      `SELECT id FROM companies WHERE symbol = $1`,
      [this.BENCHMARK_SYMBOL]
    );

    if (spyResult.rows.length === 0) return [];

    const spy = spyResult.rows[0];

    const result = await this.db.query(
      `SELECT date, close
      FROM daily_prices
      WHERE company_id = $1
        AND date >= $2::date
      ORDER BY date ASC`,
      [spy.id, startDate]
    );

    return result.rows;
  }

  /**
   * Find price closest to a target date
   */
  findPriceAtDate(prices, targetDate) {
    const targetStr = targetDate.toISOString().split('T')[0];

    for (const p of prices) {
      if (p.date >= targetStr) {
        return p.close;
      }
    }
    return null;
  }

  /**
   * Add business days to a date
   */
  addBusinessDays(date, days) {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dayOfWeek = result.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        added++;
      }
    }
    return result;
  }

  // ============================================
  // Analytics Methods
  // ============================================

  /**
   * Get overall performance statistics
   */
  async getPerformanceStats(options = {}) {
    const { period = '90d', signalType = null, regime = null, action = null } = options;

    const periodDays = this.parsePeriod(period);

    let whereClause = `WHERE outcome != 'PENDING' AND recommended_at >= CURRENT_TIMESTAMP - INTERVAL '${periodDays} days'`;
    const params = [];
    let paramCount = 0;

    if (regime) {
      paramCount++;
      whereClause += ` AND regime = $${paramCount}`;
      params.push(regime);
    }
    if (action) {
      paramCount++;
      whereClause += ` AND action = $${paramCount}`;
      params.push(action);
    }

    const result = await this.db.query(
      `SELECT
        COUNT(*) as total_recommendations,
        SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) as losses,
        AVG(return_1d) as avg_return_1d,
        AVG(return_5d) as avg_return_5d,
        AVG(return_21d) as avg_return_21d,
        AVG(return_63d) as avg_return_63d,
        AVG(alpha_21d) as avg_alpha_21d,
        AVG(signal_score) as avg_signal_score,
        AVG(confidence) as avg_confidence
      FROM recommendation_outcomes
      ${whereClause}`,
      params
    );

    const stats = result.rows[0];

    const totalRecs = parseInt(stats.total_recommendations);
    const wins = parseInt(stats.wins || 0);

    const hitRate = totalRecs > 0 ? (wins / totalRecs) * 100 : null;

    return {
      period,
      totalRecommendations: totalRecs,
      wins,
      losses: parseInt(stats.losses || 0),
      hitRate,
      avgReturn1d: parseFloat(stats.avg_return_1d),
      avgReturn5d: parseFloat(stats.avg_return_5d),
      avgReturn21d: parseFloat(stats.avg_return_21d),
      avgReturn63d: parseFloat(stats.avg_return_63d),
      avgAlpha21d: parseFloat(stats.avg_alpha_21d),
      avgSignalScore: parseFloat(stats.avg_signal_score),
      avgConfidence: parseFloat(stats.avg_confidence),
    };
  }

  /**
   * Get Information Coefficient by signal type
   */
  async getICBySignalType(period = '90d') {
    const periodDays = this.parsePeriod(period);

    // Get all recommendations with signal breakdown
    const result = await this.db.query(
      `SELECT signal_breakdown, signal_score, return_21d, regime
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND signal_breakdown IS NOT NULL
        AND return_21d IS NOT NULL
        AND recommended_at >= CURRENT_TIMESTAMP - INTERVAL '${periodDays} days'`
    );

    const recommendations = result.rows;

    if (recommendations.length < 10) {
      return { error: 'Insufficient data', sampleSize: recommendations.length };
    }

    const signalTypes = ['technical', 'sentiment', 'insider', 'fundamental', 'alternative', 'valuation', 'filing_13f', 'earnings'];
    const results = {};

    for (const signalType of signalTypes) {
      const signalScores = [];
      const returns = [];

      for (const rec of recommendations) {
        try {
          const breakdown = JSON.parse(rec.signal_breakdown);
          if (breakdown[signalType]?.score !== undefined) {
            signalScores.push(breakdown[signalType].score);
            returns.push(parseFloat(rec.return_21d));
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      if (signalScores.length >= 10) {
        const ic = this.calculateCorrelation(signalScores, returns);
        const tStat = this.calculateTStat(ic, signalScores.length);

        results[signalType] = {
          ic: Math.round(ic * 1000) / 1000,
          tStat: Math.round(tStat * 100) / 100,
          sampleSize: signalScores.length,
          significant: Math.abs(tStat) > 2,
        };
      } else {
        results[signalType] = {
          ic: null,
          tStat: null,
          sampleSize: signalScores.length,
          significant: false,
          error: 'Insufficient data',
        };
      }
    }

    return {
      period,
      totalSamples: recommendations.length,
      signalICs: results,
    };
  }

  /**
   * Get hit rate by market regime
   */
  async getHitRateByRegime(period = '90d') {
    const periodDays = this.parsePeriod(period);

    const result = await this.db.query(
      `SELECT
        regime,
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins,
        AVG(return_21d) as avg_return,
        AVG(alpha_21d) as avg_alpha
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND recommended_at >= CURRENT_TIMESTAMP - INTERVAL '${periodDays} days'
      GROUP BY regime
      ORDER BY COUNT(*) DESC`
    );

    return result.rows.map(r => ({
      regime: r.regime,
      total: parseInt(r.total),
      wins: parseInt(r.wins || 0),
      hitRate: r.total > 0 ? Math.round((parseInt(r.wins || 0) / parseInt(r.total)) * 100 * 10) / 10 : null,
      avgReturn: r.avg_return ? Math.round(parseFloat(r.avg_return) * 100) / 100 : null,
      avgAlpha: r.avg_alpha ? Math.round(parseFloat(r.avg_alpha) * 100) / 100 : null,
    }));
  }

  /**
   * Get recent recommendations with outcomes
   */
  async getRecentRecommendations(limit = 50, options = {}) {
    const { portfolioId = null, outcome = null, action = null } = options;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (portfolioId) {
      paramCount++;
      whereClause += ` AND ro.portfolio_id = $${paramCount}`;
      params.push(portfolioId);
    }
    if (outcome) {
      paramCount++;
      whereClause += ` AND ro.outcome = $${paramCount}`;
      params.push(outcome);
    }
    if (action) {
      paramCount++;
      whereClause += ` AND ro.action = $${paramCount}`;
      params.push(action);
    }

    paramCount++;
    params.push(limit);

    const result = await this.db.query(
      `SELECT
        ro.*,
        c.name as company_name
      FROM recommendation_outcomes ro
      LEFT JOIN companies c ON ro.company_id = c.id
      ${whereClause}
      ORDER BY ro.recommended_at DESC
      LIMIT $${paramCount}`,
      params
    );

    return result.rows;
  }

  /**
   * Calculate rolling IC for signal optimizer
   */
  async calculateRollingIC(signalType, windowDays = 60) {
    const result = await this.db.query(
      `SELECT signal_breakdown, return_21d, recommended_at
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND signal_breakdown IS NOT NULL
        AND return_21d IS NOT NULL
        AND recommended_at >= CURRENT_TIMESTAMP - INTERVAL '${windowDays} days'
      ORDER BY recommended_at ASC`
    );

    const recommendations = result.rows;

    const signalScores = [];
    const returns = [];

    for (const rec of recommendations) {
      try {
        const breakdown = JSON.parse(rec.signal_breakdown);
        if (breakdown[signalType]?.score !== undefined) {
          signalScores.push(breakdown[signalType].score);
          returns.push(parseFloat(rec.return_21d));
        }
      } catch (e) {
        // Skip
      }
    }

    if (signalScores.length < 10) {
      return { ic: 0, sampleSize: signalScores.length, reliable: false };
    }

    const ic = this.calculateCorrelation(signalScores, returns);

    return {
      ic,
      sampleSize: signalScores.length,
      reliable: signalScores.length >= 30,
    };
  }

  /**
   * Get optimal weights based on recent IC
   */
  async getOptimalWeights(lookbackDays = 90) {
    const signalTypes = ['technical', 'sentiment', 'insider', 'fundamental', 'alternative', 'valuation', 'filing_13f', 'earnings'];

    const ics = {};
    let totalPositiveIC = 0;

    for (const signalType of signalTypes) {
      const { ic, reliable } = await this.calculateRollingIC(signalType, lookbackDays);
      ics[signalType] = { ic, reliable };

      // Only count positive ICs for weighting
      if (ic > 0 && reliable) {
        totalPositiveIC += ic;
      }
    }

    // Calculate weights proportional to IC
    const weights = {};
    const MIN_WEIGHT = 0.05;
    const MAX_WEIGHT = 0.30;

    for (const signalType of signalTypes) {
      const { ic, reliable } = ics[signalType];

      if (totalPositiveIC > 0 && ic > 0 && reliable) {
        weights[signalType] = ic / totalPositiveIC;
      } else {
        // Default equal weight for unreliable signals
        weights[signalType] = 1 / signalTypes.length;
      }

      // Apply constraints
      weights[signalType] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, weights[signalType]));
    }

    // Normalize to sum to 1
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(weights)) {
      weights[key] = weights[key] / total;
    }

    return {
      weights,
      ics,
      lookbackDays,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Recalculate and store signal performance metrics
   */
  async recalculateSignalPerformance() {
    const periods = ['30d', '90d', '1y', 'all'];
    const regimes = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'];

    const signalTypes = ['technical', 'sentiment', 'insider', 'fundamental', 'alternative', 'valuation', 'filing_13f', 'earnings'];

    for (const period of periods) {
      for (const regime of regimes) {
        const icData = await this.getICBySignalType(period);

        for (const signalType of signalTypes) {
          const signalIC = icData.signalICs?.[signalType];

          // Get performance for this signal type
          const perfData = await this.getSignalTypePerformance(signalType, period, regime === 'ALL' ? null : regime);

          await this.db.query(
            `INSERT INTO signal_performance (
              signal_type, regime, period, sample_count,
              hit_rate, avg_return_1d, avg_return_5d, avg_return_21d, avg_return_63d,
              ic_1d, ic_5d, ic_21d, ic_63d, ic_t_stat, sharpe_ratio, calculated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
            ON CONFLICT (signal_type, regime, period)
            DO UPDATE SET
              sample_count = EXCLUDED.sample_count,
              hit_rate = EXCLUDED.hit_rate,
              avg_return_1d = EXCLUDED.avg_return_1d,
              avg_return_5d = EXCLUDED.avg_return_5d,
              avg_return_21d = EXCLUDED.avg_return_21d,
              avg_return_63d = EXCLUDED.avg_return_63d,
              ic_1d = EXCLUDED.ic_1d,
              ic_5d = EXCLUDED.ic_5d,
              ic_21d = EXCLUDED.ic_21d,
              ic_63d = EXCLUDED.ic_63d,
              ic_t_stat = EXCLUDED.ic_t_stat,
              sharpe_ratio = EXCLUDED.sharpe_ratio,
              calculated_at = EXCLUDED.calculated_at`,
            [
              signalType,
              regime,
              period,
              perfData.sampleCount,
              perfData.hitRate,
              perfData.avgReturn1d,
              perfData.avgReturn5d,
              perfData.avgReturn21d,
              perfData.avgReturn63d,
              signalIC?.ic ?? null,
              null, // ic_5d - would need separate calculation
              signalIC?.ic ?? null,
              null, // ic_63d
              signalIC?.tStat ?? null,
              perfData.sharpeRatio,
            ]
          );
        }
      }
    }

    console.log('Signal performance metrics updated');
  }

  /**
   * Get performance for a specific signal type
   */
  async getSignalTypePerformance(signalType, period, regime = null) {
    const periodDays = this.parsePeriod(period);

    const params = regime ? [regime] : [];
    const result = await this.db.query(
      `SELECT signal_breakdown, outcome, return_1d, return_5d, return_21d, return_63d
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND signal_breakdown IS NOT NULL
        AND recommended_at >= CURRENT_TIMESTAMP - INTERVAL '${periodDays} days'
        ${regime ? 'AND regime = $1' : ''}`,
      params
    );

    const recommendations = result.rows;

    const validRecs = recommendations.filter(rec => {
      try {
        const breakdown = JSON.parse(rec.signal_breakdown);
        return breakdown[signalType]?.score !== undefined;
      } catch {
        return false;
      }
    });

    if (validRecs.length === 0) {
      return { sampleCount: 0 };
    }

    const wins = validRecs.filter(r => r.outcome === 'WIN').length;
    const returns21d = validRecs.map(r => parseFloat(r.return_21d)).filter(r => r !== null && !isNaN(r));

    return {
      sampleCount: validRecs.length,
      hitRate: (wins / validRecs.length) * 100,
      avgReturn1d: this.avg(validRecs.map(r => parseFloat(r.return_1d)).filter(r => r !== null && !isNaN(r))),
      avgReturn5d: this.avg(validRecs.map(r => parseFloat(r.return_5d)).filter(r => r !== null && !isNaN(r))),
      avgReturn21d: this.avg(returns21d),
      avgReturn63d: this.avg(validRecs.map(r => parseFloat(r.return_63d)).filter(r => r !== null && !isNaN(r))),
      sharpeRatio: returns21d.length > 1 ? this.calculateSharpe(returns21d) : null,
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  parsePeriod(period) {
    const match = period.match(/^(\d+)([dmy])$/);
    if (!match) return 90;

    const [, num, unit] = match;
    switch (unit) {
      case 'd': return parseInt(num);
      case 'm': return parseInt(num) * 30;
      case 'y': return parseInt(num) * 365;
      default: return 90;
    }
  }

  calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumXSq = 0;
    let sumYSq = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      sumXSq += dx * dx;
      sumYSq += dy * dy;
    }

    const denominator = Math.sqrt(sumXSq * sumYSq);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  calculateTStat(r, n) {
    if (n < 3 || Math.abs(r) >= 1) return 0;
    return r * Math.sqrt((n - 2) / (1 - r * r));
  }

  calculateSharpe(returns) {
    if (returns.length < 2) return null;
    const mean = this.avg(returns);
    const std = this.std(returns);
    return std === 0 ? 0 : (mean / std) * Math.sqrt(252 / 21); // Annualized
  }

  avg(arr) {
    if (arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  std(arr) {
    if (arr.length < 2) return 0;
    const mean = this.avg(arr);
    const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1));
  }
}

module.exports = { RecommendationTracker };
