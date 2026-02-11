// src/services/validation/signalValidator.js
// Validates signal performance using aggregated_signals and daily_prices data
// Supports both SQLite and PostgreSQL (async)

class SignalValidator {
  constructor(db) {
    this.db = db;
    this.SIGNAL_TYPES = ['technical', 'sentiment', 'insider', 'analyst'];
    this.HORIZONS = { '1d': 1, '5d': 5, '21d': 21, '63d': 63 };
  }

  async _query(sql, params = []) {
    const result = await this.db.query(sql, params);
    return result?.rows ?? result;
  }

  async _queryOne(sql, params = []) {
    const rows = await this._query(sql, params);
    const arr = Array.isArray(rows) ? rows : [];
    return arr[0] || null;
  }

  async _getSignalsWithReturns(lookbackDays) {
    // Use datetime('now', ? || ' days') - converted to Postgres by db layer
    const param = `-${lookbackDays}`;
    const rows = await this._query(`
      SELECT
        s.id, s.company_id, s.symbol, s.calculated_at, s.market_regime,
        s.technical_score, s.sentiment_score, s.insider_score, s.analyst_score,
        s.avg_score, s.weighted_score, s.overall_signal,
        p0.close as price_at_signal,
        p1.close as price_1d, p5.close as price_5d, p21.close as price_21d, p63.close as price_63d
      FROM aggregated_signals s
      JOIN daily_prices p0 ON p0.company_id = s.company_id
        AND p0.date = (SELECT MAX(date) FROM daily_prices WHERE company_id = s.company_id AND date <= (s.calculated_at AT TIME ZONE 'UTC')::date)
      LEFT JOIN daily_prices p1 ON p1.company_id = s.company_id
        AND p1.date = (SELECT MIN(date) FROM daily_prices WHERE company_id = s.company_id AND date > (s.calculated_at AT TIME ZONE 'UTC')::date + INTERVAL '1 day')
      LEFT JOIN daily_prices p5 ON p5.company_id = s.company_id
        AND p5.date = (SELECT MIN(date) FROM daily_prices WHERE company_id = s.company_id AND date > (s.calculated_at AT TIME ZONE 'UTC')::date + INTERVAL '5 days')
      LEFT JOIN daily_prices p21 ON p21.company_id = s.company_id
        AND p21.date = (SELECT MIN(date) FROM daily_prices WHERE company_id = s.company_id AND date > (s.calculated_at AT TIME ZONE 'UTC')::date + INTERVAL '21 days')
      LEFT JOIN daily_prices p63 ON p63.company_id = s.company_id
        AND p63.date = (SELECT MIN(date) FROM daily_prices WHERE company_id = s.company_id AND date > (s.calculated_at AT TIME ZONE 'UTC')::date + INTERVAL '63 days')
      WHERE s.calculated_at >= NOW() - (ABS(?::integer) || ' days')::interval
        AND p0.close IS NOT NULL
      ORDER BY s.calculated_at DESC
    `, [param]);

    const arr = Array.isArray(rows) ? rows : [];
    return arr.map(row => ({
      ...row,
      return_1d: row.price_1d && row.price_at_signal ? (row.price_1d - row.price_at_signal) / row.price_at_signal : null,
      return_5d: row.price_5d && row.price_at_signal ? (row.price_5d - row.price_at_signal) / row.price_at_signal : null,
      return_21d: row.price_21d && row.price_at_signal ? (row.price_21d - row.price_at_signal) / row.price_at_signal : null,
      return_63d: row.price_63d && row.price_at_signal ? (row.price_63d - row.price_at_signal) / row.price_at_signal : null,
    }));
  }

  async getSignalHealthReport(lookbackDays = 180) {
    const signals = await this._getSignalsWithReturns(lookbackDays);
    if (signals.length < 20) {
      return { error: 'Insufficient data', sampleSize: signals.length, minRequired: 20, message: `Need at least 20 signals with price data. Found ${signals.length}.` };
    }

    const signalHealth = {};
    for (const signalType of this.SIGNAL_TYPES) {
      const scoreField = `${signalType}_score`;
      const validSignals = signals.filter(s => s[scoreField] !== null);
      if (validSignals.length < 15) {
        signalHealth[signalType] = { status: 'INSUFFICIENT_DATA', sampleSize: validSignals.length };
        continue;
      }
      const ic1d = this._calculateIC(validSignals, scoreField, 'return_1d');
      const ic5d = this._calculateIC(validSignals, scoreField, 'return_5d');
      const ic21d = this._calculateIC(validSignals, scoreField, 'return_21d');
      const ic63d = this._calculateIC(validSignals, scoreField, 'return_63d');
      const hitRate21d = this._calculateHitRate(validSignals, scoreField, 'return_21d');
      let healthScore = 50;
      if (ic21d !== null) healthScore += Math.min(30, ic21d * 100);
      if (hitRate21d !== null) healthScore += Math.min(20, (hitRate21d - 50) * 1.5);
      let status = 'UNKNOWN';
      if (healthScore >= 65) status = 'HEALTHY';
      else if (healthScore >= 50) status = 'MODERATE';
      else if (healthScore >= 35) status = 'WEAK';
      else status = 'CRITICAL';
      signalHealth[signalType] = {
        status,
        healthScore: Math.round(Math.max(0, Math.min(100, healthScore))),
        ic_1d: ic1d, ic_5d: ic5d, ic_21d: ic21d, ic_63d: ic63d,
        hitRate: hitRate21d ? hitRate21d / 100 : null,
        coverage: validSignals.length / signals.length,
        sampleSize: validSignals.length
      };
    }

    const overallHealth = this._calculateOverallHealth(signalHealth);
    const latestRegime = await this._queryOne(`
      SELECT market_regime, regime_confidence FROM aggregated_signals
      WHERE market_regime IS NOT NULL ORDER BY calculated_at DESC LIMIT 1
    `);

    return {
      lookbackDays,
      totalSamples: signals.length,
      signals: signalHealth,
      overallHealth,
      overallStatus: overallHealth.status,
      avgIC: this._calculateAverageIC(signalHealth),
      currentRegime: latestRegime?.market_regime || 'Unknown',
      ranking: this._getRanking(signalHealth),
      topSignals: Object.entries(signalHealth).filter(([, d]) => d.status === 'HEALTHY').map(([s]) => s),
      weakSignals: Object.entries(signalHealth).filter(([, d]) => ['WEAK', 'CRITICAL'].includes(d.status)).map(([s]) => s)
    };
  }

  async getICDecay(lookbackDays = 180) {
    const signals = await this._getSignalsWithReturns(lookbackDays);
    if (signals.length < 20) return { error: 'Insufficient data', sampleSize: signals.length };

    const results = {};
    for (const signalType of this.SIGNAL_TYPES) {
      const scoreField = `${signalType}_score`;
      const validSignals = signals.filter(s => s[scoreField] !== null);
      if (validSignals.length < 15) continue;
      const horizons = {};
      for (const [label] of Object.entries(this.HORIZONS)) {
        const returnField = `return_${label}`;
        const ic = this._calculateIC(validSignals, scoreField, returnField);
        const tStat = ic !== null ? this._calculateTStat(ic, validSignals.length) : null;
        horizons[label] = {
          ic: ic !== null ? Math.round(ic * 1000) / 1000 : null,
          tStat: tStat !== null ? Math.round(tStat * 100) / 100 : null,
          significant: tStat !== null && Math.abs(tStat) > 2,
          sampleSize: validSignals.filter(s => s[returnField] !== null).length
        };
      }
      const ic1d = horizons['1d']?.ic, ic63d = horizons['63d']?.ic;
      let decayRate = (ic1d !== null && ic63d !== null && ic1d !== 0) ? ic63d / ic1d : null;
      results[signalType] = {
        ...horizons,
        decayRate: decayRate !== null ? Math.round(decayRate * 100) / 100 : null,
        optimalHorizon: this._findOptimalHorizon(horizons)
      };
    }
    return { lookbackDays, totalSamples: signals.length, data: results };
  }

  async getHitRatesByPeriod(lookbackDays = 180) {
    const signals = await this._getSignalsWithReturns(lookbackDays);
    if (signals.length < 20) return { error: 'Insufficient data', sampleSize: signals.length };

    const results = {};
    for (const signalType of this.SIGNAL_TYPES) {
      const scoreField = `${signalType}_score`;
      const validSignals = signals.filter(s => s[scoreField] !== null);
      if (validSignals.length < 15) continue;
      const periods = {};
      for (const label of Object.keys(this.HORIZONS)) {
        const returnField = `return_${label}`;
        const hitRate = this._calculateHitRate(validSignals, scoreField, returnField);
        const strongSignals = validSignals.filter(s => Math.abs(s[scoreField]) > 0.3);
        const strongHitRate = this._calculateHitRate(strongSignals, scoreField, returnField);
        periods[label] = {
          hitRate: hitRate !== null ? hitRate / 100 : null,
          strongSignalHitRate: strongHitRate !== null ? strongHitRate / 100 : null,
          total: validSignals.filter(s => s[returnField] !== null).length,
          strongSignalTotal: strongSignals.filter(s => s[returnField] !== null).length
        };
      }
      results[signalType] = periods;
    }
    return { lookbackDays, totalSamples: signals.length, data: results };
  }

  async getRegimeStability(lookbackDays = 365) {
    const signals = await this._getSignalsWithReturns(lookbackDays);
    const regimeRows = await this._query(`
      SELECT market_regime, COUNT(*) as count FROM aggregated_signals
      WHERE calculated_at >= NOW() - (ABS(?::integer) || ' days')::interval AND market_regime IS NOT NULL
      GROUP BY market_regime
    `, [`-${lookbackDays}`]);
    const regimeCounts = Array.isArray(regimeRows) ? regimeRows : [];

    if (signals.length < 30) return { error: 'Insufficient data', sampleSize: signals.length };

    const results = {};
    const regimes = [...new Set(signals.map(s => s.market_regime).filter(Boolean))];
    for (const signalType of this.SIGNAL_TYPES) {
      const scoreField = `${signalType}_score`;
      const regimeICs = {};
      for (const regime of regimes) {
        const regimeSignals = signals.filter(s => s.market_regime === regime && s[scoreField] !== null);
        if (regimeSignals.length >= 10) {
          const ic = this._calculateIC(regimeSignals, scoreField, 'return_21d');
          regimeICs[regime] = { ic: ic !== null ? Math.round(ic * 1000) / 1000 : null, sampleSize: regimeSignals.length };
        } else {
          regimeICs[regime] = { ic: null, sampleSize: regimeSignals.length };
        }
      }
      const validICs = Object.values(regimeICs).filter(r => r.ic !== null).map(r => r.ic);
      let stability = 'Unknown';
      if (validICs.length >= 2) {
        const mean = validICs.reduce((a, b) => a + b, 0) / validICs.length;
        const variance = validICs.reduce((sum, ic) => sum + Math.pow(ic - mean, 2), 0) / validICs.length;
        const cv = mean !== 0 ? Math.abs(Math.sqrt(variance) / mean) : Infinity;
        if (cv < 0.3) stability = 'Highly Stable';
        else if (cv < 0.6) stability = 'Moderately Stable';
        else if (cv < 1.0) stability = 'Regime Dependent';
        else stability = 'Highly Variable';
      }
      results[signalType] = { regimes: regimeICs, stability };
    }
    return {
      lookbackDays,
      totalSamples: signals.length,
      regimeCounts: Object.fromEntries(regimeCounts.map(r => [r.market_regime, r.count])),
      data: results
    };
  }

  async getRollingICTrend(signalType, windowDays = 60, stepDays = 7, lookbackDays = 365) {
    const signals = await this._getSignalsWithReturns(lookbackDays);
    const scoreField = `${signalType}_score`;
    const validSignals = signals
      .filter(s => s[scoreField] !== null && s.return_21d !== null)
      .sort((a, b) => new Date(a.calculated_at) - new Date(b.calculated_at));

    if (validSignals.length < windowDays) return { error: 'Insufficient data', sampleSize: validSignals.length };

    const dataPoints = [];
    for (let i = windowDays; i < validSignals.length; i += stepDays) {
      const windowData = validSignals.slice(Math.max(0, i - windowDays), i);
      if (windowData.length >= 20) {
        const ic = this._calculateIC(windowData, scoreField, 'return_21d');
        if (ic !== null) {
          dataPoints.push({
            date: windowData[windowData.length - 1].calculated_at?.toString().split('T')[0] || '',
            ic: Math.round(ic * 1000) / 1000,
            sampleSize: windowData.length
          });
        }
      }
    }

    let trend = 'Stable';
    if (dataPoints.length >= 5) {
      const recentIC = dataPoints.slice(-3).reduce((sum, d) => sum + d.ic, 0) / 3;
      const earlyIC = dataPoints.slice(0, 3).reduce((sum, d) => sum + d.ic, 0) / 3;
      const change = recentIC - earlyIC;
      if (change > 0.03) trend = 'Improving';
      else if (change < -0.03) trend = 'Degrading';
    }

    return {
      signalType, windowDays, lookbackDays, dataPoints, trend,
      currentIC: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].ic : null,
      avgIC: dataPoints.length > 0 ? Math.round((dataPoints.reduce((sum, d) => sum + d.ic, 0) / dataPoints.length) * 1000) / 1000 : null
    };
  }

  async recalculateAll() {
    console.log('📊 Recalculating signal validation metrics...');
    const healthReport = await this.getSignalHealthReport(180);
    const results = {
      timestamp: new Date().toISOString(),
      healthReport,
      icDecay: await this.getICDecay(180),
      hitRates: await this.getHitRatesByPeriod(180),
      regimeStability: await this.getRegimeStability(365)
    };
    console.log(`✅ Validation complete. ${results.healthReport.totalSamples || 0} signals analyzed.`);
    return results;
  }

  _calculateIC(signals, scoreField, returnField) {
    const pairs = signals.filter(s => s[scoreField] !== null && s[returnField] !== null).map(s => ({ score: s[scoreField], return: s[returnField] }));
    if (pairs.length < 15) return null;
    return this._correlation(pairs.map(p => p.score), pairs.map(p => p.return));
  }

  _calculateHitRate(signals, scoreField, returnField) {
    const validSignals = signals.filter(s => s[scoreField] !== null && s[returnField] !== null);
    if (validSignals.length < 10) return null;
    let correct = 0;
    for (const s of validSignals) {
      const predictedDirection = s[scoreField] > 0 ? 1 : -1;
      const actualDirection = s[returnField] > 0 ? 1 : -1;
      if (predictedDirection === actualDirection) correct++;
    }
    return Math.round((correct / validSignals.length) * 1000) / 10;
  }

  _correlation(x, y) {
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

  _findOptimalHorizon(horizons) {
    let maxIC = -Infinity, optimal = null;
    for (const [horizon, data] of Object.entries(horizons)) {
      if (data.ic !== null && data.significant && data.ic > maxIC) { maxIC = data.ic; optimal = horizon; }
    }
    return optimal;
  }

  _calculateOverallHealth(signalHealth) {
    const scores = Object.values(signalHealth).filter(s => s.healthScore !== undefined).map(s => s.healthScore);
    if (scores.length === 0) return { averageScore: 0, status: 'Unknown', healthyCount: 0, weakCount: 0 };
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    let status = 'Unknown';
    if (avg >= 60) status = 'HEALTHY';
    else if (avg >= 45) status = 'MODERATE';
    else if (avg >= 30) status = 'NEEDS_ATTENTION';
    else status = 'CRITICAL';
    return {
      averageScore: Math.round(avg),
      status,
      healthyCount: Object.values(signalHealth).filter(s => s.status === 'HEALTHY').length,
      weakCount: Object.values(signalHealth).filter(s => ['WEAK', 'CRITICAL'].includes(s.status)).length
    };
  }

  _calculateAverageIC(signalHealth) {
    const ics = Object.values(signalHealth).filter(s => s.ic_21d !== null).map(s => s.ic_21d);
    return ics.length === 0 ? 0 : ics.reduce((a, b) => a + b, 0) / ics.length;
  }

  _getRanking(signalHealth) {
    return Object.entries(signalHealth)
      .filter(([, d]) => d.healthScore !== undefined)
      .sort((a, b) => b[1].healthScore - a[1].healthScore)
      .map(([signal, data]) => ({ signal, score: data.healthScore, status: data.status }));
  }
}

module.exports = { SignalValidator };
