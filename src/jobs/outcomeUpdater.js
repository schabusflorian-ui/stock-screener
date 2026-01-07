// src/jobs/outcomeUpdater.js
// Daily job to update recommendation outcomes and recalculate signal performance
// Enhanced with HF-style backtesting integration (IC Analysis, Alpha Validation, Capacity)

const cron = require('node-cron');
const db = require('../database');
const { RecommendationTracker } = require('../services/agent/recommendationTracker');

// Import new backtesting modules for enhanced feedback loop
let icAnalysis = null;
let alphaValidation = null;
let capacityAnalysis = null;

// Lazy load backtesting modules (they may not be available in all environments)
function loadBacktestingModules() {
  try {
    if (!icAnalysis) {
      icAnalysis = require('../services/backtesting/icAnalysis');
    }
    if (!alphaValidation) {
      alphaValidation = require('../services/backtesting/alphaValidation');
    }
    if (!capacityAnalysis) {
      capacityAnalysis = require('../services/backtesting/capacityAnalysis');
    }
    return true;
  } catch (error) {
    console.warn('⚠️ Backtesting modules not available:', error.message);
    return false;
  }
}

class OutcomeUpdater {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
    this.tracker = null;
    this.backtestingEnabled = loadBacktestingModules();
  }

  /**
   * Initialize tracker with database
   */
  getTracker() {
    if (!this.tracker) {
      this.tracker = new RecommendationTracker(db.getDatabase());
    }
    return this.tracker;
  }

  /**
   * Schedule daily outcome updates at 8:00 PM ET (after market close and prices updated)
   */
  start() {
    // Cron format: second minute hour day month day-of-week
    // 0 20 * * 1-5 = 8:00 PM, Monday through Friday
    cron.schedule('0 20 * * 1-5', async () => {
      console.log('📊 Running scheduled outcome update...');
      await this.updateOutcomes();
    }, {
      timezone: 'America/New_York'
    });

    console.log('📊 Outcome Updater scheduled: 8:00 PM ET, weekdays');
  }

  /**
   * Manually trigger outcome update
   */
  async updateOutcomes() {
    if (this.isRunning) {
      console.log('⚠️ Outcome update already in progress');
      return {
        success: false,
        error: 'Update already in progress'
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results = {
      outcomesUpdated: 0,
      errors: 0,
      icAnalysis: null,
      alphaValidation: null,
      capacityUpdate: null,
    };

    try {
      const tracker = this.getTracker();
      console.log('📊 Updating recommendation outcomes...');

      // Update all pending outcomes
      const outcomeResult = tracker.updateAllOutcomes();
      results.outcomesUpdated = outcomeResult.updated;
      results.errors = outcomeResult.errors;
      console.log(`  Updated ${outcomeResult.updated} outcomes (${outcomeResult.errors} errors)`);

      // Recalculate signal performance metrics
      console.log('📈 Recalculating signal performance...');
      tracker.recalculateSignalPerformance();

      // Update optimized weights (original method)
      console.log('⚖️ Updating optimized signal weights...');
      this.updateOptimizedWeights();

      // NEW: Enhanced backtesting-based analysis (if available)
      if (this.backtestingEnabled) {
        console.log('🔬 Running enhanced backtesting analysis...');

        // 1. Update IC decay curves for all signal types
        results.icAnalysis = await this.updateICAnalysis();

        // 2. Run alpha validation for active portfolios
        results.alphaValidation = await this.updateAlphaValidation();

        // 3. Update capacity constraints based on liquidity analysis
        results.capacityUpdate = await this.updateCapacityConstraints();
      }

      const elapsedMs = Date.now() - startTime;

      this.lastRun = new Date().toISOString();
      this.lastResult = {
        success: true,
        outcomesUpdated: results.outcomesUpdated,
        errors: results.errors,
        backtestingEnhanced: this.backtestingEnabled,
        icAnalysis: results.icAnalysis,
        alphaValidation: results.alphaValidation,
        capacityUpdate: results.capacityUpdate,
        executionTimeMs: elapsedMs
      };

      console.log(`✅ Outcome update complete in ${elapsedMs}ms`);

      return this.lastResult;
    } catch (error) {
      console.error('❌ Outcome update failed:', error.message);

      this.lastResult = {
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      };

      return this.lastResult;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Update IC decay analysis for all signal types
   * Uses the new HF-style IC Analysis module
   */
  async updateICAnalysis() {
    if (!icAnalysis) return null;

    const signalTypes = ['technical', 'sentiment', 'insider', 'fundamental',
                         'alternative', 'valuation', 'filing_13f', 'earnings'];
    const results = {};
    const horizons = [1, 5, 10, 21, 63]; // Standard IC horizons

    console.log('  📉 Calculating IC decay curves...');

    for (const signalType of signalTypes) {
      try {
        const analysis = await icAnalysis.analyzeICDecay({
          signalType,
          startDate: this._getDateNDaysAgo(180), // 6 months lookback
          endDate: new Date().toISOString().split('T')[0],
          horizons,
          regime: 'ALL'
        });

        results[signalType] = {
          optimalHorizon: analysis.optimalHorizon,
          optimalIC: analysis.optimalIC,
          decayRate: analysis.decayRate,
          significant: analysis.horizons?.some(h => h.significant) || false
        };

        console.log(`    ${signalType}: IC=${(analysis.optimalIC || 0).toFixed(3)} @ ${analysis.optimalHorizon}d horizon`);
      } catch (error) {
        console.warn(`    ${signalType}: Failed - ${error.message}`);
        results[signalType] = { error: error.message };
      }
    }

    // Store summary in database
    this._storeICAnalysisSummary(results);

    return {
      signalTypes: signalTypes.length,
      analyzed: Object.keys(results).filter(k => !results[k].error).length,
      results
    };
  }

  /**
   * Run alpha validation for portfolios with sufficient history
   */
  async updateAlphaValidation() {
    if (!alphaValidation) return null;

    console.log('  📊 Running alpha validation...');

    const database = db.getDatabase();

    // Find portfolios with at least 60 days of snapshots
    const portfolios = database.prepare(`
      SELECT portfolio_id, COUNT(*) as days
      FROM portfolio_snapshots
      GROUP BY portfolio_id
      HAVING days >= 60
    `).all();

    const results = {};
    let validated = 0;

    for (const p of portfolios) {
      try {
        const validation = await alphaValidation.runAlphaValidation({
          portfolioId: p.portfolio_id,
          benchmark: 'SPY',
          nBootstrap: 1000, // Reduced for daily job speed
          nTrials: 1
        });

        results[p.portfolio_id] = {
          alpha: validation.alphaAnalysis?.alpha?.annualized,
          alphaSignificant: validation.alphaAnalysis?.alpha?.significant,
          sharpe: validation.sharpeAnalysis?.observed,
          deflatedSharpe: validation.sharpeAnalysis?.deflated?.deflatedSharpe,
          grade: validation.overallAssessment?.grade
        };

        validated++;
        console.log(`    Portfolio ${p.portfolio_id}: Grade ${validation.overallAssessment?.grade || 'N/A'}, Alpha ${((validation.alphaAnalysis?.alpha?.annualized || 0) * 100).toFixed(1)}%`);
      } catch (error) {
        console.warn(`    Portfolio ${p.portfolio_id}: Validation failed - ${error.message}`);
        results[p.portfolio_id] = { error: error.message };
      }
    }

    return {
      portfoliosChecked: portfolios.length,
      validated,
      results
    };
  }

  /**
   * Update capacity constraints based on liquidity analysis
   */
  async updateCapacityConstraints() {
    if (!capacityAnalysis) return null;

    console.log('  💧 Updating capacity constraints...');

    const database = db.getDatabase();

    // Get portfolios with positions
    const portfolios = database.prepare(`
      SELECT DISTINCT portfolio_id FROM portfolio_positions
    `).all();

    const results = {};

    for (const p of portfolios) {
      try {
        const capacity = capacityAnalysis.analyzeCapacity(database, p.portfolio_id);

        results[p.portfolio_id] = {
          currentAUM: capacity.currentAUM,
          estimatedCapacity: capacity.estimatedCapacity,
          scalabilityRatio: capacity.scalabilityRatio,
          liquidityScore: capacity.liquidityMetrics?.overallScore,
          constraints: capacity.constraints?.length || 0
        };

        // Store capacity constraints for use by TradingAgent/RiskManager
        this._storeCapacityConstraints(p.portfolio_id, capacity);

        console.log(`    Portfolio ${p.portfolio_id}: Capacity ${(capacity.scalabilityRatio || 1).toFixed(1)}x, Liquidity ${capacity.liquidityMetrics?.overallScore || 'N/A'}/100`);
      } catch (error) {
        console.warn(`    Portfolio ${p.portfolio_id}: Capacity analysis failed - ${error.message}`);
        results[p.portfolio_id] = { error: error.message };
      }
    }

    return {
      portfoliosAnalyzed: portfolios.length,
      results
    };
  }

  /**
   * Store IC analysis summary for signal optimizer
   */
  _storeICAnalysisSummary(results) {
    const database = db.getDatabase();

    try {
      const upsertStmt = database.prepare(`
        INSERT OR REPLACE INTO signal_ic_summary
        (signal_type, optimal_horizon, optimal_ic, decay_rate, is_significant, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const [signalType, data] of Object.entries(results)) {
        if (!data.error) {
          upsertStmt.run(
            signalType,
            data.optimalHorizon || 21,
            data.optimalIC || 0,
            data.decayRate || 0,
            data.significant ? 1 : 0
          );
        }
      }
    } catch (error) {
      // Table may not exist yet
      console.warn('  Could not store IC summary:', error.message);
    }
  }

  /**
   * Store capacity constraints for RiskManager
   */
  _storeCapacityConstraints(portfolioId, capacity) {
    const database = db.getDatabase();

    try {
      database.prepare(`
        INSERT OR REPLACE INTO portfolio_capacity_constraints
        (portfolio_id, estimated_capacity, scalability_ratio, liquidity_score,
         illiquid_positions, constraints_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        portfolioId,
        capacity.estimatedCapacity || 0,
        capacity.scalabilityRatio || 1,
        capacity.liquidityMetrics?.overallScore || 0,
        capacity.constraints?.filter(c => c.type === 'illiquid').length || 0,
        JSON.stringify(capacity.constraints || [])
      );
    } catch (error) {
      // Table may not exist yet
      console.warn('  Could not store capacity constraints:', error.message);
    }
  }

  /**
   * Helper: Get date N days ago in YYYY-MM-DD format
   */
  _getDateNDaysAgo(n) {
    const date = new Date();
    date.setDate(date.getDate() - n);
    return date.toISOString().split('T')[0];
  }

  /**
   * Update optimized weights in database
   */
  updateOptimizedWeights() {
    const tracker = this.getTracker();
    const database = db.getDatabase();
    const regimes = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'];

    const updateStmt = database.prepare(`
      UPDATE optimized_signal_weights
      SET technical_weight = ?,
          sentiment_weight = ?,
          insider_weight = ?,
          fundamental_weight = ?,
          alternative_weight = ?,
          valuation_weight = ?,
          filing_13f_weight = ?,
          earnings_weight = ?,
          lookback_days = ?,
          avg_ic = ?,
          calculated_at = datetime('now'),
          valid_until = datetime('now', '+1 day')
      WHERE regime = ?
    `);

    for (const regime of regimes) {
      try {
        // Calculate optimal weights for this regime
        const { weights, ics } = tracker.getOptimalWeights(90);

        // Calculate average IC across signals
        const icValues = Object.values(ics)
          .map(i => i.ic)
          .filter(ic => ic !== null && !isNaN(ic));
        const avgIC = icValues.length > 0
          ? icValues.reduce((a, b) => a + b, 0) / icValues.length
          : null;

        updateStmt.run(
          weights.technical || 0.12,
          weights.sentiment || 0.12,
          weights.insider || 0.12,
          weights.fundamental || 0.15,
          weights.alternative || 0.12,
          weights.valuation || 0.12,
          weights.filing_13f || 0.13,
          weights.earnings || 0.12,
          90,
          avgIC,
          regime
        );

        console.log(`  Updated weights for ${regime} regime (avg IC: ${avgIC?.toFixed(3) || 'N/A'})`);
      } catch (error) {
        console.error(`  Failed to update weights for ${regime}:`, error.message);
      }
    }
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      schedule: {
        time: '8:00 PM ET',
        days: 'Monday - Friday',
        timezone: 'America/New_York'
      }
    };
  }

  /**
   * Get current signal weights
   */
  getSignalWeights(regime = 'ALL') {
    const database = db.getDatabase();

    const weights = database.prepare(`
      SELECT *
      FROM optimized_signal_weights
      WHERE regime = ?
    `).get(regime);

    if (!weights) {
      // Return defaults
      return {
        regime,
        weights: {
          technical: 0.12,
          sentiment: 0.12,
          insider: 0.12,
          fundamental: 0.15,
          alternative: 0.12,
          valuation: 0.12,
          filing_13f: 0.13,
          earnings: 0.12
        },
        isDefault: true
      };
    }

    return {
      regime,
      weights: {
        technical: weights.technical_weight,
        sentiment: weights.sentiment_weight,
        insider: weights.insider_weight,
        fundamental: weights.fundamental_weight,
        alternative: weights.alternative_weight,
        valuation: weights.valuation_weight,
        filing_13f: weights.filing_13f_weight,
        earnings: weights.earnings_weight
      },
      avgIC: weights.avg_ic,
      calculatedAt: weights.calculated_at,
      validUntil: weights.valid_until,
      isDefault: false
    };
  }
}

// Create singleton instance
const outcomeUpdater = new OutcomeUpdater();

// Export both the class and the instance
module.exports = {
  OutcomeUpdater,
  outcomeUpdater
};

// If run directly, execute update
if (require.main === module) {
  console.log('🚀 Running Outcome Updater manually...');
  outcomeUpdater.updateOutcomes().then(result => {
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}
