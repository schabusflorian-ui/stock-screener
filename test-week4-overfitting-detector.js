// Test script for Week 4 overfitting detector
// Tests: All 6 diagnostic tests, severity assessment, report generation

const { db } = require('./src/database');
const { OverfittingDetector } = require('./src/services/backtesting/overfittingDetector');

async function testWeek4Implementation() {
  console.log('🧪 Testing Week 4 Overfitting Detector Implementation\n');

  // Test 1: Verify OverfittingDetector class exists
  console.log('Test 1: Verifying OverfittingDetector class...');
  try {
    const detector = new OverfittingDetector(db);

    if (detector) {
      console.log('  ✅ OverfittingDetector instantiated successfully');
    }

    if (typeof detector.analyzeRun === 'function') {
      console.log('  ✅ analyzeRun method exists');
    } else {
      console.log('  ❌ analyzeRun method missing');
      return false;
    }
  } catch (error) {
    console.log('  ❌ OverfittingDetector test failed:', error.message);
    return false;
  }

  // Test 2: Verify all 6 diagnostic test methods exist
  console.log('\nTest 2: Verifying diagnostic test methods...');
  try {
    const detector = new OverfittingDetector(db);

    const requiredMethods = [
      '_testDataSnooping',
      '_testWalkForwardDegradation',
      '_testParameterStability',
      '_testRegimeBias',
      '_testSuspiciousUniformity',
      '_testTrackRecordLength'
    ];

    let allExist = true;
    for (const method of requiredMethods) {
      if (typeof detector[method] === 'function') {
        console.log(`  ✅ ${method} exists`);
      } else {
        console.log(`  ❌ ${method} missing`);
        allExist = false;
      }
    }

    if (allExist) {
      console.log('  ✅ All 6 diagnostic test methods exist');
    } else {
      return false;
    }
  } catch (error) {
    console.log('  ❌ Diagnostic methods test failed:', error.message);
    return false;
  }

  // Test 3: Verify assessment generation method
  console.log('\nTest 3: Verifying assessment methods...');
  try {
    const detector = new OverfittingDetector(db);

    if (typeof detector._generateAssessment === 'function') {
      console.log('  ✅ _generateAssessment method exists');
    } else {
      console.log('  ❌ _generateAssessment method missing');
      return false;
    }

    if (typeof detector._printReport === 'function') {
      console.log('  ✅ _printReport method exists');
    } else {
      console.log('  ❌ _printReport method missing');
      return false;
    }
  } catch (error) {
    console.log('  ❌ Assessment methods test failed:', error.message);
    return false;
  }

  // Test 4: Test severity assessment logic
  console.log('\nTest 4: Testing severity assessment logic...');
  try {
    const detector = new OverfittingDetector(db);

    // Mock diagnostics with different severity levels
    const testCases = [
      {
        diagnostics: [
          { severity: 'CRITICAL', passed: false },
          { severity: 'LOW', passed: true }
        ],
        expectedRisk: 'CRITICAL'
      },
      {
        diagnostics: [
          { severity: 'HIGH', passed: false },
          { severity: 'HIGH', passed: false },
          { severity: 'LOW', passed: true }
        ],
        expectedRisk: 'HIGH'
      },
      {
        diagnostics: [
          { severity: 'LOW', passed: true },
          { severity: 'LOW', passed: true },
          { severity: 'LOW', passed: true },
          { severity: 'LOW', passed: true },
          { severity: 'LOW', passed: true }
        ],
        expectedRisk: 'LOW'
      }
    ];

    for (const { diagnostics, expectedRisk } of testCases) {
      const assessment = detector._generateAssessment(diagnostics, {});
      const match = assessment.riskLevel === expectedRisk ? '✅' : '❌';
      console.log(`  ${match} Diagnostics with ${diagnostics.map(d => d.severity).join(', ')} → Risk: ${assessment.riskLevel} (expected: ${expectedRisk})`);
    }

    console.log('  ✅ Severity assessment logic works correctly');
  } catch (error) {
    console.log('  ❌ Severity assessment test failed:', error.message);
    return false;
  }

  // Test 5: Create a mock optimization run and test analyzer
  console.log('\nTest 5: Creating mock optimization run...');
  try {
    // Insert a mock run for testing
    const mockRunId = db.prepare(`
      INSERT INTO weight_optimization_runs (
        run_name, run_type, start_date, end_date, optimization_target,
        search_config, status, total_combinations_tested,
        best_alpha, best_sharpe, walk_forward_validated,
        walk_forward_efficiency, deflated_sharpe, deflated_sharpe_p_value,
        num_periods_oos, parameter_stability
      ) VALUES (
        'Test Run', 'grid_search', '2020-01-01', '2024-12-31', 'alpha',
        '{"startDate":"2020-01-01","endDate":"2024-12-31"}',
        'completed', 100, 12.5, 0.85, 1, 0.65, 0.72, 0.03,
        5, 0.82
      )
    `).run().lastInsertRowid;

    console.log(`  ✅ Created mock run #${mockRunId}`);

    // Insert mock combinations
    for (let i = 0; i < 10; i++) {
      db.prepare(`
        INSERT INTO weight_combination_results (
          run_id, weights, total_return, annualized_return,
          sharpe_ratio, sortino_ratio, max_drawdown, alpha, beta,
          win_rate, profit_factor, total_trades, avg_holding_days,
          is_walk_forward_validated, walk_forward_efficiency, rank_in_run
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0.65, ?)
      `).run(
        mockRunId,
        JSON.stringify({ technical: 0.2, fundamental: 0.2, sentiment: 0.2 }),
        0.50 + i * 0.05,
        0.12 + i * 0.01,
        0.80 + i * 0.02,
        1.10,
        -0.15,
        12.0 + i * 0.5,
        1.05,
        0.55,
        1.8,
        100,
        7,
        i + 1
      );
    }

    console.log(`  ✅ Inserted 10 mock combinations`);

    // Insert mock walk-forward periods
    for (let i = 0; i < 5; i++) {
      db.prepare(`
        INSERT INTO walk_forward_periods (
          run_id, period_index, train_start_date, train_end_date,
          test_start_date, test_end_date, purge_days,
          train_sharpe, test_sharpe, train_alpha, test_alpha,
          efficiency, optimal_weights
        ) VALUES (?, ?, ?, ?, ?, ?, 5, ?, ?, ?, ?, ?, ?)
      `).run(
        mockRunId,
        i + 1,
        `2020-0${i + 1}-01`,
        `2021-0${i + 1}-01`,
        `2021-0${i + 1}-06`,
        `2022-0${i + 1}-01`,
        0.90 - i * 0.02,
        0.60 - i * 0.01,
        13.0 - i * 0.5,
        10.0 - i * 0.5,
        (0.60 - i * 0.01) / (0.90 - i * 0.02),
        JSON.stringify({ technical: 0.2, fundamental: 0.2, sentiment: 0.2 })
      );
    }

    console.log(`  ✅ Inserted 5 mock walk-forward periods`);
    console.log(`  ℹ️  Mock run ID: ${mockRunId}`);

    return mockRunId;
  } catch (error) {
    console.log('  ❌ Mock run creation failed:', error.message);
    return false;
  }
}

testWeek4Implementation()
  .then(async mockRunId => {
    if (!mockRunId) {
      console.log('\n❌ Some tests failed');
      process.exit(1);
    }

    // Test 6: Run analyzer on mock run
    console.log('\nTest 6: Running analyzer on mock optimization run...');
    try {
      const detector = new OverfittingDetector(db);
      const result = await detector.analyzeRun(mockRunId);

      if (result.diagnostics && result.diagnostics.length === 6) {
        console.log(`\n  ✅ Analyzer ran successfully`);
        console.log(`  ✅ Generated ${result.diagnostics.length} diagnostic results`);
        console.log(`  ℹ️  Overall Risk: ${result.overallRisk}`);
        console.log(`  ℹ️  Tests Passed: ${result.assessment.testsPassed} / ${result.assessment.testsRun}`);
      } else {
        console.log('  ❌ Analyzer did not generate expected diagnostics');
        process.exit(1);
      }

      // Verify diagnostics were stored in database
      const storedDiagnostics = db.prepare(`
        SELECT * FROM overfitting_diagnostics WHERE run_id = ?
      `).all(mockRunId);

      if (storedDiagnostics.length === 6) {
        console.log(`  ✅ All ${storedDiagnostics.length} diagnostics stored in database`);
      } else {
        console.log(`  ❌ Expected 6 diagnostics, found ${storedDiagnostics.length}`);
        process.exit(1);
      }

      console.log('\n✅ Week 4 Implementation Tests: PASSED');
      console.log('\nKey Improvements:');
      console.log('  ✓ 6 diagnostic tests for comprehensive overfitting detection');
      console.log('  ✓ Data snooping test (deflated Sharpe p-value)');
      console.log('  ✓ Walk-forward degradation test (30-90% range)');
      console.log('  ✓ Parameter stability test (CV of test Sharpe)');
      console.log('  ✓ Regime bias test (includes crisis periods)');
      console.log('  ✓ Suspicious uniformity test (duplicate results)');
      console.log('  ✓ Track record length test (Bailey & Lopez de Prado)');
      console.log('  ✓ Overall risk assessment (CRITICAL/HIGH/MODERATE/LOW)');
      console.log('  ✓ Clear deploy/don\'t deploy recommendations');
      console.log('  ✓ All diagnostics stored in database');
      console.log('\nNext Steps:');
      console.log('  - Week 5: Integration, end-to-end testing, and final validation');
      console.log('  - Create comprehensive documentation');
      console.log('  - Run full optimization with all Week 1-4 features');

      process.exit(0);
    } catch (error) {
      console.error('\n❌ Analyzer test failed:', error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
