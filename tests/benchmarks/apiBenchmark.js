// tests/benchmarks/apiBenchmark.js
// Comprehensive API endpoint performance benchmarking

const http = require('http');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  iterations: 20,
  warmupIterations: 3,
  concurrentRequests: 5,
  timeoutMs: 30000
};

// Benchmark results
const results = {
  timestamp: new Date().toISOString(),
  config: CONFIG,
  endpoints: [],
  summary: {}
};

// Helper to make HTTP request with timing
function timedRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const startTime = process.hrtime.bigint();

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1e6;
        resolve({
          statusCode: res.statusCode,
          data: data,
          durationMs,
          success: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });

    req.on('error', (err) => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;
      resolve({
        statusCode: 0,
        error: err.message,
        durationMs,
        success: false
      });
    });

    req.setTimeout(CONFIG.timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Calculate statistics
function calculateStats(times) {
  if (times.length === 0) return null;

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);

  return {
    count: times.length,
    mean: sum / times.length,
    std: Math.sqrt(times.reduce((acc, t) => acc + Math.pow(t - sum/times.length, 2), 0) / times.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    throughputPerSec: 1000 / (sum / times.length)
  };
}

// Benchmark a single endpoint
async function benchmarkEndpoint(name, method, path, body = null, options = {}) {
  const iterations = options.iterations || CONFIG.iterations;
  const warmup = options.warmup || CONFIG.warmupIterations;

  const requestOptions = {
    hostname: 'localhost',
    port: 3000,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

  const times = [];
  const errors = [];

  // Warmup
  for (let i = 0; i < warmup; i++) {
    try {
      await timedRequest(requestOptions, body);
    } catch (e) {
      // Ignore warmup errors
    }
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    try {
      const result = await timedRequest(requestOptions, body);
      if (result.success) {
        times.push(result.durationMs);
      } else {
        errors.push(result.error || `Status ${result.statusCode}`);
      }
    } catch (e) {
      errors.push(e.message);
    }
  }

  const stats = calculateStats(times);

  return {
    name,
    method,
    path,
    iterations,
    successful: times.length,
    failed: errors.length,
    stats,
    errors: errors.slice(0, 5) // Keep first 5 errors
  };
}

// Benchmark concurrent requests
async function benchmarkConcurrent(name, method, path, body = null, concurrency = CONFIG.concurrentRequests) {
  const requestOptions = {
    hostname: 'localhost',
    port: 3000,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

  const startTime = process.hrtime.bigint();

  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(timedRequest(requestOptions, body));
  }

  const results = await Promise.all(promises);
  const endTime = process.hrtime.bigint();

  const totalDurationMs = Number(endTime - startTime) / 1e6;
  const successful = results.filter(r => r.success).length;
  const avgLatency = results.reduce((a, r) => a + r.durationMs, 0) / results.length;

  return {
    name: `${name} (concurrent x${concurrency})`,
    method,
    path,
    concurrency,
    successful,
    failed: concurrency - successful,
    totalDurationMs,
    avgLatencyMs: avgLatency,
    throughputPerSec: (successful / totalDurationMs) * 1000
  };
}

// Define endpoints to benchmark
const ENDPOINTS = [
  // Health & Status
  { name: 'Health Check', method: 'GET', path: '/api/health' },
  { name: 'Health Detailed', method: 'GET', path: '/api/health/detailed' },

  // Explainability
  { name: 'Explainability Status', method: 'GET', path: '/api/explainability/status' },
  { name: 'Explainability Config', method: 'GET', path: '/api/explainability/config' },
  { name: 'SHAP Feature Importance', method: 'POST', path: '/api/explainability/feature-importance',
    body: { modelType: 'xgboost', nSamples: 50 }, iterations: 5 },
  { name: 'SHAP Stock Explanation', method: 'GET', path: '/api/explainability/stock/AAPL', iterations: 5 },

  // RL
  { name: 'RL Status', method: 'GET', path: '/api/rl/status' },
  { name: 'RL Config', method: 'GET', path: '/api/rl/config' },
  { name: 'RL Models List', method: 'GET', path: '/api/rl/models' },

  // Ensemble
  { name: 'Ensemble Status', method: 'GET', path: '/api/ensemble/status' },
  { name: 'Ensemble Config', method: 'GET', path: '/api/ensemble/config' },

  // MLOps
  { name: 'MLOps Status', method: 'GET', path: '/api/mlops/status' },
  { name: 'Model Registry List', method: 'GET', path: '/api/mlops/models' },
  { name: 'Experiments List', method: 'GET', path: '/api/mlops/experiments' },

  // Features
  { name: 'Feature Store Status', method: 'GET', path: '/api/features/status' },
  { name: 'Feature Registry', method: 'GET', path: '/api/features/registry' },
  { name: 'Feature Drift Status', method: 'GET', path: '/api/features/drift/status' },

  // Execution
  { name: 'Execution Algorithms', method: 'GET', path: '/api/execution/algo/algorithms' },
  { name: 'Execution Analytics', method: 'GET', path: '/api/execution/algo/analytics' },

  // Unified Strategy
  { name: 'Strategy Presets', method: 'GET', path: '/api/unified-strategies/presets' },

  // Analytics
  { name: 'Analytics Summary', method: 'GET', path: '/api/analytics/summary' },
];

// Main benchmark runner
async function runBenchmarks() {
  console.log('='.repeat(70));
  console.log('API ENDPOINT PERFORMANCE BENCHMARK');
  console.log('='.repeat(70));
  console.log(`Base URL: ${CONFIG.baseUrl}`);
  console.log(`Iterations: ${CONFIG.iterations} | Warmup: ${CONFIG.warmupIterations}`);
  console.log(`Timestamp: ${results.timestamp}`);
  console.log('='.repeat(70));

  // Check if server is running
  console.log('\n🔍 Checking server availability...');
  try {
    const healthResult = await timedRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET'
    });

    if (!healthResult.success) {
      console.log('❌ Server not responding. Please start the server first:');
      console.log('   npm start');
      return null;
    }
    console.log(`✓ Server is running (responded in ${healthResult.durationMs.toFixed(2)}ms)`);
  } catch (e) {
    console.log('❌ Cannot connect to server:', e.message);
    console.log('   Please start the server: npm start');
    return null;
  }

  // Run benchmarks
  console.log('\n📊 Running benchmarks...\n');

  const endpointResults = [];
  const concurrentResults = [];

  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`  ${endpoint.name}... `);

    try {
      const result = await benchmarkEndpoint(
        endpoint.name,
        endpoint.method,
        endpoint.path,
        endpoint.body,
        { iterations: endpoint.iterations }
      );

      endpointResults.push(result);

      if (result.stats) {
        console.log(`${result.stats.mean.toFixed(2)}ms (±${result.stats.std.toFixed(2)})`);
      } else {
        console.log(`FAILED (${result.failed} errors)`);
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      endpointResults.push({
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
        error: e.message
      });
    }
  }

  // Run concurrent benchmarks for key endpoints
  console.log('\n📊 Running concurrent benchmarks...\n');

  const concurrentEndpoints = [
    { name: 'Health Check', method: 'GET', path: '/api/health' },
    { name: 'Explainability Status', method: 'GET', path: '/api/explainability/status' },
    { name: 'RL Status', method: 'GET', path: '/api/rl/status' },
  ];

  for (const endpoint of concurrentEndpoints) {
    process.stdout.write(`  ${endpoint.name} (concurrent)... `);

    try {
      const result = await benchmarkConcurrent(
        endpoint.name,
        endpoint.method,
        endpoint.path,
        endpoint.body,
        10 // 10 concurrent requests
      );

      concurrentResults.push(result);
      console.log(`${result.avgLatencyMs.toFixed(2)}ms avg, ${result.throughputPerSec.toFixed(1)} req/s`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }

  // Generate summary
  const successfulResults = endpointResults.filter(r => r.stats);
  const failedResults = endpointResults.filter(r => !r.stats);

  const allLatencies = successfulResults.map(r => r.stats.mean);
  const overallStats = calculateStats(allLatencies);

  results.endpoints = endpointResults;
  results.concurrent = concurrentResults;
  results.summary = {
    totalEndpoints: endpointResults.length,
    successful: successfulResults.length,
    failed: failedResults.length,
    overall: overallStats,
    fastest: successfulResults.length > 0
      ? successfulResults.reduce((a, b) => a.stats.mean < b.stats.mean ? a : b)
      : null,
    slowest: successfulResults.length > 0
      ? successfulResults.reduce((a, b) => a.stats.mean > b.stats.mean ? a : b)
      : null,
    byCategory: categorizeResults(successfulResults),
    recommendations: generateRecommendations(successfulResults)
  };

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(70));

  console.log(`\nTotal endpoints tested: ${results.summary.totalEndpoints}`);
  console.log(`Successful: ${results.summary.successful}`);
  console.log(`Failed: ${results.summary.failed}`);

  if (overallStats) {
    console.log('\nOverall latency:');
    console.log(`  Mean: ${overallStats.mean.toFixed(2)}ms`);
    console.log(`  Min: ${overallStats.min.toFixed(2)}ms`);
    console.log(`  Max: ${overallStats.max.toFixed(2)}ms`);
    console.log(`  P95: ${overallStats.p95.toFixed(2)}ms`);
  }

  if (results.summary.fastest) {
    console.log(`\nFastest endpoint: ${results.summary.fastest.name} (${results.summary.fastest.stats.mean.toFixed(2)}ms)`);
  }
  if (results.summary.slowest) {
    console.log(`Slowest endpoint: ${results.summary.slowest.name} (${results.summary.slowest.stats.mean.toFixed(2)}ms)`);
  }

  if (results.summary.recommendations.length > 0) {
    console.log('\nRecommendations:');
    results.summary.recommendations.forEach(rec => console.log(`  ${rec}`));
  }

  // Save results
  const outputPath = path.join(__dirname, `api_benchmark_${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);
  console.log('='.repeat(70));

  return results;
}

function categorizeResults(results) {
  const categories = {};

  results.forEach(r => {
    let category = 'Other';
    if (r.path.includes('/explainability')) category = 'Explainability';
    else if (r.path.includes('/rl')) category = 'RL';
    else if (r.path.includes('/ensemble')) category = 'Ensemble';
    else if (r.path.includes('/mlops')) category = 'MLOps';
    else if (r.path.includes('/features')) category = 'Features';
    else if (r.path.includes('/execution')) category = 'Execution';
    else if (r.path.includes('/health')) category = 'Health';
    else if (r.path.includes('/strategy')) category = 'Strategy';

    if (!categories[category]) {
      categories[category] = { count: 0, totalMs: 0, endpoints: [] };
    }
    categories[category].count++;
    categories[category].totalMs += r.stats.mean;
    categories[category].endpoints.push(r.name);
  });

  Object.keys(categories).forEach(cat => {
    categories[cat].avgMs = categories[cat].totalMs / categories[cat].count;
  });

  return categories;
}

function generateRecommendations(results) {
  const recommendations = [];

  results.forEach(r => {
    if (r.stats.mean > 1000) {
      recommendations.push(`⚠ ${r.name} is very slow (${r.stats.mean.toFixed(0)}ms) - needs optimization`);
    } else if (r.stats.mean > 500) {
      recommendations.push(`⚠ ${r.name} is slow (${r.stats.mean.toFixed(0)}ms) - consider caching`);
    } else if (r.stats.p95 > r.stats.mean * 3) {
      recommendations.push(`⚠ ${r.name} has high variance (P95: ${r.stats.p95.toFixed(0)}ms) - investigate spikes`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push('✓ All endpoints performing within acceptable limits');
  }

  return recommendations;
}

// Run if called directly
if (require.main === module) {
  runBenchmarks()
    .then(results => {
      if (results) {
        process.exit(results.summary.failed > results.summary.successful ? 1 : 0);
      } else {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

module.exports = { runBenchmarks, benchmarkEndpoint, benchmarkConcurrent };
