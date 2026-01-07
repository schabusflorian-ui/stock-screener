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
  trackRecommendation(recommendation, portfolioId = null) {
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

    const stmt = this.db.prepare(`
      INSERT INTO recommendation_outcomes (
        portfolio_id, symbol, company_id, action, signal_score, confidence,
        regime, signal_breakdown, recommended_at, price_at_recommendation,
        original_recommendation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `);

    const result = stmt.run(
      portfolioId,
      symbol,
      companyId,
      action,
      score,
      confidence,
      regime,
      signals ? JSON.stringify(signals) : null,
      price,
      originalRecommendationId
    );

    return {
      id: result.lastInsertRowid,
      symbol,
      action,
      trackedAt: new Date().toISOString(),
    };
  }

  /**
   * Mark a recommendation as executed
   */
  markExecuted(recommendationId, executedPrice, executedAt = null) {
    const stmt = this.db.prepare(`
      UPDATE recommendation_outcomes
      SET was_executed = 1,
          executed_at = ?,
          executed_price = ?
      WHERE id = ?
    `);

    stmt.run(
      executedAt || new Date().toISOString(),
      executedPrice,
      recommendationId
    );

    return { success: true, recommendationId };
  }

  /**
   * Update all pending outcomes with forward returns
   * Called daily by scheduler
   */
  updateAllOutcomes() {
    const pendingRecommendations = this.db.prepare(`
      SELECT ro.*, c.symbol
      FROM recommendation_outcomes ro
      LEFT JOIN companies c ON ro.company_id = c.id
      WHERE ro.outcome = 'PENDING'
        AND ro.recommended_at <= datetime('now', '-1 day')
    `).all();

    console.log(`Updating outcomes for ${pendingRecommendations.length} recommendations...`);

    let updated = 0;
    let errors = 0;

    for (const rec of pendingRecommendations) {
      try {
        this.updateSingleOutcome(rec);
        updated++;
      } catch (error) {
        console.error(`Error updating outcome for ${rec.symbol}:`, error.message);
        errors++;
      }
    }

    // Also update signal performance metrics
    this.recalculateSignalPerformance();

    return { updated, errors, total: pendingRecommendations.length };
  }

  /**
   * Update forward returns for a single recommendation
   */
  updateSingleOutcome(recommendation) {
    const { id, symbol, company_id, recommended_at, price_at_recommendation } = recommendation;

    // Get current and historical prices
    const priceData = this.db.prepare(`
      SELECT date, close
      FROM daily_prices
      WHERE company_id = ?
        AND date >= date(?)
      ORDER BY date ASC
    `).all(company_id, recommended_at);

    if (priceData.length === 0) {
      return; // No price data yet
    }

    // Get benchmark (SPY) prices
    const benchmarkPrices = this.getBenchmarkPrices(recommended_at);

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
    const updateStmt = this.db.prepare(`
      UPDATE recommendation_outcomes
      SET return_1d = ?,
          return_5d = ?,
          return_21d = ?,
          return_63d = ?,
          benchmark_return_1d = ?,
          benchmark_return_5d = ?,
          benchmark_return_21d = ?,
          benchmark_return_63d = ?,
          alpha_1d = ?,
          alpha_5d = ?,
          alpha_21d = ?,
          alpha_63d = ?,
          outcome = ?,
          outcome_updated_at = datetime('now')
      WHERE id = ?
    `);

    updateStmt.run(
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
      id
    );

    return { id, outcome, returns };
  }

  /**
   * Get benchmark prices starting from a date
   */
  getBenchmarkPrices(startDate) {
    const spy = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(this.BENCHMARK_SYMBOL);

    if (!spy) return [];

    return this.db.prepare(`
      SELECT date, close
      FROM daily_prices
      WHERE company_id = ?
        AND date >= date(?)
      ORDER BY date ASC
    `).all(spy.id, startDate);
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
  getPerformanceStats(options = {}) {
    const { period = '90d', signalType = null, regime = null, action = null } = options;

    const periodDays = this.parsePeriod(period);

    let whereClause = `WHERE outcome != 'PENDING' AND recommended_at >= datetime('now', '-${periodDays} days')`;
    const params = [];

    if (regime) {
      whereClause += ` AND regime = ?`;
      params.push(regime);
    }
    if (action) {
      whereClause += ` AND action = ?`;
      params.push(action);
    }

    const stats = this.db.prepare(`
      SELECT
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
      ${whereClause}
    `).get(...params);

    const hitRate = stats.total_recommendations > 0
      ? (stats.wins / stats.total_recommendations) * 100
      : null;

    return {
      period,
      totalRecommendations: stats.total_recommendations,
      wins: stats.wins,
      losses: stats.losses,
      hitRate,
      avgReturn1d: stats.avg_return_1d,
      avgReturn5d: stats.avg_return_5d,
      avgReturn21d: stats.avg_return_21d,
      avgReturn63d: stats.avg_return_63d,
      avgAlpha21d: stats.avg_alpha_21d,
      avgSignalScore: stats.avg_signal_score,
      avgConfidence: stats.avg_confidence,
    };
  }

  /**
   * Get Information Coefficient by signal type
   */
  getICBySignalType(period = '90d') {
    const periodDays = this.parsePeriod(period);

    // Get all recommendations with signal breakdown
    const recommendations = this.db.prepare(`
      SELECT signal_breakdown, signal_score, return_21d, regime
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND signal_breakdown IS NOT NULL
        AND return_21d IS NOT NULL
        AND recommended_at >= datetime('now', '-${periodDays} days')
    `).all();

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
            returns.push(rec.return_21d);
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
  getHitRateByRegime(period = '90d') {
    const periodDays = this.parsePeriod(period);

    const results = this.db.prepare(`
      SELECT
        regime,
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins,
        AVG(return_21d) as avg_return,
        AVG(alpha_21d) as avg_alpha
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND recommended_at >= datetime('now', '-${periodDays} days')
      GROUP BY regime
      ORDER BY COUNT(*) DESC
    `).all();

    return results.map(r => ({
      regime: r.regime,
      total: r.total,
      wins: r.wins,
      hitRate: r.total > 0 ? Math.round((r.wins / r.total) * 100 * 10) / 10 : null,
      avgReturn: r.avg_return ? Math.round(r.avg_return * 100) / 100 : null,
      avgAlpha: r.avg_alpha ? Math.round(r.avg_alpha * 100) / 100 : null,
    }));
  }

  /**
   * Get recent recommendations with outcomes
   */
  getRecentRecommendations(limit = 50, options = {}) {
    const { portfolioId = null, outcome = null, action = null } = options;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (portfolioId) {
      whereClause += ` AND ro.portfolio_id = ?`;
      params.push(portfolioId);
    }
    if (outcome) {
      whereClause += ` AND ro.outcome = ?`;
      params.push(outcome);
    }
    if (action) {
      whereClause += ` AND ro.action = ?`;
      params.push(action);
    }

    params.push(limit);

    return this.db.prepare(`
      SELECT
        ro.*,
        c.name as company_name
      FROM recommendation_outcomes ro
      LEFT JOIN companies c ON ro.company_id = c.id
      ${whereClause}
      ORDER BY ro.recommended_at DESC
      LIMIT ?
    `).all(...params);
  }

  /**
   * Calculate rolling IC for signal optimizer
   */
  calculateRollingIC(signalType, windowDays = 60) {
    const recommendations = this.db.prepare(`
      SELECT signal_breakdown, return_21d, recommended_at
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND signal_breakdown IS NOT NULL
        AND return_21d IS NOT NULL
        AND recommended_at >= datetime('now', '-${windowDays} days')
      ORDER BY recommended_at ASC
    `).all();

    const signalScores = [];
    const returns = [];

    for (const rec of recommendations) {
      try {
        const breakdown = JSON.parse(rec.signal_breakdown);
        if (breakdown[signalType]?.score !== undefined) {
          signalScores.push(breakdown[signalType].score);
          returns.push(rec.return_21d);
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
  getOptimalWeights(lookbackDays = 90) {
    const signalTypes = ['technical', 'sentiment', 'insider', 'fundamental', 'alternative', 'valuation', 'filing_13f', 'earnings'];

    const ics = {};
    let totalPositiveIC = 0;

    for (const signalType of signalTypes) {
      const { ic, reliable } = this.calculateRollingIC(signalType, lookbackDays);
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
  recalculateSignalPerformance() {
    const periods = ['30d', '90d', '1y', 'all'];
    const regimes = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'];

    const upsertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO signal_performance (
        signal_type, regime, period, sample_count,
        hit_rate, avg_return_1d, avg_return_5d, avg_return_21d, avg_return_63d,
        ic_1d, ic_5d, ic_21d, ic_63d, ic_t_stat, sharpe_ratio, calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const signalTypes = ['technical', 'sentiment', 'insider', 'fundamental', 'alternative', 'valuation', 'filing_13f', 'earnings'];

    for (const period of periods) {
      for (const regime of regimes) {
        const icData = this.getICBySignalType(period);

        for (const signalType of signalTypes) {
          const signalIC = icData.signalICs?.[signalType];

          // Get performance for this signal type
          const perfData = this.getSignalTypePerformance(signalType, period, regime === 'ALL' ? null : regime);

          upsertStmt.run(
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
          );
        }
      }
    }

    console.log('Signal performance metrics updated');
  }

  /**
   * Get performance for a specific signal type
   */
  getSignalTypePerformance(signalType, period, regime = null) {
    const periodDays = this.parsePeriod(period);

    const recommendations = this.db.prepare(`
      SELECT signal_breakdown, outcome, return_1d, return_5d, return_21d, return_63d
      FROM recommendation_outcomes
      WHERE outcome != 'PENDING'
        AND signal_breakdown IS NOT NULL
        AND recommended_at >= datetime('now', '-${periodDays} days')
        ${regime ? 'AND regime = ?' : ''}
    `).all(...(regime ? [regime] : []));

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
    const returns21d = validRecs.map(r => r.return_21d).filter(r => r !== null);

    return {
      sampleCount: validRecs.length,
      hitRate: (wins / validRecs.length) * 100,
      avgReturn1d: this.avg(validRecs.map(r => r.return_1d).filter(r => r !== null)),
      avgReturn5d: this.avg(validRecs.map(r => r.return_5d).filter(r => r !== null)),
      avgReturn21d: this.avg(returns21d),
      avgReturn63d: this.avg(validRecs.map(r => r.return_63d).filter(r => r !== null)),
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
