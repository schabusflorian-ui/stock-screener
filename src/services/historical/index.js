// src/services/historical/index.js
// Historical Intelligence Service - Main entry point
// Provides intelligent analysis based on historical investor decisions and patterns

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');
const DecisionEnricher = require('./decisionEnricher');
const OutcomeCalculator = require('./outcomeCalculator');
const PatternMatcher = require('./patternMatcher');
const PrecedentFinder = require('./precedentFinder');
const ContextBuilder = require('./contextBuilder');

/**
 * Historical Intelligence Service
 *
 * Provides historically-informed analysis by:
 * 1. Converting holdings data to structured investment decisions
 * 2. Enriching decisions with context (stock metrics, market conditions)
 * 3. Calculating outcomes for historical decisions
 * 4. Matching decisions to investment patterns
 * 5. Finding similar historical precedents for current situations
 * 6. Building rich context for AI analyst prompts
 */
class HistoricalIntelligenceService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.decisionEnricher = new DecisionEnricher();
    this.outcomeCalculator = new OutcomeCalculator();
    this.patternMatcher = new PatternMatcher();
    this.precedentFinder = new PrecedentFinder();
    this.contextBuilder = new ContextBuilder();
  }

  // ============================================
  // Decision Management
  // ============================================

  /**
   * Convert existing investor holdings to structured decisions
   * This is the initial backfill operation
   */
  async backfillDecisions(investorId = null, options = {}) {
    return this.decisionEnricher.backfillFromHoldings(investorId, options);
  }

  /**
   * Enrich a decision with stock and market context
   */
  async enrichDecision(decisionId) {
    return this.decisionEnricher.enrichDecision(decisionId);
  }

  /**
   * Enrich all decisions that lack context
   */
  async enrichAllDecisions(options = {}) {
    return this.decisionEnricher.enrichAllDecisions(options);
  }

  /**
   * Enrich decisions with factor context (link to factor scores)
   */
  async enrichWithFactorContext(options = {}) {
    return this.decisionEnricher.enrichWithFactorContext(options);
  }

  // ============================================
  // Outcome Calculation
  // ============================================

  /**
   * Calculate outcomes for a specific decision
   */
  async calculateOutcome(decisionId) {
    return this.outcomeCalculator.calculateOutcome(decisionId);
  }

  /**
   * Calculate outcomes for all decisions that need updating
   */
  async calculateAllOutcomes(options = {}) {
    return this.outcomeCalculator.calculateAllOutcomes(options);
  }

  /**
   * Update outcomes for decisions that may have new data
   */
  async refreshOutcomes(options = {}) {
    return this.outcomeCalculator.refreshOutcomes(options);
  }

  // ============================================
  // Pattern Matching
  // ============================================

  /**
   * Match a decision to investment patterns
   */
  async matchPatterns(decisionId) {
    return this.patternMatcher.matchDecision(decisionId);
  }

  /**
   * Match all decisions to patterns
   */
  async matchAllPatterns(options = {}) {
    return this.patternMatcher.matchAllDecisions(options);
  }

  /**
   * Get pattern performance statistics
   */
  async getPatternPerformance(patternCode) {
    return this.patternMatcher.getPatternPerformance(patternCode);
  }

  /**
   * Get all patterns with performance data
   */
  async getAllPatterns() {
    return this.patternMatcher.getAllPatterns();
  }

  // ============================================
  // Precedent Finding
  // ============================================

  /**
   * Find similar historical situations for a current stock
   */
  async findPrecedents(symbol, options = {}) {
    return this.precedentFinder.findPrecedents(symbol, options);
  }

  /**
   * Find what famous investors did in similar situations
   */
  async findSimilarDecisions(symbol, options = {}) {
    return this.precedentFinder.findSimilarDecisions(symbol, options);
  }

  /**
   * Get historical situations for a specific sector/valuation combo
   */
  async getSectorPrecedents(sector, valuationTier, options = {}) {
    return this.precedentFinder.getSectorPrecedents(sector, valuationTier, options);
  }

  // ============================================
  // Context Building (for AI Analysts)
  // ============================================

  /**
   * Build complete historical context for AI analyst
   * This is the main integration point with the AI analyst system
   */
  async buildAnalysisContext(symbol, analystType = 'value') {
    return this.contextBuilder.buildContext(symbol, analystType);
  }

  /**
   * Format context for prompt injection
   */
  formatContextForPrompt(context) {
    return this.contextBuilder.formatForPrompt(context);
  }

  // ============================================
  // Investor Analytics
  // ============================================

  /**
   * Get investor track record
   */
  async getInvestorTrackRecord(investorId, periodType = 'all_time') {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM investor_track_records
      WHERE investor_id = $1 AND period_type = $2
    `, [investorId, periodType]);
    const record = result.rows[0];

    if (record && record.sector_allocations) {
      record.sector_allocations = JSON.parse(record.sector_allocations);
    }
    if (record && record.sector_success_rates) {
      record.sector_success_rates = JSON.parse(record.sector_success_rates);
    }
    if (record && record.pattern_usage) {
      record.pattern_usage = JSON.parse(record.pattern_usage);
    }
    if (record && record.pattern_success) {
      record.pattern_success = JSON.parse(record.pattern_success);
    }

    return record;
  }

  /**
   * Calculate and store investor track record
   */
  async calculateInvestorTrackRecord(investorId, periodType = 'all_time') {
    return this.outcomeCalculator.calculateInvestorTrackRecord(investorId, periodType);
  }

  /**
   * Get investor's decisions with outcomes
   */
  async getInvestorDecisions(investorId, options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 100, outcomeCategory = null, patternCode = null } = options;

    let query = `
      SELECT
        d.*,
        ip.pattern_name,
        ip.pattern_category
      FROM investment_decisions d
      LEFT JOIN investment_patterns ip ON d.primary_pattern_id = ip.id
      WHERE d.investor_id = $1
    `;

    const params = [investorId];
    let paramIndex = 2;

    if (outcomeCategory) {
      query += ` AND d.outcome_category = $${paramIndex}`;
      params.push(outcomeCategory);
      paramIndex++;
    }

    if (patternCode) {
      query += ` AND ip.pattern_code = $${paramIndex}`;
      params.push(patternCode);
      paramIndex++;
    }

    query += ` ORDER BY d.decision_date DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Get investor's sector performance
   */
  async getInvestorSectorPerformance(investorId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM v_investor_sector_performance
      WHERE investor_id = $1
      ORDER BY decision_count DESC
    `, [investorId]);
    return result.rows;
  }

  // ============================================
  // Market Context
  // ============================================

  /**
   * Get or create market context snapshot for a date
   */
  async getMarketContext(date) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM market_context_snapshots
      WHERE snapshot_date = $1
    `, [date]);
    let context = result.rows[0];

    if (!context) {
      // Try to calculate from available data
      context = await this.decisionEnricher.calculateMarketContext(date);
    }

    return context;
  }

  /**
   * Get current market cycle classification
   */
  async getCurrentMarketCycle() {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM market_context_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 1
    `);
    const latest = result.rows[0];

    return latest ? {
      date: latest.snapshot_date,
      cycle: latest.market_cycle,
      confidence: latest.cycle_confidence,
      sp500_pe: latest.sp500_pe,
      vix: latest.vix
    } : null;
  }

  // ============================================
  // Summary Statistics
  // ============================================

  /**
   * Get overall system statistics
   */
  async getStats() {
    const database = await getDatabaseAsync();

    const decisionsResult = await database.query(`
      SELECT
        COUNT(*) as total_decisions,
        COUNT(CASE WHEN return_1y IS NOT NULL THEN 1 END) as decisions_with_outcomes,
        COUNT(CASE WHEN primary_pattern_id IS NOT NULL THEN 1 END) as decisions_with_patterns,
        AVG(return_1y) as avg_return_1y,
        AVG(alpha_1y) as avg_alpha_1y,
        SUM(CASE WHEN beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 /
          COUNT(CASE WHEN beat_market_1y IS NOT NULL THEN 1 END) as win_rate
      FROM investment_decisions
    `);
    const decisions = decisionsResult.rows[0];

    const patternsResult = await database.query(`
      SELECT COUNT(*) as total_patterns FROM investment_patterns WHERE is_active = 1
    `);
    const patterns = patternsResult.rows[0];

    const precedentsResult = await database.query(`
      SELECT COUNT(*) as total_precedents FROM historical_precedents
    `);
    const precedents = precedentsResult.rows[0];

    const marketContextsResult = await database.query(`
      SELECT
        COUNT(*) as total_snapshots,
        MIN(snapshot_date) as earliest,
        MAX(snapshot_date) as latest
      FROM market_context_snapshots
    `);
    const marketContexts = marketContextsResult.rows[0];

    const investorStatsResult = await database.query(`
      SELECT
        COUNT(DISTINCT investor_id) as investors_tracked,
        COUNT(*) as total_decisions
      FROM investment_decisions
    `);
    const investorStats = investorStatsResult.rows[0];

    return {
      decisions: {
        total: decisions.total_decisions,
        withOutcomes: decisions.decisions_with_outcomes,
        withPatterns: decisions.decisions_with_patterns,
        avgReturn1Y: decisions.avg_return_1y,
        avgAlpha1Y: decisions.avg_alpha_1y,
        winRate: decisions.win_rate
      },
      patterns: {
        total: patterns.total_patterns
      },
      precedents: {
        total: precedents.total_precedents
      },
      marketContext: {
        totalSnapshots: marketContexts.total_snapshots,
        earliest: marketContexts.earliest,
        latest: marketContexts.latest
      },
      investors: {
        tracked: investorStats.investors_tracked,
        totalDecisions: investorStats.total_decisions
      }
    };
  }
}

// Singleton instance
let instance = null;

function getHistoricalIntelligence() {
  if (!instance) {
    instance = new HistoricalIntelligenceService();
  }
  return instance;
}

module.exports = {
  HistoricalIntelligenceService,
  getHistoricalIntelligence
};
