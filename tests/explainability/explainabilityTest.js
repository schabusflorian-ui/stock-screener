// tests/explainability/explainabilityTest.js
// Comprehensive test suite for Phase 7: Explainability (SHAP)

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const PYTHON_PATH = 'python3';
const PROJECT_ROOT = path.join(__dirname, '../..');
const PYTHON_DIR = path.join(PROJECT_ROOT, 'python');

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Helper function to run test
function test(name, fn) {
  return async () => {
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: 'passed' });
      console.log(`  ✓ ${name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'failed', error: error.message });
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error.message}`);
    }
  };
}

// Helper function to skip test
function skip(name, reason) {
  return async () => {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    console.log(`  ○ ${name} (skipped: ${reason})`);
  };
}

// Helper to run Python code
async function runPython(code, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_PATH, ['-c', code], {
      cwd: PYTHON_DIR,
      env: { ...process.env, PYTHONPATH: PYTHON_DIR }
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Python execution timed out'));
    }, timeout);

    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Python exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Helper to check if SHAP is available
async function checkShapAvailable() {
  try {
    const code = `
import sys
try:
    import shap
    print("available")
except ImportError:
    print("unavailable")
`;
    const result = await runPython(code, 10000);
    return result.trim() === 'available';
  } catch {
    return false;
  }
}

// Helper to check if XGBoost is available
async function checkXGBoostAvailable() {
  try {
    const code = `
import sys
try:
    import xgboost
    print("available")
except ImportError:
    print("unavailable")
`;
    const result = await runPython(code, 10000);
    return result.trim() === 'available';
  } catch {
    return false;
  }
}

// =========================================
// Test Suite: Python SHAP Module
// =========================================

async function testPythonShapModule() {
  console.log('\n📊 Testing Python SHAP Module...');

  const shapAvailable = await checkShapAvailable();
  const xgbAvailable = await checkXGBoostAvailable();

  // Test 1: SHAP installation
  await test('SHAP package is installed', async () => {
    if (!shapAvailable) {
      throw new Error('SHAP is not installed. Run: pip3 install shap');
    }
  })();

  // Test 2: XGBoost availability
  await test('XGBoost is available for TreeExplainer', async () => {
    if (!xgbAvailable) {
      throw new Error('XGBoost is not installed. Run: pip3 install xgboost');
    }
  })();

  // Test 3: Explainability module imports
  if (shapAvailable && xgbAvailable) {
    await test('Explainability module imports correctly', async () => {
      const code = `
import sys
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import (
    ModelExplainer, ExplanationResult, FeatureImportance,
    explain_prediction, get_feature_importance, get_shap_summary,
    explain_stock_prediction, HAS_SHAP, HAS_XGB
)
print("imports_ok")
`;
      const result = await runPython(code);
      if (!result.includes('imports_ok')) {
        throw new Error('Module imports failed');
      }
    })();
  } else {
    await skip('Explainability module imports', 'SHAP or XGBoost not installed')();
  }

  // Test 4: FeatureImportance dataclass
  if (shapAvailable) {
    await test('FeatureImportance dataclass works correctly', async () => {
      const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import FeatureImportance

importance = FeatureImportance(
    feature_names=['momentum', 'value', 'quality'],
    importance_values=[0.3, 0.25, 0.15],
    importance_type='mean_abs_shap',
    model_type='xgboost'
)

d = importance.to_dict()
print(json.dumps({
    'has_ranking': 'ranking' in d,
    'ranking_count': len(d.get('ranking', [])),
    'has_feature_importance': 'feature_importance' in d
}))
`;
      const result = await runPython(code);
      const parsed = JSON.parse(result);
      if (!parsed.has_ranking || parsed.ranking_count !== 3 || !parsed.has_feature_importance) {
        throw new Error('FeatureImportance dataclass not working correctly');
      }
    })();
  } else {
    await skip('FeatureImportance dataclass', 'SHAP not installed')();
  }
}

// =========================================
// Test Suite: ModelExplainer Class
// =========================================

async function testModelExplainer() {
  console.log('\n🔍 Testing ModelExplainer Class...');

  const shapAvailable = await checkShapAvailable();
  const xgbAvailable = await checkXGBoostAvailable();

  if (!shapAvailable || !xgbAvailable) {
    await skip('ModelExplainer tests', 'SHAP or XGBoost not installed')();
    return;
  }

  // Test 1: ModelExplainer initialization
  await test('ModelExplainer initializes correctly', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import ModelExplainer
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=10)
model.fit(X, y)

explainer = ModelExplainer(model, model_type='xgboost')
print(json.dumps({
    'model_type': explainer.model_type,
    'initialized': explainer.model is not None
}))
`;
    const result = await runPython(code);
    const parsed = JSON.parse(result);
    if (parsed.model_type !== 'xgboost' || !parsed.initialized) {
      throw new Error('ModelExplainer initialization failed');
    }
  })();

  // Test 2: explain method (not explain_prediction)
  await test('ModelExplainer.explain returns valid results', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import ModelExplainer
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=10)
model.fit(X, y)

explainer = ModelExplainer(model, model_type='xgboost')
results = explainer.explain(
    X[0:1],
    feature_names=['f1', 'f2', 'f3', 'f4', 'f5']
)

d = results[0].to_dict()
print(json.dumps({
    'has_shap': 'shap_values' in d,
    'has_base': d.get('base_value') is not None,
    'has_pred': d.get('prediction') is not None,
    'shap_count': len(d.get('shap_values', {}))
}, default=float))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);
    if (!parsed.has_shap || !parsed.has_base || !parsed.has_pred || parsed.shap_count !== 5) {
      throw new Error('ModelExplainer.explain did not return valid result');
    }
  })();

  // Test 3: get_feature_importance method
  await test('ModelExplainer.get_feature_importance returns valid rankings', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import ModelExplainer
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.5 - X[:, 1] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=10)
model.fit(X, y)

explainer = ModelExplainer(model, model_type='xgboost')
importance = explainer.get_feature_importance(
    X,
    feature_names=['f1', 'f2', 'f3', 'f4', 'f5']
)

d = importance.to_dict()
print(json.dumps({
    'ranking_count': len(d.get('ranking', [])),
    'top_feature': d['ranking'][0]['feature'] if d.get('ranking') else None,
    'has_feature_importance': 'feature_importance' in d
}, default=float))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);
    if (parsed.ranking_count !== 5 || !parsed.has_feature_importance) {
      throw new Error('get_feature_importance did not return valid results');
    }
  })();
}

// =========================================
// Test Suite: Standalone Functions
// =========================================

async function testStandaloneFunctions() {
  console.log('\n⚙️ Testing Standalone Functions...');

  const shapAvailable = await checkShapAvailable();
  const xgbAvailable = await checkXGBoostAvailable();

  if (!shapAvailable || !xgbAvailable) {
    await skip('Standalone function tests', 'SHAP or XGBoost not installed')();
    return;
  }

  // Test 1: explain_prediction function (uses X not features)
  await test('explain_prediction standalone function works', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import explain_prediction
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=10)
model.fit(X, y)

# Note: explain_prediction takes X (array), not features
result = explain_prediction(
    model=model,
    X=X[0:1],  # Pass single sample as 2D array
    feature_names=['f1', 'f2', 'f3', 'f4', 'f5'],
    background_data=X[:50],
    model_type='xgboost'
)

# Returns a list of dicts
first_result = result[0] if result else {}
print(json.dumps({
    'is_list': isinstance(result, list),
    'has_shap_values': 'shap_values' in first_result,
    'has_prediction': 'prediction' in first_result
}, default=float))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);
    if (!parsed.is_list || !parsed.has_shap_values || !parsed.has_prediction) {
      throw new Error('explain_prediction function failed');
    }
  })();

  // Test 2: get_feature_importance function
  await test('get_feature_importance standalone function works', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import get_feature_importance
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=10)
model.fit(X, y)

result = get_feature_importance(
    model=model,
    X=X,
    feature_names=['f1', 'f2', 'f3', 'f4', 'f5'],
    model_type='xgboost'
)

print(json.dumps({
    'has_feature_importance': 'feature_importance' in result,
    'has_ranking': 'ranking' in result,
    'ranking_count': len(result.get('ranking', []))
}, default=float))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);
    if (!parsed.has_feature_importance || !parsed.has_ranking || parsed.ranking_count !== 5) {
      throw new Error('get_feature_importance function failed');
    }
  })();

  // Test 3: get_shap_summary function
  await test('get_shap_summary standalone function works', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import get_shap_summary
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=10)
model.fit(X, y)

result = get_shap_summary(
    model=model,
    X=X,
    feature_names=['f1', 'f2', 'f3', 'f4', 'f5'],
    model_type='xgboost'
)

print(json.dumps({
    'has_feature_importance': 'feature_importance' in result,
    'has_sample_explanations': 'sample_explanations' in result,
    'has_model_type': 'model_type' in result
}, default=float))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);
    if (!parsed.has_feature_importance || !parsed.has_sample_explanations) {
      throw new Error('get_shap_summary function failed');
    }
  })();

  // Test 4: explain_stock_prediction function
  await test('explain_stock_prediction function works', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import explain_stock_prediction
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=10)
model.fit(X, y)

result = explain_stock_prediction(
    model=model,
    features=X[0],  # This function takes features (1D array)
    symbol='AAPL',
    feature_names=['momentum', 'value', 'quality', 'volatility', 'rsi'],
    background_data=X[:50]
)

print(json.dumps({
    'has_symbol': result.get('symbol') == 'AAPL',
    'has_prediction': 'prediction' in result,
    'has_top_contributors': 'top_contributors' in result,
    'has_interpretation': 'interpretation' in result
}, default=float))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);
    if (!parsed.has_symbol || !parsed.has_prediction || !parsed.has_top_contributors) {
      throw new Error('explain_stock_prediction function failed');
    }
  })();
}

// =========================================
// Test Suite: PythonMLClient SHAP Methods
// =========================================

async function testPythonMLClient() {
  console.log('\n🔧 Testing PythonMLClient SHAP Methods...');

  // Create a mock database for testing
  const mockDb = {
    getDatabase: () => ({
      prepare: () => ({ all: () => [], get: () => null, run: () => {} })
    })
  };

  // Test 1: PythonMLClient can be imported
  await test('PythonMLClient imports successfully', async () => {
    const clientPath = path.join(PROJECT_ROOT, 'src/services/ml/pythonMLClient.js');
    if (!fs.existsSync(clientPath)) {
      throw new Error('pythonMLClient.js not found');
    }
    const { PythonMLClient } = require(clientPath);
    if (!PythonMLClient) {
      throw new Error('PythonMLClient class not exported');
    }
  })();

  // Test 2: PythonMLClient has SHAP methods
  await test('PythonMLClient has all SHAP methods', async () => {
    const { PythonMLClient } = require(path.join(PROJECT_ROOT, 'src/services/ml/pythonMLClient.js'));
    const client = new PythonMLClient(mockDb.getDatabase());

    const requiredMethods = [
      'explainPrediction',
      'getShapFeatureImportance',
      'getShapSummary',
      'explainStockPrediction',
      'checkShapAvailability'
    ];

    const missingMethods = requiredMethods.filter(m => typeof client[m] !== 'function');
    if (missingMethods.length > 0) {
      throw new Error(`Missing methods: ${missingMethods.join(', ')}`);
    }
  })();

  // Test 3: checkShapAvailability method
  await test('checkShapAvailability returns valid response', async () => {
    const { PythonMLClient } = require(path.join(PROJECT_ROOT, 'src/services/ml/pythonMLClient.js'));
    const client = new PythonMLClient(mockDb.getDatabase());

    const result = await client.checkShapAvailability();
    if (typeof result.success !== 'boolean') {
      throw new Error('checkShapAvailability did not return success boolean');
    }
    if (typeof result.shap !== 'boolean') {
      throw new Error('checkShapAvailability did not return shap availability');
    }
  })();

  const shapAvailable = await checkShapAvailable();
  const xgbAvailable = await checkXGBoostAvailable();

  if (!shapAvailable || !xgbAvailable) {
    await skip('PythonMLClient SHAP integration tests', 'SHAP or XGBoost not installed')();
    return;
  }

  // Test 4: getShapFeatureImportance method
  await test('getShapFeatureImportance method works', async () => {
    const { PythonMLClient } = require(path.join(PROJECT_ROOT, 'src/services/ml/pythonMLClient.js'));
    const client = new PythonMLClient(mockDb.getDatabase());

    const result = await client.getShapFeatureImportance({
      modelType: 'xgboost',
      nSamples: 50
    });

    if (!result.success) {
      throw new Error(`getShapFeatureImportance failed: ${result.error}`);
    }
  })();

  // Test 5: getShapSummary method
  await test('getShapSummary method works', async () => {
    const { PythonMLClient } = require(path.join(PROJECT_ROOT, 'src/services/ml/pythonMLClient.js'));
    const client = new PythonMLClient(mockDb.getDatabase());

    const result = await client.getShapSummary({
      modelType: 'xgboost',
      nSamples: 50
    });

    if (!result.success) {
      throw new Error(`getShapSummary failed: ${result.error}`);
    }
  })();

  // Test 6: explainStockPrediction method
  await test('explainStockPrediction method works', async () => {
    const { PythonMLClient } = require(path.join(PROJECT_ROOT, 'src/services/ml/pythonMLClient.js'));
    const client = new PythonMLClient(mockDb.getDatabase());

    const result = await client.explainStockPrediction('AAPL', {});

    if (!result.success) {
      throw new Error(`explainStockPrediction failed: ${result.error}`);
    }
    if (result.symbol !== 'AAPL') {
      throw new Error('explainStockPrediction did not return correct symbol');
    }
  })();
}

// =========================================
// Test Suite: API Endpoints
// =========================================

async function testAPIEndpoints() {
  console.log('\n🌐 Testing API Endpoints...');

  // Test 1: Explainability routes file exists
  await test('Explainability routes file exists', async () => {
    const routesPath = path.join(PROJECT_ROOT, 'src/api/routes/explainability.js');
    if (!fs.existsSync(routesPath)) {
      throw new Error('explainability.js routes file not found');
    }
  })();

  // Test 2: Routes module exports router
  await test('Routes module exports Express router', async () => {
    const router = require(path.join(PROJECT_ROOT, 'src/api/routes/explainability.js'));
    if (!router || typeof router !== 'function') {
      throw new Error('Routes module does not export a valid Express router');
    }
  })();

  // Test 3: Router has expected routes
  await test('Router has all required routes', async () => {
    const router = require(path.join(PROJECT_ROOT, 'src/api/routes/explainability.js'));

    // Express router stores routes in router.stack
    const routes = router.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    const expectedRoutes = [
      { path: '/status', method: 'get' },
      { path: '/explain', method: 'post' },
      { path: '/feature-importance', method: 'post' },
      { path: '/summary', method: 'post' },
      { path: '/stock/:symbol', method: 'post' },
      { path: '/stock/:symbol', method: 'get' },
      { path: '/config', method: 'get' },
      { path: '/batch', method: 'post' },
      { path: '/compare', method: 'post' }
    ];

    for (const expected of expectedRoutes) {
      const found = routes.find(r =>
        r.path === expected.path && r.methods.includes(expected.method)
      );
      if (!found) {
        throw new Error(`Missing route: ${expected.method.toUpperCase()} ${expected.path}`);
      }
    }
  })();

  // Test 4: Server includes explainability routes
  await test('Server includes explainability routes', async () => {
    const serverPath = path.join(PROJECT_ROOT, 'src/api/server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    if (!serverContent.includes("require('./routes/explainability')")) {
      throw new Error('Server does not require explainability routes');
    }
    if (!serverContent.includes('/api/explainability')) {
      throw new Error('Server does not mount explainability routes');
    }
  })();
}

// =========================================
// Test Suite: Integration Tests
// =========================================

async function testIntegration() {
  console.log('\n🔗 Testing Integration...');

  const shapAvailable = await checkShapAvailable();
  const xgbAvailable = await checkXGBoostAvailable();

  if (!shapAvailable || !xgbAvailable) {
    await skip('Integration tests', 'SHAP or XGBoost not installed')();
    return;
  }

  // Test 1: End-to-end SHAP explanation
  await test('End-to-end SHAP explanation flow', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import ModelExplainer, explain_stock_prediction
import xgboost as xgb

# Create and train model
np.random.seed(42)
feature_names = ['momentum', 'value', 'quality', 'volatility', 'rsi',
                 'macd', 'pe_ratio', 'revenue_growth', 'insider_activity', 'short_interest']
n_features = len(feature_names)
X = np.random.randn(500, n_features)
y = (0.3 * X[:, 0] - 0.25 * X[:, 1] + 0.2 * X[:, 2] - 0.15 * X[:, 3] +
     0.1 * X[:, 4] + np.random.randn(500) * 0.1)

model = xgb.XGBRegressor(n_estimators=50, max_depth=4, random_state=42)
model.fit(X, y)

# Create explainer
explainer = ModelExplainer(model, model_type='xgboost')

# Get feature importance
importance = explainer.get_feature_importance(X, feature_names)
importance_dict = importance.to_dict()

# Explain a single stock
stock_features = np.random.randn(n_features)
explanation = explain_stock_prediction(
    model=model,
    features=stock_features,
    symbol='AAPL',
    feature_names=feature_names,
    background_data=X[:100]
)

print(json.dumps({
    'importance_ranking': [r['feature'] for r in importance_dict['ranking'][:3]],
    'stock_symbol': explanation['symbol'],
    'has_top_contributors': len(explanation.get('top_contributors', [])) > 0,
    'has_prediction': 'prediction' in explanation
}, default=float))
`;
    const result = await runPython(code, 120000);
    const parsed = JSON.parse(result);

    if (parsed.importance_ranking.length !== 3) {
      throw new Error('Feature importance ranking incomplete');
    }
    if (parsed.stock_symbol !== 'AAPL') {
      throw new Error('Stock symbol mismatch');
    }
    if (!parsed.has_top_contributors) {
      throw new Error('No top contributors identified');
    }
  })();

  // Test 2: Feature importance consistency
  await test('Feature importance is consistent across runs', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import get_feature_importance
import xgboost as xgb

# Create deterministic model
np.random.seed(42)
X = np.random.randn(200, 5)
y = 0.5 * X[:, 0] - 0.3 * X[:, 1] + np.random.randn(200) * 0.1

model = xgb.XGBRegressor(n_estimators=20, random_state=42)
model.fit(X, y)

# Run importance twice
result1 = get_feature_importance(model, X, ['f1', 'f2', 'f3', 'f4', 'f5'], None, 'xgboost')
result2 = get_feature_importance(model, X, ['f1', 'f2', 'f3', 'f4', 'f5'], None, 'xgboost')

# Compare rankings
rank1 = [r['feature'] for r in result1['ranking']]
rank2 = [r['feature'] for r in result2['ranking']]

print(json.dumps({
    'rankings_match': rank1 == rank2,
    'top_feature_1': rank1[0],
    'top_feature_2': rank2[0]
}))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);

    if (!parsed.rankings_match) {
      throw new Error('Feature importance rankings are not consistent');
    }
  })();

  // Test 3: SHAP values sum to prediction difference
  await test('SHAP values approximately sum to prediction difference', async () => {
    const code = `
import sys
import json
import numpy as np
sys.path.insert(0, '${PYTHON_DIR}')
from explainability.shap_explainer import ModelExplainer
import xgboost as xgb

np.random.seed(42)
X = np.random.randn(100, 5)
y = X[:, 0] * 0.3 + np.random.randn(100) * 0.1

model = xgb.XGBRegressor(n_estimators=20, random_state=42)
model.fit(X, y)

explainer = ModelExplainer(model, model_type='xgboost')
results = explainer.explain(
    X[0:1],
    feature_names=['f1', 'f2', 'f3', 'f4', 'f5']
)

d = results[0].to_dict()
shap_sum = sum(d['shap_values'].values())
expected_diff = d['prediction'] - d['base_value']

# SHAP values should approximately equal prediction - base_value
relative_error = abs(shap_sum - expected_diff) / (abs(expected_diff) + 1e-10)

print(json.dumps({
    'shap_sum': float(shap_sum),
    'expected_diff': float(expected_diff),
    'relative_error': float(relative_error),
    'is_valid': relative_error < 0.1  # Allow 10% error
}, default=float))
`;
    const result = await runPython(code, 60000);
    const parsed = JSON.parse(result);

    if (!parsed.is_valid) {
      throw new Error(`SHAP values do not sum correctly. Error: ${(parsed.relative_error * 100).toFixed(1)}%`);
    }
  })();
}

// =========================================
// Main Test Runner
// =========================================

async function runTests() {
  console.log('='.repeat(60));
  console.log('Phase 7: Explainability (SHAP) Test Suite');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    await testPythonShapModule();
    await testModelExplainer();
    await testStandaloneFunctions();
    await testPythonMLClient();
    await testAPIEndpoints();
    await testIntegration();
  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('Test Results Summary');
  console.log('='.repeat(60));
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);
  console.log(`  Duration: ${duration}s`);
  console.log('='.repeat(60));

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests
      .filter(t => t.status === 'failed')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runTests, results };
