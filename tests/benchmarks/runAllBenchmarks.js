#!/usr/bin/env node
// tests/benchmarks/runAllBenchmarks.js
// Master benchmark runner - runs all performance tests and generates comprehensive report

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '../..');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'benchmark_results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const results = {
  timestamp: new Date().toISOString(),
  system: getSystemInfo(),
  tests: {},
  mlBenchmarks: null,
  apiBenchmarks: null,
  summary: {}
};

function getSystemInfo() {
  try {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: require('os').cpus().length,
      totalMemoryGB: (require('os').totalmem() / 1024 / 1024 / 1024).toFixed(2),
      freeMemoryGB: (require('os').freemem() / 1024 / 1024 / 1024).toFixed(2)
    };
  } catch (e) {
    return { error: e.message };
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (options.silent) {
      proc.stdout.on('data', data => stdout += data.toString());
      proc.stderr.on('data', data => stderr += data.toString());
    }

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

async function runTestSuite(name, testFile) {
  console.log(`\n📋 Running ${name}...`);
  const startTime = Date.now();

  try {
    const result = await runCommand('node', [testFile], { silent: true });
    const duration = Date.now() - startTime;

    // Parse results from output
    const passMatch = result.stdout.match(/Passed:\s*(\d+)/);
    const failMatch = result.stdout.match(/Failed:\s*(\d+)/);
    const skipMatch = result.stdout.match(/Skipped:\s*(\d+)/);

    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    const skipped = skipMatch ? parseInt(skipMatch[1]) : 0;

    const status = result.code === 0 ? 'PASS' : 'FAIL';
    console.log(`   ${status === 'PASS' ? '✓' : '✗'} ${name}: ${passed} passed, ${failed} failed (${duration}ms)`);

    return {
      name,
      status,
      passed,
      failed,
      skipped,
      duration,
      exitCode: result.code
    };
  } catch (e) {
    console.log(`   ✗ ${name}: ERROR - ${e.message}`);
    return {
      name,
      status: 'ERROR',
      error: e.message,
      duration: Date.now() - startTime
    };
  }
}

async function runMLBenchmarks() {
  console.log('\n📊 Running ML Performance Benchmarks...');
  const startTime = Date.now();

  try {
    const result = await runCommand('python3', [
      path.join(PROJECT_ROOT, 'python/benchmarks/ml_benchmark.py'),
      '--iterations', '30',
      '--output', path.join(RESULTS_DIR, `ml_benchmark_${timestamp}.json`)
    ], { silent: true });

    const duration = Date.now() - startTime;

    // Try to read the output file
    const outputFile = path.join(RESULTS_DIR, `ml_benchmark_${timestamp}.json`);
    let benchmarkData = null;

    if (fs.existsSync(outputFile)) {
      benchmarkData = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    }

    console.log(`   ✓ ML Benchmarks complete (${duration}ms)`);

    if (benchmarkData && benchmarkData.summary) {
      console.log(`     Total benchmarks: ${benchmarkData.summary.total_benchmarks}`);
      Object.entries(benchmarkData.summary.by_category || {}).forEach(([cat, stats]) => {
        console.log(`     ${cat}: ${stats.avg_mean_ms.toFixed(2)}ms avg`);
      });
    }

    return benchmarkData;
  } catch (e) {
    console.log(`   ✗ ML Benchmarks failed: ${e.message}`);
    return { error: e.message };
  }
}

async function runEndToEndTests() {
  console.log('\n🔗 Running End-to-End Integration Tests...');

  const testSuites = [
    { name: 'Explainability (SHAP)', file: 'tests/explainability/explainabilityTest.js' },
    { name: 'Reinforcement Learning', file: 'tests/rl/rlTest.js' },
    { name: 'Ensemble Models', file: 'tests/ensemble/ensembleTest.js' },
    { name: 'MLOps', file: 'tests/mlops/mlopsTest.js' },
    { name: 'Feature Store', file: 'tests/feature-store/featureStoreTest.js' },
    { name: 'Unified Strategy', file: 'tests/unified-strategy/runAllTests.js' },
  ];

  const testResults = [];

  for (const suite of testSuites) {
    const testFile = path.join(PROJECT_ROOT, suite.file);
    if (fs.existsSync(testFile)) {
      const result = await runTestSuite(suite.name, testFile);
      testResults.push(result);
    } else {
      console.log(`   ○ ${suite.name}: Skipped (file not found)`);
      testResults.push({ name: suite.name, status: 'SKIPPED', reason: 'File not found' });
    }
  }

  return testResults;
}

function generateReport(results) {
  const report = [];

  report.push('=' .repeat(70));
  report.push('COMPREHENSIVE BENCHMARK REPORT');
  report.push('='.repeat(70));
  report.push(`Timestamp: ${results.timestamp}`);
  report.push(`Platform: ${results.system.platform} (${results.system.arch})`);
  report.push(`Node: ${results.system.nodeVersion}`);
  report.push(`CPUs: ${results.system.cpus} | Memory: ${results.system.freeMemoryGB}GB / ${results.system.totalMemoryGB}GB`);
  report.push('');

  // Test Results Summary
  report.push('TEST RESULTS');
  report.push('-'.repeat(70));

  const testResults = results.tests || [];
  const totalPassed = testResults.reduce((sum, t) => sum + (t.passed || 0), 0);
  const totalFailed = testResults.reduce((sum, t) => sum + (t.failed || 0), 0);
  const totalSkipped = testResults.reduce((sum, t) => sum + (t.skipped || 0), 0);

  report.push(`Total Tests: ${totalPassed + totalFailed + totalSkipped}`);
  report.push(`Passed: ${totalPassed} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`);
  report.push(`Pass Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
  report.push('');

  testResults.forEach(t => {
    const icon = t.status === 'PASS' ? '✓' : t.status === 'FAIL' ? '✗' : '○';
    report.push(`  ${icon} ${t.name}: ${t.passed || 0} passed, ${t.failed || 0} failed (${t.duration}ms)`);
  });
  report.push('');

  // ML Benchmarks Summary
  if (results.mlBenchmarks && results.mlBenchmarks.summary) {
    report.push('ML PERFORMANCE BENCHMARKS');
    report.push('-'.repeat(70));

    const mlSummary = results.mlBenchmarks.summary;
    report.push(`Total Benchmarks: ${mlSummary.total_benchmarks}`);
    report.push('');

    Object.entries(mlSummary.by_category || {}).forEach(([cat, stats]) => {
      report.push(`  ${cat}:`);
      report.push(`    Avg Latency: ${stats.avg_mean_ms.toFixed(3)}ms`);
      report.push(`    Range: ${stats.min_mean_ms.toFixed(3)}ms - ${stats.max_mean_ms.toFixed(3)}ms`);
      report.push(`    Fastest: ${stats.fastest}`);
    });
    report.push('');

    if (mlSummary.recommendations && mlSummary.recommendations.length > 0) {
      report.push('Recommendations:');
      mlSummary.recommendations.slice(0, 5).forEach(rec => {
        report.push(`  ${rec}`);
      });
      report.push('');
    }
  }

  // Performance Summary
  report.push('PERFORMANCE SUMMARY');
  report.push('-'.repeat(70));

  const performanceMetrics = [];

  if (results.mlBenchmarks && results.mlBenchmarks.results) {
    // XGBoost single prediction
    const xgbSingle = results.mlBenchmarks.results.find(r =>
      r.name.includes('XGBoost predict (1 sample') && r.name.includes('10 features'));
    if (xgbSingle) {
      performanceMetrics.push(`XGBoost Single Prediction: ${xgbSingle.mean_ms.toFixed(3)}ms`);
    }

    // SHAP explanation
    const shapSingle = results.mlBenchmarks.results.find(r =>
      r.name.includes('SHAP TreeExplainer (1 sample'));
    if (shapSingle) {
      performanceMetrics.push(`SHAP Single Explanation: ${shapSingle.mean_ms.toFixed(3)}ms`);
    }

    // RL inference
    const rlSingle = results.mlBenchmarks.results.find(r =>
      r.name.includes('RL Actor inference'));
    if (rlSingle) {
      performanceMetrics.push(`RL Agent Inference: ${rlSingle.mean_ms.toFixed(3)}ms`);
    }
  }

  performanceMetrics.forEach(m => report.push(`  ${m}`));
  report.push('');

  // Overall Status
  report.push('OVERALL STATUS');
  report.push('-'.repeat(70));

  const overallStatus = totalFailed === 0 ? 'PASS' : 'FAIL';
  report.push(`Status: ${overallStatus}`);

  if (overallStatus === 'PASS') {
    report.push('All tests passed. System is ready for production.');
  } else {
    report.push(`${totalFailed} test(s) failed. Please review and fix before deploying.`);
  }

  report.push('');
  report.push('='.repeat(70));

  return report.join('\n');
}

async function main() {
  console.log('='.repeat(70));
  console.log('COMPREHENSIVE BENCHMARK SUITE');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`Results directory: ${RESULTS_DIR}`);
  console.log('='.repeat(70));

  // Run all test suites
  results.tests = await runEndToEndTests();

  // Run ML benchmarks
  results.mlBenchmarks = await runMLBenchmarks();

  // Calculate summary
  const totalPassed = results.tests.reduce((sum, t) => sum + (t.passed || 0), 0);
  const totalFailed = results.tests.reduce((sum, t) => sum + (t.failed || 0), 0);

  results.summary = {
    totalTests: totalPassed + totalFailed,
    passed: totalPassed,
    failed: totalFailed,
    passRate: totalPassed / (totalPassed + totalFailed) * 100,
    overallStatus: totalFailed === 0 ? 'PASS' : 'FAIL'
  };

  // Generate and print report
  const report = generateReport(results);
  console.log('\n' + report);

  // Save results
  const jsonPath = path.join(RESULTS_DIR, `full_benchmark_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 JSON results saved to: ${jsonPath}`);

  const reportPath = path.join(RESULTS_DIR, `benchmark_report_${timestamp}.txt`);
  fs.writeFileSync(reportPath, report);
  console.log(`📄 Text report saved to: ${reportPath}`);

  // Exit code based on test results
  process.exit(results.summary.overallStatus === 'PASS' ? 0 : 1);
}

main().catch(err => {
  console.error('Benchmark suite failed:', err);
  process.exit(1);
});
