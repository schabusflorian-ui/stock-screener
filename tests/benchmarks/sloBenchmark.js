// tests/benchmarks/sloBenchmark.js
/**
 * Service Level Objective (SLO) Benchmark
 *
 * Defines and validates reliability targets for production trading:
 * - Prediction latency (p50, p95, p99)
 * - Batch throughput
 * - System availability
 * - Error rate
 * - Data freshness
 * - Model freshness
 *
 * SLO Targets:
 * - Prediction latency p50 < 10ms
 * - Prediction latency p99 < 100ms
 * - Batch throughput > 1000/sec
 * - Availability > 99.9%
 * - Error rate < 0.1%
 * - Data freshness < 1 hour
 * - Model freshness < 7 days
 */

const { performance } = require('perf_hooks');

class SLOBenchmark {
  constructor(options = {}) {
    // SLO definitions
    this.slos = {
      latencyP50Ms: options.latencyP50Ms || 10,
      latencyP95Ms: options.latencyP95Ms || 50,
      latencyP99Ms: options.latencyP99Ms || 100,
      batchThroughputPerSec: options.batchThroughputPerSec || 1000,
      availabilityPct: options.availabilityPct || 99.9,
      errorRatePct: options.errorRatePct || 0.1,
      dataFreshnessHours: options.dataFreshnessHours || 1,
      modelFreshnessDays: options.modelFreshnessDays || 7
    };

    this.results = [];
  }

  /**
   * Calculate percentile from sorted array
   */
  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Measure prediction latency percentiles
   */
  async measureLatencyPercentiles(predictFn, nRequests = 1000) {
    console.log(`\n  Measuring latency over ${nRequests} requests...`);

    const latencies = [];
    let errors = 0;

    for (let i = 0; i < nRequests; i++) {
      const start = performance.now();
      try {
        await predictFn();
        latencies.push(performance.now() - start);
      } catch (e) {
        errors++;
        latencies.push(performance.now() - start);
      }
    }

    const result = {
      name: 'latency_percentiles',
      nRequests,
      errors,
      errorRate: (errors / nRequests) * 100,
      p50: this.percentile(latencies, 50),
      p75: this.percentile(latencies, 75),
      p90: this.percentile(latencies, 90),
      p95: this.percentile(latencies, 95),
      p99: this.percentile(latencies, 99),
      max: Math.max(...latencies),
      mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      sloStatus: {
        p50: {
          target: `< ${this.slos.latencyP50Ms}ms`,
          actual: null,
          passed: false
        },
        p95: {
          target: `< ${this.slos.latencyP95Ms}ms`,
          actual: null,
          passed: false
        },
        p99: {
          target: `< ${this.slos.latencyP99Ms}ms`,
          actual: null,
          passed: false
        }
      }
    };

    // Check SLOs
    result.sloStatus.p50.actual = `${result.p50.toFixed(2)}ms`;
    result.sloStatus.p50.passed = result.p50 < this.slos.latencyP50Ms;

    result.sloStatus.p95.actual = `${result.p95.toFixed(2)}ms`;
    result.sloStatus.p95.passed = result.p95 < this.slos.latencyP95Ms;

    result.sloStatus.p99.actual = `${result.p99.toFixed(2)}ms`;
    result.sloStatus.p99.passed = result.p99 < this.slos.latencyP99Ms;

    result.passed = result.sloStatus.p50.passed &&
                    result.sloStatus.p95.passed &&
                    result.sloStatus.p99.passed;

    console.log(`    p50: ${result.p50.toFixed(2)}ms (target: <${this.slos.latencyP50Ms}ms) [${result.sloStatus.p50.passed ? 'PASS' : 'FAIL'}]`);
    console.log(`    p95: ${result.p95.toFixed(2)}ms (target: <${this.slos.latencyP95Ms}ms) [${result.sloStatus.p95.passed ? 'PASS' : 'FAIL'}]`);
    console.log(`    p99: ${result.p99.toFixed(2)}ms (target: <${this.slos.latencyP99Ms}ms) [${result.sloStatus.p99.passed ? 'PASS' : 'FAIL'}]`);
    console.log(`    Error rate: ${result.errorRate.toFixed(3)}%`);

    this.results.push(result);
    return result;
  }

  /**
   * Measure batch throughput
   */
  async measureThroughput(batchPredictFn, batchSize = 100, durationSec = 5) {
    console.log(`\n  Measuring throughput over ${durationSec}s with batch size ${batchSize}...`);

    const startTime = Date.now();
    const endTime = startTime + (durationSec * 1000);

    let totalPredictions = 0;
    let batches = 0;
    let errors = 0;
    const batchLatencies = [];

    while (Date.now() < endTime) {
      const batchStart = performance.now();
      try {
        await batchPredictFn(batchSize);
        totalPredictions += batchSize;
        batches++;
      } catch (e) {
        errors++;
      }
      batchLatencies.push(performance.now() - batchStart);
    }

    const actualDuration = (Date.now() - startTime) / 1000;
    const throughput = totalPredictions / actualDuration;

    const result = {
      name: 'throughput',
      batchSize,
      durationSec: actualDuration,
      totalPredictions,
      totalBatches: batches,
      errors,
      throughputPerSec: throughput,
      avgBatchLatencyMs: batchLatencies.reduce((a, b) => a + b, 0) / batchLatencies.length,
      sloStatus: {
        throughput: {
          target: `> ${this.slos.batchThroughputPerSec}/sec`,
          actual: `${throughput.toFixed(0)}/sec`,
          passed: throughput > this.slos.batchThroughputPerSec
        }
      },
      passed: throughput > this.slos.batchThroughputPerSec
    };

    console.log(`    Throughput: ${throughput.toFixed(0)} predictions/sec (target: >${this.slos.batchThroughputPerSec}/sec) [${result.passed ? 'PASS' : 'FAIL'}]`);
    console.log(`    Total predictions: ${totalPredictions}`);
    console.log(`    Avg batch latency: ${result.avgBatchLatencyMs.toFixed(2)}ms`);

    this.results.push(result);
    return result;
  }

  /**
   * Measure error rate under load
   */
  async measureErrorRate(predictFn, nRequests = 1000) {
    console.log(`\n  Measuring error rate over ${nRequests} requests...`);

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < nRequests; i++) {
      try {
        await predictFn();
        successes++;
      } catch (e) {
        failures++;
      }
    }

    const errorRate = (failures / nRequests) * 100;

    const result = {
      name: 'error_rate',
      nRequests,
      successes,
      failures,
      errorRatePct: errorRate,
      sloStatus: {
        errorRate: {
          target: `< ${this.slos.errorRatePct}%`,
          actual: `${errorRate.toFixed(3)}%`,
          passed: errorRate < this.slos.errorRatePct
        }
      },
      passed: errorRate < this.slos.errorRatePct
    };

    console.log(`    Error rate: ${errorRate.toFixed(3)}% (target: <${this.slos.errorRatePct}%) [${result.passed ? 'PASS' : 'FAIL'}]`);
    console.log(`    Successes: ${successes}, Failures: ${failures}`);

    this.results.push(result);
    return result;
  }

  /**
   * Check data freshness
   */
  async checkDataFreshness(getLastUpdateFn) {
    console.log('\n  Checking data freshness...');

    let lastUpdate;
    try {
      lastUpdate = await getLastUpdateFn();
    } catch (e) {
      lastUpdate = null;
    }

    const now = new Date();
    const hoursSinceUpdate = lastUpdate
      ? (now - lastUpdate) / (1000 * 60 * 60)
      : Infinity;

    const result = {
      name: 'data_freshness',
      lastUpdate: lastUpdate ? lastUpdate.toISOString() : null,
      hoursSinceUpdate,
      sloStatus: {
        freshness: {
          target: `< ${this.slos.dataFreshnessHours} hours`,
          actual: lastUpdate ? `${hoursSinceUpdate.toFixed(2)} hours` : 'N/A',
          passed: hoursSinceUpdate < this.slos.dataFreshnessHours
        }
      },
      passed: hoursSinceUpdate < this.slos.dataFreshnessHours
    };

    console.log(`    Last update: ${result.lastUpdate || 'Unknown'}`);
    console.log(`    Hours since update: ${hoursSinceUpdate.toFixed(2)} (target: <${this.slos.dataFreshnessHours}h) [${result.passed ? 'PASS' : 'FAIL'}]`);

    this.results.push(result);
    return result;
  }

  /**
   * Check model freshness
   */
  async checkModelFreshness(getModelMetadataFn) {
    console.log('\n  Checking model freshness...');

    let metadata;
    try {
      metadata = await getModelMetadataFn();
    } catch (e) {
      metadata = null;
    }

    const now = new Date();
    const lastTrainedDate = metadata?.lastTrained ? new Date(metadata.lastTrained) : null;
    const daysSinceTrain = lastTrainedDate
      ? (now - lastTrainedDate) / (1000 * 60 * 60 * 24)
      : Infinity;

    const result = {
      name: 'model_freshness',
      modelName: metadata?.name || 'Unknown',
      lastTrained: lastTrainedDate ? lastTrainedDate.toISOString() : null,
      daysSinceTrain,
      sloStatus: {
        freshness: {
          target: `< ${this.slos.modelFreshnessDays} days`,
          actual: lastTrainedDate ? `${daysSinceTrain.toFixed(1)} days` : 'N/A',
          passed: daysSinceTrain < this.slos.modelFreshnessDays
        }
      },
      passed: daysSinceTrain < this.slos.modelFreshnessDays
    };

    console.log(`    Model: ${result.modelName}`);
    console.log(`    Last trained: ${result.lastTrained || 'Unknown'}`);
    console.log(`    Days since training: ${daysSinceTrain.toFixed(1)} (target: <${this.slos.modelFreshnessDays}d) [${result.passed ? 'PASS' : 'FAIL'}]`);

    this.results.push(result);
    return result;
  }

  /**
   * Run full SLO benchmark with mock functions
   */
  async runFullBenchmark() {
    console.log('=' .repeat(70));
    console.log('SERVICE LEVEL OBJECTIVE (SLO) BENCHMARK');
    console.log('='.repeat(70));

    console.log('\nSLO Targets:');
    console.log(`  - Latency p50: < ${this.slos.latencyP50Ms}ms`);
    console.log(`  - Latency p95: < ${this.slos.latencyP95Ms}ms`);
    console.log(`  - Latency p99: < ${this.slos.latencyP99Ms}ms`);
    console.log(`  - Throughput: > ${this.slos.batchThroughputPerSec}/sec`);
    console.log(`  - Error rate: < ${this.slos.errorRatePct}%`);
    console.log(`  - Data freshness: < ${this.slos.dataFreshnessHours}h`);
    console.log(`  - Model freshness: < ${this.slos.modelFreshnessDays}d`);

    this.results = [];

    // Mock prediction function (simulates real inference)
    const mockPredict = async () => {
      // Simulate variable latency (most fast, some slow)
      const base = Math.random() < 0.95 ? 2 : 50;
      const jitter = Math.random() * base;
      await new Promise(r => setTimeout(r, jitter));

      // Occasional errors
      if (Math.random() < 0.0005) {
        throw new Error('Mock prediction error');
      }

      return { prediction: Math.random() * 0.1 - 0.05 };
    };

    // Mock batch prediction
    const mockBatchPredict = async (batchSize) => {
      const predictions = [];
      const baseLatency = 5 + Math.random() * 10; // 5-15ms for batch
      await new Promise(r => setTimeout(r, baseLatency));

      for (let i = 0; i < batchSize; i++) {
        predictions.push(Math.random() * 0.1 - 0.05);
      }
      return predictions;
    };

    // Mock data freshness check
    const mockGetLastUpdate = async () => {
      // Simulate data updated 30 minutes ago
      return new Date(Date.now() - 30 * 60 * 1000);
    };

    // Mock model metadata
    const mockGetModelMetadata = async () => {
      return {
        name: 'ensemble_v2',
        lastTrained: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        version: '2.1.0'
      };
    };

    // Run all benchmarks
    await this.measureLatencyPercentiles(mockPredict, 500);
    await this.measureThroughput(mockBatchPredict, 100, 3);
    await this.measureErrorRate(mockPredict, 500);
    await this.checkDataFreshness(mockGetLastUpdate);
    await this.checkModelFreshness(mockGetModelMetadata);

    return this.getSummary();
  }

  /**
   * Get summary of all SLO checks
   */
  getSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;

    const summary = {
      totalSLOs: total,
      passed,
      failed: total - passed,
      passRate: passed / total,
      overallStatus: passed === total ? 'PASS' : 'FAIL',
      sloDefinitions: this.slos,
      results: {}
    };

    for (const result of this.results) {
      summary.results[result.name] = {
        passed: result.passed,
        sloStatus: result.sloStatus
      };
    }

    console.log('\n' + '='.repeat(70));
    console.log('SLO SUMMARY');
    console.log('='.repeat(70));
    console.log(`SLOs Met: ${passed}/${total}`);
    console.log(`Overall Status: ${summary.overallStatus}`);

    if (summary.overallStatus === 'FAIL') {
      console.log('\nFailed SLOs:');
      for (const [name, result] of Object.entries(summary.results)) {
        if (!result.passed) {
          console.log(`  - ${name}`);
          for (const [metric, status] of Object.entries(result.sloStatus)) {
            if (!status.passed) {
              console.log(`      ${metric}: ${status.actual} (target: ${status.target})`);
            }
          }
        }
      }
    }

    return summary;
  }
}

// Run benchmark if executed directly
async function main() {
  const benchmark = new SLOBenchmark();
  const results = await benchmark.runFullBenchmark();

  // Save results
  const fs = require('fs');
  const path = require('path');

  const outputDir = path.join(__dirname, '../../benchmark_results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(
    outputDir,
    `slo_benchmark_${Date.now()}.json`
  );

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);

  return results;
}

module.exports = { SLOBenchmark };

if (require.main === module) {
  main().catch(console.error);
}
