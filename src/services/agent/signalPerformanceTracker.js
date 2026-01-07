// src/services/agent/signalPerformanceTracker.js
// Comprehensive signal performance analysis with IC decay, regime stability, and hit rates

class SignalPerformanceTracker {
  constructor(db) {
    this.db = db;

    // All 9 signal types
    this.SIGNAL_TYPES = [
      'technical', 'sentiment', 'insider', 'fundamental',
      'alternativeData', 'valuation', 'thirteenF', 'earningsMomentum', 'valueQuality'
    ];

    // Holding periods in trading days
    this.HOLDING_PERIODS = [1, 5, 21, 63, 126, 252]; // 1d, 1w, 1m, 3m, 6m, 1y

    // Market regimes
    this.REGIMES = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS'];

    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      getRecommendationsWithReturns: this.db.prepare(`
        SELECT
          ro.id,
          ro.symbol,
          ro.company_id,
          ro.action,
          ro.signal_score,
          ro.signal_breakdown,
          ro.regime,
          ro.recommended_at,
          ro.price_at_recommendation,
          ro.return_1d,
          ro.return_5d,
          ro.return_21d,
          ro.return_63d,
          ro.outcome
        FROM recommendation_outcomes ro
        WHERE ro.signal_breakdown IS NOT NULL
          AND ro.outcome != 'PENDING'
          AND ro.recommended_at >= datetime('now', ? || ' days')
        ORDER BY ro.recommended_at DESC
      `),

      getExtendedReturns: this.db.prepare(`
        SELECT
          dp1.close as price_at_rec,
          dp2.close as price_at_horizon,
          dp2.date as horizon_date
        FROM daily_prices dp1
        JOIN daily_prices dp2 ON dp2.company_id = dp1.company_id
        WHERE dp1.company_id = ?
          AND dp1.date = (
            SELECT MAX(date) FROM daily_prices
            WHERE company_id = ? AND date <= date(?)
          )
          AND dp2.date = (
            SELECT MIN(date) FROM daily_prices
            WHERE company_id = ? AND date >= date(?, ? || ' days')
          )
      `),

      getSignalHistory: this.db.prepare(`
        SELECT
          date(recommended_at) as date,
          signal_breakdown,
          return_21d,
          regime
        FROM recommendation_outcomes
        WHERE signal_breakdown IS NOT NULL
          AND return_21d IS NOT NULL
          AND recommended_at >= datetime('now', ? || ' days')
        ORDER BY recommended_at ASC
      `),
    };
  }

  // ============================================
  // IC DECAY ANALYSIS
  // ============================================

  /**
   * Calculate IC for each signal across different holding periods
   * Shows how predictive power decays over time
   */
  getICDecay(lookbackDays = 180) {
    const recommendations = this.stmts.getRecommendationsWithReturns.all(`-${lookbackDays}`);

    if (recommendations.length < 20) {
      return { error: 'Insufficient data', sampleSize: recommendations.length };
    }

    const results = {};

    for (const signalType of this.SIGNAL_TYPES) {
      const horizonResults = {};

      // Get signal scores and returns for each horizon
      for (const horizon of [1, 5, 21, 63]) {
        const returnField = `return_${horizon}d`;
        const signalScores = [];
        const returns = [];

        for (const rec of recommendations) {
          try {
            const breakdown = JSON.parse(rec.signal_breakdown);
            const signal = breakdown[signalType];

            if (signal?.score !== undefined && rec[returnField] !== null) {
              signalScores.push(signal.score);
              returns.push(rec[returnField]);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }

        if (signalScores.length >= 15) {
          const ic = this._calculateCorrelation(signalScores, returns);
          const tStat = this._calculateTStat(ic, signalScores.length);

          horizonResults[`${horizon}d`] = {
            ic: Math.round(ic * 1000) / 1000,
            tStat: Math.round(tStat * 100) / 100,
            significant: Math.abs(tStat) > 2,
            sampleSize: signalScores.length,
          };
        } else {
          horizonResults[`${horizon}d`] = {
            ic: null,
            tStat: null,
            significant: false,
            sampleSize: signalScores.length,
          };
        }
      }

      // Calculate decay rate (IC at 63d / IC at 1d)
      const ic1d = horizonResults['1d']?.ic;
      const ic63d = horizonResults['63d']?.ic;

      let decayRate = null;
      let decayInterpretation = 'Unknown';

      if (ic1d !== null && ic63d !== null && ic1d !== 0) {
        decayRate = ic63d / ic1d;

        if (decayRate > 1.2) {
          decayInterpretation = 'Improves over time (momentum signal)';
        } else if (decayRate > 0.7) {
          decayInterpretation = 'Stable signal';
        } else if (decayRate > 0.3) {
          decayInterpretation = 'Moderate decay';
        } else {
          decayInterpretation = 'Fast decay (short-term signal)';
        }
      }

      results[signalType] = {
        horizons: horizonResults,
        decayRate: decayRate ? Math.round(decayRate * 100) / 100 : null,
        decayInterpretation,
        optimalHorizon: this._findOptimalHorizon(horizonResults),
      };
    }

    return {
      lookbackDays,
      totalSamples: recommendations.length,
      signals: results,
      summary: this._summarizeICDecay(results),
    };
  }

  _findOptimalHorizon(horizonResults) {
    let maxIC = -Infinity;
    let optimal = null;

    for (const [horizon, data] of Object.entries(horizonResults)) {
      if (data.ic !== null && data.significant && data.ic > maxIC) {
        maxIC = data.ic;
        optimal = horizon;
      }
    }

    return optimal;
  }

  _summarizeICDecay(results) {
    const shortTerm = []; // Best at 1-5 days
    const mediumTerm = []; // Best at 21 days
    const longTerm = []; // Best at 63+ days
    const unstable = []; // No clear pattern

    for (const [signal, data] of Object.entries(results)) {
      const optimal = data.optimalHorizon;

      if (!optimal) {
        unstable.push(signal);
      } else if (['1d', '5d'].includes(optimal)) {
        shortTerm.push(signal);
      } else if (optimal === '21d') {
        mediumTerm.push(signal);
      } else {
        longTerm.push(signal);
      }
    }

    return {
      shortTerm,
      mediumTerm,
      longTerm,
      unstable,
      recommendation: this._generateDecayRecommendation(shortTerm, mediumTerm, longTerm),
    };
  }

  _generateDecayRecommendation(shortTerm, mediumTerm, longTerm) {
    const parts = [];

    if (longTerm.length > 0) {
      parts.push(`For long-term holds, trust: ${longTerm.join(', ')}`);
    }
    if (mediumTerm.length > 0) {
      parts.push(`For 1-month positions, trust: ${mediumTerm.join(', ')}`);
    }
    if (shortTerm.length > 0) {
      parts.push(`For quick trades, use: ${shortTerm.join(', ')}`);
    }

    return parts.length > 0 ? parts.join('. ') : 'Insufficient data for recommendations';
  }

  // ============================================
  // HIT RATE BY HOLDING PERIOD
  // ============================================

  /**
   * Calculate win rate for each signal across different holding periods
   */
  getHitRatesByPeriod(lookbackDays = 180) {
    const recommendations = this.stmts.getRecommendationsWithReturns.all(`-${lookbackDays}`);

    if (recommendations.length < 20) {
      return { error: 'Insufficient data', sampleSize: recommendations.length };
    }

    const results = {};

    for (const signalType of this.SIGNAL_TYPES) {
      const periodResults = {};

      for (const horizon of [1, 5, 21, 63]) {
        const returnField = `return_${horizon}d`;
        let total = 0;
        let wins = 0;
        let strongSignalWins = 0;
        let strongSignalTotal = 0;

        for (const rec of recommendations) {
          try {
            const breakdown = JSON.parse(rec.signal_breakdown);
            const signal = breakdown[signalType];

            if (signal?.score !== undefined && rec[returnField] !== null) {
              const returnVal = rec[returnField];
              const isLong = ['buy', 'strong_buy'].includes(rec.action?.toLowerCase());
              const effectiveReturn = isLong ? returnVal : -returnVal;

              // Check if signal was bullish (score > 0.2)
              if (signal.score > 0.2) {
                total++;
                if (effectiveReturn > 0) wins++;

                // Strong signal (score > 0.5)
                if (signal.score > 0.5) {
                  strongSignalTotal++;
                  if (effectiveReturn > 0) strongSignalWins++;
                }
              }
            }
          } catch (e) {
            // Skip
          }
        }

        periodResults[`${horizon}d`] = {
          total,
          wins,
          hitRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : null,
          strongSignalHitRate: strongSignalTotal > 0
            ? Math.round((strongSignalWins / strongSignalTotal) * 1000) / 10
            : null,
          strongSignalSample: strongSignalTotal,
        };
      }

      results[signalType] = periodResults;
    }

    return {
      lookbackDays,
      totalSamples: recommendations.length,
      signals: results,
    };
  }

  // ============================================
  // REGIME STABILITY ANALYSIS
  // ============================================

  /**
   * Analyze how signal performance varies across market regimes
   */
  getRegimeStability(lookbackDays = 365) {
    const recommendations = this.stmts.getRecommendationsWithReturns.all(`-${lookbackDays}`);

    if (recommendations.length < 30) {
      return { error: 'Insufficient data', sampleSize: recommendations.length };
    }

    const results = {};

    for (const signalType of this.SIGNAL_TYPES) {
      const regimeICs = {};

      for (const regime of this.REGIMES) {
        const signalScores = [];
        const returns = [];

        for (const rec of recommendations) {
          if (rec.regime !== regime) continue;

          try {
            const breakdown = JSON.parse(rec.signal_breakdown);
            const signal = breakdown[signalType];

            if (signal?.score !== undefined && rec.return_21d !== null) {
              signalScores.push(signal.score);
              returns.push(rec.return_21d);
            }
          } catch (e) {
            // Skip
          }
        }

        if (signalScores.length >= 10) {
          const ic = this._calculateCorrelation(signalScores, returns);
          regimeICs[regime] = {
            ic: Math.round(ic * 1000) / 1000,
            sampleSize: signalScores.length,
          };
        } else {
          regimeICs[regime] = {
            ic: null,
            sampleSize: signalScores.length,
          };
        }
      }

      // Calculate stability metrics
      const validICs = Object.values(regimeICs)
        .filter(r => r.ic !== null)
        .map(r => r.ic);

      let stability = 'Unknown';
      let bestRegime = null;
      let worstRegime = null;

      if (validICs.length >= 2) {
        const mean = validICs.reduce((a, b) => a + b, 0) / validICs.length;
        const variance = validICs.reduce((sum, ic) => sum + Math.pow(ic - mean, 2), 0) / validICs.length;
        const stdDev = Math.sqrt(variance);
        const cv = mean !== 0 ? Math.abs(stdDev / mean) : Infinity;

        if (cv < 0.3) {
          stability = 'Highly Stable';
        } else if (cv < 0.6) {
          stability = 'Moderately Stable';
        } else if (cv < 1.0) {
          stability = 'Regime Dependent';
        } else {
          stability = 'Highly Variable';
        }

        // Find best and worst regimes
        let maxIC = -Infinity, minIC = Infinity;
        for (const [regime, data] of Object.entries(regimeICs)) {
          if (data.ic !== null) {
            if (data.ic > maxIC) { maxIC = data.ic; bestRegime = regime; }
            if (data.ic < minIC) { minIC = data.ic; worstRegime = regime; }
          }
        }
      }

      results[signalType] = {
        regimes: regimeICs,
        stability,
        bestRegime,
        worstRegime,
      };
    }

    return {
      lookbackDays,
      totalSamples: recommendations.length,
      signals: results,
      regimeCounts: this._getRegimeCounts(recommendations),
    };
  }

  _getRegimeCounts(recommendations) {
    const counts = {};
    for (const rec of recommendations) {
      counts[rec.regime] = (counts[rec.regime] || 0) + 1;
    }
    return counts;
  }

  // ============================================
  // ROLLING IC TREND
  // ============================================

  /**
   * Calculate rolling IC over time to detect signal degradation
   */
  getRollingICTrend(signalType, windowDays = 60, stepDays = 7, lookbackDays = 365) {
    const history = this.stmts.getSignalHistory.all(`-${lookbackDays}`);

    if (history.length < windowDays) {
      return { error: 'Insufficient data', sampleSize: history.length };
    }

    const dataPoints = [];

    // Parse all signal scores upfront
    const parsed = history.map(rec => {
      try {
        const breakdown = JSON.parse(rec.signal_breakdown);
        return {
          date: rec.date,
          score: breakdown[signalType]?.score,
          return21d: rec.return_21d,
        };
      } catch (e) {
        return null;
      }
    }).filter(r => r && r.score !== undefined);

    // Slide window
    for (let i = windowDays; i < parsed.length; i += stepDays) {
      const windowData = parsed.slice(i - windowDays, i);

      const scores = windowData.map(d => d.score);
      const returns = windowData.map(d => d.return21d);

      if (scores.length >= 20) {
        const ic = this._calculateCorrelation(scores, returns);
        dataPoints.push({
          date: windowData[windowData.length - 1].date,
          ic: Math.round(ic * 1000) / 1000,
          sampleSize: scores.length,
        });
      }
    }

    // Calculate trend
    let trend = 'Stable';
    if (dataPoints.length >= 5) {
      const recentIC = dataPoints.slice(-3).reduce((sum, d) => sum + d.ic, 0) / 3;
      const earlyIC = dataPoints.slice(0, 3).reduce((sum, d) => sum + d.ic, 0) / 3;

      const change = recentIC - earlyIC;

      if (change > 0.05) {
        trend = 'Improving';
      } else if (change < -0.05) {
        trend = 'Degrading';
      }
    }

    return {
      signalType,
      windowDays,
      lookbackDays,
      dataPoints,
      trend,
      currentIC: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].ic : null,
    };
  }

  // ============================================
  // COMPREHENSIVE SIGNAL HEALTH REPORT
  // ============================================

  /**
   * Generate a comprehensive health report for all signals
   */
  getSignalHealthReport(lookbackDays = 180) {
    const icDecay = this.getICDecay(lookbackDays);
    const hitRates = this.getHitRatesByPeriod(lookbackDays);
    const regimeStability = this.getRegimeStability(lookbackDays);

    if (icDecay.error || hitRates.error || regimeStability.error) {
      return {
        error: 'Insufficient data for comprehensive report',
        icDecay,
        hitRates,
        regimeStability,
      };
    }

    const signalHealth = {};

    for (const signal of this.SIGNAL_TYPES) {
      const decay = icDecay.signals[signal];
      const hr = hitRates.signals[signal];
      const stability = regimeStability.signals[signal];

      // Calculate health score (0-100)
      let healthScore = 50; // Start at neutral

      // IC contribution (up to 30 points)
      const ic21d = decay?.horizons?.['21d']?.ic;
      if (ic21d !== null) {
        healthScore += Math.min(30, ic21d * 100); // IC of 0.3 = full 30 points
      }

      // Hit rate contribution (up to 30 points)
      const hitRate21d = hr?.['21d']?.hitRate;
      if (hitRate21d !== null) {
        healthScore += Math.min(30, (hitRate21d - 50) * 1.5); // 70% hit rate = 30 points
      }

      // Stability contribution (up to 20 points)
      if (stability?.stability === 'Highly Stable') {
        healthScore += 20;
      } else if (stability?.stability === 'Moderately Stable') {
        healthScore += 10;
      } else if (stability?.stability === 'Regime Dependent') {
        healthScore += 5;
      }

      // Decay rate penalty (up to -20 points)
      if (decay?.decayRate !== null && decay.decayRate < 0.3) {
        healthScore -= 20 * (1 - decay.decayRate);
      }

      // Determine health status
      let status = 'Unknown';
      if (healthScore >= 70) {
        status = 'Healthy';
      } else if (healthScore >= 50) {
        status = 'Moderate';
      } else if (healthScore >= 30) {
        status = 'Weak';
      } else {
        status = 'Critical';
      }

      signalHealth[signal] = {
        healthScore: Math.round(Math.max(0, Math.min(100, healthScore))),
        status,
        ic21d: decay?.horizons?.['21d']?.ic,
        hitRate21d: hr?.['21d']?.hitRate,
        stability: stability?.stability,
        optimalHorizon: decay?.optimalHorizon,
        bestRegime: stability?.bestRegime,
        recommendation: this._generateSignalRecommendation(signal, decay, hr, stability),
      };
    }

    // Sort by health score
    const ranked = Object.entries(signalHealth)
      .sort((a, b) => b[1].healthScore - a[1].healthScore);

    return {
      lookbackDays,
      totalSamples: icDecay.totalSamples,
      signals: signalHealth,
      ranking: ranked.map(([signal, data]) => ({
        signal,
        score: data.healthScore,
        status: data.status,
      })),
      topSignals: ranked.filter(([, d]) => d.status === 'Healthy').map(([s]) => s),
      weakSignals: ranked.filter(([, d]) => ['Weak', 'Critical'].includes(d.status)).map(([s]) => s),
      overallHealth: this._calculateOverallHealth(signalHealth),
    };
  }

  _generateSignalRecommendation(signal, decay, hr, stability) {
    const parts = [];

    const ic = decay?.horizons?.['21d']?.ic;
    const hitRate = hr?.['21d']?.hitRate;

    if (ic !== null && ic < 0) {
      parts.push('Consider inverting or removing this signal');
    } else if (ic !== null && ic > 0.2) {
      parts.push('Strong predictive power');
    }

    if (hitRate !== null && hitRate > 60) {
      parts.push('Good directional accuracy');
    } else if (hitRate !== null && hitRate < 45) {
      parts.push('Poor directional accuracy');
    }

    if (stability?.stability === 'Highly Variable') {
      parts.push(`Only use in ${stability.bestRegime || 'specific'} regime`);
    }

    if (decay?.decayInterpretation?.includes('Fast decay')) {
      parts.push('Use for short-term trades only');
    } else if (decay?.decayInterpretation?.includes('Improves')) {
      parts.push('Best for longer holding periods');
    }

    return parts.length > 0 ? parts.join('. ') : 'Standard performance';
  }

  _calculateOverallHealth(signalHealth) {
    const scores = Object.values(signalHealth).map(s => s.healthScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    let status = 'Unknown';
    if (avg >= 65) {
      status = 'System Healthy';
    } else if (avg >= 50) {
      status = 'System Moderate';
    } else if (avg >= 35) {
      status = 'System Needs Attention';
    } else {
      status = 'System Critical';
    }

    return {
      averageScore: Math.round(avg),
      status,
      healthyCount: Object.values(signalHealth).filter(s => s.status === 'Healthy').length,
      weakCount: Object.values(signalHealth).filter(s => ['Weak', 'Critical'].includes(s.status)).length,
    };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  _calculateCorrelation(x, y) {
    const n = x.length;
    if (n < 2) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return den !== 0 ? num / den : 0;
  }

  _calculateTStat(correlation, n) {
    if (n < 3 || Math.abs(correlation) >= 1) return 0;
    return correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
  }

  // ============================================
  // RECALCULATION JOB
  // ============================================

  /**
   * Recalculate all signal performance metrics (for scheduler)
   */
  recalculateAll() {
    console.log('📊 Recalculating signal performance metrics...');

    const results = {
      timestamp: new Date().toISOString(),
      icDecay: this.getICDecay(180),
      regimeStability: this.getRegimeStability(365),
      healthReport: this.getSignalHealthReport(180),
    };

    // Store summary in database for historical tracking
    this._storePerformanceSummary(results);

    return results;
  }

  _storePerformanceSummary(results) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO signal_performance_history (
          calculated_at,
          lookback_days,
          total_samples,
          overall_health_score,
          overall_status,
          top_signals,
          weak_signals,
          full_report
        ) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)
      `);

      const health = results.healthReport;

      stmt.run(
        180,
        health.totalSamples || 0,
        health.overallHealth?.averageScore || 0,
        health.overallHealth?.status || 'Unknown',
        JSON.stringify(health.topSignals || []),
        JSON.stringify(health.weakSignals || []),
        JSON.stringify(results)
      );
    } catch (e) {
      // Table may not exist yet - that's OK
      console.log('Note: signal_performance_history table not found, skipping storage');
    }
  }

  /**
   * Get historical performance trends
   */
  getHistoricalTrends(days = 90) {
    try {
      const rows = this.db.prepare(`
        SELECT
          date(calculated_at) as date,
          overall_health_score,
          overall_status,
          top_signals,
          weak_signals
        FROM signal_performance_history
        WHERE calculated_at >= datetime('now', ? || ' days')
        ORDER BY calculated_at ASC
      `).all(`-${days}`);

      return rows.map(r => ({
        date: r.date,
        healthScore: r.overall_health_score,
        status: r.overall_status,
        topSignals: JSON.parse(r.top_signals || '[]'),
        weakSignals: JSON.parse(r.weak_signals || '[]'),
      }));
    } catch (e) {
      return { error: 'No historical data available' };
    }
  }
}

module.exports = { SignalPerformanceTracker };
