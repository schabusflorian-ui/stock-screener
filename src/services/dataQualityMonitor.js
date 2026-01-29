/**
 * Data Quality Monitor
 *
 * Monitors data freshness, completeness, and integrity for ML training.
 * Reports issues that could affect model performance.
 */

const { getDatabase } = require('../database');

class DataQualityMonitor {
  constructor(database = null) {
    this.db = database || getDatabase();
  }

  /**
   * Run all data quality checks
   */
  runFullAudit() {
    const report = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      issues: [],
      warnings: [],
      metrics: {}
    };

    // Run all checks
    const checks = [
      this.checkDataFreshness(),
      this.checkDataCompleteness(),
      this.checkFeatureCoverage(),
      this.checkOutliers(),
      this.checkSurvivorshipBias(),
      this.checkCrossValidation()
    ];

    for (const check of checks) {
      report.metrics[check.name] = check.metrics;

      if (check.issues) {
        report.issues.push(...check.issues);
      }
      if (check.warnings) {
        report.warnings.push(...check.warnings);
      }
    }

    // Determine overall status
    if (report.issues.length > 0) {
      report.status = 'critical';
    } else if (report.warnings.length > 0) {
      report.status = 'warning';
    }

    return report;
  }

  /**
   * Check data freshness across key tables
   */
  checkDataFreshness() {
    const result = {
      name: 'data_freshness',
      metrics: {},
      issues: [],
      warnings: []
    };

    // Price data freshness - optimized with subquery
    const priceStats = this.db.prepare(`
      WITH latest_prices AS (
        SELECT company_id, MAX(date) as latest_date
        FROM daily_prices
        GROUP BY company_id
      )
      SELECT
        COUNT(*) as total_companies,
        SUM(CASE WHEN latest_date >= date('now', '-1 day') THEN 1 ELSE 0 END) as fresh_1d,
        SUM(CASE WHEN latest_date >= date('now', '-3 day') THEN 1 ELSE 0 END) as fresh_3d,
        SUM(CASE WHEN latest_date >= date('now', '-7 day') THEN 1 ELSE 0 END) as fresh_7d,
        MAX(latest_date) as latest_date
      FROM latest_prices
    `).get();

    result.metrics.prices = {
      total_companies: priceStats.total_companies,
      fresh_1d: priceStats.fresh_1d,
      fresh_3d: priceStats.fresh_3d,
      fresh_7d: priceStats.fresh_7d,
      latest_date: priceStats.latest_date,
      freshness_pct_1d: (priceStats.fresh_1d / priceStats.total_companies * 100).toFixed(1)
    };

    if (priceStats.fresh_1d / priceStats.total_companies < 0.5) {
      result.issues.push({
        type: 'stale_prices',
        message: `Only ${result.metrics.prices.freshness_pct_1d}% of companies have price data from last day`,
        impact: 'ML features will use stale data'
      });
    }

    // Sentiment freshness
    const sentimentStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN sentiment_updated_at >= datetime('now', '-1 hour') THEN 1 END) as fresh_1h,
        COUNT(CASE WHEN sentiment_updated_at >= datetime('now', '-4 hour') THEN 1 END) as fresh_4h,
        COUNT(CASE WHEN sentiment_updated_at >= datetime('now', '-24 hour') THEN 1 END) as fresh_24h,
        MAX(sentiment_updated_at) as latest_update
      FROM companies
      WHERE sentiment_updated_at IS NOT NULL
    `).get();

    result.metrics.sentiment = {
      total: sentimentStats.total,
      fresh_1h: sentimentStats.fresh_1h,
      fresh_4h: sentimentStats.fresh_4h,
      fresh_24h: sentimentStats.fresh_24h,
      latest_update: sentimentStats.latest_update
    };

    if (sentimentStats.fresh_4h < sentimentStats.total * 0.3) {
      result.warnings.push({
        type: 'stale_sentiment',
        message: `Only ${sentimentStats.fresh_4h} of ${sentimentStats.total} companies have sentiment < 4 hours old`,
        impact: 'Sentiment signals may be outdated'
      });
    }

    // Fundamentals freshness
    const fundamentalsStats = this.db.prepare(`
      SELECT
        COUNT(DISTINCT company_id) as total,
        COUNT(DISTINCT CASE WHEN fiscal_period >= date('now', '-90 day') THEN company_id END) as fresh_90d,
        COUNT(DISTINCT CASE WHEN fiscal_period >= date('now', '-180 day') THEN company_id END) as fresh_180d,
        MAX(fiscal_period) as latest_period
      FROM calculated_metrics
    `).get();

    result.metrics.fundamentals = {
      total: fundamentalsStats.total,
      fresh_90d: fundamentalsStats.fresh_90d,
      fresh_180d: fundamentalsStats.fresh_180d,
      latest_period: fundamentalsStats.latest_period
    };

    return result;
  }

  /**
   * Check data completeness (null rates)
   */
  checkDataCompleteness() {
    const result = {
      name: 'data_completeness',
      metrics: {},
      issues: [],
      warnings: []
    };

    // Check key columns for null rates - sample last 90 days for speed
    const priceNulls = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN close IS NULL THEN 1 ELSE 0 END) as null_close,
        SUM(CASE WHEN volume IS NULL OR volume = 0 THEN 1 ELSE 0 END) as null_volume,
        SUM(CASE WHEN adjusted_close IS NULL THEN 1 ELSE 0 END) as null_adj_close
      FROM daily_prices
      WHERE date >= date('now', '-90 day')
    `).get();

    result.metrics.price_nulls = {
      total_rows: priceNulls.total,
      null_close_pct: (priceNulls.null_close / priceNulls.total * 100).toFixed(2),
      null_volume_pct: (priceNulls.null_volume / priceNulls.total * 100).toFixed(2),
      null_adj_close_pct: (priceNulls.null_adj_close / priceNulls.total * 100).toFixed(2)
    };

    if (priceNulls.null_close / priceNulls.total > 0.01) {
      result.issues.push({
        type: 'high_null_rate',
        message: `${result.metrics.price_nulls.null_close_pct}% of close prices are NULL`,
        impact: 'Feature calculation may fail or produce NaN'
      });
    }

    // Check fundamentals completeness
    const fundamentalsNulls = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pe_ratio IS NULL THEN 1 ELSE 0 END) as null_pe,
        SUM(CASE WHEN pb_ratio IS NULL THEN 1 ELSE 0 END) as null_pb,
        SUM(CASE WHEN roe IS NULL THEN 1 ELSE 0 END) as null_roe,
        SUM(CASE WHEN roic IS NULL THEN 1 ELSE 0 END) as null_roic
      FROM calculated_metrics
    `).get();

    result.metrics.fundamental_nulls = {
      total_rows: fundamentalsNulls.total,
      null_pe_pct: (fundamentalsNulls.null_pe / fundamentalsNulls.total * 100).toFixed(2),
      null_pb_pct: (fundamentalsNulls.null_pb / fundamentalsNulls.total * 100).toFixed(2),
      null_roe_pct: (fundamentalsNulls.null_roe / fundamentalsNulls.total * 100).toFixed(2),
      null_roic_pct: (fundamentalsNulls.null_roic / fundamentalsNulls.total * 100).toFixed(2)
    };

    return result;
  }

  /**
   * Check feature coverage for ML
   */
  checkFeatureCoverage() {
    const result = {
      name: 'feature_coverage',
      metrics: {},
      issues: [],
      warnings: []
    };

    // Check how many companies have full feature coverage
    const featureCoverage = this.db.prepare(`
      SELECT
        c.id,
        c.symbol,
        CASE WHEN dp.close IS NOT NULL THEN 1 ELSE 0 END as has_price,
        CASE WHEN cm.pe_ratio IS NOT NULL THEN 1 ELSE 0 END as has_fundamentals,
        CASE WHEN c.sentiment_score IS NOT NULL THEN 1 ELSE 0 END as has_sentiment
      FROM companies c
      LEFT JOIN (
        SELECT company_id, MAX(date) as max_date, close
        FROM daily_prices GROUP BY company_id
      ) dp ON dp.company_id = c.id
      LEFT JOIN (
        SELECT company_id, pe_ratio, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_period DESC) as rn
        FROM calculated_metrics
      ) cm ON cm.company_id = c.id AND cm.rn = 1
      WHERE c.is_active = 1
    `).all();

    const total = featureCoverage.length;
    const withPrice = featureCoverage.filter(c => c.has_price).length;
    const withFundamentals = featureCoverage.filter(c => c.has_fundamentals).length;
    const withSentiment = featureCoverage.filter(c => c.has_sentiment).length;
    const fullCoverage = featureCoverage.filter(c =>
      c.has_price && c.has_fundamentals
    ).length;

    result.metrics = {
      total_active_companies: total,
      with_price_pct: (withPrice / total * 100).toFixed(1),
      with_fundamentals_pct: (withFundamentals / total * 100).toFixed(1),
      with_sentiment_pct: (withSentiment / total * 100).toFixed(1),
      full_coverage_pct: (fullCoverage / total * 100).toFixed(1),
      full_coverage_count: fullCoverage
    };

    if (fullCoverage / total < 0.5) {
      result.warnings.push({
        type: 'low_feature_coverage',
        message: `Only ${result.metrics.full_coverage_pct}% of active companies have price+fundamentals coverage`,
        impact: 'ML models may train on limited data'
      });
    }

    return result;
  }

  /**
   * Check for outliers in key metrics
   */
  checkOutliers() {
    const result = {
      name: 'outliers',
      metrics: {},
      issues: [],
      warnings: []
    };

    // Check for extreme price movements - sample recent data
    const extremePrices = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM daily_prices
      WHERE date >= date('now', '-7 day')
        AND ABS((close - open) / NULLIF(open, 0)) > 0.5
    `).get();

    result.metrics.extreme_price_moves = extremePrices.count;

    // Check for extreme PE ratios
    const extremePE = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pe_ratio > 1000 OR pe_ratio < -100 THEN 1 ELSE 0 END) as extreme
      FROM calculated_metrics
    `).get();

    result.metrics.extreme_pe_ratios = {
      total: extremePE.total,
      extreme: extremePE.extreme,
      pct: (extremePE.extreme / extremePE.total * 100).toFixed(2)
    };

    if (extremePE.extreme / extremePE.total > 0.05) {
      result.warnings.push({
        type: 'extreme_outliers',
        message: `${result.metrics.extreme_pe_ratios.pct}% of PE ratios are extreme outliers`,
        impact: 'May need to winsorize or cap features'
      });
    }

    // Check for extreme ROIC values in calculated_metrics (should be clamped to -200% to 300%)
    const extremeROIC = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN roic > 300 OR roic < -200 THEN 1 ELSE 0 END) as extreme
      FROM calculated_metrics
      WHERE roic IS NOT NULL
    `).get();

    result.metrics.extreme_roic = {
      total: extremeROIC.total,
      extreme: extremeROIC.extreme || 0,
      pct: extremeROIC.total > 0 ? ((extremeROIC.extreme || 0) / extremeROIC.total * 100).toFixed(2) : '0.00'
    };

    if (extremeROIC.extreme > 0) {
      result.issues.push({
        severity: 'HIGH',
        type: 'EXTREME_ROIC_CALCULATED',
        message: `${extremeROIC.extreme} ROIC values exceed bounds (-200% to 300%) in calculated_metrics`,
        recommendation: 'Check metricCalculator.js clampAllMetrics() is being applied'
      });
    }

    // Check for extreme ROIC in XBRL metrics table (stored as decimals: -2 to 3)
    try {
      const extremeXBRLRoic = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN roic > 3 OR roic < -2 THEN 1 ELSE 0 END) as extreme
        FROM xbrl_fundamental_metrics
        WHERE roic IS NOT NULL
      `).get();

      result.metrics.extreme_xbrl_roic = {
        total: extremeXBRLRoic.total,
        extreme: extremeXBRLRoic.extreme || 0,
        pct: extremeXBRLRoic.total > 0 ? ((extremeXBRLRoic.extreme || 0) / extremeXBRLRoic.total * 100).toFixed(2) : '0.00'
      };

      if (extremeXBRLRoic.extreme > 0) {
        result.issues.push({
          severity: 'HIGH',
          type: 'EXTREME_ROIC_XBRL',
          message: `${extremeXBRLRoic.extreme} ROIC values exceed bounds in xbrl_fundamental_metrics`,
          recommendation: 'Check xbrlParser.js invested capital calculation thresholds'
        });
      }
    } catch (e) {
      // Table may not exist in all installations
    }

    // Check for unit mismatches in financial_data (operating income > total assets)
    try {
      const unitMismatches = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM financial_data
        WHERE operating_income > 0 AND total_assets > 0
          AND operating_income / total_assets > 10
      `).get();

      result.metrics.unit_mismatches = unitMismatches.count;

      if (unitMismatches.count > 0) {
        result.issues.push({
          severity: 'HIGH',
          type: 'UNIT_MISMATCH',
          message: `${unitMismatches.count} records have operating income > 10x total assets (likely unit mismatch)`,
          recommendation: 'Run data correction to null out corrupted balance sheet fields'
        });
      }
    } catch (e) {
      // Table structure may vary
    }

    return result;
  }

  /**
   * Check for survivorship bias indicators
   */
  checkSurvivorshipBias() {
    const result = {
      name: 'survivorship_bias',
      metrics: {},
      issues: [],
      warnings: []
    };

    // Count inactive companies (using is_active flag)
    const delistedStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_companies,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive
      FROM companies
    `).get();

    result.metrics = {
      total_companies: delistedStats.total_companies,
      active_companies: delistedStats.total_companies - delistedStats.inactive,
      inactive_companies: delistedStats.inactive,
      inactive_pct: (delistedStats.inactive / delistedStats.total_companies * 100).toFixed(2)
    };

    // Check if training data includes inactive companies
    const inactiveWithData = this.db.prepare(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM companies c
      JOIN daily_prices dp ON dp.company_id = c.id
      WHERE c.is_active = 0
        AND dp.date >= date('now', '-365 day')
    `).get();

    result.metrics.inactive_with_recent_data = inactiveWithData.count;

    if (inactiveWithData.count === 0 && delistedStats.inactive > 0) {
      result.warnings.push({
        type: 'survivorship_bias',
        message: `${delistedStats.inactive} inactive companies may be excluded from training`,
        impact: 'Models may overfit to survivors, underestimate risk of failures'
      });
    }

    return result;
  }

  /**
   * Check data consistency for cross-validation
   */
  checkCrossValidation() {
    const result = {
      name: 'cross_validation_readiness',
      metrics: {},
      issues: [],
      warnings: []
    };

    // Check temporal coverage
    const dateRange = this.db.prepare(`
      SELECT
        MIN(date) as min_date,
        MAX(date) as max_date,
        COUNT(DISTINCT date) as trading_days,
        JULIANDAY(MAX(date)) - JULIANDAY(MIN(date)) as total_days
      FROM daily_prices
    `).get();

    result.metrics.date_range = {
      start: dateRange.min_date,
      end: dateRange.max_date,
      trading_days: dateRange.trading_days,
      total_days: Math.round(dateRange.total_days)
    };

    // Check for gaps
    const gaps = this.db.prepare(`
      WITH dates AS (
        SELECT DISTINCT date FROM daily_prices
        WHERE date >= date('now', '-365 day')
        ORDER BY date
      )
      SELECT COUNT(*) as gap_count
      FROM (
        SELECT
          date,
          LAG(date) OVER (ORDER BY date) as prev_date,
          JULIANDAY(date) - JULIANDAY(LAG(date) OVER (ORDER BY date)) as days_diff
        FROM dates
      )
      WHERE days_diff > 4
    `).get();

    result.metrics.data_gaps = gaps.gap_count;

    if (gaps.gap_count > 5) {
      result.warnings.push({
        type: 'data_gaps',
        message: `Found ${gaps.gap_count} gaps > 4 days in price data`,
        impact: 'May affect time-series features and walk-forward validation'
      });
    }

    // Check sample size per symbol - limit to 1 year
    const sampleSizes = this.db.prepare(`
      SELECT
        MIN(cnt) as min_samples,
        MAX(cnt) as max_samples,
        AVG(cnt) as avg_samples,
        COUNT(*) as symbol_count
      FROM (
        SELECT company_id, COUNT(*) as cnt
        FROM daily_prices
        WHERE date >= date('now', '-365 day')
        GROUP BY company_id
      )
    `).get();

    result.metrics.sample_sizes = {
      min: sampleSizes.min_samples,
      max: sampleSizes.max_samples,
      avg: Math.round(sampleSizes.avg_samples),
      symbols: sampleSizes.symbol_count
    };

    if (sampleSizes.min_samples < 60) {
      result.warnings.push({
        type: 'insufficient_samples',
        message: `Some symbols have only ${sampleSizes.min_samples} samples (need 60+ for sequence creation)`,
        impact: 'Some companies will be excluded from training'
      });
    }

    return result;
  }

  /**
   * Get summary for display
   */
  getSummary() {
    const report = this.runFullAudit();

    let summary = `\n${'='.repeat(60)}\n`;
    summary += `  DATA QUALITY REPORT - ${report.timestamp.split('T')[0]}\n`;
    summary += `${'='.repeat(60)}\n\n`;
    summary += `Status: ${report.status.toUpperCase()}\n\n`;

    // Issues
    if (report.issues.length > 0) {
      summary += `CRITICAL ISSUES (${report.issues.length}):\n`;
      for (const issue of report.issues) {
        summary += `  ❌ ${issue.type}: ${issue.message}\n`;
        summary += `     Impact: ${issue.impact}\n`;
      }
      summary += '\n';
    }

    // Warnings
    if (report.warnings.length > 0) {
      summary += `WARNINGS (${report.warnings.length}):\n`;
      for (const warning of report.warnings) {
        summary += `  ⚠️  ${warning.type}: ${warning.message}\n`;
        summary += `     Impact: ${warning.impact}\n`;
      }
      summary += '\n';
    }

    // Key metrics
    summary += 'KEY METRICS:\n';

    if (report.metrics.data_freshness) {
      const df = report.metrics.data_freshness;
      summary += `  Price Data: ${df.prices.fresh_1d}/${df.prices.total_companies} companies fresh (<1 day)\n`;
      summary += `  Sentiment: ${df.sentiment.fresh_4h}/${df.sentiment.total} companies fresh (<4 hours)\n`;
    }

    if (report.metrics.feature_coverage) {
      const fc = report.metrics.feature_coverage;
      summary += `  Price+Fundamentals: ${fc.full_coverage_count} companies (${fc.full_coverage_pct}%)\n`;
    }

    if (report.metrics.survivorship_bias) {
      const sb = report.metrics.survivorship_bias;
      summary += `  Inactive Companies: ${sb.inactive_companies} (${sb.inactive_pct}%)\n`;
    }

    if (report.metrics.cross_validation_readiness) {
      const cv = report.metrics.cross_validation_readiness;
      summary += `  Date Range: ${cv.date_range.start} to ${cv.date_range.end}\n`;
      summary += `  Trading Days: ${cv.date_range.trading_days}\n`;
      summary += `  Avg Samples/Symbol: ${cv.sample_sizes.avg}\n`;
    }

    summary += `\n${'='.repeat(60)}\n`;

    return summary;
  }
}

// CLI
if (require.main === module) {
  const monitor = new DataQualityMonitor();

  const args = process.argv.slice(2);

  if (args.includes('--json')) {
    const report = monitor.runFullAudit();
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(monitor.getSummary());
  }
}

module.exports = DataQualityMonitor;
