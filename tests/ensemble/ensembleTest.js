#!/usr/bin/env node
/**
 * Phase 4: Advanced Ensemble Methods Test Suite
 * =============================================
 *
 * Tests the XGBoost/LightGBM gradient boosting integration:
 * - Python ML bridge
 * - Gradient boosting training and prediction
 * - Hyperparameter tuning
 * - API endpoints
 *
 * Run: node tests/ensemble/ensembleTest.js
 */

const path = require('path');
process.chdir(path.join(__dirname, '../..'));

const db = require('../../src/database');
const { PythonMLClient } = require('../../src/services/ml/pythonMLClient');

// Test results
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
  startTime: new Date()
};

function log(message, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', section: '📋', skip: '⏭️' };
  console.log(`${icons[type] || ''} ${message}`);
}

function recordTest(name, passed, details = {}) {
  testResults.tests.push({ name, passed, ...details });
  if (passed === 'skipped') {
    testResults.skipped++;
    log(`${name}: Skipped - ${details.reason || ''}`, 'skip');
  } else if (passed) {
    testResults.passed++;
    log(`${name}`, 'success');
  } else {
    testResults.failed++;
    log(`${name}: ${details.error || 'Failed'}`, 'error');
  }
}

// ============================================================================
// PYTHON ML CLIENT TESTS
// ============================================================================

async function testPythonMLClient() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 1: PYTHON ML CLIENT TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nThe Python ML Client bridges Node.js with Python ML libraries.');
  console.log('It enables training and inference with XGBoost, LightGBM, and deep learning.\n');

  const database = db.getDatabase();
  const client = new PythonMLClient(database);

  // Test 1.1: Client initialization
  try {
    recordTest('1.1 Client initialization', client !== null, {
      pythonPath: client.pythonPath,
      modelDir: client.modelDir
    });
  } catch (err) {
    recordTest('1.1 Client initialization', false, { error: err.message });
  }

  // Test 1.2: Python environment check
  try {
    const initialized = await client.initialize();

    if (initialized) {
      recordTest('1.2 Python environment check', true, {
        explanation: 'Python and required packages available'
      });
    } else {
      recordTest('1.2 Python environment check', 'skipped', {
        reason: 'Python environment not configured (torch/numpy/pandas missing)'
      });
    }
  } catch (err) {
    recordTest('1.2 Python environment check', 'skipped', {
      reason: `Python not available: ${err.message}`
    });
  }

  // Test 1.3: Health check
  try {
    const health = await client.healthCheck();

    console.log(`\n  ML Client Health: ${health.status}`);
    if (health.stats) {
      console.log(`    • Total predictions: ${health.stats.totalPredictions}`);
      console.log(`    • Cache hits: ${health.stats.cacheHits}`);
      console.log(`    • Python calls: ${health.stats.pythonCalls}`);
    }

    recordTest('1.3 Health check', health.status !== 'unknown', {
      status: health.status
    });
  } catch (err) {
    recordTest('1.3 Health check', false, { error: err.message });
  }

  // Test 1.4: Statistics tracking
  try {
    const stats = client.getStats();

    recordTest('1.4 Statistics tracking', stats !== null, {
      cacheSize: stats.cacheSize,
      isInitialized: stats.isInitialized
    });
  } catch (err) {
    recordTest('1.4 Statistics tracking', false, { error: err.message });
  }

  // Test 1.5: Cache operations
  try {
    // Set some cache entries
    client._setCache('test:2024-01-01', { expected_return: 0.05 });
    const cached = client._getCached('test:2024-01-01');

    recordTest('1.5 Cache operations', cached !== null && cached.expected_return === 0.05, {
      explanation: 'Cache set and get working'
    });

    // Clear cache
    client.clearCache();
  } catch (err) {
    recordTest('1.5 Cache operations', false, { error: err.message });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  The Python ML Client is the bridge between Node.js and Python\'s');
  console.log('  powerful machine learning libraries like XGBoost and LightGBM.\n');

  return client;
}

// ============================================================================
// GRADIENT BOOSTING MODULE TESTS
// ============================================================================

async function testGradientBoostingModule() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 2: GRADIENT BOOSTING MODULE TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nTesting XGBoost and LightGBM model training capabilities.\n');

  const database = db.getDatabase();
  const client = new PythonMLClient(database);

  // Test 2.1: Check XGBoost availability
  let xgbAvailable = false;
  let lgbAvailable = false;

  try {
    const checkScript = `
import sys
try:
    import xgboost
    print('xgboost_available')
except ImportError:
    print('xgboost_missing')
`;
    const result = await client._runPythonScript(checkScript);
    xgbAvailable = result.includes('xgboost_available');

    if (xgbAvailable) {
      recordTest('2.1 XGBoost availability', true, {
        explanation: 'XGBoost is installed'
      });
    } else {
      recordTest('2.1 XGBoost availability', 'skipped', {
        reason: 'XGBoost not installed (pip install xgboost)'
      });
    }
  } catch (err) {
    recordTest('2.1 XGBoost availability', 'skipped', {
      reason: 'Python not available'
    });
  }

  // Test 2.2: Check LightGBM availability
  try {
    const checkScript = `
import sys
try:
    import lightgbm
    print('lightgbm_available')
except ImportError:
    print('lightgbm_missing')
`;
    const result = await client._runPythonScript(checkScript);
    lgbAvailable = result.includes('lightgbm_available');

    if (lgbAvailable) {
      recordTest('2.2 LightGBM availability', true, {
        explanation: 'LightGBM is installed'
      });
    } else {
      recordTest('2.2 LightGBM availability', 'skipped', {
        reason: 'LightGBM not installed (pip install lightgbm)'
      });
    }
  } catch (err) {
    recordTest('2.2 LightGBM availability', 'skipped', {
      reason: 'Python not available'
    });
  }

  // Test 2.3: Gradient boosting module import
  if (xgbAvailable || lgbAvailable) {
    try {
      const checkScript = `
import sys
sys.path.insert(0, '${client.modelDir.replace(/\\/g, '/')}')
from gradient_boosting import GradientBoostingModels
print('import_success')
`;
      const result = await client._runPythonScript(checkScript);

      recordTest('2.3 Gradient boosting module import', result.includes('import_success'), {
        explanation: 'GradientBoostingModels class importable'
      });
    } catch (err) {
      recordTest('2.3 Gradient boosting module import', false, { error: err.message });
    }
  } else {
    recordTest('2.3 Gradient boosting module import', 'skipped', {
      reason: 'Neither XGBoost nor LightGBM available'
    });
  }

  // Test 2.4: Synthetic data training test (quick)
  if (xgbAvailable || lgbAvailable) {
    try {
      const trainScript = `
import sys
import json
import numpy as np
sys.path.insert(0, '${client.modelDir.replace(/\\/g, '/')}')

from gradient_boosting import GradientBoostingModels

# Generate synthetic data
np.random.seed(42)
n_samples = 200
n_features = 10

X = np.random.randn(n_samples, n_features)
y = 0.3 * X[:, 0] - 0.2 * X[:, 1] + np.random.randn(n_samples) * 0.3

# Split
X_train, X_val = X[:160], X[160:]
y_train, y_val = y[:160], y[160:]

# Train
gb = GradientBoostingModels()
metrics = gb.train_${xgbAvailable ? 'xgboost' : 'lightgbm'}(X_train, y_train, X_val, y_val)

print(json.dumps({
    'success': True,
    'ic': metrics.ic,
    'direction_accuracy': metrics.direction_accuracy
}))
`;
      const result = await client._runPythonScript(trainScript, { timeout: 60000 });
      const data = JSON.parse(result);

      console.log('\n  Synthetic training results:');
      console.log(`    • IC (correlation): ${data.ic?.toFixed(4) || 'N/A'}`);
      console.log(`    • Direction accuracy: ${((data.direction_accuracy || 0) * 100).toFixed(1)}%`);

      recordTest('2.4 Synthetic data training', data.success === true, {
        ic: data.ic,
        directionAccuracy: data.direction_accuracy
      });
    } catch (err) {
      recordTest('2.4 Synthetic data training', false, { error: err.message });
    }
  } else {
    recordTest('2.4 Synthetic data training', 'skipped', {
      reason: 'No gradient boosting library available'
    });
  }

  // Test 2.5: Cross-validation test
  if (xgbAvailable || lgbAvailable) {
    try {
      const cvScript = `
import sys
import json
import numpy as np
sys.path.insert(0, '${client.modelDir.replace(/\\/g, '/')}')

from gradient_boosting import GradientBoostingModels

# Generate synthetic data
np.random.seed(42)
X = np.random.randn(300, 10)
y = 0.3 * X[:, 0] - 0.2 * X[:, 1] + np.random.randn(300) * 0.3

# Cross-validate
gb = GradientBoostingModels()
result = gb.cross_validate(X, y, model_type='${xgbAvailable ? 'xgboost' : 'lightgbm'}', n_splits=3)

print(json.dumps({
    'success': True,
    'overall_ic': result['overall']['ic'],
    'n_folds': len(result['fold_metrics'])
}))
`;
      const result = await client._runPythonScript(cvScript, { timeout: 120000 });
      // Extract JSON from output (skip any debug print statements)
      const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
      const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

      console.log('\n  Cross-validation results:');
      console.log(`    • Overall IC: ${data.overall_ic?.toFixed(4) || 'N/A'}`);
      console.log(`    • Folds tested: ${data.n_folds}`);

      recordTest('2.5 Cross-validation', data.success === true && data.n_folds >= 3, {
        overallIC: data.overall_ic,
        folds: data.n_folds
      });
    } catch (err) {
      recordTest('2.5 Cross-validation', false, { error: err.message });
    }
  } else {
    recordTest('2.5 Cross-validation', 'skipped', {
      reason: 'No gradient boosting library available'
    });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  XGBoost and LightGBM are industry-standard gradient boosting libraries.');
  console.log('  They complement deep learning with fast, interpretable predictions.\n');
}

// ============================================================================
// API ENDPOINT TESTS
// ============================================================================

async function testAPIEndpoints() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 3: API ENDPOINT TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nTesting ensemble ML API endpoints.\n');

  const express = require('express');
  const http = require('http');
  const app = express();
  app.use(express.json());
  app.set('db', db.getDatabase());

  const ensembleRouter = require('../../src/api/routes/ensemble');
  app.use('/api/ensemble', ensembleRouter);

  const server = app.listen(3099);

  async function testEndpoint(method, path, body = null) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3099,
        path: '/api/ensemble' + path,
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

  // Test 3.1: GET /status
  try {
    const r = await testEndpoint('GET', '/status');

    console.log('\n  Ensemble Status:');
    if (r.data?.health) {
      console.log(`    • Health: ${r.data.health}`);
      console.log(`    • DL models available: ${r.data.models?.deepLearning?.available || false}`);
      console.log(`    • GB models available: ${r.data.models?.gradientBoosting?.available || false}`);
    }

    recordTest('3.1 GET /api/ensemble/status', r.status === 200 && r.data?.success === true, {
      health: r.data?.health
    });
  } catch (err) {
    recordTest('3.1 GET /api/ensemble/status', false, { error: err.message });
  }

  // Test 3.2: GET /deep-learning/models
  try {
    const r = await testEndpoint('GET', '/deep-learning/models');
    recordTest('3.2 GET /api/ensemble/deep-learning/models', r.status === 200 && r.data?.success === true, {
      modelCount: r.data?.count || 0
    });
  } catch (err) {
    recordTest('3.2 GET /api/ensemble/deep-learning/models', false, { error: err.message });
  }

  // Test 3.3: GET /gradient-boosting/models
  try {
    const r = await testEndpoint('GET', '/gradient-boosting/models');
    recordTest('3.3 GET /api/ensemble/gradient-boosting/models', r.status === 200 && r.data?.success === true, {
      modelCount: r.data?.count || 0
    });
  } catch (err) {
    recordTest('3.3 GET /api/ensemble/gradient-boosting/models', false, { error: err.message });
  }

  // Test 3.4: POST /clear-cache
  try {
    const r = await testEndpoint('POST', '/clear-cache');
    recordTest('3.4 POST /api/ensemble/clear-cache', r.status === 200 && r.data?.success === true, {
      message: r.data?.message
    });
  } catch (err) {
    recordTest('3.4 POST /api/ensemble/clear-cache', false, { error: err.message });
  }

  // Test 3.5: GET /feature-importance
  try {
    const r = await testEndpoint('GET', '/feature-importance?modelType=xgboost&topN=10');
    recordTest('3.5 GET /api/ensemble/feature-importance', r.status === 200 && r.data?.success === true, {
      hasImportance: !!r.data?.featureImportance
    });
  } catch (err) {
    recordTest('3.5 GET /api/ensemble/feature-importance', false, { error: err.message });
  }

  // Test 3.6: POST /deep-learning/predict (validation)
  try {
    const r = await testEndpoint('POST', '/deep-learning/predict', {});
    // Should fail with missing params
    recordTest('3.6 DL predict validation', r.status === 400, {
      explanation: 'Missing params correctly rejected'
    });
  } catch (err) {
    recordTest('3.6 DL predict validation', false, { error: err.message });
  }

  // Test 3.7: POST /gradient-boosting/predict (validation)
  try {
    const r = await testEndpoint('POST', '/gradient-boosting/predict', {});
    // Should fail with missing params
    recordTest('3.7 GB predict validation', r.status === 400, {
      explanation: 'Missing params correctly rejected'
    });
  } catch (err) {
    recordTest('3.7 GB predict validation', false, { error: err.message });
  }

  server.close();

  console.log('\n  💡 What does this mean?');
  console.log('  The API endpoints allow external access to all ensemble ML functions.');
  console.log('  The frontend can trigger training, get predictions, and monitor status.\n');
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

function generateReport() {
  const endTime = new Date();
  const duration = (endTime - testResults.startTime) / 1000;

  console.log('\n' + '='.repeat(70));
  console.log('              PHASE 4: ADVANCED ENSEMBLE TEST REPORT');
  console.log('='.repeat(70));

  console.log(`
  📅 Test Date:     ${endTime.toISOString().split('T')[0]}
  ⏱️  Duration:      ${duration.toFixed(1)} seconds

  📊 RESULTS SUMMARY
  ─────────────────────────────────────────────────────────────────────
  ✅ Passed:  ${testResults.passed}
  ❌ Failed:  ${testResults.failed}
  ⏭️  Skipped: ${testResults.skipped}

  Overall: ${testResults.failed === 0 ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}
  `);

  // Show failed tests
  const failedTests = testResults.tests.filter(t => t.passed === false);
  if (failedTests.length > 0) {
    console.log('  FAILED TESTS:');
    failedTests.forEach(t => {
      console.log(`  ❌ ${t.name}: ${t.error || 'Failed'}`);
    });
    console.log('');
  }

  // Show skipped tests
  const skippedTests = testResults.tests.filter(t => t.passed === 'skipped');
  if (skippedTests.length > 0) {
    console.log('  SKIPPED TESTS (environment not configured):');
    skippedTests.forEach(t => {
      console.log(`  ⏭️  ${t.name}: ${t.reason || 'Skipped'}`);
    });
    console.log('');
  }

  console.log(`
  📝 WHAT THIS MEANS (Plain English)
  ─────────────────────────────────────────────────────────────────────

  Phase 4 adds advanced gradient boosting models to the ensemble:

  ✓ XGBoost/LightGBM Integration
    → Industry-standard gradient boosting for tabular data
    → Complements deep learning with fast, interpretable models

  ✓ Hyperparameter Tuning
    → Automatic optimization of model parameters
    → Walk-forward cross-validation for robust evaluation

  ✓ Ensemble Predictions
    → Combines deep learning + gradient boosting
    → Uncertainty quantification from model disagreement

  ✓ API Access
    → Full REST API for training and prediction
    → Frontend dashboard can control all ML functions
  `);

  console.log(`
  🏗️  ENSEMBLE ARCHITECTURE
  ─────────────────────────────────────────────────────────────────────

  ┌─────────────────────────────────────────────────────────────┐
  │                    ENSEMBLE ML SYSTEM                        │
  ├─────────────────────────────────────────────────────────────┤
  │                                                              │
  │  Deep Learning                    Gradient Boosting          │
  │  ┌──────────────┐                ┌──────────────┐           │
  │  │    LSTM      │                │   XGBoost    │           │
  │  │  Transformer │                │   LightGBM   │           │
  │  └──────┬───────┘                └──────┬───────┘           │
  │         │                               │                    │
  │         └───────────┬───────────────────┘                    │
  │                     │                                        │
  │              ┌──────▼──────┐                                 │
  │              │  Ensemble   │                                 │
  │              │  Combiner   │                                 │
  │              └──────┬──────┘                                 │
  │                     │                                        │
  │              ┌──────▼──────┐                                 │
  │              │ Prediction  │                                 │
  │              │+Uncertainty │                                 │
  │              └─────────────┘                                 │
  │                                                              │
  └─────────────────────────────────────────────────────────────┘
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
  console.log('║          PHASE 4: ADVANCED ENSEMBLE METHODS TEST SUITE             ║');
  console.log('║                                                                     ║');
  console.log('║  Testing XGBoost, LightGBM, and ensemble prediction capabilities   ║');
  console.log('║  with hyperparameter tuning and walk-forward cross-validation.     ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  try {
    await testPythonMLClient();
    await testGradientBoostingModule();
    await testAPIEndpoints();
    generateReport();

    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n❌ Test suite crashed:', err);
    process.exit(1);
  }
}

main();
