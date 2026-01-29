// src/services/agent/metaAllocator.js
// Meta-Allocator - AI-driven allocation across multiple strategies
// Used only in Multi-Strategy mode to dynamically allocate capital

const { StrategyConfigManager } = require('./strategyConfig');
const { ConfigurableStrategyAgent } = require('./configurableStrategyAgent');
const { EnhancedQuantSystem } = require('../quant/enhancedQuantSystem');

/**
 * MetaAllocator - Orchestrates capital allocation across multiple strategies
 *
 * Decision factors:
 * - Current market regime (favor defensive strategies in downturns)
 * - Recent strategy performance (momentum in strategy returns)
 * - Strategy correlation (reduce allocation to correlated strategies)
 * - Risk budget utilization (rebalance when strategies drift)
 */
class MetaAllocator {
  constructor(db, multiStrategyId) {
    this.db = db;
    this.multiStrategyId = multiStrategyId;

    this.configManager = new StrategyConfigManager(db);
    this.quantSystem = new EnhancedQuantSystem(db);

    // Load the multi-strategy config
    this.parentConfig = this.configManager.getStrategy(multiStrategyId);
    if (!this.parentConfig || this.parentConfig.mode !== 'multi') {
      throw new Error(`Strategy ${multiStrategyId} is not a multi-strategy`);
    }

    // Initialize child strategy agents
    this.childAgents = new Map();
    for (const alloc of this.parentConfig.allocations) {
      const agent = new ConfigurableStrategyAgent(db, alloc.child_strategy_id);
      this.childAgents.set(alloc.child_strategy_id, {
        agent,
        config: alloc,
        name: alloc.child_name
      });
    }

    this._prepareStatements();

    console.log(`🎯 MetaAllocator initialized: "${this.parentConfig.name}"`);
    console.log(`   Child strategies: ${this.childAgents.size}`);
  }

  _prepareStatements() {
    // Create decision history table if not exists (MUST happen BEFORE prepare statements)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta_allocation_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_strategy_id INTEGER NOT NULL,
        decision_date TEXT NOT NULL,
        market_regime TEXT,
        risk_level TEXT,
        allocations_json TEXT NOT NULL,
        reasoning TEXT,
        total_rebalance_pct REAL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (parent_strategy_id) REFERENCES strategy_configs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_meta_decisions_date
        ON meta_allocation_decisions(parent_strategy_id, decision_date);
    `);

    this.stmtGetStrategyPerformance = this.db.prepare(`
      SELECT * FROM strategy_performance
      WHERE strategy_id = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    this.stmtStoreAllocationDecision = this.db.prepare(`
      INSERT INTO meta_allocation_decisions (
        parent_strategy_id, decision_date, market_regime, risk_level,
        allocations_json, reasoning, total_rebalance_pct
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Calculate optimal allocations based on current conditions
   * @returns {Object} Allocation recommendations with reasoning
   */
  calculateOptimalAllocations() {
    const marketAssessment = this.quantSystem.getMarketAssessment();
    const regime = marketAssessment.economicRegime.regime;
    const riskLevel = marketAssessment.overallRisk;

    // Get strategy characteristics and recent performance
    const strategyAnalysis = this._analyzeStrategies();

    // Calculate regime-adjusted target allocations
    const allocations = this._calculateRegimeAdjustedAllocations(
      strategyAnalysis,
      regime,
      riskLevel
    );

    // Apply correlation adjustments
    const correlationAdjusted = this._applyCorrelationAdjustments(allocations, strategyAnalysis);

    // Enforce min/max constraints
    const constrained = this._enforceConstraints(correlationAdjusted);

    // Normalize to sum to 1
    const normalized = this._normalizeAllocations(constrained);

    // Generate reasoning
    const reasoning = this._generateReasoning(normalized, regime, riskLevel, strategyAnalysis);

    return {
      allocations: normalized,
      marketContext: {
        regime,
        riskLevel,
        exposureMultiplier: marketAssessment.exposureMultiplier
      },
      reasoning,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze each child strategy's characteristics and performance
   */
  _analyzeStrategies() {
    const analysis = {};

    for (const [strategyId, { agent, config, name }] of this.childAgents) {
      const agentConfig = agent.config;

      // Categorize strategy style
      const style = this._categorizeStrategy(agentConfig.weights);

      // Get recent performance
      const performance = this.stmtGetStrategyPerformance.all(strategyId, 30);
      const recentReturn = performance.length > 0
        ? performance.reduce((sum, p) => sum + (p.daily_return || 0), 0)
        : 0;
      const recentVol = this._calculateVolatility(performance.map(p => p.daily_return || 0));
      const recentSharpe = recentVol > 0 ? (recentReturn / recentVol) * Math.sqrt(252) : 0;

      analysis[strategyId] = {
        name,
        style,
        targetAllocation: config.target_allocation,
        minAllocation: config.min_allocation,
        maxAllocation: config.max_allocation,
        weights: agentConfig.weights,
        riskProfile: this._assessRiskProfile(agentConfig),
        performance: {
          recentReturn,
          recentVol,
          recentSharpe
        },
        regimeFit: {} // Populated below
      };
    }

    // Calculate regime fit scores
    for (const strategyId in analysis) {
      analysis[strategyId].regimeFit = this._calculateRegimeFit(analysis[strategyId]);
    }

    return analysis;
  }

  /**
   * Categorize strategy based on signal weights
   */
  _categorizeStrategy(weights) {
    const dominant = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k);

    if (weights.momentum > 0.25 || weights.technical > 0.3) {
      return 'momentum';
    }
    if (weights.value > 0.25 && weights.quality > 0.2) {
      return 'quality_value';
    }
    if (weights.value > 0.3) {
      return 'deep_value';
    }
    if (weights.quality > 0.3) {
      return 'quality';
    }
    if (weights.fundamental > 0.3) {
      return 'fundamental';
    }
    return 'balanced';
  }

  /**
   * Assess risk profile of a strategy
   */
  _assessRiskProfile(config) {
    let riskScore = 50; // Start neutral

    // Position concentration
    if (config.risk.maxPositionSize > 0.08) riskScore += 15;
    else if (config.risk.maxPositionSize < 0.04) riskScore -= 10;

    // Stop loss
    if (config.risk.stopLoss > 0.15) riskScore += 10;
    else if (config.risk.stopLoss < 0.08) riskScore -= 5;

    // Holding period (shorter = higher turnover = more risk)
    if (config.holdingPeriod.target < 14) riskScore += 15;
    else if (config.holdingPeriod.target > 90) riskScore -= 10;

    // Tail hedge
    if (config.risk.tailHedgeAllocation > 0.03) riskScore -= 15;

    // Regime overlay
    if (config.regime.enabled) riskScore -= 10;

    if (riskScore >= 65) return 'aggressive';
    if (riskScore >= 45) return 'moderate';
    return 'conservative';
  }

  /**
   * Calculate how well a strategy fits different regimes
   */
  _calculateRegimeFit(strategyAnalysis) {
    const { style, riskProfile } = strategyAnalysis;

    // Regime fit scores (0-1, higher = better fit)
    const fit = {
      GOLDILOCKS: 0.5,
      REFLATION: 0.5,
      STAGFLATION: 0.5,
      DEFLATION: 0.5
    };

    // Style-based adjustments
    switch (style) {
      case 'momentum':
        fit.GOLDILOCKS = 0.9;
        fit.REFLATION = 0.7;
        fit.STAGFLATION = 0.3;
        fit.DEFLATION = 0.4;
        break;
      case 'deep_value':
        fit.GOLDILOCKS = 0.6;
        fit.REFLATION = 0.7;
        fit.STAGFLATION = 0.6;
        fit.DEFLATION = 0.8;
        break;
      case 'quality':
      case 'quality_value':
        fit.GOLDILOCKS = 0.8;
        fit.REFLATION = 0.6;
        fit.STAGFLATION = 0.7;
        fit.DEFLATION = 0.9;
        break;
      case 'fundamental':
        fit.GOLDILOCKS = 0.7;
        fit.REFLATION = 0.7;
        fit.STAGFLATION = 0.5;
        fit.DEFLATION = 0.6;
        break;
    }

    // Risk profile adjustments
    if (riskProfile === 'conservative') {
      fit.STAGFLATION += 0.1;
      fit.DEFLATION += 0.1;
      fit.GOLDILOCKS -= 0.05;
    } else if (riskProfile === 'aggressive') {
      fit.GOLDILOCKS += 0.1;
      fit.REFLATION += 0.1;
      fit.STAGFLATION -= 0.15;
      fit.DEFLATION -= 0.1;
    }

    // Clamp values
    for (const r in fit) {
      fit[r] = Math.max(0.1, Math.min(1, fit[r]));
    }

    return fit;
  }

  /**
   * Calculate regime-adjusted allocations
   */
  _calculateRegimeAdjustedAllocations(strategyAnalysis, regime, riskLevel) {
    const allocations = {};

    // Get total regime fit for normalization
    let totalFit = 0;
    for (const strategyId in strategyAnalysis) {
      const fit = strategyAnalysis[strategyId].regimeFit[regime] || 0.5;
      totalFit += fit * strategyAnalysis[strategyId].targetAllocation;
    }

    for (const strategyId in strategyAnalysis) {
      const analysis = strategyAnalysis[strategyId];
      const regimeFit = analysis.regimeFit[regime] || 0.5;

      // Start from target allocation
      let allocation = analysis.targetAllocation;

      // Adjust by regime fit (±30% swing)
      const regimeAdjustment = (regimeFit - 0.5) * 0.6;
      allocation *= (1 + regimeAdjustment);

      // Risk level adjustments
      if (riskLevel === 'extreme' || riskLevel === 'high') {
        // Favor conservative strategies
        if (analysis.riskProfile === 'aggressive') {
          allocation *= 0.6;
        } else if (analysis.riskProfile === 'conservative') {
          allocation *= 1.3;
        }
      }

      // Performance momentum (subtle tilt toward recent performers)
      if (analysis.performance.recentSharpe > 1) {
        allocation *= 1.1;
      } else if (analysis.performance.recentSharpe < -0.5) {
        allocation *= 0.9;
      }

      allocations[strategyId] = {
        strategyId: parseInt(strategyId),
        name: analysis.name,
        allocation,
        regimeFit,
        riskProfile: analysis.riskProfile
      };
    }

    return allocations;
  }

  /**
   * Apply correlation-based adjustments
   */
  _applyCorrelationAdjustments(allocations, strategyAnalysis) {
    // Group strategies by style to identify correlation clusters
    const styleGroups = {};
    for (const strategyId in allocations) {
      const style = strategyAnalysis[strategyId].style;
      if (!styleGroups[style]) styleGroups[style] = [];
      styleGroups[style].push(strategyId);
    }

    // Penalize over-allocation to correlated strategies
    for (const style in styleGroups) {
      const group = styleGroups[style];
      if (group.length > 1) {
        const totalAllocation = group.reduce((sum, id) => sum + allocations[id].allocation, 0);
        if (totalAllocation > 0.5) {
          // Scale down correlated strategies
          const scale = 0.5 / totalAllocation;
          for (const id of group) {
            allocations[id].allocation *= (0.7 + scale * 0.3);
            allocations[id].correlationPenalty = true;
          }
        }
      }
    }

    return allocations;
  }

  /**
   * Enforce min/max allocation constraints
   */
  _enforceConstraints(allocations) {
    for (const strategyId in allocations) {
      const analysis = this.childAgents.get(parseInt(strategyId)).config;
      const minAlloc = analysis.min_allocation || 0;
      const maxAlloc = analysis.max_allocation || 1;

      allocations[strategyId].allocation = Math.max(
        minAlloc,
        Math.min(maxAlloc, allocations[strategyId].allocation)
      );
    }
    return allocations;
  }

  /**
   * Normalize allocations to sum to 1
   */
  _normalizeAllocations(allocations) {
    const total = Object.values(allocations).reduce((sum, a) => sum + a.allocation, 0);

    if (total === 0) {
      // Equal weight fallback
      const count = Object.keys(allocations).length;
      for (const id in allocations) {
        allocations[id].allocation = 1 / count;
      }
    } else {
      for (const id in allocations) {
        allocations[id].allocation /= total;
      }
    }

    return allocations;
  }

  /**
   * Generate human-readable reasoning for allocation decisions
   */
  _generateReasoning(allocations, regime, riskLevel, strategyAnalysis) {
    const reasons = [];

    reasons.push(`Market Regime: ${regime}`);
    reasons.push(`Risk Level: ${riskLevel.toUpperCase()}`);
    reasons.push('');

    // Sort by allocation
    const sorted = Object.values(allocations).sort((a, b) => b.allocation - a.allocation);

    for (const alloc of sorted) {
      const pct = (alloc.allocation * 100).toFixed(1);
      const analysis = strategyAnalysis[alloc.strategyId];

      let reason = `${alloc.name}: ${pct}%`;
      reason += ` [${analysis.style}, ${alloc.riskProfile}]`;
      reason += ` - Regime fit: ${(alloc.regimeFit * 100).toFixed(0)}%`;

      if (alloc.correlationPenalty) {
        reason += ' (correlation penalty applied)';
      }

      reasons.push(reason);
    }

    // Add summary
    reasons.push('');
    const conservativeAlloc = sorted
      .filter(a => a.riskProfile === 'conservative')
      .reduce((sum, a) => sum + a.allocation, 0);

    if (conservativeAlloc > 0.5) {
      reasons.push('Defensive positioning due to elevated risk.');
    } else if (conservativeAlloc < 0.3) {
      reasons.push('Risk-on positioning in favorable conditions.');
    } else {
      reasons.push('Balanced positioning across strategies.');
    }

    return reasons.join('\n');
  }

  /**
   * Execute rebalance based on current vs target allocations
   * @param {number} portfolioValue - Total portfolio value
   * @param {Object} currentAllocations - Current allocations by strategy ID
   * @returns {Object} Rebalance instructions
   */
  calculateRebalance(portfolioValue, currentAllocations = {}) {
    const optimal = this.calculateOptimalAllocations();
    const instructions = [];
    let totalRebalancePct = 0;

    for (const strategyId in optimal.allocations) {
      const target = optimal.allocations[strategyId].allocation;
      const current = currentAllocations[strategyId] || 0;
      const diff = target - current;

      if (Math.abs(diff) > 0.02) { // Only rebalance if drift > 2%
        instructions.push({
          strategyId: parseInt(strategyId),
          name: optimal.allocations[strategyId].name,
          currentAllocation: current,
          targetAllocation: target,
          change: diff,
          action: diff > 0 ? 'increase' : 'decrease',
          valueChange: diff * portfolioValue
        });
        totalRebalancePct += Math.abs(diff);
      }
    }

    // Store decision
    const date = new Date().toISOString().split('T')[0];
    try {
      this.stmtStoreAllocationDecision.run(
        this.multiStrategyId,
        date,
        optimal.marketContext.regime,
        optimal.marketContext.riskLevel,
        JSON.stringify(optimal.allocations),
        optimal.reasoning,
        totalRebalancePct
      );
    } catch (e) {
      // Ignore duplicate date
    }

    return {
      needsRebalance: instructions.length > 0,
      instructions,
      totalRebalancePct,
      optimal,
      portfolioValue
    };
  }

  /**
   * Get signals from all child strategies, weighted by allocation
   * @param {Map} currentPositions - Current portfolio positions
   * @returns {Array} Combined signals with allocation weights
   */
  getWeightedSignals(currentPositions = new Map()) {
    const optimal = this.calculateOptimalAllocations();
    const allSignals = [];

    for (const [strategyId, { agent }] of this.childAgents) {
      const allocation = optimal.allocations[strategyId]?.allocation || 0;
      if (allocation < 0.05) continue; // Skip strategies with <5% allocation

      const universe = agent.getUniverse();

      for (const stock of universe) {
        const signal = agent.generateSignal(stock, currentPositions);
        if (signal) {
          allSignals.push({
            ...signal,
            strategyId,
            strategyName: agent.config.name,
            strategyAllocation: allocation,
            weightedScore: signal.score * allocation
          });
        }
      }
    }

    // Aggregate signals by symbol
    const aggregated = new Map();
    for (const signal of allSignals) {
      if (!aggregated.has(signal.symbol)) {
        aggregated.set(signal.symbol, {
          symbol: signal.symbol,
          companyId: signal.companyId,
          sector: signal.sector,
          price: signal.price,
          totalWeightedScore: 0,
          totalWeight: 0,
          strategies: [],
          confidence: 0
        });
      }

      const agg = aggregated.get(signal.symbol);
      agg.totalWeightedScore += signal.weightedScore;
      agg.totalWeight += signal.strategyAllocation;
      agg.confidence = Math.max(agg.confidence, signal.confidence * signal.strategyAllocation);
      agg.strategies.push({
        name: signal.strategyName,
        score: signal.score,
        allocation: signal.strategyAllocation
      });
    }

    // Calculate final scores and actions
    const finalSignals = [];
    for (const [symbol, agg] of aggregated) {
      const score = agg.totalWeight > 0 ? agg.totalWeightedScore / agg.totalWeight : 0;

      let action = 'hold';
      if (score > 0.25) action = 'strong_buy';
      else if (score > 0.1) action = 'buy';
      else if (score < -0.25) action = 'strong_sell';
      else if (score < -0.1) action = 'sell';

      if (action !== 'hold') {
        finalSignals.push({
          symbol,
          companyId: agg.companyId,
          sector: agg.sector,
          price: agg.price,
          action,
          score,
          confidence: agg.confidence,
          strategies: agg.strategies,
          hasPosition: currentPositions.has(symbol)
        });
      }
    }

    // Sort by absolute score
    finalSignals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    return finalSignals;
  }

  _calculateVolatility(returns) {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Get summary of meta-allocator state
   */
  getSummary() {
    const optimal = this.calculateOptimalAllocations();

    // Get ML model binding info from the parent strategy
    const featureFlags = this.parentConfig?.feature_flags ?
      (typeof this.parentConfig.feature_flags === 'string' ? JSON.parse(this.parentConfig.feature_flags) : this.parentConfig.feature_flags) : {};

    return {
      parentStrategy: this.parentConfig.name,
      mode: 'multi',
      childStrategies: Array.from(this.childAgents.entries()).map(([id, { agent, name }]) => ({
        id,
        name,
        currentAllocation: optimal.allocations[id]?.allocation || 0
      })),
      marketContext: optimal.marketContext,
      reasoning: optimal.reasoning,
      // ML Model binding fields
      useMLCombiner: featureFlags.useMLCombiner || false,
      mlModelVersion: this.parentConfig?.ml_model_version || null,
      mlModelLocked: this.parentConfig?.ml_model_locked === 1,
      mlModelUpdatedAt: this.parentConfig?.ml_model_updated_at || null
    };
  }
}

module.exports = { MetaAllocator };
