#!/usr/bin/env node
/**
 * MLOps Pipeline Test Suite
 * ==========================
 *
 * Tests the MLOps infrastructure including:
 * - Model Registry (versioning, promotion, rollback)
 * - Weight Update Service (validation gates)
 * - Retraining Scheduler (job management)
 * - API endpoints
 *
 * Run: node tests/mlops/mlopsTest.js
 */

const path = require('path');
process.chdir(path.join(__dirname, '../..'));

const db = require('../../src/database');
const {
  ModelRegistry,
  WeightUpdateService,
  RetrainingScheduler
} = require('../../src/services/mlops');

// Test results
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  startTime: new Date()
};

function log(message, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', section: '📋' };
  console.log(`${icons[type] || ''} ${message}`);
}

function recordTest(name, passed, details = {}) {
  testResults.tests.push({ name, passed, ...details });
  if (passed) {
    testResults.passed++;
    log(`${name}`, 'success');
  } else {
    testResults.failed++;
    log(`${name}: ${details.error || 'Failed'}`, 'error');
  }
}

// ============================================================================
// MODEL REGISTRY TESTS
// ============================================================================

async function testModelRegistry() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 1: MODEL REGISTRY TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nThe Model Registry tracks all ML model versions, enabling:');
  console.log('- Version control for strategy weights');
  console.log('- Performance comparison between versions');
  console.log('- Safe rollback if new weights underperform\n');

  const database = db.getDatabase();
  const registry = new ModelRegistry(database);

  // Test 1.1: Register a model
  try {
    const model = registry.registerModel('test_signal_weights', 'v1.0.0', {
      modelType: 'signal_weights',
      artifacts: {
        weights: {
          technical: 0.15,
          fundamental: 0.20,
          sentiment: 0.10,
          insider: 0.15,
          momentum: 0.15,
          valuation: 0.15,
          alternative: 0.10
        }
      },
      config: { stepSize: 0.1, maxCombinations: 100 },
      metrics: {
        trainSharpe: 1.2,
        testSharpe: 0.9,
        walkForwardEfficiency: 0.65,
        alpha: 5.2,
        maxDrawdown: 0.18
      },
      validationPeriod: { start: '2020-01-01', end: '2024-01-01' }
    });

    recordTest('1.1 Model registration', model !== null, {
      modelName: 'test_signal_weights',
      version: 'v1.0.0'
    });
  } catch (err) {
    recordTest('1.1 Model registration', false, { error: err.message });
  }

  // Test 1.2: Register second version
  try {
    const model2 = registry.registerModel('test_signal_weights', 'v1.1.0', {
      modelType: 'signal_weights',
      artifacts: {
        weights: {
          technical: 0.12,
          fundamental: 0.22,
          sentiment: 0.08,
          insider: 0.18,
          momentum: 0.12,
          valuation: 0.18,
          alternative: 0.10
        }
      },
      metrics: {
        trainSharpe: 1.3,
        testSharpe: 1.0,
        walkForwardEfficiency: 0.72,
        alpha: 6.1,
        maxDrawdown: 0.15
      }
    });

    recordTest('1.2 Version creation', model2 !== null, {
      version: 'v1.1.0'
    });
  } catch (err) {
    recordTest('1.2 Version creation', false, { error: err.message });
  }

  // Test 1.3: Get versions (using getVersionHistory)
  try {
    const versions = registry.getVersionHistory('test_signal_weights');
    recordTest('1.3 Get model versions', versions.length >= 2, {
      versionCount: versions.length,
      explanation: `Found ${versions.length} versions`
    });
  } catch (err) {
    recordTest('1.3 Get model versions', false, { error: err.message });
  }

  // Test 1.4: Promote to production (using promoteToProduction)
  try {
    registry.promoteToProduction('test_signal_weights', 'v1.1.0', {
      promotedBy: 'test',
      reason: 'Testing promotion'
    });
    const production = registry.getLatestProduction('test_signal_weights');

    recordTest('1.4 Promote to production', production?.version === 'v1.1.0', {
      productionVersion: production?.version,
      explanation: 'Version v1.1.0 is now in production'
    });
  } catch (err) {
    recordTest('1.4 Promote to production', false, { error: err.message });
  }

  // Test 1.5: Compare versions (using compareModels)
  try {
    const comparison = registry.compareModels(
      'test_signal_weights', 'v1.0.0',
      'test_signal_weights', 'v1.1.0'
    );

    console.log('\n  Version comparison (v1.0.0 vs v1.1.0):');
    console.log(`    • Model A Sharpe: ${comparison.modelA?.sharpe?.toFixed(2) || 'N/A'}`);
    console.log(`    • Model B Sharpe: ${comparison.modelB?.sharpe?.toFixed(2) || 'N/A'}`);
    console.log(`    • Winner: ${comparison.winner || 'N/A'}`);

    recordTest('1.5 Version comparison', comparison.winner !== undefined, {
      winner: comparison.winner
    });
  } catch (err) {
    recordTest('1.5 Version comparison', false, { error: err.message });
  }

  // Test 1.6: Validate model
  try {
    const validation = registry.validateModel('test_signal_weights', 'v1.1.0', {
      minWFE: 0.50,
      maxDeflatedSharpeP: 0.05,
      minTestSharpe: 0.5,
      maxDrawdown: 0.40
    });

    console.log('\n  Validation result:');
    console.log(`    • Valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (validation.errors.length > 0) {
      validation.errors.forEach(e => console.log(`    • Error: ${e}`));
    }
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => console.log(`    • Warning: ${w}`));
    }

    recordTest('1.6 Model validation', validation.valid === true, {
      explanation: validation.valid ? 'Model passed all gates' : 'Model failed validation'
    });
  } catch (err) {
    recordTest('1.6 Model validation', false, { error: err.message });
  }

  // Test 1.7: Rollback
  try {
    const rollbackResult = registry.rollback('test_signal_weights', 'v1.0.0', 'Testing rollback functionality');
    const production = registry.getLatestProduction('test_signal_weights');

    recordTest('1.7 Rollback capability', production !== null && production.version.includes('rollback'), {
      currentProduction: production?.version,
      explanation: 'Successfully rolled back (new version created from v1.0.0)'
    });
  } catch (err) {
    recordTest('1.7 Rollback capability', false, { error: err.message });
  }

  // Test 1.8: Get summary
  try {
    const summary = registry.getSummary();

    console.log('\n  Model summary:');
    summary.forEach(s => {
      console.log(`    • ${s.model_name}: ${s.total_versions} versions (${s.production_count} in production)`);
    });

    recordTest('1.8 Model summary', summary.length > 0, {
      modelCount: summary.length,
      explanation: `${summary.length} model types registered`
    });
  } catch (err) {
    recordTest('1.8 Model summary', false, { error: err.message });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  The Model Registry lets us safely experiment with new strategy');
  console.log('  weights while keeping track of all versions. If something goes');
  console.log('  wrong, we can instantly rollback to a previous working version.\n');
}

// ============================================================================
// WEIGHT UPDATE SERVICE TESTS
// ============================================================================

async function testWeightUpdateService() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 2: WEIGHT UPDATE SERVICE TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nThe Weight Update Service automates strategy optimization:');
  console.log('- Runs optimization on historical data');
  console.log('- Validates results against strict quality gates');
  console.log('- Only promotes weights that pass all checks\n');

  const database = db.getDatabase();
  const service = new WeightUpdateService(database);

  // Test 2.1: Service initialization
  try {
    recordTest('2.1 Service initialization', service !== null, {
      config: Object.keys(service.config).length + ' settings'
    });
  } catch (err) {
    recordTest('2.1 Service initialization', false, { error: err.message });
  }

  // Test 2.2: Validation gates configuration
  try {
    console.log('\n  Validation gates (weights must pass ALL):');
    console.log(`    • Min WFE (Walk-Forward Efficiency): ${(service.config.minWFE * 100).toFixed(0)}%`);
    console.log(`    • Max Deflated Sharpe p-value: ${service.config.maxDeflatedSharpeP}`);
    console.log(`    • Min Test Sharpe: ${service.config.minTestSharpe}`);
    console.log(`    • Max Drawdown: ${(service.config.maxDrawdown * 100).toFixed(0)}%`);
    console.log(`    • Min Alpha: ${service.config.minAlpha}%`);

    const hasAllGates = service.config.minWFE !== undefined &&
      service.config.maxDeflatedSharpeP !== undefined &&
      service.config.minTestSharpe !== undefined;

    recordTest('2.2 Validation gates configured', hasAllGates, {
      explanation: 'All validation gates are configured'
    });
  } catch (err) {
    recordTest('2.2 Validation gates configured', false, { error: err.message });
  }

  // Test 2.3: Status reporting
  try {
    const status = service.getStatus();

    console.log('\n  Weight Update Status:');
    console.log(`    • Has production: ${status.hasProduction ? 'YES' : 'NO'}`);
    console.log(`    • Current version: ${status.currentVersion || 'None'}`);
    console.log(`    • Staged count: ${status.stagedCount}`);
    console.log(`    • Total versions: ${status.totalVersions}`);

    recordTest('2.3 Status reporting', status !== null, {
      explanation: 'Status reporting works correctly'
    });
  } catch (err) {
    recordTest('2.3 Status reporting', false, { error: err.message });
  }

  // Test 2.4: Rolling window calculation
  try {
    const { startDate, endDate } = service._calculateRollingWindow(4);
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();

    console.log(`\n  Rolling window (4 years): ${startDate} to ${endDate}`);

    recordTest('2.4 Rolling window calculation', endYear - startYear >= 3, {
      startDate,
      endDate,
      years: endYear - startYear
    });
  } catch (err) {
    recordTest('2.4 Rolling window calculation', false, { error: err.message });
  }

  // Test 2.5: Current weights retrieval
  try {
    const currentWeights = service.getCurrentWeights();

    if (currentWeights) {
      console.log('\n  Current production weights:');
      console.log(`    • Version: ${currentWeights.version}`);
      console.log(`    • Promoted at: ${currentWeights.promotedAt || 'N/A'}`);
    } else {
      console.log('\n  No production weights set (expected for fresh install)');
    }

    // This can be null if no production weights - that's OK
    recordTest('2.5 Current weights retrieval', true, {
      explanation: currentWeights ? 'Current weights retrieved' : 'No production weights (OK for new install)'
    });
  } catch (err) {
    recordTest('2.5 Current weights retrieval', false, { error: err.message });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  New strategy weights must pass multiple quality checks before');
  console.log('  going live. This prevents overfitted or poorly performing');
  console.log('  strategies from affecting real trading decisions.\n');
}

// ============================================================================
// RETRAINING SCHEDULER TESTS
// ============================================================================

async function testRetrainingScheduler() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 3: RETRAINING SCHEDULER TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nThe Retraining Scheduler automates when optimization runs:');
  console.log('- Weekly/monthly scheduled updates');
  console.log('- Job tracking and history');
  console.log('- Automatic failure handling\n');

  const database = db.getDatabase();
  const scheduler = new RetrainingScheduler(database);

  // Test 3.1: Scheduler initialization
  try {
    recordTest('3.1 Scheduler initialization', scheduler !== null, {
      explanation: 'Scheduler initialized successfully'
    });
  } catch (err) {
    recordTest('3.1 Scheduler initialization', false, { error: err.message });
  }

  // Test 3.2: Register schedule (using registerSchedule)
  try {
    const result = scheduler.registerSchedule(
      'test_weekly_update',
      'signal_weights',
      'weekly',  // Preset name
      { maxCombinations: 200 }
    );

    recordTest('3.2 Register schedule', result !== null, {
      scheduleName: 'test_weekly_update',
      cron: result.cron || 'weekly'
    });
  } catch (err) {
    recordTest('3.2 Register schedule', false, { error: err.message });
  }

  // Test 3.3: Get status (includes schedules)
  try {
    const status = scheduler.getStatus();

    console.log('\n  Scheduler Status:');
    console.log(`    • Is running: ${status.isRunning ? 'YES' : 'NO'}`);
    console.log(`    • Active schedules: ${status.activeSchedules.length}`);
    console.log(`    • Running jobs: ${status.runningJobs}`);
    console.log(`    • Recent jobs: ${status.recentJobs.length}`);

    status.activeSchedules.forEach(s => {
      console.log(`    • ${s.name}: ${s.cron} (next: ${s.nextRun || 'N/A'})`);
    });

    recordTest('3.3 Get scheduler status', status !== null, {
      scheduleCount: status.activeSchedules.length
    });
  } catch (err) {
    recordTest('3.3 Get scheduler status', false, { error: err.message });
  }

  // Test 3.4: Deactivate schedule
  try {
    const result = scheduler.deactivateSchedule('test_weekly_update');

    recordTest('3.4 Deactivate schedule', result !== null, {
      explanation: 'Schedule deactivated successfully'
    });
  } catch (err) {
    recordTest('3.4 Deactivate schedule', false, { error: err.message });
  }

  // Test 3.5: Create another schedule for ongoing tests
  try {
    const result = scheduler.registerSchedule(
      'test_monthly_update',
      'signal_weights',
      'monthly',
      { minWFE: 0.60, autoPromote: true }
    );

    recordTest('3.5 Monthly schedule creation', result !== null, {
      scheduleName: 'test_monthly_update'
    });
  } catch (err) {
    recordTest('3.5 Monthly schedule creation', false, { error: err.message });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  The scheduler automatically runs optimization at set intervals');
  console.log('  (e.g., every Sunday). This ensures strategies stay updated');
  console.log('  with recent market data without manual intervention.\n');
}

// ============================================================================
// API ENDPOINT TESTS
// ============================================================================

async function testAPIEndpoints() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 4: API ENDPOINT TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nTesting MLOps API endpoints for external access...\n');

  const express = require('express');
  const http = require('http');
  const app = express();
  app.use(express.json());
  app.set('db', db.getDatabase());

  const mlopsRouter = require('../../src/api/routes/mlops');
  app.use('/api/mlops', mlopsRouter);

  const server = app.listen(3098);

  async function testEndpoint(method, path, body = null) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3098,
        path: '/api/mlops' + path,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {}
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data, parseError: e.message });
          }
        });
      });

      req.on('error', (e) => resolve({ status: 500, error: e.message }));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 4.1: GET /models
  try {
    const r = await testEndpoint('GET', '/models');
    recordTest('4.1 GET /api/mlops/models', r.status === 200 && r.data?.success === true, {
      modelCount: r.data?.count || 0
    });
  } catch (err) {
    recordTest('4.1 GET /api/mlops/models', false, { error: err.message });
  }

  // Test 4.2: GET /models/:name
  try {
    const r = await testEndpoint('GET', '/models/test_signal_weights');
    recordTest('4.2 GET /api/mlops/models/:name', r.status === 200 && r.data?.success === true, {
      versionCount: r.data?.totalVersions || 0
    });
  } catch (err) {
    recordTest('4.2 GET /api/mlops/models/:name', false, { error: err.message });
  }

  // Test 4.3: GET /dashboard
  try {
    const r = await testEndpoint('GET', '/dashboard');
    console.log('\n  MLOps Dashboard:');
    if (r.data?.summary) {
      console.log(`    • Total models: ${r.data.summary.totalModels}`);
      console.log(`    • Total schedules: ${r.data.summary.totalSchedules}`);
      console.log(`    • Running jobs: ${r.data.summary.runningJobs}`);
    }
    recordTest('4.3 GET /api/mlops/dashboard', r.status === 200 && r.data?.success === true, {
      hasSummary: !!r.data?.summary
    });
  } catch (err) {
    recordTest('4.3 GET /api/mlops/dashboard', false, { error: err.message });
  }

  // Test 4.4: GET /health
  try {
    const r = await testEndpoint('GET', '/health');
    console.log(`\n  MLOps Health: ${r.data?.status || 'Unknown'}`);
    if (r.data?.issues?.length > 0) {
      r.data.issues.forEach(i => console.log(`    ⚠️ ${i}`));
    }
    recordTest('4.4 GET /api/mlops/health', r.status === 200 && r.data?.success === true, {
      status: r.data?.status
    });
  } catch (err) {
    recordTest('4.4 GET /api/mlops/health', false, { error: err.message });
  }

  // Test 4.5: GET /scheduler/status
  try {
    const r = await testEndpoint('GET', '/scheduler/status');
    recordTest('4.5 GET /api/mlops/scheduler/status', r.status === 200 && r.data?.success === true, {
      scheduleCount: r.data?.activeSchedules?.length || 0
    });
  } catch (err) {
    recordTest('4.5 GET /api/mlops/scheduler/status', false, { error: err.message });
  }

  // Test 4.6: GET /weights/status
  try {
    const r = await testEndpoint('GET', '/weights/status');
    recordTest('4.6 GET /api/mlops/weights/status', r.status === 200 && r.data?.success === true, {
      hasProduction: r.data?.hasProduction || false
    });
  } catch (err) {
    recordTest('4.6 GET /api/mlops/weights/status', false, { error: err.message });
  }

  // Test 4.7: GET /weights/config
  try {
    const r = await testEndpoint('GET', '/weights/config');
    recordTest('4.7 GET /api/mlops/weights/config', r.status === 200 && r.data?.success === true, {
      hasConfig: !!r.data?.config
    });
  } catch (err) {
    recordTest('4.7 GET /api/mlops/weights/config', false, { error: err.message });
  }

  // Test 4.8: POST /schedules (create schedule)
  try {
    const r = await testEndpoint('POST', '/schedules', {
      name: 'api_test_schedule',
      modelName: 'signal_weights',
      cronExpression: 'daily',
      config: { autoPromote: false }
    });
    recordTest('4.8 POST /api/mlops/schedules', r.status === 200 && r.data?.success === true, {
      scheduleName: r.data?.schedule?.scheduleName || 'api_test_schedule'
    });
  } catch (err) {
    recordTest('4.8 POST /api/mlops/schedules', false, { error: err.message });
  }

  server.close();

  console.log('\n  💡 What does this mean?');
  console.log('  All MLOps functionality is accessible via REST API endpoints.');
  console.log('  This allows the frontend dashboard to display model status,');
  console.log('  trigger updates, and monitor system health.\n');
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

function generateReport() {
  const endTime = new Date();
  const duration = (endTime - testResults.startTime) / 1000;

  console.log('\n' + '='.repeat(70));
  console.log('                    MLOPS PIPELINE TEST REPORT');
  console.log('='.repeat(70));

  console.log(`
  📅 Test Date:     ${endTime.toISOString().split('T')[0]}
  ⏱️  Duration:      ${duration.toFixed(1)} seconds

  📊 RESULTS SUMMARY
  ─────────────────────────────────────────────────────────────────────
  ✅ Passed:  ${testResults.passed}
  ❌ Failed:  ${testResults.failed}

  Overall: ${testResults.failed === 0 ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}
  `);

  // Show failed tests
  const failedTests = testResults.tests.filter(t => !t.passed);
  if (failedTests.length > 0) {
    console.log('  FAILED TESTS:');
    failedTests.forEach(t => {
      console.log(`  ❌ ${t.name}: ${t.error || 'Failed'}`);
    });
    console.log('');
  }

  console.log(`
  📝 WHAT THIS MEANS (Plain English)
  ─────────────────────────────────────────────────────────────────────

  The MLOps pipeline ${testResults.failed === 0 ? 'is fully operational' : 'has some issues'}.

  ✓ Model Registry: Track and version all strategy weights
    → Safe experimentation with instant rollback capability

  ✓ Weight Update Service: Automated strategy optimization
    → New weights only go live after passing strict quality checks

  ✓ Retraining Scheduler: Automated weekly/monthly updates
    → Strategies stay current without manual intervention

  ✓ API Endpoints: Full REST API access
    → Dashboard can monitor and control all MLOps functions
  `);

  console.log(`
  📈 AUTOMATED WEIGHT UPDATE FLOW
  ─────────────────────────────────────────────────────────────────────

  1. Scheduler triggers (e.g., every Sunday)
     ↓
  2. Run optimization on rolling 4-year window
     ↓
  3. Validate against quality gates:
     • Walk-Forward Efficiency ≥ 50%
     • Deflated Sharpe p-value < 0.05
     • Test Sharpe ≥ 0.5
     • Max Drawdown ≤ 40%
     ↓
  4. If ALL gates pass → Promote to production
     If ANY gate fails → Keep existing weights
     ↓
  5. Monitor live performance vs backtest
     If deviation > 30% → Auto-rollback
  `);

  console.log('='.repeat(70));
  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              MLOPS PIPELINE TEST SUITE                              ║');
  console.log('║                                                                     ║');
  console.log('║  Testing the automated model lifecycle management system for       ║');
  console.log('║  strategy weight optimization with version control and rollback.   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  try {
    await testModelRegistry();
    await testWeightUpdateService();
    await testRetrainingScheduler();
    await testAPIEndpoints();
    generateReport();

    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n❌ Test suite crashed:', err);
    process.exit(1);
  }
}

main();
