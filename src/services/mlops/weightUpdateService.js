// src/services/mlops/weightUpdateService.js
// Weight Update Service - Orchestrates automated signal weight optimization

const { ModelRegistry } = require('./modelRegistry');
const { WeightOptimizer } = require('../backtesting/weightOptimizer');
const { StrategyManager } = require('../strategy/strategyManager');

/**
 * WeightUpdateService
 *
 * Orchestrates the full automated weight update flow:
 * 1. Trigger optimization (scheduled or manual)
 * 2. Run WeightOptimizer with rolling window
 * 3. Validate results against gates (WFE, deflated Sharpe, etc.)
 * 4. Register new version in ModelRegistry (staged)
 * 5. Optionally auto-promote if validation passes
 * 6. Update StrategyManager with new weights
 * 7. Monitor live performance vs backtest
 * 8. Auto-rollback if degradation detected
 */
class WeightUpdateService {
  constructor(db, options = {}) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this.registry = new ModelRegistry(this.db);
    this.optimizer = new WeightOptimizer(this.db);
    this.strategyManager = new StrategyManager(this.db);

    // Default configuration
    this.config = {
      // Optimization settings
      rollingWindowYears: 4,      // Use 4 years of data
      stepSize: 0.15,             // Coarse grid for less overfitting
      fineStepSize: 0.10,
      minWeight: 0.05,            // No zero weights
      maxWeight: 0.40,            // Max 40% per signal
      maxCombinations: 300,       // Limit multiple testing

      // Validation gates (must pass ALL to auto-promote)
      minWFE: 0.50,               // Walk-forward efficiency >= 50%
      maxDeflatedSharpeP: 0.05,   // Deflated Sharpe p-value < 0.05
      minTestSharpe: 0.5,         // Test Sharpe >= 0.5
      maxDrawdown: 0.40,          // Max drawdown <= 40%
      minAlpha: 0,                // Alpha >= 0%

      // Live monitoring thresholds
      maxLiveDeviation: 0.30,     // Max 30% deviation from backtest
      rollbackAfterDays: 30,      // Days to evaluate before rollback
      minDaysForRollback: 10,     // Min days before rollback decision

      // Auto-promotion
      autoPromote: true,          // Auto-promote if validation passes

      ...options
    };
  }

  /**
   * Run full weight update cycle
   * @param {Object} options - Override default config
   * @returns {Object} Update result
   */
  async runUpdate(options = {}) {
    const config = { ...this.config, ...options };
    const startTime = Date.now();

    console.log('\n' + '='.repeat(70));
    console.log('AUTOMATED WEIGHT UPDATE SERVICE');
    console.log('='.repeat(70));
    console.log(`Started at: ${new Date().toISOString()}`);

    const result = {
      success: false,
      version: null,
      optimizationRunId: null,
      validationResult: null,
      promoted: false,
      strategiesUpdated: [],
      rollback: false,
      error: null,
      elapsed: 0
    };

    try {
      // Step 1: Calculate rolling window dates
      const { startDate, endDate } = this._calculateRollingWindow(config.rollingWindowYears);
      console.log(`\n[1/6] Rolling window: ${startDate} to ${endDate}`);

      // Step 2: Run optimization
      console.log('\n[2/6] Running weight optimization...');
      const optimizationConfig = {
        runName: `AutoUpdate_${new Date().toISOString().split('T')[0]}`,
        startDate,
        endDate,
        optimizationTarget: 'alpha',
        stepSize: config.stepSize,
        fineStepSize: config.fineStepSize,
        minWeight: config.minWeight,
        maxWeight: config.maxWeight,
        maxCombinations: config.maxCombinations,
        regimeSpecific: true,
        runAblation: true,
        useWalkForward: true,
        walkForwardPeriods: 5,
        walkForwardPurgeGaps: 5,
        minWalkForwardEfficiency: config.minWFE,
        applyStatisticalCorrections: true,
        multipleTestingMethod: 'fdr_bh',
        runStressTests: true,
        verbose: true
      };

      const optimizationResult = await this.optimizer.runOptimization(optimizationConfig);
      result.optimizationRunId = optimizationResult.runId;

      console.log(`   Optimization completed. Run ID: ${optimizationResult.runId}`);
      console.log(`   Best Alpha: ${optimizationResult.topCombinations[0]?.alpha?.toFixed(2) || 'N/A'}%`);
      console.log(`   Best Sharpe: ${optimizationResult.topCombinations[0]?.sharpe?.toFixed(2) || 'N/A'}`);
      console.log(`   WFE: ${optimizationResult.walkForwardEfficiency !== null ? (optimizationResult.walkForwardEfficiency * 100).toFixed(1) + '%' : 'N/A'}`);

      // Step 3: Extract best weights and metrics
      const bestCombo = optimizationResult.topCombinations[0];
      if (!bestCombo) {
        throw new Error('No valid weight combinations found');
      }

      // Step 4: Register in model registry
      console.log('\n[3/6] Registering in model registry...');
      const version = this._generateVersion();
      const registeredModel = this.registry.registerModel('signal_weights', version, {
        modelType: 'signal_weights',
        artifacts: {
          weights: bestCombo.weights,
          topCombinations: optimizationResult.topCombinations.slice(0, 5),
          ablationResults: optimizationResult.ablationResults,
          regimeWeights: optimizationResult.regimeOptimalWeights
        },
        config: optimizationConfig,
        metrics: {
          trainSharpe: optimizationResult.baselineSharpe,
          testSharpe: bestCombo.sharpe,
          walkForwardEfficiency: optimizationResult.walkForwardEfficiency,
          deflatedSharpeP: optimizationResult.deflatedSharpeP,
          alpha: bestCombo.alpha,
          maxDrawdown: bestCombo.maxDrawdown || optimizationResult.stressTestMaxDrawdown
        },
        validationPeriod: { start: startDate, end: endDate },
        optimizationRunId: optimizationResult.runId
      });

      result.version = version;
      console.log(`   Registered as version: ${version}`);

      // Step 5: Validate against gates
      console.log('\n[4/6] Validating against gates...');
      const validationResult = this.registry.validateModel('signal_weights', version, {
        minWFE: config.minWFE,
        maxDeflatedSharpeP: config.maxDeflatedSharpeP,
        minTestSharpe: config.minTestSharpe,
        maxDrawdown: config.maxDrawdown,
        minAlpha: config.minAlpha
      });

      result.validationResult = validationResult;

      if (validationResult.errors.length > 0) {
        console.log('   FAILED validation:');
        validationResult.errors.forEach(e => console.log(`   - ${e}`));
      }
      if (validationResult.warnings.length > 0) {
        console.log('   Warnings:');
        validationResult.warnings.forEach(w => console.log(`   - ${w}`));
      }
      if (validationResult.valid) {
        console.log('   PASSED all validation gates');
      }

      // Step 6: Conditional promotion
      console.log('\n[5/6] Promotion decision...');
      if (validationResult.valid && config.autoPromote) {
        console.log('   Auto-promoting to production...');
        this.registry.promoteToProduction('signal_weights', version, {
          promotedBy: 'WeightUpdateService',
          reason: 'Passed all validation gates'
        });
        result.promoted = true;

        // Step 7: Update strategies
        console.log('\n[6/6] Updating strategies with new weights...');
        const updatedStrategies = await this._updateStrategies(bestCombo.weights, config);
        result.strategiesUpdated = updatedStrategies;
        console.log(`   Updated ${updatedStrategies.length} strategies`);
      } else if (!validationResult.valid) {
        console.log('   NOT promoting - validation failed');
        console.log('   Model staged for manual review');
      } else {
        console.log('   Auto-promote disabled - model staged for manual review');
      }

      result.success = true;

    } catch (error) {
      result.error = error.message;
      console.error(`\nERROR: ${error.message}`);
      console.error(error.stack);
    }

    result.elapsed = (Date.now() - startTime) / 1000;

    console.log('\n' + '='.repeat(70));
    console.log('WEIGHT UPDATE SUMMARY');
    console.log('='.repeat(70));
    console.log(`Success: ${result.success ? 'YES' : 'NO'}`);
    console.log(`Version: ${result.version || 'N/A'}`);
    console.log(`Promoted: ${result.promoted ? 'YES' : 'NO'}`);
    console.log(`Strategies Updated: ${result.strategiesUpdated.length}`);
    console.log(`Elapsed: ${result.elapsed.toFixed(1)}s`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    console.log('='.repeat(70) + '\n');

    return result;
  }

  /**
   * Check live performance and rollback if needed
   * @param {Object} options - Check options
   * @returns {Object} Check result
   */
  async checkLivePerformance(options = {}) {
    const config = { ...this.config, ...options };

    const currentProduction = this.registry.getLatestProduction('signal_weights');
    if (!currentProduction) {
      return { needsRollback: false, message: 'No production model to check' };
    }

    const performanceHistory = this.registry.getPerformanceHistory(
      'signal_weights',
      currentProduction.version,
      config.rollbackAfterDays
    );

    if (performanceHistory.length < config.minDaysForRollback) {
      return {
        needsRollback: false,
        message: `Only ${performanceHistory.length} days of data, need ${config.minDaysForRollback}`
      };
    }

    // Calculate realized metrics
    const returns = performanceHistory.map(p => p.daily_return).filter(r => r !== null);
    if (returns.length === 0) {
      return { needsRollback: false, message: 'No return data available' };
    }

    const avgDailyReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const realizedSharpe = this._calculateSharpe(returns);
    const backtestSharpe = currentProduction.testSharpe || currentProduction.trainSharpe;

    // Check deviation
    const deviation = backtestSharpe > 0
      ? Math.abs(realizedSharpe - backtestSharpe) / backtestSharpe
      : 0;

    const result = {
      version: currentProduction.version,
      daysTracked: performanceHistory.length,
      realizedSharpe,
      backtestSharpe,
      deviation,
      needsRollback: deviation > config.maxLiveDeviation && realizedSharpe < backtestSharpe,
      message: ''
    };

    if (result.needsRollback) {
      result.message = `Realized Sharpe (${realizedSharpe.toFixed(2)}) deviates ${(deviation * 100).toFixed(0)}% from backtest (${backtestSharpe.toFixed(2)})`;
    } else {
      result.message = `Performance within acceptable range (${(deviation * 100).toFixed(0)}% deviation)`;
    }

    return result;
  }

  /**
   * Manually trigger rollback to previous version
   * @param {string} reason - Reason for rollback
   * @returns {Object} Rollback result
   */
  async rollback(reason = 'Manual rollback') {
    const versionHistory = this.registry.getVersionHistory('signal_weights');

    // Find the last non-rollback production version
    const previousVersion = versionHistory.find(v =>
      v.status === 'deprecated' &&
      !v.version.includes('-rollback-') &&
      v.promotedAt !== null
    );

    if (!previousVersion) {
      return { success: false, message: 'No previous version to rollback to' };
    }

    console.log(`Rolling back to version: ${previousVersion.version}`);

    const rolledBack = this.registry.rollback(
      'signal_weights',
      previousVersion.version,
      reason
    );

    // Update strategies with rolled-back weights
    if (rolledBack && previousVersion.artifacts?.weights) {
      await this._updateStrategies(previousVersion.artifacts.weights, this.config);
    }

    return {
      success: true,
      previousVersion: previousVersion.version,
      newVersion: rolledBack.version,
      message: `Rolled back from current to ${previousVersion.version}`
    };
  }

  /**
   * Get current production weights
   * @returns {Object|null} Current weights or null
   */
  getCurrentWeights() {
    const production = this.registry.getLatestProduction('signal_weights');
    if (!production) {
      return null;
    }
    return {
      version: production.version,
      weights: production.artifacts?.weights || {},
      promotedAt: production.promotedAt,
      metrics: {
        sharpe: production.testSharpe,
        alpha: production.alpha,
        wfe: production.walkForwardEfficiency
      }
    };
  }

  /**
   * Get status report
   * @returns {Object} Status report
   */
  getStatus() {
    const production = this.registry.getLatestProduction('signal_weights');
    const staged = this.registry.getStagedModels().filter(m => m.modelName === 'signal_weights');
    const history = this.registry.getVersionHistory('signal_weights');

    return {
      hasProduction: production !== null,
      currentVersion: production?.version || null,
      currentWeights: production?.artifacts?.weights || null,
      promotedAt: production?.promotedAt || null,
      stagedCount: staged.length,
      stagedVersions: staged.map(s => ({
        version: s.version,
        stagedAt: s.stagedAt,
        metrics: {
          wfe: s.walkForwardEfficiency,
          alpha: s.alpha,
          sharpe: s.testSharpe
        }
      })),
      totalVersions: history.length,
      lastUpdate: history[0]?.stagedAt || null
    };
  }

  /**
   * Manually promote a staged version
   * @param {string} version - Version to promote
   * @param {Object} options - Promotion options
   * @returns {Object} Promotion result
   */
  async manualPromote(version, options = {}) {
    const {
      force = false,
      promotedBy = 'manual',
      reason = 'Manual promotion'
    } = options;

    const model = this.registry.getModel('signal_weights', version);
    if (!model) {
      return { success: false, message: `Version ${version} not found` };
    }

    if (model.status === 'production') {
      return { success: false, message: `Version ${version} is already in production` };
    }

    // Validate unless force
    if (!force) {
      const validation = this.registry.validateModel('signal_weights', version, {
        minWFE: this.config.minWFE,
        maxDeflatedSharpeP: this.config.maxDeflatedSharpeP,
        minTestSharpe: this.config.minTestSharpe,
        maxDrawdown: this.config.maxDrawdown
      });

      if (!validation.valid) {
        return {
          success: false,
          message: 'Validation failed',
          errors: validation.errors,
          hint: 'Use force=true to override validation'
        };
      }
    }

    // Promote
    this.registry.promoteToProduction('signal_weights', version, {
      promotedBy,
      reason: force ? `${reason} (forced)` : reason
    });

    // Update strategies
    if (model.artifacts?.weights) {
      await this._updateStrategies(model.artifacts.weights, this.config);
    }

    return {
      success: true,
      version,
      message: `Promoted ${version} to production`
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Calculate rolling window dates
   */
  _calculateRollingWindow(years) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  /**
   * Generate version string
   */
  _generateVersion() {
    const now = new Date();
    const date = now.toISOString().split('T')[0].replace(/-/g, '');
    const time = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
    return `v${date}_${time}`;
  }

  /**
   * Update strategies with new weights
   */
  async _updateStrategies(weights, config) {
    const updated = [];

    // Get all active strategies that use optimized weights
    const strategies = this.strategyManager.getAllStrategies();

    for (const strategy of strategies) {
      // Check if strategy uses optimized weights
      if (strategy.feature_flags?.useOptimizedWeights !== false) {
        try {
          // Map optimization weights to strategy weights
          const mappedWeights = this._mapWeightsToStrategy(weights, strategy.signal_weights);

          this.strategyManager.updateStrategy(strategy.id, {
            signal_weights: mappedWeights
          });

          updated.push({
            id: strategy.id,
            name: strategy.name,
            previousWeights: strategy.signal_weights,
            newWeights: mappedWeights
          });
        } catch (error) {
          console.warn(`Failed to update strategy ${strategy.id}: ${error.message}`);
        }
      }
    }

    return updated;
  }

  /**
   * Map optimizer weights to strategy weights
   * The optimizer uses 6 signals, strategy uses 15
   */
  _mapWeightsToStrategy(optimizerWeights, currentStrategyWeights) {
    // Optimizer signals: technical, fundamental, sentiment, insider, valuation, factor
    // Strategy signals: technical, fundamental, sentiment, insider, congressional, valuation,
    //                   thirteenF, earningsMomentum, valueQuality, momentum, analyst,
    //                   alternative, contrarian, magicFormula, factorScores

    const mapped = { ...currentStrategyWeights };

    // Direct mappings
    if (optimizerWeights.technical !== undefined) {
      mapped.technical = optimizerWeights.technical;
    }
    if (optimizerWeights.fundamental !== undefined) {
      mapped.fundamental = optimizerWeights.fundamental;
    }
    if (optimizerWeights.sentiment !== undefined) {
      mapped.sentiment = optimizerWeights.sentiment;
    }
    if (optimizerWeights.insider !== undefined) {
      mapped.insider = optimizerWeights.insider;
    }
    if (optimizerWeights.valuation !== undefined) {
      mapped.valuation = optimizerWeights.valuation;
    }

    // Factor weight gets distributed to factor-related signals
    if (optimizerWeights.factor !== undefined) {
      const factorSignals = ['factorScores', 'momentum', 'valueQuality'];
      const factorShare = optimizerWeights.factor / factorSignals.length;
      factorSignals.forEach(signal => {
        if (mapped[signal] !== undefined) {
          mapped[signal] = factorShare;
        }
      });
    }

    // Normalize to sum to 1
    const total = Object.values(mapped).reduce((a, b) => a + (b || 0), 0);
    if (total > 0) {
      for (const key in mapped) {
        mapped[key] = (mapped[key] || 0) / total;
      }
    }

    return mapped;
  }

  /**
   * Calculate Sharpe ratio from daily returns
   */
  _calculateSharpe(returns) {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize (252 trading days)
    return (mean * 252) / (stdDev * Math.sqrt(252));
  }
}

module.exports = { WeightUpdateService };
