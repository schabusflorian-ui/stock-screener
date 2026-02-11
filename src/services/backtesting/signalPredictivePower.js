// src/services/backtesting/signalPredictivePower.js
// Signal Predictive Power Analyzer
// Measures and ranks the predictive power of each signal type

const { getDatabaseAsync } = require('../../lib/db');
const {
  calculateIC,
  calculateICIR,
  calculateHitRate,
  spearmanCorrelation
} = require('./icAnalysis');

const SIGNAL_TYPES = ['technical', 'fundamental', 'sentiment', 'insider', 'valuation', 'factor'];
const HORIZONS = [1, 5, 21, 63]; // days
const REGIMES = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'];

/**
 * SignalPredictivePowerAnalyzer
 * Analyzes the predictive power of each signal type across different horizons and regimes
 */
class SignalPredictivePowerAnalyzer {
  constructor() {
    this.database = null;
  }

  async _ensureDatabase() {
    if (!this.database) {
      this.database = await getDatabaseAsync();
    }
    return this.database;
  }

  /**
   * Run full predictive power analysis for all signal types
   */
  async analyzeAllSignals(startDate, endDate) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 SIGNAL PREDICTIVE POWER ANALYSIS');
    console.log('='.repeat(70));
    console.log(`Period: ${startDate} to ${endDate}`);

    const results = {
      analysisDate: new Date().toISOString(),
      period: { startDate, endDate },
      signals: {},
      rankings: {},
      correlations: null
    };

    // Analyze each signal type
    for (const signalType of SIGNAL_TYPES) {
      console.log(`\nAnalyzing ${signalType} signal...`);
      results.signals[signalType] = await this.analyzeSignalType(signalType, startDate, endDate);
    }

    // Generate rankings for each regime
    for (const regime of REGIMES) {
      results.rankings[regime] = this._rankSignalsByCompositeScore(results.signals, regime);
    }

    // Calculate signal correlations
    results.correlations = await this._calculateSignalCorrelations(startDate, endDate);

    // Print summary
    this._printSummary(results);

    return results;
  }

  /**
   * Analyze a single signal type across all horizons and regimes
   */
  async analyzeSignalType(signalType, startDate, endDate) {
    const result = {
      signalType,
      horizons: {},
      regimes: {},
      overallIC: null,
      overallHitRate: null,
      decayHalfLife: null,
      optimalHorizon: null
    };

    // Get signal and return data
    const data = await this._getSignalData(signalType, startDate, endDate);

    if (data.length < 30) {
      console.log(`  ⚠️ Insufficient data for ${signalType} (${data.length} samples)`);
      return result;
    }

    // Analyze by horizon
    for (const horizon of HORIZONS) {
      const horizonKey = `${horizon}d`;
      result.horizons[horizonKey] = this._analyzeHorizon(data, horizon);
    }

    // Find optimal horizon (highest IC)
    const horizonICs = Object.entries(result.horizons)
      .filter(([_, h]) => h.ic !== null)
      .map(([key, h]) => ({ horizon: key, ic: h.ic }));

    if (horizonICs.length > 0) {
      result.optimalHorizon = horizonICs.reduce((best, h) => h.ic > best.ic ? h : best);
    }

    // Calculate decay half-life
    result.decayHalfLife = this._calculateDecayHalfLife(result.horizons);

    // Analyze by regime
    for (const regime of REGIMES) {
      const regimeData = regime === 'ALL' ? data : data.filter(d => d.regime === regime);
      if (regimeData.length >= 20) {
        result.regimes[regime] = this._analyzeHorizon(regimeData, 21); // Use 21-day horizon for regime analysis
        result.regimes[regime].sampleSize = regimeData.length;

        // Store in database
        await this._storeResult(signalType, 21, result.regimes[regime], regime, startDate, endDate);
      }
    }

    // Overall metrics (using 21-day horizon)
    result.overallIC = result.horizons['21d']?.ic || null;
    result.overallHitRate = result.horizons['21d']?.hitRate || null;

    return result;
  }

  /**
   * Get signal and forward return data for a signal type
   */
  async _getSignalData(signalType, startDate, endDate) {
    // Try to get from recommendation_outcomes first (uses overall signal_score)
    // Then we'll use synthetic signals based on signal type
    let data = [];

    try {
      // First try overall recommendation outcomes
      const database = await this._ensureDatabase();
      const outcomes = await database.query(`
        SELECT
          ro.symbol,
          DATE(ro.recommended_at) as date,
          ro.action as signal_type,
          ro.signal_score as signal_value,
          ro.return_5d as forward_return_5d,
          ro.return_21d as forward_return_21d,
          ro.return_63d as forward_return_63d,
          ro.regime as regime
        FROM recommendation_outcomes ro
        WHERE DATE(ro.recommended_at) >= $1
          AND DATE(ro.recommended_at) <= $2
          AND ro.return_21d IS NOT NULL
        ORDER BY ro.recommended_at ASC
      `, [startDate, endDate]);

      if (outcomes.rows.length > 0 && signalType === 'overall') {
        data = outcomes.rows.map(o => ({
          symbol: o.symbol,
          date: o.date,
          signal: o.signal_value,
          return5d: o.forward_return_5d,
          return21d: o.forward_return_21d,
          return63d: o.forward_return_63d,
          regime: o.regime || 'ALL'
        }));
      }
    } catch (e) {
      // Table might not exist, continue to synthetic data
    }

    // Generate synthetic signals from metrics for specific signal types
    if (data.length === 0) {
      data = await this._generateSyntheticSignalData(signalType, startDate, endDate);
    }

    return data;
  }

  /**
   * Generate synthetic signal data from available metrics
   */
  async _generateSyntheticSignalData(signalType, startDate, endDate) {
    const data = [];
    const database = await this._ensureDatabase();

    // Get price data first
    const prices = {};
    try {
      const priceResult = await database.query(`
        SELECT
          c.symbol,
          dp.date,
          dp.close as price
        FROM daily_prices dp
        JOIN companies c ON dp.company_id = c.id
        WHERE dp.date >= $1
          AND dp.date <= $2
        ORDER BY dp.date ASC
      `, [startDate, endDate]);

      for (const row of priceResult.rows) {
        if (!prices[row.symbol]) prices[row.symbol] = [];
        prices[row.symbol].push({ date: row.date, price: row.price });
      }
    } catch (e) {
      console.log(`  Warning: Could not load price data: ${e.message}`);
      return data;
    }

    // Get metrics and generate signals
    try {
      const metricsResult = await database.query(`
        SELECT
          c.symbol,
          cm.fiscal_period as date,
          cm.pe_ratio,
          cm.pb_ratio,
          cm.roe,
          cm.roic,
          cm.net_margin,
          cm.revenue_growth_yoy as revenue_growth,
          cm.debt_to_equity
        FROM calculated_metrics cm
        JOIN companies c ON cm.company_id = c.id
        WHERE cm.fiscal_period >= $1
          AND cm.fiscal_period <= $2
        ORDER BY cm.fiscal_period ASC
      `, [startDate, endDate]);

      // Group by symbol and date
      const grouped = new Map();
      for (const m of metricsResult.rows) {
        const key = `${m.symbol}_${m.date}`;
        grouped.set(key, m);
      }

      // Generate signal values based on signal type
      for (const [key, m] of grouped) {
        const signal = this._calculateSignalValue(signalType, m);
        if (signal === null) continue;

        const symbolPrices = prices[m.symbol];
        if (!symbolPrices || symbolPrices.length < 64) continue;

        // Find price index for this date
        const dateIdx = symbolPrices.findIndex(p => p.date === m.date);
        if (dateIdx < 0 || dateIdx + 63 >= symbolPrices.length) continue;

        // Calculate forward returns
        const currentPrice = symbolPrices[dateIdx].price;
        const return5d = (symbolPrices[dateIdx + 5]?.price / currentPrice - 1) || null;
        const return21d = (symbolPrices[dateIdx + 21]?.price / currentPrice - 1) || null;
        const return63d = (symbolPrices[dateIdx + 63]?.price / currentPrice - 1) || null;

        if (return21d === null) continue;

        // Get regime for this date
        let regime = 'ALL';
        try {
          const regimeResult = await database.query(`
            SELECT regime
            FROM market_regime_history
            WHERE date <= $1
            ORDER BY date DESC
            LIMIT 1
          `, [m.date]);

          if (regimeResult.rows.length > 0) regime = regimeResult.rows[0].regime;
        } catch (e) {
          // Ignore
        }

        data.push({
          symbol: m.symbol,
          date: m.date,
          signal,
          return5d,
          return21d,
          return63d,
          regime
        });
      }
    } catch (e) {
      console.log(`  Warning: Could not generate synthetic data: ${e.message}`);
    }

    return data;
  }

  /**
   * Calculate signal value based on signal type and metrics
   */
  _calculateSignalValue(signalType, metrics) {
    switch (signalType) {
      case 'fundamental':
        // Higher ROE, margins, growth = positive signal
        const roe = metrics.roe || 0;
        const margin = metrics.net_margin || 0;
        const growth = metrics.revenue_growth || 0;
        return (roe * 2 + margin + growth) / 4; // Normalize to ~[-1, 1]

      case 'valuation':
        // Lower PE, PB = positive signal (value)
        const pe = metrics.pe_ratio;
        const pb = metrics.pb_ratio;
        if (!pe || !pb) return null;
        // Invert: lower = better
        return -((pe - 20) / 20 + (pb - 3) / 3) / 2;

      case 'technical':
        // Placeholder - would need price data for RSI, MAs
        return null;

      case 'sentiment':
        // Placeholder - would need sentiment data
        return null;

      case 'insider':
        // Placeholder - would need insider data
        return null;

      case 'factor':
        // Quality factor from fundamentals
        const roic = metrics.roic || 0;
        const de = metrics.debt_to_equity || 1;
        return (roic - de * 0.1); // Quality = high ROIC, low debt

      default:
        return null;
    }
  }

  /**
   * Analyze IC and hit rate for a specific horizon
   */
  _analyzeHorizon(data, horizon) {
    const returnKey = horizon <= 5 ? 'return5d' :
                      horizon <= 21 ? 'return21d' : 'return63d';

    const signals = data.map(d => d.signal).filter(s => s !== null);
    const returns = data.map(d => d[returnKey]).filter(r => r !== null);

    if (signals.length < 20 || signals.length !== returns.length) {
      return {
        ic: null,
        icIR: null,
        tStat: null,
        pValue: null,
        hitRate: null,
        hitRateCI: [null, null],
        significant: false,
        sampleSize: signals.length
      };
    }

    // Calculate IC using Spearman correlation
    const { correlation: ic, tStat, pValue } = spearmanCorrelation(signals, returns);

    // Calculate hit rate
    const hitRateResult = calculateHitRate(signals, returns, 0);

    // Calculate IC Information Ratio (rolling IC stability)
    // For simplicity, use single IC value here
    const icIR = Math.abs(tStat) / Math.sqrt(signals.length);

    // Composite score: weighted combination of IC, hit rate, and stability
    const compositeScore = this._calculateCompositeScore(ic, hitRateResult.hitRate, icIR, pValue);

    return {
      ic,
      icIR,
      tStat,
      pValue,
      hitRate: hitRateResult.hitRate,
      hitRateCI: hitRateResult.confInterval,
      significant: pValue < 0.05,
      compositeScore,
      sampleSize: signals.length
    };
  }

  /**
   * Calculate composite predictive power score
   */
  _calculateCompositeScore(ic, hitRate, icIR, pValue) {
    if (ic === null || hitRate === null) return 0;

    // Weight components:
    // - IC: 40% (raw predictive power)
    // - Hit rate excess: 20% (directional accuracy above 50%)
    // - IC stability (icIR): 30% (consistency)
    // - Significance: 10% (statistical confidence)

    const icScore = Math.min(Math.max(ic * 10, -1), 1); // Normalize IC to [-1, 1]
    const hitRateExcess = (hitRate - 0.5) * 2; // Excess over 50%, normalized
    const stabilityScore = Math.min(icIR, 1); // Cap at 1
    const significanceScore = pValue < 0.01 ? 1 : pValue < 0.05 ? 0.7 : pValue < 0.1 ? 0.4 : 0.1;

    return icScore * 0.4 + hitRateExcess * 0.2 + stabilityScore * 0.3 + significanceScore * 0.1;
  }

  /**
   * Calculate signal decay half-life from horizon results
   */
  _calculateDecayHalfLife(horizons) {
    const icValues = [];
    const horizonDays = [];

    for (const [key, data] of Object.entries(horizons)) {
      if (data.ic !== null && data.ic > 0) {
        const days = parseInt(key);
        icValues.push(Math.log(data.ic));
        horizonDays.push(days);
      }
    }

    if (icValues.length < 2) return null;

    // Linear regression on log(IC) vs horizon
    const n = icValues.length;
    const sumX = horizonDays.reduce((a, b) => a + b, 0);
    const sumY = icValues.reduce((a, b) => a + b, 0);
    const sumXY = horizonDays.reduce((acc, x, i) => acc + x * icValues[i], 0);
    const sumX2 = horizonDays.reduce((acc, x) => acc + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Half-life = -ln(2) / slope
    return slope !== 0 ? Math.abs(-Math.log(2) / slope) : null;
  }

  /**
   * Rank signals by composite score for a regime
   */
  _rankSignalsByCompositeScore(signals, regime) {
    const rankings = [];

    for (const [signalType, data] of Object.entries(signals)) {
      const regimeData = data.regimes[regime] || data.regimes['ALL'];
      if (!regimeData) continue;

      rankings.push({
        signalType,
        compositeScore: regimeData.compositeScore || 0,
        ic: regimeData.ic,
        hitRate: regimeData.hitRate,
        decayHalfLife: data.decayHalfLife,
        optimalHorizon: data.optimalHorizon?.horizon,
        sampleSize: regimeData.sampleSize
      });
    }

    // Sort by composite score descending
    rankings.sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));

    // Add rank
    rankings.forEach((r, i) => r.rank = i + 1);

    return rankings;
  }

  /**
   * Calculate correlation matrix between signal types
   */
  async _calculateSignalCorrelations(startDate, endDate) {
    const matrix = {};
    const warnings = [];

    // For each pair of signal types, calculate correlation
    for (let i = 0; i < SIGNAL_TYPES.length; i++) {
      matrix[SIGNAL_TYPES[i]] = {};

      for (let j = 0; j < SIGNAL_TYPES.length; j++) {
        if (i === j) {
          matrix[SIGNAL_TYPES[i]][SIGNAL_TYPES[j]] = 1.0;
          continue;
        }

        // Get aligned signal data
        const data1 = await this._getSignalData(SIGNAL_TYPES[i], startDate, endDate);
        const data2 = await this._getSignalData(SIGNAL_TYPES[j], startDate, endDate);

        // Align by symbol and date
        const aligned = this._alignSignalData(data1, data2);

        if (aligned.signals1.length < 20) {
          matrix[SIGNAL_TYPES[i]][SIGNAL_TYPES[j]] = null;
          continue;
        }

        const { correlation } = spearmanCorrelation(aligned.signals1, aligned.signals2);
        matrix[SIGNAL_TYPES[i]][SIGNAL_TYPES[j]] = correlation;

        // Warn about high correlations
        if (i < j && Math.abs(correlation) > 0.7) {
          warnings.push({
            signal1: SIGNAL_TYPES[i],
            signal2: SIGNAL_TYPES[j],
            correlation
          });
        }
      }
    }

    return { matrix, warnings };
  }

  /**
   * Align two signal datasets by symbol and date
   */
  _alignSignalData(data1, data2) {
    const map2 = new Map();
    for (const d of data2) {
      map2.set(`${d.symbol}_${d.date}`, d.signal);
    }

    const signals1 = [];
    const signals2 = [];

    for (const d of data1) {
      const key = `${d.symbol}_${d.date}`;
      if (map2.has(key) && d.signal !== null) {
        signals1.push(d.signal);
        signals2.push(map2.get(key));
      }
    }

    return { signals1, signals2 };
  }

  /**
   * Store result in database
   */
  async _storeResult(signalType, horizon, data, regime, startDate, endDate) {
    try {
      const database = await this._ensureDatabase();
      await database.query(`
        INSERT INTO signal_predictive_power (
          signal_type, horizon_days, ic, ic_ir, t_stat, p_value,
          hit_rate, hit_rate_ci_lower, hit_rate_ci_upper,
          decay_half_life, sample_size, regime, composite_score,
          rank_in_regime, start_date, end_date, calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
        ON CONFLICT (signal_type, horizon_days, regime, start_date, end_date)
        DO UPDATE SET
          ic = $3,
          ic_ir = $4,
          t_stat = $5,
          p_value = $6,
          hit_rate = $7,
          hit_rate_ci_lower = $8,
          hit_rate_ci_upper = $9,
          decay_half_life = $10,
          sample_size = $11,
          composite_score = $13,
          calculated_at = CURRENT_TIMESTAMP
      `, [
        signalType,
        horizon,
        data.ic,
        data.icIR,
        data.tStat,
        data.pValue,
        data.hitRate,
        data.hitRateCI?.[0],
        data.hitRateCI?.[1],
        null, // decay half-life stored at signal level
        data.sampleSize,
        regime,
        data.compositeScore,
        null, // rank updated later
        startDate,
        endDate
      ]);
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Print summary of analysis
   */
  _printSummary(results) {
    console.log('\n' + '='.repeat(70));
    console.log('📈 SIGNAL PREDICTIVE POWER SUMMARY');
    console.log('='.repeat(70));

    console.log('\n📊 Overall Ranking (21-day horizon, ALL regimes):');
    console.log('-'.repeat(70));
    console.log('Rank  Signal        IC       Hit Rate  Decay    Composite');
    console.log('-'.repeat(70));

    const ranking = results.rankings['ALL'] || [];
    for (const r of ranking) {
      const ic = r.ic !== null ? r.ic.toFixed(4) : 'N/A';
      const hitRate = r.hitRate !== null ? (r.hitRate * 100).toFixed(1) + '%' : 'N/A';
      const decay = r.decayHalfLife !== null ? r.decayHalfLife.toFixed(0) + 'd' : 'N/A';
      const composite = r.compositeScore !== null ? r.compositeScore.toFixed(3) : 'N/A';

      console.log(
        `${r.rank.toString().padStart(4)}  ` +
        `${r.signalType.padEnd(12)}  ` +
        `${ic.padStart(7)}  ` +
        `${hitRate.padStart(8)}  ` +
        `${decay.padStart(6)}  ` +
        `${composite.padStart(9)}`
      );
    }

    // Correlation warnings
    if (results.correlations?.warnings?.length > 0) {
      console.log('\n⚠️ High Signal Correlations (>0.7):');
      for (const w of results.correlations.warnings) {
        console.log(`  ${w.signal1} <-> ${w.signal2}: ${w.correlation.toFixed(3)}`);
      }
      console.log('  Consider combining or removing redundant signals');
    }

    console.log('\n' + '='.repeat(70));
  }

  /**
   * Get stored predictive power results
   */
  async getStoredResults(signalType = null, regime = 'ALL') {
    const database = await this._ensureDatabase();
    let sql = `
      SELECT *
      FROM signal_predictive_power
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (signalType) {
      sql += ` AND signal_type = $${paramCount}`;
      params.push(signalType);
      paramCount++;
    }

    if (regime !== 'ALL') {
      sql += ` AND regime = $${paramCount}`;
      params.push(regime);
      paramCount++;
    }

    sql += ' ORDER BY composite_score DESC';

    const result = await database.query(sql, params);
    return result.rows;
  }
}

module.exports = { SignalPredictivePowerAnalyzer, SIGNAL_TYPES, HORIZONS, REGIMES };
