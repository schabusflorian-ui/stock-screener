#!/usr/bin/env node
// tests/benchmarks/runProductionBenchmarks.js
/**
 * Production Benchmark Suite Runner
 *
 * Runs all production-readiness benchmarks for hedge fund deployment:
 * 1. Transaction Cost Analysis (TCA)
 * 2. Liquidity Stress Testing
 * 3. Operational Resilience
 * 4. SLO Validation
 *
 * Usage:
 *   node tests/benchmarks/runProductionBenchmarks.js [--quick]
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class ProductionBenchmarkRunner {
  constructor() {
    this.results = {};
    this.startTime = null;
    this.outputDir = path.join(__dirname, '../../benchmark_results');
  }

  /**
   * Run Python benchmark
   */
  async runPythonBenchmark(scriptName, description) {
    return new Promise((resolve, reject) => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Running: ${description}`);
      console.log('='.repeat(70));

      const scriptPath = path.join(__dirname, scriptName);

      if (!fs.existsSync(scriptPath)) {
        console.log(`  Warning: ${scriptName} not found, skipping...`);
        resolve({ skipped: true, reason: 'File not found' });
        return;
      }

      const python = spawn('python3', [scriptPath], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'inherit'
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, code });
        } else {
          resolve({ success: false, code });
        }
      });

      python.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Run JavaScript benchmark
   */
  async runJsBenchmark(modulePath, description) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Running: ${description}`);
    console.log('='.repeat(70));

    try {
      const benchmarkModule = require(modulePath);

      // Find the benchmark class
      const BenchmarkClass = Object.values(benchmarkModule).find(
        v => typeof v === 'function' && v.prototype
      );

      if (BenchmarkClass) {
        const benchmark = new BenchmarkClass();
        if (benchmark.runAll) {
          return await benchmark.runAll();
        } else if (benchmark.runFullBenchmark) {
          return await benchmark.runFullBenchmark();
        }
      }

      return { skipped: true, reason: 'No runnable benchmark found' };
    } catch (error) {
      console.error(`  Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run all production benchmarks
   */
  async runAll(options = {}) {
    this.startTime = Date.now();
    const quick = options.quick || false;

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║           PRODUCTION HEDGE FUND BENCHMARK SUITE                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log(`\nStarted: ${new Date().toISOString()}`);
    console.log(`Mode: ${quick ? 'Quick' : 'Full'}`);

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 1. Transaction Cost Analysis (Python)
    if (!quick) {
      this.results.tca = await this.runPythonBenchmark(
        'transactionCostBenchmark.py',
        'Transaction Cost Analysis (TCA)'
      );
    }

    // 2. Liquidity Stress Testing (Python)
    if (!quick) {
      this.results.liquidityStress = await this.runPythonBenchmark(
        'liquidityStressBenchmark.py',
        'Liquidity Stress Testing'
      );
    }

    // 3. Operational Resilience (JavaScript)
    this.results.resilience = await this.runJsBenchmark(
      './resilienceBenchmark.js',
      'Operational Resilience'
    );

    // 4. SLO Validation (JavaScript)
    this.results.slo = await this.runJsBenchmark(
      './sloBenchmark.js',
      'Service Level Objectives (SLO)'
    );

    // Generate summary
    const summary = this.generateSummary();

    // Save results
    await this.saveResults(summary);

    return summary;
  }

  /**
   * Generate summary of all benchmarks
   */
  generateSummary() {
    const duration = Date.now() - this.startTime;

    const summary = {
      timestamp: new Date().toISOString(),
      durationMs: duration,
      durationMin: (duration / 60000).toFixed(2),
      benchmarks: {},
      overallStatus: 'PASS'
    };

    let totalPassed = 0;
    let totalFailed = 0;

    for (const [name, result] of Object.entries(this.results)) {
      if (result.skipped) {
        summary.benchmarks[name] = {
          status: 'SKIPPED',
          reason: result.reason
        };
      } else if (result.overallStatus) {
        const passed = result.overallStatus === 'PASS';
        summary.benchmarks[name] = {
          status: result.overallStatus,
          passRate: result.passRate,
          details: result
        };
        if (passed) totalPassed++; else totalFailed++;
      } else if (result.success !== undefined) {
        const passed = result.success;
        summary.benchmarks[name] = {
          status: passed ? 'PASS' : 'FAIL'
        };
        if (passed) totalPassed++; else totalFailed++;
      }
    }

    summary.totalBenchmarks = totalPassed + totalFailed;
    summary.passed = totalPassed;
    summary.failed = totalFailed;
    summary.passRate = totalPassed / (totalPassed + totalFailed) || 0;

    if (totalFailed > 0) {
      summary.overallStatus = 'FAIL';
    }

    // Print summary
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                    BENCHMARK SUITE SUMMARY                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');

    console.log(`\nDuration: ${summary.durationMin} minutes`);
    console.log('\nBenchmark Results:');
    console.log('-'.repeat(70));

    for (const [name, result] of Object.entries(summary.benchmarks)) {
      const status = result.status;
      const statusColor = status === 'PASS' ? '\x1b[32m' : (status === 'FAIL' ? '\x1b[31m' : '\x1b[33m');
      console.log(`  ${name.padEnd(30)} [${statusColor}${status}\x1b[0m]`);
    }

    console.log('-'.repeat(70));
    console.log(`\nTotal: ${summary.passed}/${summary.totalBenchmarks} passed (${(summary.passRate * 100).toFixed(1)}%)`);

    const overallColor = summary.overallStatus === 'PASS' ? '\x1b[32m' : '\x1b[31m';
    console.log(`\nOverall Status: ${overallColor}${summary.overallStatus}\x1b[0m`);

    // Production readiness checklist
    console.log('\n' + '='.repeat(70));
    console.log('PRODUCTION READINESS CHECKLIST');
    console.log('='.repeat(70));

    const checklist = [
      { item: 'TCA Benchmark', key: 'tca' },
      { item: 'Liquidity Stress Testing', key: 'liquidityStress' },
      { item: 'Operational Resilience', key: 'resilience' },
      { item: 'SLO Compliance', key: 'slo' }
    ];

    for (const check of checklist) {
      const result = summary.benchmarks[check.key];
      let mark, color;
      if (!result || result.status === 'SKIPPED') {
        mark = '○';
        color = '\x1b[33m';
      } else if (result.status === 'PASS') {
        mark = '✓';
        color = '\x1b[32m';
      } else {
        mark = '✗';
        color = '\x1b[31m';
      }
      console.log(`  ${color}[${mark}]${'\x1b[0m'} ${check.item}`);
    }

    return summary;
  }

  /**
   * Save results to file
   */
  async saveResults(summary) {
    const filename = `production_benchmark_${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
    console.log(`\nResults saved to: ${filepath}`);

    // Also update the main benchmark results file
    const mainResultsPath = path.join(__dirname, '../../BENCHMARK_RESULTS.json');
    try {
      const existing = JSON.parse(fs.readFileSync(mainResultsPath, 'utf8'));
      existing.production_benchmarks = {
        timestamp: summary.timestamp,
        overall_status: summary.overallStatus,
        pass_rate: summary.passRate,
        benchmarks: Object.fromEntries(
          Object.entries(summary.benchmarks).map(([k, v]) => [k, v.status])
        )
      };
      fs.writeFileSync(mainResultsPath, JSON.stringify(existing, null, 2));
      console.log(`Updated: ${mainResultsPath}`);
    } catch (e) {
      // Main results file may not exist
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');

  const runner = new ProductionBenchmarkRunner();
  const results = await runner.runAll({ quick });

  // Exit with appropriate code
  process.exit(results.overallStatus === 'PASS' ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { ProductionBenchmarkRunner };
