/**
 * Stock Performance ML Benchmark Runner
 *
 * Orchestrates the Python ML benchmark and integrates with
 * existing JavaScript test infrastructure.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class StockPerformanceBenchmark {
  constructor(options = {}) {
    this.startDate = options.startDate || '2015-01-01';
    this.endDate = options.endDate || '2025-12-31';
    this.outputDir = options.outputDir || path.join(__dirname, '../../benchmark_results');
    this.verbose = options.verbose !== false;

    // Thresholds (moderate, user-selected)
    this.thresholds = {
      icMin: 0.03,
      directionAccuracyMin: 0.52,
      icirMin: 0.5,
      wfeMin: 0.30,
      wfeMax: 0.90,
      icGapMax: 0.60,
      stabilityMin: 0.40
    };
  }

  /**
   * Run the full Python benchmark suite
   */
  async runPythonBenchmark() {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(
        __dirname,
        '../../python/benchmarks/stock_performance_benchmark.py'
      );

      const outputFile = path.join(
        this.outputDir,
        `benchmark_${Date.now()}.json`
      );

      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const args = [
        pythonScript,
        '--full',
        '--start-date', this.startDate,
        '--end-date', this.endDate,
        '--output', outputFile
      ];

      if (!this.verbose) {
        args.push('--quiet');
      }

      if (this.verbose) {
        console.log('Running Python benchmark...');
        console.log(`  Start: ${this.startDate}`);
        console.log(`  End: ${this.endDate}`);
        console.log(`  Output: ${outputFile}`);
      }

      const python = spawn('python3', args, {
        cwd: path.join(__dirname, '../..'),
        stdio: this.verbose ? 'inherit' : 'pipe'
      });

      let stdout = '';
      let stderr = '';

      if (!this.verbose) {
        python.stdout.on('data', (data) => { stdout += data.toString(); });
        python.stderr.on('data', (data) => { stderr += data.toString(); });
      }

      python.on('close', (code) => {
        if (code === 0) {
          // Read results
          try {
            const results = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
            resolve({
              success: true,
              code,
              outputFile,
              results
            });
          } catch (e) {
            resolve({
              success: true,
              code,
              outputFile,
              results: null,
              parseError: e.message
            });
          }
        } else {
          reject({
            success: false,
            code,
            stdout,
            stderr
          });
        }
      });

      python.on('error', (err) => {
        reject({
          success: false,
          error: err.message
        });
      });
    });
  }

  /**
   * Run quick validation tests (without full Python benchmark)
   */
  async runQuickValidation() {
    const results = {
      timestamp: new Date().toISOString(),
      tests: [],
      passed: 0,
      failed: 0
    };

    // Test 1: Check if database exists
    const dbPath = path.join(__dirname, '../../data/stocks.db');
    const dbExists = fs.existsSync(dbPath);
    results.tests.push({
      name: 'Database exists',
      passed: dbExists,
      details: dbExists ? 'Found stocks.db' : 'Database not found'
    });
    if (dbExists) results.passed++; else results.failed++;

    // Test 2: Check if Python models exist
    const modelsDir = path.join(__dirname, '../../python/models');
    const requiredModels = ['stock_lstm.py', 'temporal_fusion.py', 'gradient_boosting.py'];
    const modelsExist = requiredModels.every(m => fs.existsSync(path.join(modelsDir, m)));
    results.tests.push({
      name: 'Python models exist',
      passed: modelsExist,
      details: modelsExist ? 'All model files found' : 'Missing model files'
    });
    if (modelsExist) results.passed++; else results.failed++;

    // Test 3: Check if checkpoints exist
    const checkpointDir = path.join(__dirname, '../../python/checkpoints');
    const checkpointsExist = fs.existsSync(checkpointDir);
    let checkpointCount = 0;
    if (checkpointsExist) {
      checkpointCount = fs.readdirSync(checkpointDir).filter(f => f.endsWith('.pt')).length;
    }
    results.tests.push({
      name: 'Model checkpoints available',
      passed: checkpointCount > 0,
      details: `Found ${checkpointCount} checkpoint files`
    });
    if (checkpointCount > 0) results.passed++; else results.failed++;

    // Test 4: Check Python dependencies
    const pythonCheck = await this._checkPythonDependencies();
    results.tests.push({
      name: 'Python dependencies',
      passed: pythonCheck.success,
      details: pythonCheck.details
    });
    if (pythonCheck.success) results.passed++; else results.failed++;

    results.passRate = results.passed / (results.passed + results.failed);
    results.status = results.passRate >= 0.75 ? 'READY' : 'NOT_READY';

    return results;
  }

  /**
   * Check Python dependencies
   */
  async _checkPythonDependencies() {
    return new Promise((resolve) => {
      const check = spawn('python3', ['-c', `
import sys
try:
    import torch
    import numpy
    import pandas
    import xgboost
    import scipy
    print('OK')
except ImportError as e:
    print(f'MISSING: {e}')
    sys.exit(1)
`]);

      let output = '';
      check.stdout.on('data', (data) => { output += data.toString(); });
      check.stderr.on('data', (data) => { output += data.toString(); });

      check.on('close', (code) => {
        resolve({
          success: code === 0,
          details: output.trim()
        });
      });

      check.on('error', () => {
        resolve({
          success: false,
          details: 'Python3 not found'
        });
      });
    });
  }

  /**
   * Validate benchmark results against thresholds
   */
  validateResults(results) {
    if (!results || !results.phases) {
      return { valid: false, error: 'No results to validate' };
    }

    const validation = {
      valid: true,
      models: {},
      summary: {
        passed: 0,
        failed: 0,
        warnings: []
      }
    };

    const modelBenchmarks = results.phases.model_benchmarks?.models || {};
    const overfitting = results.phases.overfitting?.models || {};

    for (const [modelName, metrics] of Object.entries(modelBenchmarks)) {
      const modelValidation = {
        ic: { value: metrics.metrics?.ic, threshold: this.thresholds.icMin, passed: false },
        direction: { value: metrics.metrics?.direction_accuracy, threshold: this.thresholds.directionAccuracyMin, passed: false },
        wfe: { value: null, threshold: [this.thresholds.wfeMin, this.thresholds.wfeMax], passed: false }
      };

      // Check IC
      if (modelValidation.ic.value >= this.thresholds.icMin) {
        modelValidation.ic.passed = true;
      }

      // Check direction accuracy
      if (modelValidation.direction.value >= this.thresholds.directionAccuracyMin) {
        modelValidation.direction.passed = true;
      }

      // Check WFE from overfitting results
      const ofMetrics = overfitting[modelName]?.metrics || {};
      modelValidation.wfe.value = ofMetrics.wfe;
      if (ofMetrics.wfe >= this.thresholds.wfeMin && ofMetrics.wfe <= this.thresholds.wfeMax) {
        modelValidation.wfe.passed = true;
      }

      const modelPassed = modelValidation.ic.passed && modelValidation.direction.passed && modelValidation.wfe.passed;
      validation.models[modelName] = {
        ...modelValidation,
        passed: modelPassed
      };

      if (modelPassed) {
        validation.summary.passed++;
      } else {
        validation.summary.failed++;
      }
    }

    validation.summary.passRate = validation.summary.passed /
      (validation.summary.passed + validation.summary.failed);

    validation.valid = validation.summary.passRate >= 0.6; // At least 3/5 models pass

    return validation;
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(results) {
    const summary = results.summary || {};
    const modelBenchmarks = results.phases?.model_benchmarks?.models || {};
    const overfitting = results.phases?.overfitting?.models || {};

    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Stock Performance ML Benchmark Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a2e; }
    .status-pass { color: #10b981; font-weight: bold; }
    .status-fail { color: #ef4444; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
    th { background: #f3f4f6; }
    .metric { font-family: monospace; }
    .section { margin: 30px 0; }
  </style>
</head>
<body>
  <h1>Stock Performance ML Benchmark Report</h1>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <p><strong>Period:</strong> ${results.config?.start_date} to ${results.config?.end_date}</p>
  <p><strong>Overall Status:</strong> <span class="${summary.overall_status === 'PRODUCTION_READY' ? 'status-pass' : 'status-fail'}">${summary.overall_status}</span></p>

  <div class="section">
    <h2>Model Comparison</h2>
    <table>
      <tr>
        <th>Model</th>
        <th>IC</th>
        <th>Rank IC</th>
        <th>Direction</th>
        <th>Sharpe</th>
        <th>WFE</th>
        <th>Status</th>
      </tr>
`;

    for (const [model, data] of Object.entries(modelBenchmarks)) {
      const of = overfitting[model]?.metrics || {};
      const status = data.status === 'PASS' ? 'PASS' : 'FAIL';
      html += `
      <tr>
        <td>${model}</td>
        <td class="metric">${(data.metrics?.ic || 0).toFixed(4)}</td>
        <td class="metric">${(data.metrics?.rank_ic || 0).toFixed(4)}</td>
        <td class="metric">${((data.metrics?.direction_accuracy || 0) * 100).toFixed(1)}%</td>
        <td class="metric">${(data.metrics?.sharpe || 0).toFixed(2)}</td>
        <td class="metric">${((of.wfe || 0) * 100).toFixed(1)}%</td>
        <td class="${status === 'PASS' ? 'status-pass' : 'status-fail'}">${status}</td>
      </tr>
`;
    }

    html += `
    </table>
  </div>

  <div class="section">
    <h2>Recommendations</h2>
    <ul>
`;

    for (const rec of (summary.recommendations || [])) {
      html += `      <li>${rec}</li>\n`;
    }

    html += `
    </ul>
  </div>

  <div class="section">
    <h2>Duration</h2>
    <p>${(results.duration_sec || 0).toFixed(1)} seconds</p>
  </div>
</body>
</html>
`;

    return html;
  }
}

// CLI runner
async function main() {
  console.log('='.repeat(70));
  console.log('STOCK PERFORMANCE ML BENCHMARK');
  console.log('='.repeat(70));

  const benchmark = new StockPerformanceBenchmark({
    startDate: '2015-01-01',
    endDate: '2025-12-31',
    verbose: true
  });

  // Quick validation first
  console.log('\nRunning quick validation...\n');
  const quickResults = await benchmark.runQuickValidation();

  console.log('Quick Validation Results:');
  for (const test of quickResults.tests) {
    const status = test.passed ? '[PASS]' : '[FAIL]';
    console.log(`  ${status} ${test.name}: ${test.details}`);
  }
  console.log(`\nStatus: ${quickResults.status}`);

  if (quickResults.status !== 'READY') {
    console.log('\nWarning: System not fully ready for benchmark.');
    console.log('Some tests may fail or produce incomplete results.\n');
  }

  // Run full benchmark
  console.log('\n' + '-'.repeat(70));
  console.log('Running full Python benchmark...\n');

  try {
    const result = await benchmark.runPythonBenchmark();

    if (result.success && result.results) {
      // Validate results
      const validation = benchmark.validateResults(result.results);

      console.log('\n' + '='.repeat(70));
      console.log('VALIDATION RESULTS');
      console.log('='.repeat(70));

      for (const [model, data] of Object.entries(validation.models)) {
        const status = data.passed ? 'PASS' : 'FAIL';
        console.log(`${model}: IC=${data.ic.passed ? 'OK' : 'LOW'}, Direction=${data.direction.passed ? 'OK' : 'LOW'}, WFE=${data.wfe.passed ? 'OK' : 'OUT_OF_RANGE'} [${status}]`);
      }

      console.log(`\nOverall: ${validation.summary.passed}/${validation.summary.passed + validation.summary.failed} models passed`);

      // Generate HTML report
      const htmlReport = benchmark.generateHtmlReport(result.results);
      const htmlPath = path.join(benchmark.outputDir, `report_${Date.now()}.html`);
      fs.writeFileSync(htmlPath, htmlReport);
      console.log(`\nHTML report saved to: ${htmlPath}`);

    } else {
      console.log('Benchmark completed but results could not be parsed.');
      console.log(`Output file: ${result.outputFile}`);
    }
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { StockPerformanceBenchmark };

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
