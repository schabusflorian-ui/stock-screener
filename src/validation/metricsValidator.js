/**
 * Metrics Validator
 *
 * Compares our calculated metrics against Yahoo Finance data
 * to validate accuracy and identify discrepancies.
 */

const SampleSelector = require('./sampleSelector');
const YahooFetcher = require('./yahooFetcher');

class MetricsValidator {
  constructor(db, options = {}) {
    this.db = db;
    this.fetcher = new YahooFetcher(options);
    this.selector = new SampleSelector(db);

    // Tolerance thresholds for each metric (as relative percentage)
    // e.g., 15 means 15% relative difference is acceptable
    this.tolerances = {
      // Profitability - these should match closely
      roe: 20,                // Can vary due to timing/averaging
      roa: 20,
      gross_margin: 5,        // Should be very close
      operating_margin: 8,
      net_margin: 10,

      // Liquidity - should match well
      current_ratio: 10,
      quick_ratio: 15,        // More variance in calculation

      // Leverage - can vary significantly due to lease treatment
      debt_to_equity: 25,

      // Valuation - depends on price timing
      pe_ratio: 15,
      pb_ratio: 20,
      ps_ratio: 15,

      // Growth - can vary due to period differences
      earnings_growth: 30,
      revenue_growth: 20,
    };

    // Metrics to validate (in order of importance)
    this.metricsToValidate = [
      'gross_margin',
      'operating_margin',
      'net_margin',
      'roe',
      'roa',
      'current_ratio',
      'quick_ratio',
      'debt_to_equity',
      'pe_ratio',
      'pb_ratio',
      'revenue_growth',
      'earnings_growth',
    ];
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

  /**
   * Run full validation
   * @param {Object} options - Validation options
   * @returns {Object} Validation results
   */
  async runValidation(options = {}) {
    const {
      onProgress = () => {},
      sampleSize = 40,
      includeRaw = false,
      useTTM = false,  // Use TTM (last 4 quarters) instead of annual
    } = options;

    console.log('\n1. Selecting sample companies...');
    const sample = await this.selector.selectSample({ targetSize: sampleSize });
    await this.selector.printSampleDistribution(sample);

    const estimatedTime = this.fetcher.estimateTime(sample.length);
    const modeLabel = useTTM ? 'TTM (quarterly)' : 'Annual';
    console.log(`\n2. Fetching Yahoo Finance data (est. ${estimatedTime.seconds}s)...`);
    console.log(`   Comparison mode: ${modeLabel}`);

    const results = {
      timestamp: new Date().toISOString(),
      sampleSize: sample.length,
      comparisonMode: useTTM ? 'ttm' : 'annual',
      companies: [],
      byMetric: {},
      issues: [],
      warnings: [],
    };

    // Initialize metric aggregators
    for (const metric of this.metricsToValidate) {
      results.byMetric[metric] = {
        exact: 0,
        close: 0,
        acceptable: 0,
        concerning: 0,
        major: 0,
        missing: 0,
        diffs: [],
        comparisons: [],
      };
    }

    // Fetch and compare each company
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sample.length; i++) {
      const symbol = sample[i];

      // Fetch Yahoo data
      const yahoo = await this.fetcher.fetchMetrics(symbol);

      if (!yahoo.success) {
        failCount++;
        results.warnings.push({
          symbol,
          type: 'fetch_error',
          message: yahoo.error,
        });
        onProgress({ current: i + 1, total: sample.length, symbol, success: false });
        continue;
      }

      // Get our data (TTM or annual depending on mode)
      const ours = await this.getOurMetrics(symbol, useTTM);

      if (!ours) {
        failCount++;
        results.warnings.push({
          symbol,
          type: 'no_data',
          message: 'No metrics found in our database',
        });
        onProgress({ current: i + 1, total: sample.length, symbol, success: false });
        continue;
      }

      // Get company sector for metric filtering
      const companyInfo = await this._queryOne('SELECT sector FROM companies WHERE symbol = ?', [symbol]);
      const sector = companyInfo?.sector || null;

      // Compare metrics
      const comparison = this.compareMetrics(symbol, ours, yahoo.data, sector);
      results.companies.push(comparison);

      // Aggregate results
      this.aggregateResults(comparison, results);

      successCount++;
      onProgress({ current: i + 1, total: sample.length, symbol, success: true });
    }

    console.log(`\n3. Analyzed ${successCount} companies (${failCount} failed)`);

    // Generate summary
    results.summary = this.generateSummary(results);
    results.overallAccuracy = this.calculateOverallAccuracy(results);

    return results;
  }

  /**
   * Get our calculated metrics for a company
   * @param {string} symbol - Stock symbol
   * @param {boolean} useTTM - If true, calculate TTM from last 4 quarters
   */
  async getOurMetrics(symbol, useTTM = false) {
    if (useTTM) {
      return this.getTTMMetrics(symbol);
    }

    let result = await this._queryOne(`
      SELECT m.*, c.symbol
      FROM calculated_metrics m
      JOIN companies c ON c.id = m.company_id
      WHERE c.symbol = ?
        AND m.period_type = 'annual'
      ORDER BY m.fiscal_year DESC
      LIMIT 1
    `, [symbol]);

    if (!result) {
      result = await this._queryOne(`
        SELECT m.*, c.symbol
        FROM calculated_metrics m
        JOIN companies c ON c.id = m.company_id
        WHERE c.symbol = ?
        ORDER BY m.fiscal_period DESC
        LIMIT 1
      `, [symbol]);
    }

    if (result) {
      result.revenue_growth = result.revenue_growth_yoy;
      result.earnings_growth = result.earnings_growth_yoy;
    }

    return result;
  }

  /**
   * Calculate TTM (Trailing Twelve Months) metrics from quarterly data
   * For margin metrics: average of last 4 quarters (or weighted by revenue)
   * For ratios (current, quick, D/E): use most recent quarter (point-in-time)
   * For ROE/ROA: use TTM income / average equity or assets
   */
  async getTTMMetrics(symbol) {
    const quarters = await this._query(`
      SELECT m.*, c.symbol
      FROM calculated_metrics m
      JOIN companies c ON c.id = m.company_id
      WHERE c.symbol = ?
        AND m.period_type = 'quarterly'
      ORDER BY m.fiscal_period DESC
      LIMIT 4
    `, [symbol]);

    const arr = Array.isArray(quarters) ? quarters : [];

    if (arr.length < 4) {
      return this.getOurMetrics(symbol, false);
    }

    const latest = arr[0];

    const avg = (key) => {
      const values = arr.map(q => q[key]).filter(v => v != null);
      if (values.length === 0) return null;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    return {
      symbol: latest.symbol,
      company_id: latest.company_id,
      fiscal_period: latest.fiscal_period,
      fiscal_year: latest.fiscal_year,
      period_type: 'ttm',

      // Margin metrics - average of 4 quarters
      gross_margin: avg('gross_margin'),
      operating_margin: avg('operating_margin'),
      net_margin: avg('net_margin'),

      // Return metrics - average (simplified; ideally would use TTM income / avg equity)
      roe: avg('roe'),
      roa: avg('roa'),
      roic: avg('roic'),

      // Point-in-time ratios - use most recent quarter
      current_ratio: latest.current_ratio,
      quick_ratio: latest.quick_ratio,
      debt_to_equity: latest.debt_to_equity,

      // Valuation - use latest
      pe_ratio: latest.pe_ratio,
      pb_ratio: latest.pb_ratio,
      ps_ratio: latest.ps_ratio,

      // Growth - use latest (map from _yoy fields)
      revenue_growth: latest.revenue_growth_yoy,
      earnings_growth: latest.earnings_growth_yoy,

      _ttm_quarters: arr.length,
      _latest_quarter: latest.fiscal_period,
    };
  }

  /**
   * Compare our metrics against Yahoo
   * @param {string} symbol - Stock symbol
   * @param {Object} ours - Our calculated metrics
   * @param {Object} yahoo - Yahoo Finance metrics
   * @param {string} sector - Company sector (optional, for skipping irrelevant metrics)
   */
  compareMetrics(symbol, ours, yahoo, sector = null) {
    const metrics = [];

    // Financial sector companies (banks, insurance) don't have traditional gross margins
    const financialSectors = ['Finance', 'Insurance', 'Financial Services', 'Banks'];
    const isFinancial = sector && financialSectors.some(s =>
      sector.toLowerCase().includes(s.toLowerCase())
    );

    for (const metric of this.metricsToValidate) {
      // Skip gross_margin for financial sector companies
      if (metric === 'gross_margin' && isFinancial) {
        metrics.push({
          metric,
          ours: null,
          yahoo: null,
          diff: null,
          status: 'skipped_financial',
        });
        continue;
      }

      const ourVal = ours[metric];
      const yahooVal = yahoo[metric];

      // Skip if either value is missing
      if (ourVal == null && yahooVal == null) {
        metrics.push({
          metric,
          ours: null,
          yahoo: null,
          diff: null,
          status: 'missing',
        });
        continue;
      }

      if (ourVal == null) {
        metrics.push({
          metric,
          ours: null,
          yahoo: yahooVal,
          diff: null,
          status: 'missing_ours',
        });
        continue;
      }

      if (yahooVal == null) {
        metrics.push({
          metric,
          ours: ourVal,
          yahoo: null,
          diff: null,
          status: 'missing_yahoo',
        });
        continue;
      }

      // Calculate difference
      const diff = Math.abs(ourVal - yahooVal);
      const relativeDiff = yahooVal !== 0
        ? (diff / Math.abs(yahooVal)) * 100
        : (ourVal !== 0 ? 100 : 0);

      const tolerance = this.tolerances[metric] || 20;

      // Determine status
      let status;
      if (relativeDiff < 2) {
        status = 'exact';
      } else if (relativeDiff < 5) {
        status = 'close';
      } else if (relativeDiff < tolerance) {
        status = 'acceptable';
      } else if (relativeDiff < tolerance * 2) {
        status = 'concerning';
      } else {
        status = 'major';
      }

      metrics.push({
        metric,
        ours: ourVal,
        yahoo: yahooVal,
        diff: relativeDiff,
        absoluteDiff: diff,
        status,
      });
    }

    // Calculate overall match score
    const validMetrics = metrics.filter(m => m.diff != null);
    const matchScore = validMetrics.length > 0
      ? validMetrics.filter(m => ['exact', 'close', 'acceptable'].includes(m.status)).length / validMetrics.length
      : 0;

    return {
      symbol,
      fiscalYear: ours.fiscal_year,
      metrics,
      matchScore,
    };
  }

  /**
   * Aggregate comparison results
   */
  aggregateResults(comparison, results) {
    for (const m of comparison.metrics) {
      const metricData = results.byMetric[m.metric];
      if (!metricData) continue;

      if (m.status === 'missing' || m.status === 'missing_ours' || m.status === 'missing_yahoo') {
        metricData.missing++;
        continue;
      }

      // Skip metrics that were excluded for valid reasons (e.g., gross_margin for financials)
      if (m.status === 'skipped_financial') {
        continue;
      }

      metricData[m.status]++;
      if (m.diff != null) {
        metricData.diffs.push(m.diff);
        metricData.comparisons.push({
          symbol: comparison.symbol,
          ours: m.ours,
          yahoo: m.yahoo,
          diff: m.diff,
        });
      }

      // Track issues
      if (m.status === 'concerning' || m.status === 'major') {
        results.issues.push({
          symbol: comparison.symbol,
          metric: m.metric,
          ours: m.ours,
          yahoo: m.yahoo,
          diff: m.diff,
          status: m.status,
        });
      }
    }
  }

  /**
   * Generate summary statistics
   */
  generateSummary(results) {
    const summary = {};

    for (const [metric, data] of Object.entries(results.byMetric)) {
      const total = data.exact + data.close + data.acceptable + data.concerning + data.major;

      if (total === 0) {
        summary[metric] = {
          accuracy: 'N/A',
          avgDiff: 'N/A',
          medianDiff: 'N/A',
          status: '?',
          sampleSize: 0,
        };
        continue;
      }

      const accurate = data.exact + data.close + data.acceptable;
      const accuracyPct = (accurate / total) * 100;

      // Calculate average and median diff
      const avgDiff = data.diffs.length > 0
        ? data.diffs.reduce((a, b) => a + b, 0) / data.diffs.length
        : 0;

      const sortedDiffs = [...data.diffs].sort((a, b) => a - b);
      const medianDiff = sortedDiffs.length > 0
        ? sortedDiffs[Math.floor(sortedDiffs.length / 2)]
        : 0;

      summary[metric] = {
        accuracy: `${accuracyPct.toFixed(1)}%`,
        avgDiff: `${avgDiff.toFixed(1)}%`,
        medianDiff: `${medianDiff.toFixed(1)}%`,
        status: accuracyPct >= 85 ? 'pass' : accuracyPct >= 70 ? 'warn' : 'fail',
        statusIcon: accuracyPct >= 85 ? '\u2705' : accuracyPct >= 70 ? '\u26A0\uFE0F' : '\u274C',
        sampleSize: total,
        breakdown: {
          exact: data.exact,
          close: data.close,
          acceptable: data.acceptable,
          concerning: data.concerning,
          major: data.major,
        },
      };
    }

    return summary;
  }

  /**
   * Calculate overall accuracy score
   */
  calculateOverallAccuracy(results) {
    let totalAccurate = 0;
    let totalCompared = 0;

    for (const data of Object.values(results.byMetric)) {
      const total = data.exact + data.close + data.acceptable + data.concerning + data.major;
      const accurate = data.exact + data.close + data.acceptable;

      totalAccurate += accurate;
      totalCompared += total;
    }

    return totalCompared > 0
      ? ((totalAccurate / totalCompared) * 100).toFixed(1)
      : 0;
  }

  /**
   * Print formatted report
   */
  printReport(results) {
    console.log('\n' + '='.repeat(70));
    console.log('               METRICS VALIDATION REPORT');
    console.log('='.repeat(70));

    console.log(`\nValidation Date: ${new Date(results.timestamp).toLocaleString()}`);
    console.log(`Companies Sampled: ${results.sampleSize}`);
    console.log(`Companies Analyzed: ${results.companies.length}`);
    console.log(`API Calls Made: ${results.companies.length}`);
    console.log(`Overall Accuracy: ${results.overallAccuracy}%`);

    console.log('\n' + '-'.repeat(70));
    console.log('PER-METRIC ACCURACY');
    console.log('-'.repeat(70));

    console.log(
      'Metric'.padEnd(20) +
      'Accuracy'.padEnd(12) +
      'Avg Diff'.padEnd(12) +
      'Median'.padEnd(10) +
      'N'.padEnd(6) +
      'Status'
    );
    console.log('-'.repeat(70));

    for (const [metric, data] of Object.entries(results.summary)) {
      console.log(
        metric.padEnd(20) +
        data.accuracy.padEnd(12) +
        data.avgDiff.padEnd(12) +
        data.medianDiff.padEnd(10) +
        String(data.sampleSize).padEnd(6) +
        data.statusIcon
      );
    }

    // Print top issues
    if (results.issues.length > 0) {
      console.log('\n' + '-'.repeat(70));
      console.log(`ISSUES FOUND (${results.issues.length} total, showing top 15)`);
      console.log('-'.repeat(70));

      // Sort by diff descending
      const sortedIssues = [...results.issues].sort((a, b) => b.diff - a.diff);

      console.log(
        'Symbol'.padEnd(8) +
        'Metric'.padEnd(18) +
        'Ours'.padEnd(12) +
        'Yahoo'.padEnd(12) +
        'Diff'.padEnd(10) +
        'Status'
      );

      for (const issue of sortedIssues.slice(0, 15)) {
        const statusIcon = issue.status === 'major' ? '\u274C' : '\u26A0\uFE0F';
        console.log(
          issue.symbol.padEnd(8) +
          issue.metric.padEnd(18) +
          (issue.ours?.toFixed(2) || 'N/A').padEnd(12) +
          (issue.yahoo?.toFixed(2) || 'N/A').padEnd(12) +
          `${issue.diff?.toFixed(1)}%`.padEnd(10) +
          statusIcon
        );
      }
    }

    // Warnings
    if (results.warnings.length > 0) {
      console.log('\n' + '-'.repeat(70));
      console.log(`WARNINGS (${results.warnings.length})`);
      console.log('-'.repeat(70));

      for (const warn of results.warnings.slice(0, 10)) {
        console.log(`  ${warn.symbol}: ${warn.message}`);
      }
    }

    console.log('\n' + '='.repeat(70));

    // Overall assessment
    const overallAcc = parseFloat(results.overallAccuracy);
    if (overallAcc >= 85) {
      console.log('\u2705 VALIDATION PASSED - Metrics are highly accurate');
    } else if (overallAcc >= 70) {
      console.log('\u26A0\uFE0F  VALIDATION WARNING - Some metrics may need review');
    } else {
      console.log('\u274C VALIDATION FAILED - Significant discrepancies found');
    }

    console.log('='.repeat(70) + '\n');
  }

  /**
   * Get recommendations based on results
   */
  getRecommendations(results) {
    const recommendations = [];

    for (const [metric, data] of Object.entries(results.summary)) {
      if (data.status === 'fail') {
        recommendations.push({
          priority: 'high',
          metric,
          message: `${metric} has low accuracy (${data.accuracy}). Review calculation methodology.`,
          avgDiff: data.avgDiff,
        });
      } else if (data.status === 'warn') {
        recommendations.push({
          priority: 'medium',
          metric,
          message: `${metric} has moderate accuracy (${data.accuracy}). Consider reviewing edge cases.`,
          avgDiff: data.avgDiff,
        });
      }
    }

    // Check for systematic issues
    const majorIssues = results.issues.filter(i => i.status === 'major');
    if (majorIssues.length > 5) {
      const metricCounts = {};
      for (const issue of majorIssues) {
        metricCounts[issue.metric] = (metricCounts[issue.metric] || 0) + 1;
      }

      for (const [metric, count] of Object.entries(metricCounts)) {
        if (count >= 3) {
          recommendations.push({
            priority: 'high',
            metric,
            message: `${metric} has ${count} major discrepancies. May indicate systematic calculation issue.`,
          });
        }
      }
    }

    return recommendations.sort((a, b) =>
      a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0
    );
  }
}

module.exports = MetricsValidator;
