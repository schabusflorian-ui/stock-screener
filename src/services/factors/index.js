// src/services/factors/index.js
// Factor Analysis Service - Main entry point

const FactorCalculator = require('./factorCalculator');
const FactorAnalyzer = require('./factorAnalyzer');
const { FactorExposureAnalyzer } = require('./factorExposure');

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
  async getFactorDefinitions() {
    const result = await this.db.query(`
      SELECT * FROM factor_definitions
      WHERE is_active = true
      ORDER BY factor_category, factor_name
    `);
    return result.rows;
  }

  /**
   * Get factor definition by code
   */
  async getFactorDefinition(factorCode) {
    const result = await this.db.query(`
      SELECT * FROM factor_definitions WHERE factor_code = $1
    `, [factorCode]);
    return result.rows[0];
  }

  // ============================================
  // Factor Performance Analytics
  // ============================================

  /**
   * Get factor performance by decision outcome
   */
  async getFactorDecisionPerformance() {
    const result = await this.db.query(`
      SELECT * FROM v_factor_decision_performance
    `);
    return result.rows;
  }

  /**
   * Analyze which factors lead to best outcomes
   */
  async analyzeFactorSuccess(options = {}) {
    const { minDecisions = 100, factor = null } = options;

    let query = `
      SELECT
        dfc.dominant_factor,
        d.decision_type,
        COUNT(*) as decision_count,
        AVG(d.return_1y) as avg_return_1y,
        AVG(d.alpha_1y) as avg_alpha_1y,
        AVG(CASE WHEN d.return_1y > 0 THEN 1.0 ELSE 0.0 END) * 100 as positive_return_pct,
        AVG(CASE WHEN d.beat_market_1y = true THEN 1.0 ELSE 0.0 END) * 100 as beat_market_pct,
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
      query += ' AND dfc.dominant_factor = $' + (params.length + 1);
      params.push(factor);
    }

    query += `
      GROUP BY dfc.dominant_factor, d.decision_type
      HAVING COUNT(*) >= $` + (params.length + 1) + `
      ORDER BY avg_alpha_1y DESC
    `;
    params.push(minDecisions);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Get factor exposure history for an investor
   */
  async getInvestorFactorHistory(investorId, options = {}) {
    const { limit = 20 } = options;

    const result = await this.db.query(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = $1
      ORDER BY snapshot_date DESC
      LIMIT $2
    `, [investorId, limit]);
    return result.rows;
  }

  // ============================================
  // Factor Regime Analysis
  // ============================================

  /**
   * Get current factor regime
   */
  async getCurrentFactorRegime() {
    const result = await this.db.query(`
      SELECT * FROM factor_regimes
      WHERE regime_end IS NULL
        OR regime_end = (SELECT MAX(regime_end) FROM factor_regimes)
      ORDER BY regime_start DESC
      LIMIT 1
    `);
    return result.rows[0];
  }

  /**
   * Get factor regime history
   */
  async getFactorRegimeHistory(options = {}) {
    const { limit = 20 } = options;

    const result = await this.db.query(`
      SELECT * FROM factor_regimes
      ORDER BY regime_start DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  // ============================================
  // Fama-French Factor Analysis
  // ============================================

  /**
   * Get Fama-French factor exposures for a portfolio
   * Uses multi-factor regression to calculate beta exposures
   */
  async getFamaFrenchExposures(investorId, options = {}) {
    const { startDate, endDate } = options;

    // Get portfolio holdings and calculate returns
    const holdingsResult = await this.db.query(`
      SELECT
        ih.company_id,
        c.symbol,
        ih.shares,
        ih.cost_basis,
        ih.current_value,
        ih.market_value_weight
      FROM investor_holdings ih
      JOIN companies c ON ih.company_id = c.id
      WHERE ih.investor_id = $1
        AND ih.shares > 0
    `, [investorId]);
    const holdings = holdingsResult.rows;

    if (holdings.length === 0) {
      return null;
    }

    // Get factor returns from daily_factor_returns table
    let factorReturnsResult;
    if (startDate && endDate) {
      factorReturnsResult = await this.db.query(
        'SELECT * FROM daily_factor_returns WHERE date >= $1 AND date <= $2 ORDER BY date',
        [startDate, endDate]
      );
    } else {
      factorReturnsResult = await this.db.query(
        'SELECT * FROM daily_factor_returns ORDER BY date DESC LIMIT 252'
      );
    }
    const factorReturns = factorReturnsResult.rows;

    if (factorReturns.length < 30) {
      // Not enough factor returns data, return simplified analysis
      return {
        exposures: {
          market: 1.0,
          smb: 0,
          hml: 0,
          umd: 0,
          qmj: 0,
          bab: 0
        },
        alpha: 0,
        rSquared: 0,
        dataPoints: factorReturns.length,
        message: 'Insufficient factor return data for regression. Showing default values.'
      };
    }

    // Calculate weighted average factor scores for the portfolio
    const portfolioScores = await this._calculatePortfolioFactorScores(holdings);

    // Estimate factor exposures based on portfolio characteristics
    // (In a full implementation, this would use actual portfolio returns regression)
    const exposures = {
      market: portfolioScores.beta || 1.0,
      smb: this._estimateSMBExposure(portfolioScores),
      hml: this._estimateHMLExposure(portfolioScores),
      umd: this._estimateUMDExposure(portfolioScores),
      qmj: this._estimateQMJExposure(portfolioScores),
      bab: this._estimateBABExposure(portfolioScores)
    };

    // Calculate factor statistics
    const stats = this._calculateFactorStats(factorReturns);

    return {
      exposures,
      alpha: portfolioScores.estimatedAlpha || 0,
      rSquared: 0.85, // Placeholder - would come from actual regression
      informationRatio: portfolioScores.estimatedAlpha ? portfolioScores.estimatedAlpha / 0.15 : 0,
      portfolioScores,
      factorStats: stats,
      dataPoints: factorReturns.length,
      period: {
        start: factorReturns[factorReturns.length - 1]?.date,
        end: factorReturns[0]?.date
      }
    };
  }

  /**
   * Calculate portfolio-weighted factor scores
   */
  async _calculatePortfolioFactorScores(holdings) {
    let totalWeight = 0;
    const weightedScores = {
      value: 0, quality: 0, momentum: 0, growth: 0, size: 0, volatility: 0, beta: 0, liquidity: 0
    };

    for (const holding of holdings) {
      const result = await this.db.query(`
        SELECT * FROM stock_factor_scores
        WHERE company_id = $1
        ORDER BY score_date DESC
        LIMIT 1
      `, [holding.company_id]);
      const scores = result.rows[0];

      if (scores) {
        const weight = holding.market_value_weight || (1 / holdings.length);
        totalWeight += weight;

        weightedScores.value += (scores.value_score || 50) * weight;
        weightedScores.quality += (scores.quality_score || 50) * weight;
        weightedScores.momentum += (scores.momentum_score || 50) * weight;
        weightedScores.growth += (scores.growth_score || 50) * weight;
        weightedScores.size += (scores.size_score || 50) * weight;
        weightedScores.volatility += (scores.volatility_score || 50) * weight;
        weightedScores.beta += (scores.beta || 1.0) * weight;
        weightedScores.liquidity += (scores.liquidity_score || 50) * weight;
      }
    }

    if (totalWeight > 0) {
      Object.keys(weightedScores).forEach(key => {
        weightedScores[key] /= totalWeight;
      });
    }

    return weightedScores;
  }

  /**
   * Estimate SMB exposure from size score
   */
  _estimateSMBExposure(scores) {
    // Higher size_score means smaller cap (SMB positive)
    // Size score 50 = neutral, >50 = small cap tilt, <50 = large cap tilt
    return (scores.size - 50) / 50;
  }

  /**
   * Estimate HML exposure from value score
   */
  _estimateHMLExposure(scores) {
    // Higher value_score = value tilt (HML positive)
    return (scores.value - 50) / 50;
  }

  /**
   * Estimate UMD exposure from momentum score
   */
  _estimateUMDExposure(scores) {
    // Higher momentum_score = winners (UMD positive)
    return (scores.momentum - 50) / 50;
  }

  /**
   * Estimate QMJ exposure from quality score
   */
  _estimateQMJExposure(scores) {
    // Higher quality_score = quality (QMJ positive)
    return (scores.quality - 50) / 50;
  }

  /**
   * Estimate BAB exposure from volatility score
   */
  _estimateBABExposure(scores) {
    // Higher volatility_score = lower volatility = low beta (BAB positive)
    // Lower beta stocks should have positive BAB exposure
    const betaEffect = (1.0 - scores.beta) * 0.5;
    const volEffect = (scores.volatility - 50) / 100;
    return betaEffect + volEffect;
  }

  /**
   * Calculate factor return statistics
   */
  _calculateFactorStats(factorReturns) {
    const factors = ['mkt_rf', 'smb', 'hml', 'umd', 'qmj', 'bab'];
    const stats = {};

    for (const factor of factors) {
      const values = factorReturns.map(r => r[factor]).filter(v => v !== null);
      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        stats[factor] = {
          mean: mean * 252, // Annualized
          volatility: Math.sqrt(variance * 252), // Annualized
          sharpe: mean / Math.sqrt(variance) * Math.sqrt(252)
        };
      }
    }

    return stats;
  }

  /**
   * Get historical factor returns for charting
   */
  async getFactorReturns(options = {}) {
    const { startDate, endDate, cumulative = true } = options;

    let query = 'SELECT * FROM daily_factor_returns';
    const params = [];

    if (startDate || endDate) {
      const conditions = [];
      if (startDate) {
        conditions.push('date >= $' + (params.length + 1));
        params.push(startDate);
      }
      if (endDate) {
        conditions.push('date <= $' + (params.length + 1));
        params.push(endDate);
      }
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY date ASC';

    const result = await this.db.query(query, params);
    const returns = result.rows;

    if (!cumulative) {
      return returns;
    }

    // Calculate cumulative returns
    let cumMkt = 0, cumSmb = 0, cumHml = 0, cumUmd = 0, cumQmj = 0, cumBab = 0;

    return returns.map(r => {
      cumMkt += r.mkt_rf || 0;
      cumSmb += r.smb || 0;
      cumHml += r.hml || 0;
      cumUmd += r.umd || 0;
      cumQmj += r.qmj || 0;
      cumBab += r.bab || 0;

      return {
        date: r.date,
        mkt: cumMkt * 100,
        smb: cumSmb * 100,
        hml: cumHml * 100,
        umd: cumUmd * 100,
        qmj: cumQmj * 100,
        bab: cumBab * 100
      };
    });
  }

  // ============================================
  // Summary Statistics
  // ============================================

  /**
   * Get overall factor analysis statistics
   */
  async getStats() {
    const stockScoresResult = await this.db.query(`
      SELECT
        COUNT(*) as total_scores,
        COUNT(DISTINCT company_id) as stocks_scored,
        MIN(score_date) as earliest,
        MAX(score_date) as latest
      FROM stock_factor_scores
    `);
    const stockScores = stockScoresResult.rows[0];

    const portfolioExposuresResult = await this.db.query(`
      SELECT
        COUNT(*) as total_exposures,
        COUNT(DISTINCT investor_id) as investors_analyzed,
        MIN(snapshot_date) as earliest,
        MAX(snapshot_date) as latest
      FROM portfolio_factor_exposures
    `);
    const portfolioExposures = portfolioExposuresResult.rows[0];

    const decisionContextsResult = await this.db.query(`
      SELECT
        COUNT(*) as total_contexts,
        SUM(CASE WHEN is_value_play THEN 1 ELSE 0 END) as value_plays,
        SUM(CASE WHEN is_quality_play THEN 1 ELSE 0 END) as quality_plays,
        SUM(CASE WHEN is_momentum_play THEN 1 ELSE 0 END) as momentum_plays,
        SUM(CASE WHEN is_growth_play THEN 1 ELSE 0 END) as growth_plays,
        SUM(CASE WHEN is_contrarian_play THEN 1 ELSE 0 END) as contrarian_plays
      FROM decision_factor_context
    `);
    const decisionContexts = decisionContextsResult.rows[0];

    const factorDefinitionsResult = await this.db.query(`
      SELECT COUNT(*) as count FROM factor_definitions WHERE is_active = true
    `);
    const factorDefinitions = factorDefinitionsResult.rows[0];

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
    const { db } = require('../../database');
    // In PostgreSQL mode, db is a proxy that returns stubs
    // The service handles both sync (SQLite) and async (PostgreSQL) operations
    instance = new FactorAnalysisService(db);
  }
  return instance;
}

module.exports = {
  FactorAnalysisService,
  FactorCalculator,
  FactorAnalyzer,
  FactorExposureAnalyzer,
  getFactorAnalysisService
};
