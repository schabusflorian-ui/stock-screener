// src/services/strategy/multiStrategyOrchestrator.js
// Multi-Strategy Orchestrator - Regime-Switching Logic
// Manages multiple child strategies and allocates based on market regime

const { RegimeDetector, REGIMES } = require('../trading/regimeDetector');
const { RegimeHMMService } = require('../ml/regimeHMM');
const { UnifiedStrategyEngine } = require('./unifiedStrategyEngine');
const { StrategyManager } = require('./strategyManager');

/**
 * Regime triggers that can be configured for child strategies
 * Format: { regimes: ['CRISIS', 'HIGH_VOL'], action: 'activate' }
 * Or:     { regimes: ['BULL', 'NORMAL'], action: 'deactivate' }
 * Or:     { regimes: ['BULL'], action: 'scale', factor: 1.5 }
 */
const TRIGGER_ACTIONS = {
  ACTIVATE: 'activate',     // Enable strategy when regime matches
  DEACTIVATE: 'deactivate', // Disable strategy when regime matches
  SCALE: 'scale',           // Scale allocation when regime matches
  DEFAULT: 'default'        // Use base allocation
};

/**
 * Regime severity levels (for automatic defensive scaling)
 */
const REGIME_SEVERITY = {
  LOW_VOL: 0,
  BULL: 1,
  NORMAL: 2,
  SIDEWAYS: 3,
  BEAR: 4,
  HIGH_VOL: 5,
  CRISIS: 6
};

/**
 * MultiStrategyOrchestrator
 *
 * Manages a parent multi-strategy that contains child strategies.
 * Each child strategy can have regime triggers that control when it's active.
 *
 * Use cases:
 * - Defensive/aggressive strategy switching based on volatility
 * - Sector rotation based on market regime
 * - Factor tilt adjustments in different market conditions
 */
class MultiStrategyOrchestrator {
  /**
   * @param {Object} db Database instance
   * @param {number} parentStrategyId Parent multi-strategy ID
   * @param {Object} options Configuration options
   */
  constructor(db, parentStrategyId, options = {}) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this.parentStrategyId = parentStrategyId;
    this.options = {
      useHMM: options.useHMM !== false,
      cacheRegimeTTL: options.cacheRegimeTTL || 15 * 60 * 1000, // 15 min
      minAllocationThreshold: options.minAllocationThreshold || 0.01, // 1%
      ...options
    };

    // Initialize services
    this.regimeDetector = new RegimeDetector(db);
    this.regimeHMM = this.options.useHMM ? new RegimeHMMService(this.db) : null;
    this.strategyManager = new StrategyManager(db);

    // Load parent strategy and children
    this.parentStrategy = null;
    this.childStrategies = [];
    this.childEngines = new Map(); // strategyId -> UnifiedStrategyEngine

    // Cache
    this.regimeCache = null;
    this.regimeCacheTime = 0;
    this.allocationCache = null;
    this.allocationCacheTime = 0;

    // Simulation date support
    this.simulationDate = null;

    this._loadStrategies();
  }

  /**
   * Load parent and child strategies from database
   */
  _loadStrategies() {
    this.parentStrategy = this.strategyManager.getStrategy(this.parentStrategyId);

    if (!this.parentStrategy) {
      throw new Error(`Parent strategy ${this.parentStrategyId} not found`);
    }

    if (this.parentStrategy.strategy_type !== 'multi' &&
        this.parentStrategy.strategy_type !== 'regime_switching') {
      throw new Error(`Strategy ${this.parentStrategyId} is not a multi-strategy (type: ${this.parentStrategy.strategy_type})`);
    }

    // Load child strategies
    this.childStrategies = this.strategyManager.getChildStrategies(this.parentStrategyId);

    if (this.childStrategies.length < 2) {
      throw new Error('Multi-strategy requires at least 2 child strategies');
    }

    // Create engines for each child
    for (const child of this.childStrategies) {
      const engine = new UnifiedStrategyEngine(this.db, {
        useHMM: this.options.useHMM,
        useMLCombiner: child.feature_flags?.useMLCombiner || false
      });
      this.childEngines.set(child.id, engine);
    }

    console.log(`🎭 MultiStrategyOrchestrator loaded: ${this.parentStrategy.name} with ${this.childStrategies.length} child strategies`);
  }

  /**
   * Set simulation date for backtesting
   * @param {Date|string} date Simulation date
   */
  setSimulationDate(date) {
    this.simulationDate = date;

    // Clear cache when date changes
    this.regimeCache = null;
    this.allocationCache = null;

    // Propagate to child engines
    for (const engine of this.childEngines.values()) {
      engine.setSimulationDate(date);
    }
  }

  /**
   * Detect current market regime
   * Uses HMM if trained, falls back to VIX-based detection
   * @returns {Object} Regime information
   */
  async detectRegime() {
    // Check cache
    const now = Date.now();
    if (this.regimeCache && (now - this.regimeCacheTime) < this.options.cacheRegimeTTL) {
      return this.regimeCache;
    }

    let regime;

    // Try HMM first if enabled
    if (this.regimeHMM) {
      try {
        // Load model if needed
        if (!this.regimeHMM.model.trained) {
          this.regimeHMM.loadModel();
        }

        if (this.regimeHMM.model.trained) {
          regime = this.regimeHMM.getCurrentRegime();
          regime.source = 'hmm';
        }
      } catch (error) {
        console.warn('HMM regime detection failed, falling back to VIX-based:', error.message);
      }
    }

    // Fall back to VIX-based detection
    if (!regime || regime.regime === 'UNKNOWN') {
      regime = await this.regimeDetector.detectRegime();
      regime.source = 'vix_based';
    }

    // Cache the result
    this.regimeCache = regime;
    this.regimeCacheTime = now;

    return regime;
  }

  /**
   * Get current allocations for all child strategies
   * Based on regime triggers and market conditions
   * @returns {Array} Array of allocation objects
   */
  async getCurrentAllocations() {
    // Check cache
    const now = Date.now();
    if (this.allocationCache && (now - this.allocationCacheTime) < this.options.cacheRegimeTTL) {
      return this.allocationCache;
    }

    const regime = await this.detectRegime();
    const allocations = [];

    for (const child of this.childStrategies) {
      const allocation = this._calculateChildAllocation(child, regime);
      allocations.push(allocation);
    }

    // Normalize allocations to sum to 1 (or less if some strategies are deactivated)
    const totalActive = allocations.reduce((sum, a) => sum + (a.isActive ? a.allocation : 0), 0);

    if (totalActive > 0 && totalActive !== 1) {
      // Normalize to 100%
      for (const allocation of allocations) {
        if (allocation.isActive) {
          allocation.allocation = allocation.allocation / totalActive;
          allocation.normalized = true;
        }
      }
    }

    // Cache the result
    this.allocationCache = {
      regime: regime.regime,
      regimeConfidence: regime.confidence,
      regimeSource: regime.source,
      allocations,
      timestamp: new Date().toISOString()
    };
    this.allocationCacheTime = now;

    return this.allocationCache;
  }

  /**
   * Calculate allocation for a child strategy based on regime
   * @param {Object} child Child strategy
   * @param {Object} regime Current regime
   * @returns {Object} Allocation info
   */
  _calculateChildAllocation(child, regime) {
    const baseAllocation = child.target_allocation || 0;
    const trigger = child.regime_trigger;
    const currentRegime = regime.regime;

    let allocation = baseAllocation;
    let isActive = true;
    let reason = 'base_allocation';
    let triggerMatched = false;

    // Process regime trigger if defined
    if (trigger && trigger.regimes && Array.isArray(trigger.regimes)) {
      const regimeMatch = trigger.regimes.includes(currentRegime);

      switch (trigger.action) {
        case TRIGGER_ACTIONS.ACTIVATE:
          if (regimeMatch) {
            isActive = true;
            reason = `activated_by_${currentRegime}`;
            triggerMatched = true;
          } else {
            isActive = false;
            allocation = 0;
            reason = 'deactivated_regime_mismatch';
          }
          break;

        case TRIGGER_ACTIONS.DEACTIVATE:
          if (regimeMatch) {
            isActive = false;
            allocation = 0;
            reason = `deactivated_by_${currentRegime}`;
            triggerMatched = true;
          } else {
            isActive = true;
            reason = 'active_no_trigger';
          }
          break;

        case TRIGGER_ACTIONS.SCALE:
          if (regimeMatch && trigger.factor) {
            allocation = Math.min(1, baseAllocation * trigger.factor);
            reason = `scaled_${trigger.factor}x_by_${currentRegime}`;
            triggerMatched = true;
          }
          break;

        default:
          // Default: always active with base allocation
          reason = 'default_allocation';
      }
    }

    // Apply parent strategy's regime config (exposure adjustments)
    if (isActive && this.parentStrategy.regime_config) {
      const regimeConfig = this.parentStrategy.regime_config;
      let exposureMultiplier = 1;

      switch (currentRegime) {
        case REGIMES.CRISIS:
          if (regimeConfig.pauseInCrisis) {
            // Reduce all allocations significantly in crisis
            exposureMultiplier = regimeConfig.exposureCrisis || 0.25;
          }
          break;
        case REGIMES.HIGH_VOL:
          exposureMultiplier = regimeConfig.exposureHighRisk || 0.5;
          break;
        case 'ELEVATED': // Alias for compatibility
          exposureMultiplier = regimeConfig.exposureElevated || 0.75;
          break;
        case REGIMES.BEAR:
          exposureMultiplier = regimeConfig.exposureBear || 0.5;
          break;
        case REGIMES.SIDEWAYS:
          exposureMultiplier = regimeConfig.exposureSideways || 0.85;
          break;
        case REGIMES.BULL:
          exposureMultiplier = regimeConfig.exposureNormal || 1.0;
          break;
        default:
          exposureMultiplier = regimeConfig.exposureNormal || 1.0;
      }

      if (exposureMultiplier !== 1) {
        allocation = allocation * exposureMultiplier;
        reason += `_exposure_${exposureMultiplier}x`;
      }
    }

    // Apply min/max bounds if defined
    if (child.min_allocation !== null && allocation < child.min_allocation && isActive) {
      allocation = child.min_allocation;
      reason += '_bounded_min';
    }
    if (child.max_allocation !== null && allocation > child.max_allocation) {
      allocation = child.max_allocation;
      reason += '_bounded_max';
    }

    // Round to 4 decimal places
    allocation = Math.round(allocation * 10000) / 10000;

    // Deactivate if below threshold
    if (allocation < this.options.minAllocationThreshold) {
      isActive = false;
      allocation = 0;
      reason += '_below_threshold';
    }

    return {
      strategyId: child.id,
      strategyName: child.name,
      baseAllocation,
      allocation,
      isActive,
      reason,
      triggerMatched,
      regime: currentRegime
    };
  }

  /**
   * Generate signals for all active strategies combined
   * @param {string|number} companyIdOrSymbol Company ID or symbol
   * @param {Object} portfolioContext Portfolio context
   * @returns {Object} Combined signal
   */
  async generateCombinedSignal(companyIdOrSymbol, portfolioContext = {}) {
    const allocations = await this.getCurrentAllocations();
    const activeStrategies = allocations.allocations.filter(a => a.isActive);

    if (activeStrategies.length === 0) {
      return {
        symbol: companyIdOrSymbol,
        action: 'HOLD',
        confidence: 0,
        reason: 'No active strategies in current regime',
        regime: allocations.regime
      };
    }

    // Generate signal from each active strategy
    const signals = [];

    for (const strategyAlloc of activeStrategies) {
      const engine = this.childEngines.get(strategyAlloc.strategyId);
      const strategy = this.childStrategies.find(s => s.id === strategyAlloc.strategyId);

      if (!engine || !strategy) continue;

      try {
        const signal = await engine.generateSignal(companyIdOrSymbol, strategy, portfolioContext);
        signals.push({
          ...signal,
          weight: strategyAlloc.allocation,
          strategyId: strategyAlloc.strategyId,
          strategyName: strategyAlloc.strategyName
        });
      } catch (error) {
        console.error(`Error generating signal for strategy ${strategyAlloc.strategyName}:`, error.message);
      }
    }

    if (signals.length === 0) {
      return {
        symbol: companyIdOrSymbol,
        action: 'HOLD',
        confidence: 0,
        reason: 'All strategies failed to generate signals',
        regime: allocations.regime
      };
    }

    // Combine signals using weighted average
    return this._combineSignals(signals, allocations);
  }

  /**
   * Combine signals from multiple strategies
   * @param {Array} signals Array of weighted signals
   * @param {Object} allocationInfo Allocation context
   * @returns {Object} Combined signal
   */
  _combineSignals(signals, allocationInfo) {
    // Calculate weighted score
    let weightedScore = 0;
    let weightedConfidence = 0;
    let totalWeight = 0;
    const contributions = [];

    for (const signal of signals) {
      const weight = signal.weight;
      const score = this._actionToScore(signal.action);

      weightedScore += score * weight;
      weightedConfidence += (signal.confidence || 0.5) * weight;
      totalWeight += weight;

      contributions.push({
        strategyId: signal.strategyId,
        strategyName: signal.strategyName,
        action: signal.action,
        score: signal.score,
        confidence: signal.confidence,
        weight,
        contribution: score * weight
      });
    }

    if (totalWeight > 0) {
      weightedScore /= totalWeight;
      weightedConfidence /= totalWeight;
    }

    // Determine combined action
    let action;
    if (weightedScore > 0.3) {
      action = weightedScore > 0.6 ? 'STRONG_BUY' : 'BUY';
    } else if (weightedScore < -0.3) {
      action = weightedScore < -0.6 ? 'STRONG_SELL' : 'SELL';
    } else {
      action = 'HOLD';
    }

    return {
      symbol: signals[0]?.symbol,
      action,
      score: weightedScore,
      confidence: weightedConfidence,
      regime: allocationInfo.regime,
      regimeConfidence: allocationInfo.regimeConfidence,
      contributions,
      activeStrategies: signals.length,
      totalStrategies: this.childStrategies.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Convert action to numeric score for averaging
   */
  _actionToScore(action) {
    switch (action) {
      case 'STRONG_BUY': return 1.0;
      case 'BUY': return 0.5;
      case 'HOLD': return 0.0;
      case 'SELL': return -0.5;
      case 'STRONG_SELL': return -1.0;
      default: return 0.0;
    }
  }

  /**
   * Generate signals for entire universe
   * @param {Array} universe Array of symbols or company IDs
   * @param {Object} portfolioContext Portfolio context
   * @returns {Array} Array of combined signals
   */
  async generateSignalsForUniverse(universe, portfolioContext = {}) {
    const results = [];

    for (const companyIdOrSymbol of universe) {
      try {
        const signal = await this.generateCombinedSignal(companyIdOrSymbol, portfolioContext);
        results.push(signal);
      } catch (error) {
        console.error(`Error generating signal for ${companyIdOrSymbol}:`, error.message);
        results.push({
          symbol: companyIdOrSymbol,
          action: 'HOLD',
          confidence: 0,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get strategy summary for display
   * @returns {Object} Summary of orchestrator state
   */
  async getSummary() {
    const allocations = await this.getCurrentAllocations();

    return {
      parentStrategy: {
        id: this.parentStrategy.id,
        name: this.parentStrategy.name,
        type: this.parentStrategy.strategy_type,
        regimeConfig: this.parentStrategy.regime_config
      },
      childStrategies: this.childStrategies.map(child => ({
        id: child.id,
        name: child.name,
        baseAllocation: child.target_allocation,
        regimeTrigger: child.regime_trigger
      })),
      currentRegime: {
        regime: allocations.regime,
        confidence: allocations.regimeConfidence,
        source: allocations.regimeSource
      },
      currentAllocations: allocations.allocations,
      hmmEnabled: this.options.useHMM,
      hmmTrained: this.regimeHMM?.model?.trained || false,
      timestamp: allocations.timestamp
    };
  }

  /**
   * Train the HMM model for regime detection
   * @param {number} lookbackDays Days of history to use
   * @returns {Object} Training results
   */
  async trainHMM(lookbackDays = 500) {
    if (!this.regimeHMM) {
      throw new Error('HMM not enabled for this orchestrator');
    }

    const result = this.regimeHMM.train(lookbackDays);

    // Clear cache after training
    this.regimeCache = null;
    this.allocationCache = null;

    return result;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.regimeCache = null;
    this.regimeCacheTime = 0;
    this.allocationCache = null;
    this.allocationCacheTime = 0;
    this.regimeDetector.clearCache();
  }

  /**
   * Reload strategies from database
   * Useful after strategy updates
   */
  reload() {
    this.clearCache();
    this._loadStrategies();
  }
}

/**
 * Factory function to create an orchestrator for a strategy
 * @param {Object} db Database instance
 * @param {number} strategyId Strategy ID
 * @param {Object} options Options
 * @returns {MultiStrategyOrchestrator|null} Orchestrator or null if not multi-strategy
 */
function createOrchestratorIfMulti(db, strategyId, options = {}) {
  const manager = new StrategyManager(db);
  const strategy = manager.getStrategy(strategyId);

  if (!strategy) {
    return null;
  }

  if (strategy.strategy_type === 'multi' || strategy.strategy_type === 'regime_switching') {
    return new MultiStrategyOrchestrator(db, strategyId, options);
  }

  return null;
}

module.exports = {
  MultiStrategyOrchestrator,
  createOrchestratorIfMulti,
  TRIGGER_ACTIONS,
  REGIME_SEVERITY
};
