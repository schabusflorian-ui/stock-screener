// src/services/mlops/tcaResultsManager.js
// TCA Benchmark Results Manager - Persists and retrieves TCA benchmark results

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

class TCAResultsManager {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  /**
   * Save benchmark results to database
   * @param {Object} results - Results from TCABenchmark.runBenchmark()
   * @param {Object} options - Additional options
   * @returns {Object} Saved record with ID
   */
  async saveResults(results, options = {}) {
    const database = await getDatabaseAsync();

    const runDate = options.runDate || new Date().toISOString().split('T')[0];
    const runType = options.runType || 'manual';
    const notes = options.notes || null;

    const summary = results.summary || {};
    const passFail = results.passFail || {};

    // Determine if synthetic data was used
    const syntheticData = results.trades?.[0]?.synthetic ? 1 : 0;

    const result = await database.query(`
      INSERT INTO tca_benchmark_results (
        run_date, run_type, overall_pass, pass_rate, trade_count, synthetic_data,
        is_mean, is_median, is_std, is_p95, is_pass, is_threshold,
        vwap_mean, vwap_median, vwap_std, vwap_p95, vwap_pass, vwap_threshold,
        impact_mean, impact_median, impact_std, impact_p95, impact_pass, impact_threshold,
        spread_mean, spread_median, spread_std, spread_pass, spread_threshold,
        by_liquidity_tier, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29,
        $30, $31
      )
      RETURNING id
    `, [
      runDate,
      runType,
      results.overallPass ? 1 : 0,
      results.passRate || 0,
      results.trades?.length || summary.totalTrades || 0,
      syntheticData,

      // Implementation Shortfall
      summary.implementationShortfall?.mean,
      summary.implementationShortfall?.median,
      summary.implementationShortfall?.std,
      summary.implementationShortfall?.p95,
      passFail.implementationShortfall?.pass ? 1 : 0,
      passFail.implementationShortfall?.threshold,

      // VWAP Deviation
      summary.vwapDeviation?.mean,
      summary.vwapDeviation?.median,
      summary.vwapDeviation?.std,
      summary.vwapDeviation?.p95,
      passFail.vwapDeviation?.pass ? 1 : 0,
      passFail.vwapDeviation?.threshold,

      // Market Impact
      summary.marketImpact?.mean,
      summary.marketImpact?.median,
      summary.marketImpact?.std,
      summary.marketImpact?.p95,
      passFail.marketImpact?.pass ? 1 : 0,
      passFail.marketImpact?.threshold,

      // Spread Cost
      summary.spreadCost?.mean,
      summary.spreadCost?.median,
      summary.spreadCost?.std,
      passFail.spreadCost?.pass ? 1 : 0,
      passFail.spreadCost?.threshold,

      // Liquidity tier breakdown
      JSON.stringify(results.byLiquidityTier || {}),
      notes
    ]);

    return {
      id: result.rows[0].id,
      runDate,
      runType,
      overallPass: results.overallPass,
      passRate: results.passRate
    };
  }

  /**
   * Get the most recent benchmark result
   * @returns {Object|null} Latest result or null
   */
  async getLatest() {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM tca_benchmark_results
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = result.rows[0];
    return row ? this._parseRow(row) : null;
  }

  /**
   * Get results within a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Array} Array of results
   */
  async getByDateRange(startDate, endDate) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM tca_benchmark_results
      WHERE run_date BETWEEN $1 AND $2
      ORDER BY run_date DESC
    `, [startDate, endDate]);
    return result.rows.map(row => this._parseRow(row));
  }

  /**
   * Get recent benchmark results
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of results
   */
  async getRecent(limit = 30) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM tca_benchmark_results
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows.map(row => this._parseRow(row));
  }

  /**
   * Get results by pass/fail status
   * @param {boolean} passed - True for passed, false for failed
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of results
   */
  async getByStatus(passed, limit = 30) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM tca_benchmark_results
      WHERE overall_pass = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [passed ? 1 : 0, limit]);
    return result.rows.map(row => this._parseRow(row));
  }

  /**
   * Get summary statistics over a time period
   * @param {string} period - Date modifier (e.g., '-30 days', '-90 days')
   * @returns {Object} Summary statistics
   */
  async getSummaryStats(period = '-30 days') {
    const database = await getDatabaseAsync();

    // Build dialect-aware date filter
    const dateCondition = isUsingPostgres()
      ? `created_at >= CURRENT_TIMESTAMP + INTERVAL '${period}'`
      : `created_at >= datetime('now', '${period}')`;

    const result = await database.query(`
      SELECT
        COUNT(*) as total_runs,
        SUM(overall_pass) as passed_runs,
        AVG(pass_rate) as avg_pass_rate,
        AVG(is_median) as avg_is_median,
        AVG(vwap_median) as avg_vwap_median,
        AVG(impact_median) as avg_impact_median,
        AVG(spread_median) as avg_spread_median,
        MIN(created_at) as first_run,
        MAX(created_at) as last_run
      FROM tca_benchmark_results
      WHERE ${dateCondition}
    `);
    const row = result.rows[0];

    if (!row || row.total_runs === 0) {
      return {
        totalRuns: 0,
        passedRuns: 0,
        failedRuns: 0,
        passRate: 0,
        averageMetrics: null,
        period
      };
    }

    return {
      totalRuns: row.total_runs,
      passedRuns: row.passed_runs || 0,
      failedRuns: row.total_runs - (row.passed_runs || 0),
      passRate: row.passed_runs / row.total_runs,
      avgPassRate: row.avg_pass_rate,
      averageMetrics: {
        implementationShortfall: row.avg_is_median,
        vwapDeviation: row.avg_vwap_median,
        marketImpact: row.avg_impact_median,
        spreadCost: row.avg_spread_median
      },
      firstRun: row.first_run,
      lastRun: row.last_run,
      period
    };
  }

  /**
   * Get trend data for charting
   * @param {string} period - Date modifier (e.g., '-30 days', '-90 days')
   * @returns {Array} Daily aggregated trend data
   */
  async getTrend(period = '-30 days') {
    const database = await getDatabaseAsync();

    // Build dialect-aware date filter and date function
    const dateCondition = isUsingPostgres()
      ? `run_date >= CURRENT_DATE + INTERVAL '${period}'`
      : `run_date >= date('now', '${period}')`;

    const dateFunction = isUsingPostgres()
      ? `run_date::date`
      : `date(run_date)`;

    const result = await database.query(`
      SELECT
        ${dateFunction} as date,
        AVG(is_median) as is_median,
        AVG(vwap_median) as vwap_median,
        AVG(impact_median) as impact_median,
        AVG(spread_median) as spread_median,
        AVG(pass_rate) as pass_rate,
        COUNT(*) as run_count
      FROM tca_benchmark_results
      WHERE ${dateCondition}
      GROUP BY ${dateFunction}
      ORDER BY date ASC
    `);

    return result.rows.map(row => ({
      date: row.date,
      implementationShortfall: row.is_median,
      vwapDeviation: row.vwap_median,
      marketImpact: row.impact_median,
      spreadCost: row.spread_median,
      passRate: row.pass_rate,
      runCount: row.run_count
    }));
  }

  /**
   * Get comparison between two time periods
   * @param {string} currentPeriod - Current period modifier
   * @param {string} previousPeriod - Previous period modifier
   * @returns {Object} Comparison data
   */
  async getComparison(currentPeriod = '-30 days', previousPeriod = '-60 days') {
    const current = await this.getSummaryStats(currentPeriod);
    const previous = await this.getSummaryStats(previousPeriod);

    const calcChange = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    return {
      current,
      previous,
      changes: current.averageMetrics && previous.averageMetrics ? {
        implementationShortfall: calcChange(
          current.averageMetrics.implementationShortfall,
          previous.averageMetrics.implementationShortfall
        ),
        vwapDeviation: calcChange(
          current.averageMetrics.vwapDeviation,
          previous.averageMetrics.vwapDeviation
        ),
        marketImpact: calcChange(
          current.averageMetrics.marketImpact,
          previous.averageMetrics.marketImpact
        ),
        spreadCost: calcChange(
          current.averageMetrics.spreadCost,
          previous.averageMetrics.spreadCost
        ),
        passRate: calcChange(current.passRate, previous.passRate)
      } : null
    };
  }

  /**
   * Parse database row to structured object
   */
  _parseRow(row) {
    return {
      id: row.id,
      runDate: row.run_date,
      runType: row.run_type,
      overallPass: row.overall_pass === 1,
      passRate: row.pass_rate,
      tradeCount: row.trade_count,
      syntheticData: row.synthetic_data === 1,

      summary: {
        implementationShortfall: {
          mean: row.is_mean,
          median: row.is_median,
          std: row.is_std,
          p95: row.is_p95
        },
        vwapDeviation: {
          mean: row.vwap_mean,
          median: row.vwap_median,
          std: row.vwap_std,
          p95: row.vwap_p95
        },
        marketImpact: {
          mean: row.impact_mean,
          median: row.impact_median,
          std: row.impact_std,
          p95: row.impact_p95
        },
        spreadCost: {
          mean: row.spread_mean,
          median: row.spread_median,
          std: row.spread_std
        }
      },

      passFail: {
        implementationShortfall: {
          pass: row.is_pass === 1,
          threshold: row.is_threshold
        },
        vwapDeviation: {
          pass: row.vwap_pass === 1,
          threshold: row.vwap_threshold
        },
        marketImpact: {
          pass: row.impact_pass === 1,
          threshold: row.impact_threshold
        },
        spreadCost: {
          pass: row.spread_pass === 1,
          threshold: row.spread_threshold
        }
      },

      byLiquidityTier: row.by_liquidity_tier ? JSON.parse(row.by_liquidity_tier) : {},
      notes: row.notes,
      createdAt: row.created_at
    };
  }
}

module.exports = { TCAResultsManager };
