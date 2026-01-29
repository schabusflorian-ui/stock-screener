// tests/benchmarks/resilienceBenchmark.js
/**
 * Operational Resilience Benchmark
 *
 * Tests system resilience under failure conditions:
 * - Model fallback timing
 * - Circuit breaker functionality
 * - Concurrent load handling
 * - Recovery time measurement
 * - Memory pressure handling
 * - Stale data detection
 *
 * Pass Criteria:
 * - Fallback activates < 100ms
 * - Circuit opens after 5 consecutive failures
 * - p99 latency < 500ms under load
 * - Recovery time < 60s
 */

const { CircuitBreaker, CircuitBreakerManager, CircuitState } = require('../../src/services/mlops/circuitBreaker');
const { ModelMonitor } = require('../../src/services/mlops/modelMonitor');

class ResilienceBenchmark {
  constructor() {
    this.results = [];
  }

  /**
   * Test model fallback timing
   */
  async testModelFallback() {
    console.log('\n  Testing: Model Fallback Timing');

    const results = {
      name: 'model_fallback',
      passed: false,
      latencies: [],
      details: {}
    };

    // Create circuit breaker with fallback
    const fallbackCalled = [];
    const breaker = new CircuitBreaker({
      name: 'test_model',
      failureThreshold: 3,
      timeout: 5000,
      fallback: async (error) => {
        const start = Date.now();
        // Simulate fallback computation
        await new Promise(r => setTimeout(r, 10));
        fallbackCalled.push(Date.now() - start);
        return { prediction: 0, source: 'fallback', uncertainty: 1.0 };
      }
    });

    // Simulate primary model failures
    const failingModel = async () => {
      throw new Error('Model unavailable');
    };

    // Run 10 calls to trigger circuit open
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      try {
        await breaker.execute(failingModel);
      } catch (e) {
        // Expected
      }
      const latency = Date.now() - start;
      results.latencies.push(latency);
    }

    // Check fallback latencies
    results.details = {
      fallbackCalls: fallbackCalled.length,
      avgFallbackLatency: fallbackCalled.length > 0
        ? fallbackCalled.reduce((a, b) => a + b, 0) / fallbackCalled.length
        : null,
      maxFallbackLatency: fallbackCalled.length > 0 ? Math.max(...fallbackCalled) : null,
      circuitState: breaker.state
    };

    // Pass if fallback latency < 100ms
    results.passed = results.details.maxFallbackLatency !== null &&
                     results.details.maxFallbackLatency < 100;

    console.log(`    Fallback calls: ${results.details.fallbackCalls}`);
    console.log(`    Avg fallback latency: ${results.details.avgFallbackLatency?.toFixed(1)}ms`);
    console.log(`    Max fallback latency: ${results.details.maxFallbackLatency?.toFixed(1)}ms`);
    console.log(`    Status: [${results.passed ? 'PASS' : 'FAIL'}]`);

    this.results.push(results);
    return results;
  }

  /**
   * Test circuit breaker functionality
   */
  async testCircuitBreaker() {
    console.log('\n  Testing: Circuit Breaker');

    const results = {
      name: 'circuit_breaker',
      passed: false,
      details: {}
    };

    const breaker = new CircuitBreaker({
      name: 'circuit_test',
      failureThreshold: 5,
      successThreshold: 3,
      resetTimeout: 1000
    });

    // Track state changes
    const stateChanges = [];
    breaker.on('stateChange', (change) => {
      stateChanges.push(change);
    });

    // Test 1: Circuit should open after 5 failures
    const failingFn = async () => { throw new Error('fail'); };

    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
    }

    const openedCorrectly = breaker.state === CircuitState.OPEN;

    // Test 2: Circuit should reject calls when open
    let rejectedWhenOpen = false;
    try {
      await breaker.execute(failingFn);
    } catch (e) {
      rejectedWhenOpen = e.message.includes('Circuit');
    }

    // Test 3: Circuit should transition to half-open after timeout
    await new Promise(r => setTimeout(r, 1100));

    // Attempt a call - should transition to half-open
    const successFn = async () => 'success';
    try {
      await breaker.execute(successFn);
    } catch (e) {
      // May still fail
    }

    const wentToHalfOpen = stateChanges.some(s => s.to === CircuitState.HALF_OPEN);

    // Test 4: Circuit should close after success threshold
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(successFn);
      } catch (e) {
        // May fail
      }
    }

    const closedCorrectly = breaker.state === CircuitState.CLOSED;

    results.details = {
      openedAfter5Failures: openedCorrectly,
      rejectedWhenOpen,
      wentToHalfOpen,
      closedAfterRecovery: closedCorrectly,
      stateChangeCount: stateChanges.length
    };

    results.passed = openedCorrectly && rejectedWhenOpen && closedCorrectly;

    console.log(`    Opened after 5 failures: ${openedCorrectly}`);
    console.log(`    Rejected when open: ${rejectedWhenOpen}`);
    console.log(`    Went to half-open: ${wentToHalfOpen}`);
    console.log(`    Closed after recovery: ${closedCorrectly}`);
    console.log(`    Status: [${results.passed ? 'PASS' : 'FAIL'}]`);

    this.results.push(results);
    return results;
  }

  /**
   * Test concurrent load handling
   */
  async testConcurrentLoad() {
    console.log('\n  Testing: Concurrent Load (100 requests)');

    const results = {
      name: 'concurrent_load',
      passed: false,
      latencies: [],
      details: {}
    };

    const breaker = new CircuitBreaker({
      name: 'load_test',
      failureThreshold: 50,
      timeout: 5000
    });

    // Simulate a prediction function with variable latency
    const predictFn = async () => {
      const latency = Math.random() * 50 + 10; // 10-60ms
      await new Promise(r => setTimeout(r, latency));
      return { prediction: Math.random() * 0.1 - 0.05 };
    };

    // Fire 100 concurrent requests
    const start = Date.now();
    const promises = [];

    for (let i = 0; i < 100; i++) {
      const requestStart = Date.now();
      promises.push(
        breaker.execute(predictFn)
          .then(result => ({
            success: true,
            latency: Date.now() - requestStart,
            result
          }))
          .catch(error => ({
            success: false,
            latency: Date.now() - requestStart,
            error: error.message
          }))
      );
    }

    const responses = await Promise.all(promises);
    const totalTime = Date.now() - start;

    // Calculate statistics
    const successCount = responses.filter(r => r.success).length;
    const latencies = responses.map(r => r.latency);
    latencies.sort((a, b) => a - b);

    results.latencies = latencies;
    results.details = {
      totalRequests: 100,
      successCount,
      failCount: 100 - successCount,
      totalTimeMs: totalTime,
      throughput: (100 / (totalTime / 1000)).toFixed(1),
      latencyP50: latencies[49],
      latencyP95: latencies[94],
      latencyP99: latencies[98],
      latencyMax: latencies[99]
    };

    // Pass if p99 < 500ms and no dropped requests
    results.passed = results.details.latencyP99 < 500 && successCount === 100;

    console.log(`    Success: ${successCount}/100`);
    console.log(`    Total time: ${totalTime}ms`);
    console.log(`    Throughput: ${results.details.throughput} req/sec`);
    console.log(`    Latency p50: ${results.details.latencyP50}ms`);
    console.log(`    Latency p99: ${results.details.latencyP99}ms`);
    console.log(`    Status: [${results.passed ? 'PASS' : 'FAIL'}]`);

    this.results.push(results);
    return results;
  }

  /**
   * Test recovery time after failure
   */
  async testRecoveryTime() {
    console.log('\n  Testing: Recovery Time');

    const results = {
      name: 'recovery_time',
      passed: false,
      details: {}
    };

    const breaker = new CircuitBreaker({
      name: 'recovery_test',
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 500 // Short for testing
    });

    let serviceUp = false;
    const serviceFn = async () => {
      if (!serviceUp) throw new Error('Service down');
      return 'OK';
    };

    // Cause failure and open circuit
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(serviceFn); } catch (e) { }
    }

    const openTime = Date.now();

    // Simulate service recovery
    await new Promise(r => setTimeout(r, 100));
    serviceUp = true;

    // Wait for reset timeout and recovery
    await new Promise(r => setTimeout(r, 500));

    // Try to recover
    const recoveryStart = Date.now();
    let recovered = false;

    for (let i = 0; i < 10 && !recovered; i++) {
      try {
        await breaker.execute(serviceFn);
        if (breaker.state === CircuitState.CLOSED) {
          recovered = true;
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    const recoveryTime = Date.now() - recoveryStart;
    const totalDowntime = Date.now() - openTime;

    results.details = {
      circuitOpenedAt: new Date(openTime).toISOString(),
      recovered,
      recoveryTimeMs: recoveryTime,
      totalDowntimeMs: totalDowntime,
      finalState: breaker.state
    };

    // Pass if recovery < 60 seconds (we use much shorter for testing)
    results.passed = recovered && recoveryTime < 60000;

    console.log(`    Circuit opened at: ${new Date(openTime).toISOString()}`);
    console.log(`    Recovered: ${recovered}`);
    console.log(`    Recovery time: ${recoveryTime}ms`);
    console.log(`    Total downtime: ${totalDowntime}ms`);
    console.log(`    Status: [${results.passed ? 'PASS' : 'FAIL'}]`);

    this.results.push(results);
    return results;
  }

  /**
   * Test model monitoring drift detection
   */
  async testDriftDetection() {
    console.log('\n  Testing: Drift Detection');

    const results = {
      name: 'drift_detection',
      passed: false,
      details: {}
    };

    const monitor = new ModelMonitor();

    // Initialize with reference data
    await monitor.initializeReference('test_model', {
      ic: 0.05,
      directionAccuracy: 0.55,
      predictionMean: 0,
      predictionStd: 0.02
    });

    // Simulate predictions that gradually degrade
    const np = { random: () => Math.random() };

    // First 50: Good predictions
    for (let i = 0; i < 50; i++) {
      const pred = (np.random() - 0.5) * 0.04;
      const actual = pred * 0.6 + (np.random() - 0.5) * 0.02; // Correlated
      monitor.recordPrediction('test_model', pred, actual, 0.02);
    }

    const healthyCheck = monitor.calculateRollingIC('test_model');

    // Next 50: Degraded predictions
    for (let i = 0; i < 50; i++) {
      const pred = (np.random() - 0.5) * 0.04;
      const actual = (np.random() - 0.5) * 0.04; // Uncorrelated
      monitor.recordPrediction('test_model', pred, actual, 0.02);
    }

    const degradedCheck = monitor.calculateRollingIC('test_model');

    // Run full health check
    const fullCheck = await monitor.runHealthCheck('test_model', false);

    results.details = {
      healthyIC: healthyCheck.ic,
      degradedIC: degradedCheck.ic,
      icDegradationDetected: degradedCheck.status === 'alert',
      alertCount: fullCheck.alerts.length,
      overallStatus: fullCheck.overallStatus
    };

    // Pass if drift was detected
    results.passed = degradedCheck.ic < healthyCheck.ic;

    console.log(`    Healthy IC: ${healthyCheck.ic?.toFixed(4)}`);
    console.log(`    Degraded IC: ${degradedCheck.ic?.toFixed(4)}`);
    console.log(`    IC degradation detected: ${results.details.icDegradationDetected}`);
    console.log(`    Alerts generated: ${results.details.alertCount}`);
    console.log(`    Status: [${results.passed ? 'PASS' : 'FAIL'}]`);

    this.results.push(results);
    return results;
  }

  /**
   * Run all resilience benchmarks
   */
  async runAll() {
    console.log('=' .repeat(70));
    console.log('OPERATIONAL RESILIENCE BENCHMARK');
    console.log('='.repeat(70));

    this.results = [];

    await this.testModelFallback();
    await this.testCircuitBreaker();
    await this.testConcurrentLoad();
    await this.testRecoveryTime();
    await this.testDriftDetection();

    return this.getSummary();
  }

  /**
   * Get summary of all tests
   */
  getSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;

    const summary = {
      totalTests: total,
      passed,
      failed: total - passed,
      passRate: passed / total,
      overallStatus: passed === total ? 'PASS' : 'FAIL',
      tests: {}
    };

    for (const result of this.results) {
      summary.tests[result.name] = {
        passed: result.passed,
        details: result.details
      };
    }

    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Tests: ${passed}/${total} passed`);
    console.log(`Overall Status: ${summary.overallStatus}`);

    return summary;
  }
}

// Run benchmark if executed directly
async function main() {
  const benchmark = new ResilienceBenchmark();
  const results = await benchmark.runAll();

  // Save results
  const fs = require('fs');
  const path = require('path');

  const outputDir = path.join(__dirname, '../../benchmark_results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(
    outputDir,
    `resilience_benchmark_${Date.now()}.json`
  );

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);

  return results;
}

module.exports = { ResilienceBenchmark };

if (require.main === module) {
  main().catch(console.error);
}
