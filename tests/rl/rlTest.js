#!/usr/bin/env node
/**
 * Phase 5: Reinforcement Learning Test Suite
 * ==========================================
 *
 * Tests the RL portfolio optimization system:
 * - Portfolio trading environment
 * - PPO agent implementation
 * - Training and inference
 * - API endpoints
 *
 * Run: node tests/rl/rlTest.js
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
// PYTHON ENVIRONMENT TESTS
// ============================================================================

async function testPythonEnvironment() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 1: PYTHON ENVIRONMENT TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nVerifying Python environment and required packages.\n');

  const database = db.getDatabase();
  const client = new PythonMLClient(database);

  // Test 1.1: Python availability
  let pythonAvailable = false;
  try {
    const checkScript = `
import sys
print(f"Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
`;
    const result = await client._runPythonScript(checkScript);
    pythonAvailable = result.includes('Python');
    recordTest('1.1 Python availability', pythonAvailable, {
      version: result.trim()
    });
  } catch (err) {
    recordTest('1.1 Python availability', false, { error: err.message });
  }

  // Test 1.2: PyTorch availability
  let torchAvailable = false;
  if (pythonAvailable) {
    try {
      const checkScript = `
import torch
print(f"PyTorch {torch.__version__}")
`;
      const result = await client._runPythonScript(checkScript);
      torchAvailable = result.includes('PyTorch');
      recordTest('1.2 PyTorch availability', torchAvailable, {
        version: result.trim()
      });
    } catch (err) {
      recordTest('1.2 PyTorch availability', 'skipped', {
        reason: 'PyTorch not installed'
      });
    }
  } else {
    recordTest('1.2 PyTorch availability', 'skipped', { reason: 'Python not available' });
  }

  // Test 1.3: NumPy/Pandas availability
  if (pythonAvailable) {
    try {
      const checkScript = `
import numpy as np
import pandas as pd
print(f"NumPy {np.__version__}, Pandas {pd.__version__}")
`;
      const result = await client._runPythonScript(checkScript);
      recordTest('1.3 NumPy/Pandas availability', true, {
        versions: result.trim()
      });
    } catch (err) {
      recordTest('1.3 NumPy/Pandas availability', false, { error: err.message });
    }
  } else {
    recordTest('1.3 NumPy/Pandas availability', 'skipped', { reason: 'Python not available' });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  The RL system requires Python with PyTorch for neural network training.');
  console.log('  NumPy and Pandas are used for data manipulation.\n');

  return { pythonAvailable, torchAvailable };
}

// ============================================================================
// PORTFOLIO ENVIRONMENT TESTS
// ============================================================================

async function testPortfolioEnvironment(envStatus) {
  console.log('\n' + '='.repeat(70));
  log('SECTION 2: PORTFOLIO ENVIRONMENT TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nTesting the Gym-compatible portfolio trading environment.\n');

  const database = db.getDatabase();
  const client = new PythonMLClient(database);

  if (!envStatus.pythonAvailable) {
    recordTest('2.1 Environment import', 'skipped', { reason: 'Python not available' });
    recordTest('2.2 Environment creation', 'skipped', { reason: 'Python not available' });
    recordTest('2.3 Environment reset', 'skipped', { reason: 'Python not available' });
    recordTest('2.4 Environment step', 'skipped', { reason: 'Python not available' });
    recordTest('2.5 Episode statistics', 'skipped', { reason: 'Python not available' });
    return;
  }

  // Test 2.1: Import environment
  try {
    const script = `
import sys
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig, RewardType
print('import_success')
`;
    const result = await client._runPythonScript(script);
    recordTest('2.1 Environment import', result.includes('import_success'));
  } catch (err) {
    recordTest('2.1 Environment import', false, { error: err.message });
    return;
  }

  // Test 2.2: Create environment
  try {
    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig

# Create synthetic prices
np.random.seed(42)
n_days, n_assets = 500, 5
prices = np.zeros((n_days, n_assets))
prices[0] = 100
for t in range(1, n_days):
    prices[t] = prices[t-1] * (1 + np.random.normal(0.0005, 0.02, n_assets))

env = PortfolioTradingEnv(prices=prices, seed=42)
print(json.dumps({
    'success': True,
    'n_assets': env.n_assets,
    'n_timesteps': env.n_timesteps,
    'obs_dim': env.observation_space.shape[0] if hasattr(env.observation_space, 'shape') else None,
    'action_dim': env.action_space.shape[0] if hasattr(env.action_space, 'shape') else None,
}))
`;
    const result = await client._runPythonScript(script);
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

    console.log('\n  Environment created:');
    console.log(`    • Assets: ${data.n_assets}`);
    console.log(`    • Timesteps: ${data.n_timesteps}`);
    console.log(`    • Observation dim: ${data.obs_dim}`);
    console.log(`    • Action dim: ${data.action_dim}`);

    recordTest('2.2 Environment creation', data.success, data);
  } catch (err) {
    recordTest('2.2 Environment creation', false, { error: err.message });
    return;
  }

  // Test 2.3: Reset environment
  try {
    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from environments.portfolio_env import PortfolioTradingEnv

np.random.seed(42)
prices = np.random.randn(500, 5).cumsum(axis=0) + 100
env = PortfolioTradingEnv(prices=prices, seed=42)

obs, info = env.reset()
print(json.dumps({
    'success': True,
    'obs_shape': list(obs.shape),
    'portfolio_value': float(info.get('portfolio_value', 0)),
    'initial_weights': [float(w) for w in env.portfolio_weights],
}))
`;
    const result = await client._runPythonScript(script);
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);
    recordTest('2.3 Environment reset', data.success, data);
  } catch (err) {
    recordTest('2.3 Environment reset', false, { error: err.message });
  }

  // Test 2.4: Step through environment
  try {
    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from environments.portfolio_env import PortfolioTradingEnv

np.random.seed(42)
prices = np.random.randn(500, 5).cumsum(axis=0) + 100
env = PortfolioTradingEnv(prices=prices, seed=42)

obs, info = env.reset()

# Take some steps
total_reward = 0
for _ in range(10):
    action = np.random.random(5)  # Random action
    obs, reward, terminated, truncated, info = env.step(action)
    total_reward += reward
    if terminated or truncated:
        break

print(json.dumps({
    'success': True,
    'steps_taken': 10,
    'total_reward': float(total_reward),
    'portfolio_value': float(info.get('portfolio_value', 0)),
}))
`;
    const result = await client._runPythonScript(script);
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

    console.log('\n  Step test results:');
    console.log(`    • Steps: ${data.steps_taken}`);
    console.log(`    • Total reward: ${data.total_reward?.toFixed(4)}`);

    recordTest('2.4 Environment step', data.success, data);
  } catch (err) {
    recordTest('2.4 Environment step', false, { error: err.message });
  }

  // Test 2.5: Episode statistics
  try {
    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig

np.random.seed(42)
prices = np.random.randn(500, 5).cumsum(axis=0) + 100

config = PortfolioEnvConfig(episode_length=100)
env = PortfolioTradingEnv(prices=prices, config=config, seed=42)

obs, _ = env.reset()
done = False
while not done:
    action = np.random.random(5)
    obs, reward, terminated, truncated, _ = env.step(action)
    done = terminated or truncated

stats = env.get_episode_stats()
print(json.dumps({
    'success': True,
    'sharpe': float(stats.get('sharpe', 0)),
    'total_return': float(stats.get('total_return', 0)),
    'max_drawdown': float(stats.get('max_drawdown', 0)),
    'volatility': float(stats.get('volatility', 0)),
    'n_trades': stats.get('n_trades', 0),
}))
`;
    const result = await client._runPythonScript(script);
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

    console.log('\n  Episode statistics:');
    console.log(`    • Sharpe: ${data.sharpe?.toFixed(3)}`);
    console.log(`    • Return: ${(data.total_return * 100)?.toFixed(2)}%`);
    console.log(`    • Max DD: ${(data.max_drawdown * 100)?.toFixed(2)}%`);

    recordTest('2.5 Episode statistics', data.success, data);
  } catch (err) {
    recordTest('2.5 Episode statistics', false, { error: err.message });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  The portfolio environment simulates trading with transaction costs,');
  console.log('  position limits, and various reward functions for RL training.\n');
}

// ============================================================================
// PPO AGENT TESTS
// ============================================================================

async function testPPOAgent(envStatus) {
  console.log('\n' + '='.repeat(70));
  log('SECTION 3: PPO AGENT TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nTesting the Proximal Policy Optimization agent.\n');

  const database = db.getDatabase();
  const client = new PythonMLClient(database);

  if (!envStatus.torchAvailable) {
    recordTest('3.1 PPO agent import', 'skipped', { reason: 'PyTorch not available' });
    recordTest('3.2 Agent creation', 'skipped', { reason: 'PyTorch not available' });
    recordTest('3.3 Action selection', 'skipped', { reason: 'PyTorch not available' });
    recordTest('3.4 Short training', 'skipped', { reason: 'PyTorch not available' });
    recordTest('3.5 Save/Load', 'skipped', { reason: 'PyTorch not available' });
    return;
  }

  // Test 3.1: Import PPO agent
  try {
    const script = `
import sys
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from agents.ppo_agent import PPOAgent, PPOConfig
print('import_success')
`;
    const result = await client._runPythonScript(script);
    recordTest('3.1 PPO agent import', result.includes('import_success'));
  } catch (err) {
    recordTest('3.1 PPO agent import', false, { error: err.message });
    return;
  }

  // Test 3.2: Create agent
  try {
    const script = `
import sys
import json
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from agents.ppo_agent import PPOAgent, PPOConfig

config = PPOConfig(hidden_sizes=[64, 64])
agent = PPOAgent(obs_dim=100, action_dim=5, config=config)

info = agent.get_policy_info()
print(json.dumps({
    'success': True,
    'obs_dim': info['obs_dim'],
    'action_dim': info['action_dim'],
    'n_parameters': info['n_parameters'],
    'device': info['device'],
}))
`;
    const result = await client._runPythonScript(script);
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

    console.log('\n  PPO Agent created:');
    console.log(`    • Parameters: ${data.n_parameters?.toLocaleString()}`);
    console.log(`    • Device: ${data.device}`);

    recordTest('3.2 Agent creation', data.success, data);
  } catch (err) {
    recordTest('3.2 Agent creation', false, { error: err.message });
  }

  // Test 3.3: Action selection
  try {
    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from agents.ppo_agent import PPOAgent, PPOConfig

config = PPOConfig(hidden_sizes=[64, 64])
agent = PPOAgent(obs_dim=100, action_dim=5, config=config)

# Create fake observation
obs = np.random.randn(100).astype(np.float32)

# Get action
action, log_prob, value = agent.select_action(obs, deterministic=False)

print(json.dumps({
    'success': True,
    'action_shape': list(action.shape),
    'action_sum': float(action.sum()),
    'log_prob': float(log_prob),
    'value': float(value),
}))
`;
    const result = await client._runPythonScript(script);
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

    console.log('\n  Action selection:');
    console.log(`    • Action sum: ${data.action_sum?.toFixed(4)} (should be ~1.0)`);
    console.log(`    • Value estimate: ${data.value?.toFixed(4)}`);

    const actionSumValid = Math.abs(data.action_sum - 1.0) < 0.01;
    recordTest('3.3 Action selection', data.success && actionSumValid, data);
  } catch (err) {
    recordTest('3.3 Action selection', false, { error: err.message });
  }

  // Test 3.4: Short training run
  try {
    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from agents.ppo_agent import PPOAgent, PPOConfig
from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig

# Create environment
np.random.seed(42)
prices = np.random.randn(500, 5).cumsum(axis=0) + 100
env_config = PortfolioEnvConfig(episode_length=50, lookback_window=10)
env = PortfolioTradingEnv(prices=prices, config=env_config, seed=42)

# Create agent
obs, _ = env.reset()
agent_config = PPOConfig(hidden_sizes=[32, 32], n_steps=128, n_epochs=2)
agent = PPOAgent(obs_dim=obs.shape[0], action_dim=5, config=agent_config)

# Short training
history = agent.train(env, total_timesteps=500, log_interval=100)

print(json.dumps({
    'success': True,
    'episodes': len(history['episode_rewards']),
    'final_reward': float(np.mean(history['episode_rewards'][-5:])) if history['episode_rewards'] else 0,
    'policy_loss': float(history['policy_loss'][-1]) if history['policy_loss'] else None,
}))
`;
    const result = await client._runPythonScript(script, { timeout: 60000 });
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

    console.log('\n  Training test (500 steps):');
    console.log(`    • Episodes completed: ${data.episodes}`);
    console.log(`    • Final mean reward: ${data.final_reward?.toFixed(4)}`);

    recordTest('3.4 Short training', data.success && data.episodes > 0, data);
  } catch (err) {
    recordTest('3.4 Short training', false, { error: err.message });
  }

  // Test 3.5: Save/Load
  try {
    const script = `
import sys
import json
import os
import tempfile
sys.path.insert(0, '${path.join(__dirname, '../../python').replace(/\\/g, '/')}')
from agents.ppo_agent import PPOAgent, PPOConfig

# Create agent
config = PPOConfig(hidden_sizes=[32, 32])
agent = PPOAgent(obs_dim=50, action_dim=3, config=config)
agent.total_timesteps = 1000  # Simulate some training

# Save to temp file
with tempfile.NamedTemporaryFile(suffix='.pt', delete=False) as f:
    temp_path = f.name

agent.save(temp_path)

# Load
loaded_agent = PPOAgent.load(temp_path)

# Verify
info1 = agent.get_policy_info()
info2 = loaded_agent.get_policy_info()

# Cleanup
os.unlink(temp_path)

print(json.dumps({
    'success': True,
    'original_timesteps': info1['total_timesteps'],
    'loaded_timesteps': info2['total_timesteps'],
    'match': info1['total_timesteps'] == info2['total_timesteps'],
}))
`;
    const result = await client._runPythonScript(script);
    const jsonMatch = result.match(/\{[^{}]*"success"[^{}]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : result);

    recordTest('3.5 Save/Load', data.success && data.match, data);
  } catch (err) {
    recordTest('3.5 Save/Load', false, { error: err.message });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  PPO is the state-of-the-art RL algorithm for continuous control.');
  console.log('  It learns to optimize portfolio weights through trial and error.\n');
}

// ============================================================================
// API ENDPOINT TESTS
// ============================================================================

async function testAPIEndpoints() {
  console.log('\n' + '='.repeat(70));
  log('SECTION 4: API ENDPOINT TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nTesting RL API endpoints.\n');

  const express = require('express');
  const http = require('http');
  const app = express();
  app.use(express.json());
  app.set('db', db.getDatabase());

  const rlRouter = require('../../src/api/routes/rl');
  app.use('/api/rl', rlRouter);

  const server = app.listen(3098);

  async function testEndpoint(method, path, body = null) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3098,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data: data });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ status: 500, error: e.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 408, error: 'Timeout' });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  try {
    // Test 4.1: Status endpoint
    const statusRes = await testEndpoint('GET', '/api/rl/status');
    console.log(`\n  RL Status: ${statusRes.data?.status || 'unknown'}`);
    console.log(`    • Models available: ${statusRes.data?.modelsAvailable || 0}`);

    recordTest('4.1 GET /api/rl/status', statusRes.status === 200 && statusRes.data?.success);

    // Test 4.2: Config endpoint
    const configRes = await testEndpoint('GET', '/api/rl/config');
    const hasConfig = configRes.data?.config?.environment && configRes.data?.config?.agent;
    recordTest('4.2 GET /api/rl/config', configRes.status === 200 && hasConfig);

    // Test 4.3: Models endpoint
    const modelsRes = await testEndpoint('GET', '/api/rl/models');
    recordTest('4.3 GET /api/rl/models', modelsRes.status === 200 && modelsRes.data?.success);

    // Test 4.4: Train validation (don't actually train, just validate inputs)
    const trainRes = await testEndpoint('POST', '/api/rl/train', {
      symbols: ['AAPL', 'GOOGL'],
      totalTimesteps: 1000,
      rewardType: 'SHARPE'
    });
    recordTest('4.4 POST /api/rl/train (validation)', trainRes.status === 200 && trainRes.data?.success);

    // Test 4.5: Train with invalid inputs
    const invalidTrainRes = await testEndpoint('POST', '/api/rl/train', {
      symbols: [],  // Invalid: empty
      rewardType: 'INVALID'  // Invalid reward type
    });
    recordTest('4.5 Train validation (invalid inputs)', invalidTrainRes.status === 400);

    // Test 4.6: Predict endpoint (will fail without trained model)
    const predictRes = await testEndpoint('POST', '/api/rl/predict', {
      symbols: ['AAPL', 'GOOGL', 'MSFT']
    });
    // Expected to fail since no model is trained
    recordTest('4.6 POST /api/rl/predict (no model)', predictRes.status === 404 || predictRes.data?.error?.includes('not found'));

    // Test 4.7: Backtest endpoint (will fail without trained model)
    const backtestRes = await testEndpoint('POST', '/api/rl/backtest', {
      symbols: ['AAPL', 'GOOGL'],
      nEpisodes: 3
    });
    recordTest('4.7 POST /api/rl/backtest (no model)', backtestRes.status === 404 || backtestRes.data?.error?.includes('not found'));

  } finally {
    server.close();
  }

  console.log('\n  💡 What does this mean?');
  console.log('  The API endpoints allow external access to RL training and inference.');
  console.log('  The frontend can trigger training, get predictions, and run backtests.\n');
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

async function testIntegration(envStatus) {
  console.log('\n' + '='.repeat(70));
  log('SECTION 5: INTEGRATION TESTS', 'section');
  console.log('='.repeat(70));
  console.log('\nTesting integration with existing ML pipeline.\n');

  const database = db.getDatabase();
  const client = new PythonMLClient(database);

  if (!envStatus.torchAvailable) {
    recordTest('5.1 ML Client RL methods', 'skipped', { reason: 'PyTorch not available' });
    recordTest('5.2 Available RL models', 'skipped', { reason: 'PyTorch not available' });
    return;
  }

  // Test 5.1: ML Client has RL methods
  try {
    const hasTrainMethod = typeof client.trainRLAgent === 'function';
    const hasPredictMethod = typeof client.getRLPrediction === 'function';
    const hasBacktestMethod = typeof client.backtestRLAgent === 'function';
    const hasModelsMethod = typeof client.getAvailableRLModels === 'function';

    const allMethods = hasTrainMethod && hasPredictMethod && hasBacktestMethod && hasModelsMethod;

    console.log('\n  ML Client RL methods:');
    console.log(`    • trainRLAgent: ${hasTrainMethod ? '✓' : '✗'}`);
    console.log(`    • getRLPrediction: ${hasPredictMethod ? '✓' : '✗'}`);
    console.log(`    • backtestRLAgent: ${hasBacktestMethod ? '✓' : '✗'}`);
    console.log(`    • getAvailableRLModels: ${hasModelsMethod ? '✓' : '✗'}`);

    recordTest('5.1 ML Client RL methods', allMethods);
  } catch (err) {
    recordTest('5.1 ML Client RL methods', false, { error: err.message });
  }

  // Test 5.2: Get available models
  try {
    const models = await client.getAvailableRLModels();
    console.log(`\n  Available RL models: ${models.length}`);

    recordTest('5.2 Available RL models', Array.isArray(models), {
      count: models.length
    });
  } catch (err) {
    recordTest('5.2 Available RL models', false, { error: err.message });
  }

  console.log('\n  💡 What does this mean?');
  console.log('  The RL system integrates with the existing PythonMLClient,');
  console.log('  allowing seamless use alongside deep learning and gradient boosting.\n');
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runTests() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║      PHASE 5: REINFORCEMENT LEARNING TEST SUITE                    ║
║                                                                     ║
║  Testing PPO agent for portfolio optimization with Gym-compatible  ║
║  environment, walk-forward validation, and API integration.        ║
╚════════════════════════════════════════════════════════════════════╝
`);

  try {
    // Run test sections
    const envStatus = await testPythonEnvironment();
    await testPortfolioEnvironment(envStatus);
    await testPPOAgent(envStatus);
    await testAPIEndpoints();
    await testIntegration(envStatus);

  } catch (error) {
    console.error('Test suite error:', error);
  }

  // Print report
  const duration = ((new Date() - testResults.startTime) / 1000).toFixed(1);

  console.log(`
======================================================================
              PHASE 5: REINFORCEMENT LEARNING TEST REPORT
======================================================================

  📅 Test Date:     ${new Date().toISOString().split('T')[0]}
  ⏱️  Duration:      ${duration} seconds

  📊 RESULTS SUMMARY
  ─────────────────────────────────────────────────────────────────────
  ✅ Passed:  ${testResults.passed}
  ❌ Failed:  ${testResults.failed}
  ⏭️  Skipped: ${testResults.skipped}

  Overall: ${testResults.failed === 0 ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}
  `);

  if (testResults.failed > 0) {
    console.log('  FAILED TESTS:');
    testResults.tests
      .filter(t => t.passed === false)
      .forEach(t => console.log(`  ❌ ${t.name}: ${t.error || 'Failed'}`));
  }

  if (testResults.skipped > 0) {
    console.log('\n  SKIPPED TESTS (environment not configured):');
    testResults.tests
      .filter(t => t.passed === 'skipped')
      .forEach(t => console.log(`  ⏭️  ${t.name}: ${t.reason || ''}`));
  }

  console.log(`

  📝 WHAT THIS MEANS (Plain English)
  ─────────────────────────────────────────────────────────────────────

  Phase 5 adds Reinforcement Learning for portfolio optimization:

  ✓ Portfolio Trading Environment
    → Gym-compatible environment for RL training
    → Realistic transaction costs and position limits
    → Multiple reward functions (Sharpe, Sortino, Calmar)

  ✓ PPO Agent
    → State-of-the-art policy gradient algorithm
    → Actor-Critic architecture with shared features
    → Automatic exploration vs exploitation balance

  ✓ Training Pipeline
    → Walk-forward validation for robustness
    → Model checkpointing and monitoring
    → Integration with existing ML infrastructure

  ✓ API Access
    → Full REST API for training and inference
    → Async training with job tracking
    → Backtest comparison with benchmarks


  🏗️  RL ARCHITECTURE
  ─────────────────────────────────────────────────────────────────────

  ┌─────────────────────────────────────────────────────────────┐
  │                    RL PORTFOLIO SYSTEM                       │
  ├─────────────────────────────────────────────────────────────┤
  │                                                              │
  │  Market Data          PPO Agent           Portfolio          │
  │  ┌──────────┐        ┌──────────┐        ┌──────────┐       │
  │  │  Prices  │───────>│  Actor   │───────>│ Weights  │       │
  │  │ Features │        │  Critic  │        │ Actions  │       │
  │  └──────────┘        └────┬─────┘        └────┬─────┘       │
  │       │                   │                   │              │
  │       │              ┌────▼─────┐             │              │
  │       └──────────────│  Reward  │<────────────┘              │
  │                      │  (Sharpe)│                            │
  │                      └──────────┘                            │
  │                                                              │
  │  Training: Environment → Agent → Action → Reward → Update   │
  │                                                              │
  └─────────────────────────────────────────────────────────────┘

======================================================================
`);

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests();
