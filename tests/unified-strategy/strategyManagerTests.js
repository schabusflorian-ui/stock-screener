// tests/unified-strategy/strategyManagerTests.js
// Integration tests for StrategyManager CRUD operations

/**
 * Run strategy manager tests
 * @param {TestRunner} t - Test runner instance
 * @param {Object} db - Database instance
 */
async function runStrategyManagerTests(t, db) {
  const { StrategyManager, DEFAULT_SIGNAL_WEIGHTS, DEFAULT_RISK_PARAMS } = require('../../src/services/strategy/strategyManager');

  let manager;
  let createdStrategyId = null;

  await t.asyncSuite('StrategyManager - Initialization', async () => {
    t.test('Should create manager instance', () => {
      manager = new StrategyManager(db);
      t.assertDefined(manager, 'Manager should be defined');
    });

    t.test('Should have default weights available', () => {
      t.assertObject(DEFAULT_SIGNAL_WEIGHTS);
      const keys = Object.keys(DEFAULT_SIGNAL_WEIGHTS);
      t.assert(keys.length === 15, `Should have 15 signal weights, got ${keys.length}`);
    });

    t.test('Should have default risk params available', () => {
      t.assertObject(DEFAULT_RISK_PARAMS);
      t.assertDefined(DEFAULT_RISK_PARAMS.maxPositionSize);
      t.assertDefined(DEFAULT_RISK_PARAMS.maxSectorConcentration);
    });
  });

  await t.asyncSuite('StrategyManager - Strategy Validation', async () => {
    t.test('Should validate correct strategy config', () => {
      const validConfig = {
        name: 'Test Strategy',
        signal_weights: DEFAULT_SIGNAL_WEIGHTS,
        risk_params: DEFAULT_RISK_PARAMS
      };

      const result = manager.validateStrategy(validConfig);
      t.assert(result.valid, `Validation should pass: ${JSON.stringify(result.errors)}`);
    });

    t.test('Should reject strategy without name', () => {
      const invalidConfig = {
        signal_weights: DEFAULT_SIGNAL_WEIGHTS
      };

      const result = manager.validateStrategy(invalidConfig);
      t.assert(!result.valid, 'Validation should fail');
      t.assert(result.errors.some(e => e.includes('name')), 'Should have name error');
    });

    t.test('Should reject strategy with invalid weights', () => {
      const invalidConfig = {
        name: 'Test',
        signal_weights: { technical: 5.0 } // Sum != 1
      };

      const result = manager.validateStrategy(invalidConfig);
      // Should have warning about weights not summing to 1
      t.assert(result.warnings?.length > 0 || !result.valid);
    });

    t.test('Should warn on extreme risk params', () => {
      const extremeConfig = {
        name: 'Extreme Strategy',
        signal_weights: DEFAULT_SIGNAL_WEIGHTS,
        risk_params: {
          ...DEFAULT_RISK_PARAMS,
          maxPositionSize: 0.5 // Very high
        }
      };

      const result = manager.validateStrategy(extremeConfig);
      t.assert(result.warnings?.length > 0, 'Should have warnings');
    });
  });

  await t.asyncSuite('StrategyManager - Strategy CRUD', async () => {
    await t.asyncTest('Should create a new strategy', async () => {
      const config = {
        name: 'QA Test Strategy ' + Date.now(),
        description: 'Created by automated tests',
        strategy_type: 'single',
        signal_weights: DEFAULT_SIGNAL_WEIGHTS,
        risk_params: DEFAULT_RISK_PARAMS,
        min_confidence: 0.65,
        min_signal_score: 0.35
      };

      const strategy = manager.createStrategy(config);
      t.assertDefined(strategy, 'Strategy should be created');
      t.assertDefined(strategy.id, 'Strategy should have an ID');
      t.assertEqual(strategy.name, config.name);

      createdStrategyId = strategy.id;
    });

    await t.asyncTest('Should retrieve created strategy', async () => {
      t.assertDefined(createdStrategyId, 'Need created strategy ID');

      const strategy = manager.getStrategy(createdStrategyId);
      t.assertDefined(strategy, 'Strategy should be found');
      t.assertEqual(strategy.id, createdStrategyId);
    });

    await t.asyncTest('Should update strategy', async () => {
      t.assertDefined(createdStrategyId, 'Need created strategy ID');

      const updates = {
        description: 'Updated by QA tests',
        min_confidence: 0.7
      };

      const updated = manager.updateStrategy(createdStrategyId, updates);
      t.assertEqual(updated.description, updates.description);
      t.assertEqual(updated.min_confidence, updates.min_confidence);
    });

    await t.asyncTest('Should list all strategies', async () => {
      const strategies = manager.getAllStrategies();
      t.assertArray(strategies);
      t.assert(strategies.length > 0, 'Should have at least one strategy');

      // Find our created strategy
      const found = strategies.find(s => s.id === createdStrategyId);
      t.assertDefined(found, 'Created strategy should be in list');
    });

    await t.asyncTest('Should duplicate strategy', async () => {
      t.assertDefined(createdStrategyId, 'Need created strategy ID');

      const duplicated = manager.duplicateStrategy(createdStrategyId, 'Duplicated Test Strategy');
      t.assertDefined(duplicated, 'Duplicate should be created');
      t.assert(duplicated.id !== createdStrategyId, 'Duplicate should have new ID');
      t.assertEqual(duplicated.name, 'Duplicated Test Strategy');

      // Clean up duplicate
      manager.hardDeleteStrategy(duplicated.id);
    });

    await t.asyncTest('Should soft delete strategy', async () => {
      t.assertDefined(createdStrategyId, 'Need created strategy ID');

      const deleted = manager.deleteStrategy(createdStrategyId);
      t.assert(deleted, 'Delete should succeed');

      // Verify soft deleted
      const strategy = manager.getStrategy(createdStrategyId);
      t.assert(!strategy.is_active, 'Strategy should be inactive');
    });

    await t.asyncTest('Should hard delete strategy', async () => {
      t.assertDefined(createdStrategyId, 'Need created strategy ID');

      const deleted = manager.hardDeleteStrategy(createdStrategyId);
      t.assert(deleted, 'Hard delete should succeed');

      // Verify deleted
      const strategy = manager.getStrategy(createdStrategyId);
      t.assert(!strategy, 'Strategy should not exist');

      createdStrategyId = null;
    });
  });

  await t.asyncSuite('StrategyManager - Presets', async () => {
    t.test('Should have presets available', () => {
      const presets = manager.getPresets();
      t.assertArray(presets);
      t.assert(presets.length > 0, 'Should have presets');
    });

    t.test('Presets should have required fields', () => {
      const presets = manager.getPresets();

      for (const preset of presets) {
        t.assertDefined(preset.name, 'Preset should have name');
        t.assertDefined(preset.signalWeights, `Preset ${preset.name} should have signalWeights`);
      }
    });

    await t.asyncTest('Should create strategy from preset', async () => {
      const presets = manager.getPresets();
      t.assert(presets.length > 0, 'Need presets');

      const presetName = presets[0].name;
      const strategy = manager.createFromPreset(presetName, { name: 'From Preset ' + Date.now() });

      t.assertDefined(strategy, 'Strategy should be created');
      t.assertDefined(strategy.id);

      // Clean up
      manager.hardDeleteStrategy(strategy.id);
    });

    t.test('Should throw on invalid preset name', () => {
      t.assertThrows(() => {
        manager.createFromPreset('NonExistentPreset', {});
      }, 'not found');
    });
  });

  await t.asyncSuite('StrategyManager - Multi-Strategy', async () => {
    let parentId = null;
    let childIds = [];

    await t.asyncTest('Should create multi-strategy with children', async () => {
      const parentConfig = {
        name: 'Test Multi-Strategy ' + Date.now(),
        strategy_type: 'multi',
        signal_weights: DEFAULT_SIGNAL_WEIGHTS,
        risk_params: DEFAULT_RISK_PARAMS
      };

      const children = [
        {
          name: 'Aggressive Child',
          strategy_type: 'single',
          signal_weights: { ...DEFAULT_SIGNAL_WEIGHTS, momentum: 0.3 },
          risk_params: DEFAULT_RISK_PARAMS,
          target_allocation: 0.6,
          regime_trigger: { regime: 'LOW_VOL', action: 'activate' }
        },
        {
          name: 'Defensive Child',
          strategy_type: 'single',
          signal_weights: { ...DEFAULT_SIGNAL_WEIGHTS, valueQuality: 0.3 },
          risk_params: DEFAULT_RISK_PARAMS,
          target_allocation: 0.4,
          regime_trigger: { regime: 'CRISIS', action: 'activate' }
        }
      ];

      const multiStrategy = manager.createMultiStrategy(parentConfig, children);
      t.assertDefined(multiStrategy, 'Multi-strategy should be created');
      t.assertEqual(multiStrategy.strategy_type, 'multi');

      parentId = multiStrategy.id;

      // Get children
      const childStrategies = manager.getChildStrategies(parentId);
      t.assertArray(childStrategies);
      t.assertEqual(childStrategies.length, 2);

      childIds = childStrategies.map(c => c.id);
    });

    await t.asyncTest('Should retrieve multi-strategy with children', async () => {
      t.assertDefined(parentId, 'Need parent ID');

      const strategy = manager.getStrategy(parentId);
      t.assertDefined(strategy);

      // Should include children info when type is multi
      const children = manager.getChildStrategies(parentId);
      t.assertEqual(children.length, 2);
    });

    await t.asyncTest('Should clean up multi-strategy', async () => {
      if (parentId) {
        // Delete children first
        for (const childId of childIds) {
          manager.hardDeleteStrategy(childId);
        }
        // Delete parent
        manager.hardDeleteStrategy(parentId);
      }
    });
  });

  await t.asyncSuite('StrategyManager - Query Filters', async () => {
    t.test('Should filter by strategy type', () => {
      const singleStrategies = manager.getAllStrategies({ type: 'single' });
      t.assertArray(singleStrategies);

      for (const s of singleStrategies) {
        t.assertEqual(s.strategy_type, 'single');
      }
    });

    t.test('Should filter templates only', () => {
      const templates = manager.getAllStrategies({ templates: true });
      t.assertArray(templates);

      for (const s of templates) {
        t.assert(s.is_template, 'Should only return templates');
      }
    });
  });
}

module.exports = runStrategyManagerTests;
