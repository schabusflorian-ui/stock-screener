// src/services/factors/index.js
// Factor Analysis Service - Main entry point

const FactorCalculator = require('./factorCalculator');
const FactorAnalyzer = require('./factorAnalyzer');

/**
 * Factor Analysis Service
 *
 * Provides comprehensive factor analysis including:
 * 1. Stock-level factor score calculation
 * 2. Portfolio factor exposure analysis
 * 3. Investor factor style profiling
 * 4. Factor attribution for returns
 * 5. Decision factor context enrichment
 */
class FactorAnalysisService {
  constructor(db) {
    this.db = db;
    this.calculator = new FactorCalculator(db);
    this.analyzer = new FactorAnalyzer(db);
  }

  // ============================================
  // Stock Factor Scores
  // ============================================

  /**
   * Calculate factor scores for all stocks at a date
   */
  async calculateFactorScores(scoreDate, options = {}) {
    return this.calculator.calculateAllFactorScores(scoreDate, options);
  }

  /**
   * Calculate historical factor scores
   */
  async calculateHistoricalFactorScores(options = {}) {
    return this.calculator.calculateHistoricalFactorScores(options);
  }

  /**
   * Get factor scores for a stock
   */
  getStockFactorScores(symbol, scoreDate = null) {
    return this.calculator.getFactorScores(symbol, scoreDate);
  }

  /**
   * Get factor score history for a stock
   */
  getStockFactorHistory(symbol, options = {}) {
    return this.calculator.getFactorScoreHistory(symbol, options);
  }

  /**
   * Get top stocks by factor
   */
  getTopByFactor(factor, scoreDate, options = {}) {
    return this.calculator.getTopByFactor(factor, scoreDate, options);
  }

  // ============================================
  // Portfolio Factor Analysis
  // ============================================

  /**
   * Calculate portfolio factor exposures for an investor
   */
  async calculatePortfolioExposures(investorId, snapshotDate, options = {}) {
    return this.analyzer.calculatePortfolioExposures(investorId, snapshotDate, options);
  }

  /**
   * Get investor factor profile
   */
  getInvestorFactorProfile(investorId) {
    return this.analyzer.getInvestorFactorProfile(investorId);
  }

  /**
   * Compare factor exposures between investors
   */
  compareInvestorFactors(investorIds, snapshotDate = null) {
    return this.analyzer.compareInvestorFactors(investorIds, snapshotDate);
  }

  /**
   * Calculate factor attribution for returns
   */
  async calculateFactorAttribution(investorId, periodStart, periodEnd, options = {}) {
    return this.analyzer.calculateFactorAttribution(investorId, periodStart, periodEnd, options);
  }

  // ============================================
  // Decision Factor Context
  // ============================================

  /**
   * Enrich a decision with factor context
   */
  async enrichDecisionWithFactors(decisionId) {
    return this.analyzer.enrichDecisionWithFactors(decisionId);
  }

  /**
   * Batch enrich decisions with factor context
   */
  async enrichAllDecisionsWithFactors(options = {}) {
    return this.analyzer.enrichAllDecisionsWithFactors(options);
  }

  // ============================================
  // Factor Definitions
  // ============================================

  /**
   * Get all factor definitions
   */
  getFactorDefinitions() {
    return this.db.prepare(`
      SELECT * FROM factor_definitions
      WHERE is_active = 1
      ORDER BY factor_category, factor_name
    `).all();
  }

  /**
   * Get factor definition by code
   */
  getFactorDefinition(factorCode) {
    return this.db.prepare(`
      SELECT * FROM factor_definitions WHERE factor_code = ?
    `).get(factorCode);
  }

  // ============================================
  // Factor Performance Analytics
  // ============================================

  /**
   * Get factor performance by decision outcome
   */
  getFactorDecisionPerformance() {
    return this.db.prepare(`
      SELECT * FROM v_factor_decision_performance
    `).all();
  }

  /**
   * Analyze which factors lead to best outcomes
   */
  analyzeFactorSuccess(options = {}) {
    const { minDecisions = 100, factor = null } = options;

    let query = `
      SELECT
        dfc.dominant_factor,
        d.decision_type,
        COUNT(*) as decision_count,
        AVG(d.return_1y) as avg_return_1y,
        AVG(d.alpha_1y) as avg_alpha_1y,
        AVG(CASE WHEN d.return_1y > 0 THEN 1.0 ELSE 0.0 END) * 100 as positive_return_pct,
        AVG(CASE WHEN d.beat_market_1y = 1 THEN 1.0 ELSE 0.0 END) * 100 as beat_market_pct,
        AVG(dfc.value_percentile) as avg_value_pct,
        AVG(dfc.quality_percentile) as avg_quality_pct,
        AVG(dfc.momentum_percentile) as avg_momentum_pct,
        AVG(dfc.growth_percentile) as avg_growth_pct
      FROM decision_factor_context dfc
      JOIN investment_decisions d ON dfc.decision_id = d.id
      WHERE d.return_1y IS NOT NULL
    `;

    const params = [];
    if (factor) {
      query += ` AND dfc.dominant_factor = ?`;
      params.push(factor);
    }

    query += `
      GROUP BY dfc.dominant_factor, d.decision_type
      HAVING COUNT(*) >= ?
      ORDER BY avg_alpha_1y DESC
    `;
    params.push(minDecisions);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get factor exposure history for an investor
   */
  getInvestorFactorHistory(investorId, options = {}) {
    const { limit = 20 } = options;

    return this.db.prepare(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = ?
      ORDER BY snapshot_date DESC
      LIMIT ?
    `).all(investorId, limit);
  }

  // ============================================
  // Factor Regime Analysis
  // ============================================

  /**
   * Get current factor regime
   */
  getCurrentFactorRegime() {
    return this.db.prepare(`
      SELECT * FROM factor_regimes
      WHERE regime_end IS NULL
        OR regime_end = (SELECT MAX(regime_end) FROM factor_regimes)
      ORDER BY regime_start DESC
      LIMIT 1
    `).get();
  }

  /**
   * Get factor regime history
   */
  getFactorRegimeHistory(options = {}) {
    const { limit = 20 } = options;

    return this.db.prepare(`
      SELECT * FROM factor_regimes
      ORDER BY regime_start DESC
      LIMIT ?
    `).all(limit);
  }

  // ============================================
  // Summary Statistics
  // ============================================

  /**
   * Get overall factor analysis statistics
   */
  getStats() {
    const stockScores = this.db.prepare(`
      SELECT
        COUNT(*) as total_scores,
        COUNT(DISTINCT company_id) as stocks_scored,
        MIN(score_date) as earliest,
        MAX(score_date) as latest
      FROM stock_factor_scores
    `).get();

    const portfolioExposures = this.db.prepare(`
      SELECT
        COUNT(*) as total_exposures,
        COUNT(DISTINCT investor_id) as investors_analyzed,
        MIN(snapshot_date) as earliest,
        MAX(snapshot_date) as latest
      FROM portfolio_factor_exposures
    `).get();

    const decisionContexts = this.db.prepare(`
      SELECT
        COUNT(*) as total_contexts,
        SUM(is_value_play) as value_plays,
        SUM(is_quality_play) as quality_plays,
        SUM(is_momentum_play) as momentum_plays,
        SUM(is_growth_play) as growth_plays,
        SUM(is_contrarian_play) as contrarian_plays
      FROM decision_factor_context
    `).get();

    const factorDefinitions = this.db.prepare(`
      SELECT COUNT(*) as count FROM factor_definitions WHERE is_active = 1
    `).get();

    return {
      stockScores,
      portfolioExposures,
      decisionContexts,
      factorDefinitions: factorDefinitions.count
    };
  }
}

// Singleton instance
let instance = null;

function getFactorAnalysisService() {
  if (!instance) {
    const db = require('../../database').db;
    instance = new FactorAnalysisService(db);
  }
  return instance;
}

module.exports = {
  FactorAnalysisService,
  FactorCalculator,
  FactorAnalyzer,
  getFactorAnalysisService
};
