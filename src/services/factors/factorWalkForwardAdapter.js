// src/services/factors/factorWalkForwardAdapter.js
// Walk-Forward Validation for Custom Factors using IC Analysis

/**
 * FactorWalkForwardAdapter
 *
 * Runs walk-forward validation for custom factor formulas using Information Coefficient (IC).
 *
 * Process:
 * - Split time into train/test windows (e.g., 3 years train, 1 year test)
 * - Calculate IC (Spearman correlation) between factor values and forward returns
 * - Compare in-sample IC vs out-of-sample IC
 * - Calculate walk-forward efficiency (OOS IC / IS IC)
 *
 * Returns:
 * - Per-window metrics (IS IC, OOS IC, WFE)
 * - Aggregate metrics (avg IS IC, avg OOS IC, hit rate, verdict)
 */
class FactorWalkForwardAdapter {
  constructor(db, customFactorCalculator, icAnalysis) {
    this.db = db;
    this.calculator = customFactorCalculator;
    this.icAnalysis = icAnalysis;

    // Prepare SQL statements
    this._prepareStatements();
  }

  _prepareStatements() {
    // Get month-end dates in range
    this.stmtGetMonthEndDates = this.db.prepare(`
      SELECT DISTINCT date
      FROM daily_prices
      WHERE date >= ? AND date <= ?
        AND strftime('%d', date) >= '25'  -- Last week of month
      GROUP BY strftime('%Y-%m', date)
      HAVING date = MAX(date)
      ORDER BY date ASC
    `);
  }

  /**
   * Run walk-forward validation
   */
  async runWalkForward(factorId, formula, config) {
    const {
      trainYears = 3,
      testYears = 1,
      startYear = 2015,
      endYear = 2026,
      rollingWindow = true,
      horizon = 21  // 21-day forward returns
    } = config;

    console.log(`Running walk-forward validation: ${formula.substring(0, 50)}...`);
    console.log(`Windows: ${trainYears}y train, ${testYears}y test, ${rollingWindow ? 'rolling' : 'anchored'}`);

    // Generate walk-forward periods
    const periods = this.generatePeriods({
      trainYears,
      testYears,
      startYear,
      endYear,
      rollingWindow
    });

    console.log(`Generated ${periods.length} walk-forward windows`);

    // Calculate IC for each window (in parallel for speed)
    const windowResults = await Promise.all(
      periods.map(async (period, idx) => {
        console.log(`  Window ${period.window}: ${period.trainStart}-${period.trainEnd} (train) → ${period.testStart}-${period.testEnd} (test)`);

        try {
          const inSampleIC = await this.calculateICForPeriod(
            formula,
            `${period.trainStart}-01-01`,
            `${period.trainEnd}-12-31`,
            horizon
          );

          const outOfSampleIC = await this.calculateICForPeriod(
            formula,
            `${period.testStart}-01-01`,
            `${period.testEnd}-12-31`,
            horizon
          );

          const wfe = inSampleIC > 0.001 ? outOfSampleIC / inSampleIC : 0;

          console.log(`    IS IC: ${inSampleIC.toFixed(4)}, OOS IC: ${outOfSampleIC.toFixed(4)}, WFE: ${wfe.toFixed(2)}`);

          return {
            window: period.window,
            trainStart: period.trainStart,
            trainEnd: period.trainEnd,
            testStart: period.testStart,
            testEnd: period.testEnd,
            inSampleIC,
            outOfSampleIC,
            wfe,
            stockCount: 500 // approximate
          };
        } catch (err) {
          console.error(`    Error in window ${period.window}:`, err.message);
          return {
            window: period.window,
            trainStart: period.trainStart,
            trainEnd: period.trainEnd,
            testStart: period.testStart,
            testEnd: period.testEnd,
            inSampleIC: 0,
            outOfSampleIC: 0,
            wfe: 0,
            stockCount: 0
          };
        }
      })
    );

    // Calculate summary statistics
    const validWindows = windowResults.filter(w => !isNaN(w.inSampleIC) && !isNaN(w.outOfSampleIC));
    const avgISIC = validWindows.reduce((s, w) => s + w.inSampleIC, 0) / validWindows.length;
    const avgOOSIC = validWindows.reduce((s, w) => s + w.outOfSampleIC, 0) / validWindows.length;
    const avgWFE = avgISIC > 0.001 ? avgOOSIC / avgISIC : 0;
    const oosHitRate = windowResults.filter(w => w.outOfSampleIC > 0).length / windowResults.length;

    console.log(`Walk-forward complete: Avg IS IC=${avgISIC.toFixed(4)}, Avg OOS IC=${avgOOSIC.toFixed(4)}, WFE=${avgWFE.toFixed(2)}`);

    return {
      windows: windowResults,
      summary: {
        avgInSampleIC: avgISIC,
        avgOutOfSampleIC: avgOOSIC,
        walkForwardEfficiency: avgWFE,
        oosHitRate,
        windowCount: windowResults.length
      }
    };
  }

  /**
   * Calculate IC for a specific time period
   * Samples monthly to reduce computation (12 ICs per year vs 252 daily)
   */
  async calculateICForPeriod(formula, startDate, endDate, horizon = 21) {
    // Get month-end dates in this period
    const monthEndDates = this.getMonthEndDates(startDate, endDate);

    if (monthEndDates.length === 0) {
      console.warn(`No month-end dates found between ${startDate} and ${endDate}`);
      return 0;
    }

    const icValues = [];

    for (const date of monthEndDates) {
      try {
        // Calculate factor values at this date
        const factorResult = this.calculator.calculateFactorValues(
          null,
          formula,
          { asOfDate: date, storeResults: false }
        );

        if (factorResult.values.length < 50) {
          // Need minimum 50 stocks for reliable correlation
          continue;
        }

        // Get forward returns (21-day horizon)
        const returns = this.getForwardReturns(
          factorResult.values.map(v => v.company_id),
          date,
          horizon
        );

        // Align factor values with returns
        const aligned = this.alignFactorAndReturns(factorResult.values, returns);

        if (aligned.factors.length < 50) {
          continue;
        }

        // Calculate Spearman rank correlation
        const { correlation } = this.icAnalysis.spearmanCorrelation(
          aligned.factors,
          aligned.returns
        );

        if (!isNaN(correlation)) {
          icValues.push(correlation);
        }

      } catch (err) {
        console.warn(`Error calculating IC for ${date}:`, err.message);
      }
    }

    // Return mean IC across all dates in period
    if (icValues.length === 0) {
      return 0;
    }

    return icValues.reduce((a, b) => a + b, 0) / icValues.length;
  }

  /**
   * Get forward returns for a list of companies
   */
  getForwardReturns(companyIds, asOfDate, horizon) {
    if (companyIds.length === 0) {
      return [];
    }

    // Build placeholders for SQL IN clause
    const placeholders = companyIds.map(() => '?').join(',');

    const stmt = this.db.prepare(`
      SELECT
        c.id as company_id,
        (p2.adjusted_close - p1.adjusted_close) / p1.adjusted_close * 100 as forward_return
      FROM companies c
      JOIN daily_prices p1 ON c.id = p1.company_id
      JOIN daily_prices p2 ON c.id = p2.company_id
      WHERE c.id IN (${placeholders})
        AND p1.date = (SELECT MAX(date) FROM daily_prices WHERE company_id = c.id AND date <= ?)
        AND p2.date = (
          SELECT MIN(date) FROM daily_prices
          WHERE company_id = c.id
            AND date > date((SELECT MAX(date) FROM daily_prices WHERE company_id = c.id AND date <= ?), '+' || ? || ' days')
        )
        AND p1.adjusted_close > 0
        AND p2.adjusted_close > 0
    `);

    try {
      return stmt.all(...companyIds, asOfDate, asOfDate, horizon);
    } catch (err) {
      console.error('Error getting forward returns:', err.message);
      return [];
    }
  }

  /**
   * Align factor values with forward returns by company_id
   */
  alignFactorAndReturns(factorValues, returns) {
    const returnMap = new Map();

    for (const r of returns) {
      if (r.forward_return !== null && !isNaN(r.forward_return)) {
        returnMap.set(r.company_id, r.forward_return);
      }
    }

    const aligned = { factors: [], returns: [] };

    for (const fv of factorValues) {
      if (returnMap.has(fv.company_id) && fv.zscoreValue !== null && !isNaN(fv.zscoreValue)) {
        aligned.factors.push(fv.zscoreValue);
        aligned.returns.push(returnMap.get(fv.company_id));
      }
    }

    return aligned;
  }

  /**
   * Get month-end trading dates in a range
   */
  getMonthEndDates(startDate, endDate) {
    const rows = this.stmtGetMonthEndDates.all(startDate, endDate);
    return rows.map(r => r.date);
  }

  /**
   * Generate walk-forward periods
   */
  generatePeriods(config) {
    const { trainYears, testYears, startYear, endYear, rollingWindow } = config;
    const periods = [];
    let currentYear = startYear;
    let windowNum = 1;

    while (currentYear + trainYears + testYears <= endYear) {
      periods.push({
        window: windowNum,
        trainStart: currentYear,
        trainEnd: currentYear + trainYears - 1,
        testStart: currentYear + trainYears,
        testEnd: currentYear + trainYears + testYears - 1
      });

      if (rollingWindow) {
        // Rolling: advance by test period
        currentYear += testYears;
      } else {
        // Anchored: train always starts from beginning
        currentYear += trainYears;
      }

      windowNum++;
    }

    return periods;
  }
}

module.exports = FactorWalkForwardAdapter;
