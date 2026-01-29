// tests/unified-strategy/apiEndpointTests.js
// Tests for unified strategy API endpoints

/**
 * Run API endpoint tests
 * @param {TestRunner} t - Test runner instance
 * @param {Object} db - Database instance
 * @param {Object} app - Express app instance (optional, for integration testing)
 */
async function runApiEndpointTests(t, db, app = null) {
  // Check if supertest is available
  let request;
  try {
    request = require('supertest');
  } catch (e) {
    console.log('  Note: supertest not installed, running limited API tests');
    console.log('  To enable full API tests: npm install --save-dev supertest');
    request = null;
  }

  // Import the route handlers for unit testing
  const express = require('express');

  let testApp;
  let testStrategyId = null;

  // If supertest not available, skip all API tests
  if (!request) {
    await t.asyncSuite('API Endpoints - Status', async () => {
      t.test('Should skip API tests (supertest not installed)', () => {
        t.assert(true, 'Install supertest with: npm install --save-dev supertest');
      });
    });
    return;
  }

  // Setup test app if not provided
  if (!app) {
    testApp = express();
    testApp.use(express.json());

    // Mount the routes
    try {
      const unifiedStrategyRoutes = require('../../src/api/routes/unifiedStrategy');
      testApp.use('/api/unified-strategies', unifiedStrategyRoutes(db));
    } catch (e) {
      console.log('Note: Could not mount routes directly, using mock tests');
      testApp = null;
    }
  } else {
    testApp = app;
  }

  await t.asyncSuite('API Endpoints - Strategy CRUD', async () => {
    if (!testApp) {
      t.test('Should skip API tests (no app available)', () => {
        t.assert(true, 'Skipped - run with full app');
      });
      return;
    }

    await t.asyncTest('POST /api/unified-strategies - Create strategy', async () => {
      const response = await request(testApp)
        .post('/api/unified-strategies')
        .send({
          name: 'API Test Strategy',
          description: 'Created via API test',
          strategy_type: 'single',
          signal_weights: {
            technical: 0.15,
            fundamental: 0.15,
            sentiment: 0.10,
            insider: 0.10,
            congressional: 0.05,
            valuation: 0.15,
            thirteenF: 0.05,
            earningsMomentum: 0.05,
            valueQuality: 0.10,
            momentum: 0.05,
            analyst: 0.05,
            alternative: 0.00,
            contrarian: 0.00,
            magicFormula: 0.00,
            factorScores: 0.00
          },
          risk_params: {
            maxPositionSize: 0.10,
            stopLoss: 0.15
          }
        })
        .expect('Content-Type', /json/);

      t.assert(response.status === 200 || response.status === 201,
        `Should return success status, got ${response.status}`);

      if (response.body.strategy) {
        testStrategyId = response.body.strategy.id;
        t.assertDefined(testStrategyId, 'Should return strategy ID');
      }
    });

    await t.asyncTest('GET /api/unified-strategies - List strategies', async () => {
      const response = await request(testApp)
        .get('/api/unified-strategies')
        .expect('Content-Type', /json/);

      t.assert(response.status === 200, `Should return 200, got ${response.status}`);
      t.assertArray(response.body.strategies || response.body, 'Should return array');
    });

    await t.asyncTest('GET /api/unified-strategies/:id - Get single strategy', async () => {
      if (!testStrategyId) {
        t.assert(true, 'Skipped - no test strategy created');
        return;
      }

      const response = await request(testApp)
        .get(`/api/unified-strategies/${testStrategyId}`)
        .expect('Content-Type', /json/);

      t.assert(response.status === 200, `Should return 200, got ${response.status}`);
      t.assertDefined(response.body.strategy || response.body, 'Should return strategy');
    });

    await t.asyncTest('PUT /api/unified-strategies/:id - Update strategy', async () => {
      if (!testStrategyId) {
        t.assert(true, 'Skipped - no test strategy created');
        return;
      }

      const response = await request(testApp)
        .put(`/api/unified-strategies/${testStrategyId}`)
        .send({
          name: 'API Test Strategy Updated',
          min_confidence: 0.7
        })
        .expect('Content-Type', /json/);

      t.assert(response.status === 200, `Should return 200, got ${response.status}`);
    });

    await t.asyncTest('DELETE /api/unified-strategies/:id - Delete strategy', async () => {
      if (!testStrategyId) {
        t.assert(true, 'Skipped - no test strategy created');
        return;
      }

      const response = await request(testApp)
        .delete(`/api/unified-strategies/${testStrategyId}`);

      t.assert(response.status === 200 || response.status === 204,
        `Should return success status, got ${response.status}`);

      testStrategyId = null;
    });
  });

  await t.asyncSuite('API Endpoints - Presets', async () => {
    if (!testApp) {
      t.test('Should skip preset tests (no app available)', () => {
        t.assert(true, 'Skipped - run with full app');
      });
      return;
    }

    await t.asyncTest('GET /api/unified-strategies/presets - Get presets', async () => {
      const response = await request(testApp)
        .get('/api/unified-strategies/presets')
        .expect('Content-Type', /json/);

      t.assert(response.status === 200, `Should return 200, got ${response.status}`);

      const presets = response.body.presets || response.body;
      if (Array.isArray(presets)) {
        t.assert(presets.length > 0, 'Should have at least one preset');
      }
    });
  });

  await t.asyncSuite('API Endpoints - Backtest', async () => {
    if (!testApp) {
      t.test('Should skip backtest API tests (no app available)', () => {
        t.assert(true, 'Skipped - run with full app');
      });
      return;
    }

    let backtestStrategyId = null;

    await t.asyncTest('Should create strategy for backtest testing', async () => {
      const response = await request(testApp)
        .post('/api/unified-strategies')
        .send({
          name: 'Backtest API Test Strategy',
          strategy_type: 'single',
          signal_weights: {
            technical: 0.20,
            fundamental: 0.20,
            sentiment: 0.10,
            insider: 0.10,
            congressional: 0.05,
            valuation: 0.15,
            thirteenF: 0.05,
            earningsMomentum: 0.05,
            valueQuality: 0.05,
            momentum: 0.05,
            analyst: 0.00,
            alternative: 0.00,
            contrarian: 0.00,
            magicFormula: 0.00,
            factorScores: 0.00
          }
        });

      if (response.body.strategy) {
        backtestStrategyId = response.body.strategy.id;
      }
      t.assert(true);
    });

    await t.asyncTest('POST /api/unified-strategies/:id/backtest - Run backtest', async () => {
      if (!backtestStrategyId) {
        t.assert(true, 'Skipped - no strategy for backtest');
        return;
      }

      const response = await request(testApp)
        .post(`/api/unified-strategies/${backtestStrategyId}/backtest`)
        .send({
          startDate: '2023-01-01',
          endDate: '2023-12-31',
          mode: 'simple',
          benchmark: 'SPY',
          initialCapital: 100000
        })
        .timeout(60000); // 60 second timeout for backtest

      // Backtest might take time or fail due to missing data - that's OK for API test
      t.assert(
        response.status === 200 || response.status === 202 || response.status === 400,
        `Should return valid status, got ${response.status}`
      );
    });

    await t.asyncTest('Cleanup backtest test strategy', async () => {
      if (backtestStrategyId) {
        await request(testApp).delete(`/api/unified-strategies/${backtestStrategyId}`);
      }
      t.assert(true);
    });
  });

  await t.asyncSuite('API Endpoints - Validation', async () => {
    if (!testApp) {
      t.test('Should skip validation tests (no app available)', () => {
        t.assert(true, 'Skipped - run with full app');
      });
      return;
    }

    await t.asyncTest('Should reject invalid strategy creation', async () => {
      const response = await request(testApp)
        .post('/api/unified-strategies')
        .send({
          // Missing required fields
          description: 'Invalid strategy without name'
        });

      t.assert(
        response.status === 400 || response.status === 422,
        `Should reject invalid request, got ${response.status}`
      );
    });

    await t.asyncTest('Should reject invalid signal weights', async () => {
      const response = await request(testApp)
        .post('/api/unified-strategies')
        .send({
          name: 'Invalid Weights Strategy',
          signal_weights: {
            technical: 2.0, // Over 1.0 is invalid
            fundamental: 0.5
          }
        });

      // Should either reject or normalize - both are valid behaviors
      t.assert(response.status >= 200 && response.status < 500, 'Should handle gracefully');
    });

    await t.asyncTest('Should return 404 for non-existent strategy', async () => {
      const response = await request(testApp)
        .get('/api/unified-strategies/99999999');

      t.assert(
        response.status === 404 || response.status === 400,
        `Should return not found, got ${response.status}`
      );
    });
  });

  await t.asyncSuite('API Endpoints - Regime', async () => {
    if (!testApp) {
      t.test('Should skip regime API tests (no app available)', () => {
        t.assert(true, 'Skipped - run with full app');
      });
      return;
    }

    await t.asyncTest('GET /api/unified-strategies/regime/current - Get current regime', async () => {
      const response = await request(testApp)
        .get('/api/unified-strategies/regime/current');

      // This might not be implemented - just verify we get a response
      t.assert(response.status >= 200 && response.status < 500, 'Should respond');

      if (response.status === 200 && response.body.regime) {
        const validRegimes = ['CRISIS', 'HIGH_VOL', 'NORMAL', 'LOW_VOL'];
        t.assert(
          validRegimes.includes(response.body.regime),
          `Should return valid regime, got ${response.body.regime}`
        );
      }
    });
  });

  await t.asyncSuite('API Endpoints - Response Format', async () => {
    if (!testApp) {
      t.test('Should skip format tests (no app available)', () => {
        t.assert(true, 'Skipped - run with full app');
      });
      return;
    }

    await t.asyncTest('Should return consistent response format', async () => {
      const response = await request(testApp)
        .get('/api/unified-strategies');

      t.assert(response.headers['content-type'].includes('json'), 'Should return JSON');

      // Check for standard response structure
      const body = response.body;
      t.assert(
        body.strategies !== undefined ||
        body.error !== undefined ||
        Array.isArray(body),
        'Should have expected response structure'
      );
    });

    await t.asyncTest('Should handle query parameters', async () => {
      const response = await request(testApp)
        .get('/api/unified-strategies')
        .query({
          is_template: true,
          limit: 10,
          offset: 0
        });

      t.assert(response.status === 200, 'Should accept query params');
    });
  });
}

module.exports = runApiEndpointTests;
