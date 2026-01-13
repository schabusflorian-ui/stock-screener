// src/services/backtesting/overfittingDetector.js
// Overfitting Detection Framework for Weight Optimization
// Implements 6 diagnostic tests to identify overfitting in backtest results
// Based on Bailey & Lopez de Prado research and Nassim Taleb principles

const { db } = require('../../database');

/**
 * Overfitting Detector
 * Analyzes weight optimization runs for signs of overfitting
 * Runs 6 diagnostic tests and provides overall risk assessment
 */
class OverfittingDetector {
  constructor(database) {
    this.db = database || db;
  }

  /**
   * Analyze a weight optimization run for overfitting
   * Returns comprehensive diagnostics and risk assessment
   */
  async analyzeRun(runId) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔍 OVERFITTING DETECTION ANALYSIS - Run #${runId}`);
    console.log('='.repeat(70));

    // Get run data
    const run = this.db.prepare(`
      SELECT * FROM weight_optimization_runs WHERE id = ?
    `).get(runId);

    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Get combination results
    const combinations = this.db.prepare(`
      SELECT * FROM weight_combination_results
      WHERE run_id = ?
    `).all(runId);

    // Get walk-forward periods
    const wfPeriods = this.db.prepare(`
      SELECT * FROM walk_forward_periods
      WHERE run_id = ?
      ORDER BY period_index
    `).all(runId);

    const diagnostics = [];

    // Run all 6 diagnostic tests
    console.log('\n📋 Running diagnostic tests...\n');

    diagnostics.push(await this._testDataSnooping(runId, run, combinations));
    diagnostics.push(await this._testWalkForwardDegradation(runId, run, wfPeriods));
    diagnostics.push(await this._testParameterStability(runId, run, wfPeriods));
    diagnostics.push(await this._testRegimeBias(runId, run));
    diagnostics.push(await this._testSuspiciousUniformity(runId, run, combinations));
    diagnostics.push(await this._testTrackRecordLength(runId, run));

    // Store all diagnostics in database
    for (const diagnostic of diagnostics) {
      this.db.prepare(`
        INSERT INTO overfitting_diagnostics (
          run_id, diagnostic_type, severity, metric_name,
          metric_value, threshold_value, passed,
          description, recommendation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId,
        diagnostic.type,
        diagnostic.severity,
        diagnostic.metricName,
        diagnostic.metricValue,
        diagnostic.thresholdValue,
        diagnostic.passed ? 1 : 0,
        diagnostic.description,
        diagnostic.recommendation
      );
    }

    // Generate overall assessment
    const assessment = this._generateAssessment(diagnostics, run);

    // Print comprehensive report
    this._printReport(diagnostics, assessment);

    return {
      runId,
      diagnostics,
      assessment,
      overallRisk: assessment.riskLevel,
      deploymentRecommendation: assessment.recommendation
    };
  }

  /**
   * Test 1: Data Snooping Test
   * Checks if strategy is statistically significant after accounting for multiple testing
   */
  async _testDataSnooping(runId, run, combinations) {
    const nTrials = combinations.length || run.total_combinations_tested || 0;
    const deflatedSharpe = run.deflated_sharpe || null;
    const deflatedPValue = run.deflated_sharpe_p_value || null;

    let passed = false;
    let severity = 'HIGH';
    let description = '';
    let recommendation = '';

    if (deflatedPValue === null) {
      severity = 'HIGH';
      description = 'Deflated Sharpe p-value not calculated - cannot assess data snooping risk';
      recommendation = 'Re-run optimization with statistical corrections enabled';
    } else if (deflatedPValue < 0.05) {
      passed = true;
      severity = 'LOW';
      description = `Result is statistically significant (p = ${deflatedPValue.toFixed(4)}) after testing ${nTrials} combinations`;
      recommendation = 'Data snooping risk is acceptable';
    } else if (deflatedPValue < 0.10) {
      severity = 'MODERATE';
      description = `Marginal statistical significance (p = ${deflatedPValue.toFixed(4)}) after ${nTrials} trials`;
      recommendation = 'Consider gathering more out-of-sample data or reducing combinations tested';
    } else {
      severity = 'CRITICAL';
      description = `Not statistically significant (p = ${deflatedPValue.toFixed(4)}) - likely false discovery from testing ${nTrials} combinations`;
      recommendation = 'DO NOT DEPLOY - Result is likely due to data snooping';
    }

    console.log(`  ${passed ? '✅' : '❌'} Test 1: Data Snooping (${severity})`);
    console.log(`     Deflated Sharpe p-value: ${deflatedPValue !== null ? deflatedPValue.toFixed(4) : 'N/A'}`);
    console.log(`     Combinations tested: ${nTrials}`);

    return {
      type: 'data_snooping',
      severity,
      metricName: 'deflated_sharpe_p_value',
      metricValue: deflatedPValue,
      thresholdValue: 0.05,
      passed,
      description,
      recommendation
    };
  }

  /**
   * Test 2: Walk-Forward Degradation Test
   * Checks if out-of-sample performance is realistic (30-90% range)
   */
  async _testWalkForwardDegradation(runId, run, wfPeriods) {
    const wfEfficiency = run.walk_forward_efficiency || null;
    const numPeriods = run.num_periods_oos || wfPeriods.length;

    let passed = false;
    let severity = 'HIGH';
    let description = '';
    let recommendation = '';

    if (wfEfficiency === null) {
      severity = 'HIGH';
      description = 'Walk-forward validation not performed';
      recommendation = 'Re-run with walk-forward validation enabled';
    } else if (wfEfficiency < 0.30) {
      severity = 'CRITICAL';
      description = `Severe walk-forward degradation: ${(wfEfficiency * 100).toFixed(1)}% efficiency across ${numPeriods} periods`;
      recommendation = 'DO NOT DEPLOY - Strategy is severely overfit to in-sample data';
    } else if (wfEfficiency >= 0.30 && wfEfficiency <= 0.90) {
      passed = true;
      severity = 'LOW';
      description = `Healthy walk-forward efficiency: ${(wfEfficiency * 100).toFixed(1)}% across ${numPeriods} periods`;
      recommendation = 'Walk-forward performance is realistic and robust';
    } else if (wfEfficiency > 0.90) {
      severity = 'MODERATE';
      description = `Suspiciously high walk-forward efficiency: ${(wfEfficiency * 100).toFixed(1)}% - possible data leakage`;
      recommendation = 'Verify no lookahead bias or data leakage in walk-forward implementation';
    }

    console.log(`  ${passed ? '✅' : '❌'} Test 2: Walk-Forward Degradation (${severity})`);
    console.log(`     Efficiency: ${wfEfficiency !== null ? (wfEfficiency * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`     Periods: ${numPeriods || 'N/A'}`);

    return {
      type: 'walk_forward_degradation',
      severity,
      metricName: 'walk_forward_efficiency',
      metricValue: wfEfficiency,
      thresholdValue: 0.30,
      passed,
      description,
      recommendation
    };
  }

  /**
   * Test 3: Parameter Stability Test
   * Checks if strategy parameters are stable across time periods
   */
  async _testParameterStability(runId, run, wfPeriods) {
    const parameterStability = run.parameter_stability || null;

    let passed = false;
    let severity = 'HIGH';
    let description = '';
    let recommendation = '';

    if (wfPeriods.length === 0 || parameterStability === null) {
      severity = 'MODERATE';
      description = 'Parameter stability not measured (requires walk-forward validation)';
      recommendation = 'Re-run with walk-forward validation to measure parameter stability';
    } else {
      // Calculate CV of test Sharpe ratios
      const testSharpes = wfPeriods.map(p => p.test_sharpe).filter(s => s !== null);

      if (testSharpes.length >= 3) {
        const avgSharpe = testSharpes.reduce((a, b) => a + b, 0) / testSharpes.length;
        const variance = testSharpes.reduce((acc, s) => acc + Math.pow(s - avgSharpe, 2), 0) / (testSharpes.length - 1);
        const stdDev = Math.sqrt(variance);
        const cv = avgSharpe !== 0 ? stdDev / Math.abs(avgSharpe) : Infinity;

        const stability = Math.max(0, 1 - cv);

        if (stability >= 0.70) {
          passed = true;
          severity = 'LOW';
          description = `High parameter stability: ${(stability * 100).toFixed(1)}% (CV: ${cv.toFixed(2)}) across ${testSharpes.length} periods`;
          recommendation = 'Strategy parameters are stable across time';
        } else if (stability >= 0.50) {
          severity = 'MODERATE';
          description = `Moderate parameter stability: ${(stability * 100).toFixed(1)}% (CV: ${cv.toFixed(2)})`;
          recommendation = 'Some parameter instability detected - monitor closely if deployed';
        } else {
          severity = 'HIGH';
          description = `Low parameter stability: ${(stability * 100).toFixed(1)}% (CV: ${cv.toFixed(2)}) - performance varies widely`;
          recommendation = 'High parameter instability indicates overfitting to specific periods';
        }
      }
    }

    console.log(`  ${passed ? '✅' : '❌'} Test 3: Parameter Stability (${severity})`);
    console.log(`     Stability: ${parameterStability !== null ? (parameterStability * 100).toFixed(1) + '%' : 'N/A'}`);

    return {
      type: 'parameter_instability',
      severity,
      metricName: 'parameter_stability',
      metricValue: parameterStability,
      thresholdValue: 0.70,
      passed,
      description,
      recommendation
    };
  }

  /**
   * Test 4: Regime Bias Test
   * Checks if backtest period includes crisis regimes (not just bull markets)
   */
  async _testRegimeBias(runId, run) {
    const searchConfig = run.search_config ? JSON.parse(run.search_config) : {};
    const startDate = searchConfig.startDate || run.created_at;
    const endDate = searchConfig.endDate || new Date().toISOString().split('T')[0];

    let passed = false;
    let severity = 'HIGH';
    let description = '';
    let recommendation = '';

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const yearsCovered = (end - start) / (365.25 * 24 * 60 * 60 * 1000);

    // Check if includes known crisis periods
    const includesCOVID = start <= new Date('2020-03-01') && end >= new Date('2020-04-01');
    const includes2022Bear = start <= new Date('2022-01-01') && end >= new Date('2022-12-31');
    const includesGFC = start <= new Date('2008-09-01') && end >= new Date('2009-03-01');

    const crisisCount = [includesCOVID, includes2022Bear, includesGFC].filter(Boolean).length;

    if (yearsCovered < 3) {
      severity = 'HIGH';
      description = `Short backtest period: ${yearsCovered.toFixed(1)} years (${startDate} to ${endDate})`;
      recommendation = 'Extend backtest to at least 3 years to cover multiple market regimes';
    } else if (crisisCount === 0) {
      severity = 'CRITICAL';
      description = `${yearsCovered.toFixed(1)} year period includes NO major crisis (COVID, 2022 bear, GFC)`;
      recommendation = 'DO NOT DEPLOY - Strategy untested in adverse market conditions';
    } else if (crisisCount === 1) {
      passed = true;
      severity = 'LOW';
      description = `${yearsCovered.toFixed(1)} year period includes 1 crisis period - adequate regime coverage`;
      recommendation = 'Regime coverage is acceptable';
    } else {
      passed = true;
      severity = 'LOW';
      description = `${yearsCovered.toFixed(1)} year period includes ${crisisCount} crisis periods - excellent regime coverage`;
      recommendation = 'Excellent coverage of multiple market regimes';
    }

    console.log(`  ${passed ? '✅' : '❌'} Test 4: Regime Bias (${severity})`);
    console.log(`     Period: ${yearsCovered.toFixed(1)} years (${startDate} to ${endDate})`);
    console.log(`     Crisis periods: ${crisisCount} (COVID: ${includesCOVID}, 2022 bear: ${includes2022Bear}, GFC: ${includesGFC})`);

    return {
      type: 'regime_bias',
      severity,
      metricName: 'years_covered',
      metricValue: yearsCovered,
      thresholdValue: 3.0,
      passed,
      description,
      recommendation
    };
  }

  /**
   * Test 5: Suspicious Uniformity Test
   * Checks for too many duplicate or near-identical results (sign of overfitting)
   */
  async _testSuspiciousUniformity(runId, run, combinations) {
    let passed = false;
    let severity = 'LOW';
    let description = '';
    let recommendation = '';

    if (combinations.length < 10) {
      severity = 'LOW';
      description = 'Too few combinations to assess uniformity';
      recommendation = 'N/A - test requires at least 10 combinations';
      passed = true;
    } else {
      // Check for duplicate alpha values (rounded to 2 decimals)
      const alphas = combinations.map(c => Math.round((c.alpha || 0) * 100) / 100);
      const uniqueAlphas = new Set(alphas).size;
      const duplicateRatio = 1 - (uniqueAlphas / alphas.length);

      if (duplicateRatio > 0.30) {
        severity = 'HIGH';
        description = `High duplicate ratio: ${(duplicateRatio * 100).toFixed(1)}% of ${alphas.length} combinations have identical alphas`;
        recommendation = 'Suspicious uniformity suggests limited search space or numerical precision issues';
      } else if (duplicateRatio > 0.15) {
        severity = 'MODERATE';
        description = `Moderate duplicate ratio: ${(duplicateRatio * 100).toFixed(1)}%`;
        recommendation = 'Some duplicate results detected - verify search space is sufficiently diverse';
      } else {
        passed = true;
        severity = 'LOW';
        description = `Low duplicate ratio: ${(duplicateRatio * 100).toFixed(1)}% - results show healthy diversity`;
        recommendation = 'Results show appropriate diversity';
      }
    }

    console.log(`  ${passed ? '✅' : '❌'} Test 5: Suspicious Uniformity (${severity})`);
    if (combinations.length >= 10) {
      const alphas = combinations.map(c => Math.round((c.alpha || 0) * 100) / 100);
      const uniqueAlphas = new Set(alphas).size;
      console.log(`     Unique results: ${uniqueAlphas} / ${combinations.length}`);
    }

    return {
      type: 'suspicious_uniformity',
      severity,
      metricName: 'duplicate_ratio',
      metricValue: combinations.length >= 10 ? (1 - (new Set(combinations.map(c => Math.round((c.alpha || 0) * 100) / 100)).size / combinations.length)) : null,
      thresholdValue: 0.15,
      passed,
      description,
      recommendation
    };
  }

  /**
   * Test 6: Track Record Length Test
   * Bailey & Lopez de Prado minimum track record formula
   */
  async _testTrackRecordLength(runId, run) {
    const sharpe = run.best_sharpe || 0;
    const searchConfig = run.search_config ? JSON.parse(run.search_config) : {};
    const startDate = searchConfig.startDate || run.created_at;
    const endDate = searchConfig.endDate || new Date().toISOString().split('T')[0];

    const start = new Date(startDate);
    const end = new Date(endDate);
    const actualMonths = (end - start) / (30.44 * 24 * 60 * 60 * 1000);

    // Bailey & Lopez de Prado formula
    // Required months = (1.96 / Sharpe)^2 * (1 + 0.5 * Sharpe^2) / 21
    const requiredMonths = sharpe > 0 ? Math.pow(1.96 / sharpe, 2) * (1 + 0.5 * Math.pow(sharpe, 2)) / 21 * 12 : Infinity;

    let passed = false;
    let severity = 'HIGH';
    let description = '';
    let recommendation = '';

    if (sharpe <= 0) {
      severity = 'CRITICAL';
      description = 'Strategy has non-positive Sharpe ratio';
      recommendation = 'DO NOT DEPLOY - Strategy has no risk-adjusted returns';
    } else if (actualMonths >= requiredMonths) {
      passed = true;
      severity = 'LOW';
      description = `Track record length sufficient: ${actualMonths.toFixed(0)} months (required: ${requiredMonths.toFixed(0)} months for Sharpe ${sharpe.toFixed(2)})`;
      recommendation = 'Track record length is sufficient for statistical confidence';
    } else {
      severity = 'MODERATE';
      description = `Track record too short: ${actualMonths.toFixed(0)} months (required: ${requiredMonths.toFixed(0)} months for Sharpe ${sharpe.toFixed(2)})`;
      recommendation = `Extend backtest by ${(requiredMonths - actualMonths).toFixed(0)} months or verify results with additional out-of-sample data`;
    }

    console.log(`  ${passed ? '✅' : '❌'} Test 6: Track Record Length (${severity})`);
    console.log(`     Actual: ${actualMonths.toFixed(0)} months, Required: ${requiredMonths < 1000 ? requiredMonths.toFixed(0) : 'N/A'} months`);
    console.log(`     Sharpe: ${sharpe.toFixed(2)}`);

    return {
      type: 'track_record_length',
      severity,
      metricName: 'track_record_months',
      metricValue: actualMonths,
      thresholdValue: requiredMonths < 1000 ? requiredMonths : null,
      passed,
      description,
      recommendation
    };
  }

  /**
   * Generate overall assessment based on diagnostic results
   */
  _generateAssessment(diagnostics, run) {
    const severityCounts = {
      CRITICAL: diagnostics.filter(d => d.severity === 'CRITICAL').length,
      HIGH: diagnostics.filter(d => d.severity === 'HIGH').length,
      MODERATE: diagnostics.filter(d => d.severity === 'MODERATE').length,
      LOW: diagnostics.filter(d => d.severity === 'LOW').length
    };

    const passedCount = diagnostics.filter(d => d.passed).length;
    const totalTests = diagnostics.length;

    let overallRisk = 'MODERATE';
    let recommendation = '';
    let confidence = '';

    if (severityCounts.CRITICAL > 0) {
      overallRisk = 'CRITICAL';
      recommendation = '❌ DO NOT DEPLOY - Critical overfitting issues detected';
      confidence = 'Strategy results are NOT RELIABLE';
    } else if (severityCounts.HIGH >= 2) {
      overallRisk = 'HIGH';
      recommendation = '⚠️  NOT RECOMMENDED - Multiple high-severity issues detected';
      confidence = 'Strategy has SIGNIFICANT OVERFITTING RISK';
    } else if (severityCounts.HIGH === 1 || severityCounts.MODERATE >= 3) {
      overallRisk = 'MODERATE';
      recommendation = '⚠️  CAUTION - Some issues detected, monitor closely if deployed';
      confidence = 'Strategy may have MODERATE OVERFITTING RISK';
    } else if (passedCount >= 5) {
      overallRisk = 'LOW';
      recommendation = '✅ APPROVED - Strategy passes overfitting diagnostics';
      confidence = 'Strategy appears ROBUST and DEPLOYABLE';
    } else {
      overallRisk = 'MODERATE';
      recommendation = '⚠️  CAUTION - Mixed results, verify with additional testing';
      confidence = 'Strategy needs ADDITIONAL VALIDATION';
    }

    return {
      riskLevel: overallRisk,
      recommendation,
      confidence,
      testsRun: totalTests,
      testsPassed: passedCount,
      testsFailed: totalTests - passedCount,
      severityCounts,
      criticalIssues: diagnostics.filter(d => d.severity === 'CRITICAL')
    };
  }

  /**
   * Print comprehensive overfitting detection report
   */
  _printReport(diagnostics, assessment) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 OVERALL ASSESSMENT');
    console.log('='.repeat(70));

    console.log(`\n🎯 Overall Risk Level: ${assessment.riskLevel}`);
    console.log(`📋 Tests Passed: ${assessment.testsPassed} / ${assessment.testsRun}`);
    console.log(`💡 Confidence: ${assessment.confidence}`);
    console.log(`\n${assessment.recommendation}`);

    console.log(`\n📈 Severity Breakdown:`);
    console.log(`  CRITICAL: ${assessment.severityCounts.CRITICAL}`);
    console.log(`  HIGH:     ${assessment.severityCounts.HIGH}`);
    console.log(`  MODERATE: ${assessment.severityCounts.MODERATE}`);
    console.log(`  LOW:      ${assessment.severityCounts.LOW}`);

    if (assessment.criticalIssues.length > 0) {
      console.log(`\n🚨 Critical Issues:`);
      for (const issue of assessment.criticalIssues) {
        console.log(`  - ${issue.description}`);
        console.log(`    → ${issue.recommendation}`);
      }
    }

    console.log(`\n${'='.repeat(70)}`);
  }
}

module.exports = { OverfittingDetector };
