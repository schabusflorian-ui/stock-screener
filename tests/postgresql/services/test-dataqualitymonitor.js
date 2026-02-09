/**
 * Tests for DataQualityMonitor service with PostgreSQL async
 */

const { TestResults, testDatabaseConnection, testMethod } = require('../testUtils');

async function runDataQualityMonitorTests() {
  const results = new TestResults('DataQualityMonitor');

  // Test database connection
  await testDatabaseConnection(results);

  // Load service
  const DataQualityMonitor = require('../../../src/services/dataQualityMonitor');
  const monitor = new DataQualityMonitor();

  // Test 1: Service instantiates without database parameter
  await testMethod(results, 'Service instantiates without db parameter', async () => {
    if (!monitor) {
      throw new Error('Service did not instantiate');
    }
    if (monitor.db !== undefined) {
      throw new Error('Service should not have db property');
    }
  });

  // Test 2: runFullAudit() returns complete report
  await testMethod(results, 'runFullAudit() returns complete report', async () => {
    const report = await monitor.runFullAudit();

    if (typeof report !== 'object') {
      throw new Error('Expected report object');
    }
    if (!report.timestamp) {
      throw new Error('Report missing timestamp');
    }
    if (!report.status) {
      throw new Error('Report missing status');
    }
    if (!Array.isArray(report.issues)) {
      throw new Error('Report.issues must be array');
    }
    if (!Array.isArray(report.warnings)) {
      throw new Error('Report.warnings must be array');
    }
    if (typeof report.metrics !== 'object') {
      throw new Error('Report.metrics must be object');
    }

    // Check that all metrics sections exist
    const expectedSections = [
      'data_freshness',
      'data_completeness',
      'feature_coverage',
      'outliers',
      'survivorship_bias',
      'cross_validation_readiness'
    ];

    for (const section of expectedSections) {
      if (!report.metrics[section]) {
        throw new Error(`Report missing metrics section: ${section}`);
      }
    }
  });

  // Test 3: checkDataFreshness() returns freshness metrics
  await testMethod(results, 'checkDataFreshness() returns metrics', async () => {
    const result = await monitor.checkDataFreshness();

    if (result.name !== 'data_freshness') {
      throw new Error('Expected name to be data_freshness');
    }
    if (!result.metrics.prices) {
      throw new Error('Missing prices metrics');
    }
    if (!result.metrics.sentiment) {
      throw new Error('Missing sentiment metrics');
    }
    if (!result.metrics.fundamentals) {
      throw new Error('Missing fundamentals metrics');
    }
    if (!Array.isArray(result.issues)) {
      throw new Error('Issues must be array');
    }
    if (!Array.isArray(result.warnings)) {
      throw new Error('Warnings must be array');
    }
  });

  // Test 4: checkDataCompleteness() returns null rate metrics
  await testMethod(results, 'checkDataCompleteness() returns null rates', async () => {
    const result = await monitor.checkDataCompleteness();

    if (result.name !== 'data_completeness') {
      throw new Error('Expected name to be data_completeness');
    }
    if (!result.metrics.price_nulls) {
      throw new Error('Missing price_nulls metrics');
    }
    if (!result.metrics.fundamental_nulls) {
      throw new Error('Missing fundamental_nulls metrics');
    }
    if (typeof result.metrics.price_nulls.total_rows !== 'number') {
      throw new Error('Expected total_rows to be number');
    }
  });

  // Test 5: checkFeatureCoverage() returns coverage metrics
  await testMethod(results, 'checkFeatureCoverage() returns coverage', async () => {
    const result = await monitor.checkFeatureCoverage();

    if (result.name !== 'feature_coverage') {
      throw new Error('Expected name to be feature_coverage');
    }
    if (typeof result.metrics.total_active_companies !== 'number') {
      throw new Error('Expected total_active_companies to be number');
    }
    if (!result.metrics.with_price_pct) {
      throw new Error('Missing with_price_pct');
    }
    if (!result.metrics.with_fundamentals_pct) {
      throw new Error('Missing with_fundamentals_pct');
    }
    if (!result.metrics.full_coverage_count) {
      throw new Error('Missing full_coverage_count');
    }
  });

  // Test 6: checkOutliers() returns outlier metrics
  await testMethod(results, 'checkOutliers() returns outlier metrics', async () => {
    const result = await monitor.checkOutliers();

    if (result.name !== 'outliers') {
      throw new Error('Expected name to be outliers');
    }
    if (typeof result.metrics.extreme_price_moves !== 'number') {
      throw new Error('Expected extreme_price_moves to be number');
    }
    if (!result.metrics.extreme_pe_ratios) {
      throw new Error('Missing extreme_pe_ratios');
    }
    if (!result.metrics.extreme_roic) {
      throw new Error('Missing extreme_roic');
    }
  });

  // Test 7: checkSurvivorshipBias() returns bias metrics
  await testMethod(results, 'checkSurvivorshipBias() returns bias metrics', async () => {
    const result = await monitor.checkSurvivorshipBias();

    if (result.name !== 'survivorship_bias') {
      throw new Error('Expected name to be survivorship_bias');
    }
    if (typeof result.metrics.total_companies !== 'number') {
      throw new Error('Expected total_companies to be number');
    }
    if (typeof result.metrics.active_companies !== 'number') {
      throw new Error('Expected active_companies to be number');
    }
    if (typeof result.metrics.inactive_companies !== 'number') {
      throw new Error('Expected inactive_companies to be number');
    }
    if (!result.metrics.inactive_pct) {
      throw new Error('Missing inactive_pct');
    }
  });

  // Test 8: checkCrossValidation() returns CV metrics
  await testMethod(results, 'checkCrossValidation() returns CV metrics', async () => {
    const result = await monitor.checkCrossValidation();

    if (result.name !== 'cross_validation_readiness') {
      throw new Error('Expected name to be cross_validation_readiness');
    }
    if (!result.metrics.date_range) {
      throw new Error('Missing date_range');
    }
    if (!result.metrics.date_range.start) {
      throw new Error('Missing start date');
    }
    if (!result.metrics.date_range.end) {
      throw new Error('Missing end date');
    }
    if (typeof result.metrics.data_gaps !== 'number') {
      throw new Error('Expected data_gaps to be number');
    }
    if (!result.metrics.sample_sizes) {
      throw new Error('Missing sample_sizes');
    }
  });

  // Test 9: getSummary() returns formatted text
  await testMethod(results, 'getSummary() returns formatted text', async () => {
    const summary = await monitor.getSummary();

    if (typeof summary !== 'string') {
      throw new Error('Expected summary to be string');
    }
    if (!summary.includes('DATA QUALITY REPORT')) {
      throw new Error('Summary missing header');
    }
    if (!summary.includes('Status:')) {
      throw new Error('Summary missing status');
    }
    if (!summary.includes('KEY METRICS:')) {
      throw new Error('Summary missing key metrics');
    }
  });

  // Test 10: Report status logic
  await testMethod(results, 'Report status determined correctly', async () => {
    const report = await monitor.runFullAudit();

    const validStatuses = ['healthy', 'warning', 'critical'];
    if (!validStatuses.includes(report.status)) {
      throw new Error(`Invalid status: ${report.status}, expected one of ${validStatuses.join(', ')}`);
    }

    // If there are issues, status should be critical
    if (report.issues.length > 0 && report.status !== 'critical') {
      throw new Error('Status should be critical when issues exist');
    }

    // If there are warnings but no issues, status should be warning
    if (report.warnings.length > 0 && report.issues.length === 0 && report.status !== 'warning') {
      throw new Error('Status should be warning when warnings exist but no issues');
    }
  });

  // Test 11: Parallel execution of checks
  await testMethod(results, 'All checks execute in parallel', async () => {
    const startTime = Date.now();
    const report = await monitor.runFullAudit();
    const duration = Date.now() - startTime;

    // Parallel execution should be faster than sequential
    // With 6 checks running complex queries on large database (17K companies, millions of rows)
    // Each check may take 2-5 seconds due to CTEs, window functions, aggregations
    // In parallel should complete in 30 seconds or less
    // Sequential would take 60+ seconds
    if (duration > 30000) {
      throw new Error(`Audit took ${duration}ms, may not be running in parallel`);
    }

    // Verify all checks completed
    if (Object.keys(report.metrics).length !== 6) {
      throw new Error('Not all checks completed');
    }
  });

  return results.summary();
}

// Run if called directly
if (require.main === module) {
  runDataQualityMonitorTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}

module.exports = { runDataQualityMonitorTests };
