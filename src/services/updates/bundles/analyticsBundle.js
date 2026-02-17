// src/services/updates/bundles/analyticsBundle.js
/**
 * Analytics Update Bundle
 *
 * Handles factor analysis, outcome calculation, and investor analytics jobs:
 * - analytics.factors - Calculate factor scores for all stocks
 * - analytics.factor_context - Link decisions to factor scores at time of decision
 * - analytics.outcomes - Calculate decision outcomes (returns, alpha)
 * - analytics.investor_styles - Re-classify investor styles based on decisions
 * - analytics.track_records - Update investor track records
 * - analytics.pattern_matching - Match decisions to investment patterns
 * - analytics.market_indicators - Update Buffett Indicator, S&P P/E, MSI (FRED + stock-based)
 */

const { getDatabaseAsync } = require('../../../lib/db');

class AnalyticsBundle {
  constructor() {
    this.factorService = null;
    this.historicalService = null;
  }

  getFactorService() {
    if (!this.factorService) {
      const { getFactorAnalysisService } = require('../../factors');
      this.factorService = getFactorAnalysisService();
    }
    return this.factorService;
  }

  getHistoricalService() {
    if (!this.historicalService) {
      const { getHistoricalIntelligence } = require('../../historical');
      this.historicalService = getHistoricalIntelligence();
    }
    return this.historicalService;
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'analytics.factors':
        return this.runFactorCalculation(db, onProgress);
      case 'analytics.factor_context':
        return this.runFactorContextEnrichment(db, onProgress);
      case 'analytics.outcomes':
        return this.runOutcomeCalculation(db, onProgress);
      case 'analytics.investor_styles':
        return this.runStyleClassification(db, onProgress);
      case 'analytics.track_records':
        return this.runTrackRecordUpdate(db, onProgress);
      case 'analytics.pattern_matching':
        return this.runPatternMatching(db, onProgress);
      case 'analytics.market_indicators':
        return this.runMarketIndicators(db, onProgress);
      default:
        throw new Error(`Unknown analytics job: ${jobKey}`);
    }
  }

  /**
   * Calculate factor scores for all stocks
   * Runs nightly to keep factor rankings current
   */
  async runFactorCalculation(db, onProgress) {
    await onProgress(5, 'Starting factor score calculation...');

    const factorService = this.getFactorService();

    // Calculate for current date
    const today = new Date().toISOString().split('T')[0];

    await onProgress(10, `Calculating factor scores for ${today}...`);

    const result = await factorService.calculateFactorScores(today, {
      verbose: false
    });

    await onProgress(100, `Calculated ${result.calculated} factor scores`);

    return {
      itemsTotal: result.total || result.calculated,
      itemsProcessed: result.calculated,
      itemsUpdated: result.calculated,
      itemsFailed: result.errors || 0
    };
  }

  /**
   * Enrich decisions with factor context
   * Links decisions to factor scores at time of decision
   * Runs weekly after factor calculation
   *
   * NOTE: This job requires SQLite-specific APIs (db.prepare) in decisionEnricher.js
   * On PostgreSQL, it will return early with a warning until the service is refactored.
   */
  async runFactorContextEnrichment(db, onProgress) {
    const { isUsingPostgres } = require('../../../lib/db');

    if (isUsingPostgres()) {
      await onProgress(100, 'Factor context enrichment skipped - requires PostgreSQL refactoring of decisionEnricher.js');
      console.warn('[analyticsBundle] analytics.factor_context: decisionEnricher.js uses SQLite db.prepare() API which is incompatible with PostgreSQL');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        skipped: true,
        reason: 'PostgreSQL not yet supported for this job - decisionEnricher.js needs refactoring'
      };
    }

    await onProgress(5, 'Starting factor context enrichment...');

    const historicalService = this.getHistoricalService();

    await onProgress(10, 'Finding decisions needing factor context...');

    const result = await historicalService.enrichWithFactorContext({
      batchSize: 10000,
      verbose: false,
      onProgress: async (pct, msg) => {
        await onProgress(10 + pct * 0.85, msg);
      }
    });

    await onProgress(100, `Enriched ${result.enriched} decisions with factor context`);

    return {
      itemsTotal: result.total || result.processed,
      itemsProcessed: result.processed || 0,
      itemsUpdated: result.enriched || 0,
      itemsFailed: result.errors || 0
    };
  }

  /**
   * Calculate outcomes for decisions that have enough price history
   * Runs weekly to update return/alpha calculations.
   * OutcomeCalculator returns { calculated, errors, total }.
   */
  async runOutcomeCalculation(db, onProgress) {
    await onProgress(5, 'Starting outcome calculation...');

    const historicalService = this.getHistoricalService();

    await onProgress(10, 'Finding decisions needing outcome updates...');

    const result = await historicalService.calculateAllOutcomes({
      limit: 2000,
      minDaysOld: 365,
      verbose: false
    });

    const calculated = result.calculated ?? 0;
    const errors = result.errors ?? 0;
    const total = result.total ?? 0;
    await onProgress(100, `Calculated ${calculated} outcomes (${errors} errors, ${total} processed)`);

    return {
      itemsTotal: total,
      itemsProcessed: total,
      itemsUpdated: calculated,
      itemsFailed: errors
    };
  }

  /**
   * Re-classify investor styles based on their decision history
   * Runs weekly to keep classifications current
   */
  async runStyleClassification(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting investor style classification...');

    // Get all famous investors
    const result = await database.query(`
      SELECT id, name, investment_style
      FROM famous_investors
      WHERE is_active = true
    `);
    const investors = result.rows;

    await onProgress(10, `Classifying ${investors.length} investors...`);

    let classified = 0;
    let updated = 0;

    for (let i = 0; i < investors.length; i++) {
      const investor = investors[i];

      // Calculate investor's factor preferences from their decisions
      // Note: size_percentile and volatility_percentile don't exist in the PostgreSQL schema
      // Using size_score as a proxy (lower = smaller cap)
      const factorResult = await database.query(`
        SELECT
          AVG(dfc.value_percentile) as avg_value_pct,
          AVG(dfc.quality_percentile) as avg_quality_pct,
          AVG(dfc.momentum_percentile) as avg_momentum_pct,
          AVG(dfc.growth_percentile) as avg_growth_pct,
          AVG(dfc.size_score * 20) as avg_size_pct,
          AVG(dfc.volatility_score * 20) as avg_volatility_pct,
          COUNT(*) as decision_count
        FROM investment_decisions d
        JOIN decision_factor_context dfc ON dfc.decision_id = d.id
        WHERE d.investor_id = $1
          AND d.decision_type IN ('new_position', 'increased')
      `, [investor.id]);
      const factorPrefs = factorResult.rows[0];

      if (!factorPrefs || factorPrefs.decision_count < 10) {
        continue; // Need at least 10 decisions with factor context
      }

      // Classify style based on factor preferences
      const newStyle = this._classifyStyle(factorPrefs);

      if (newStyle && newStyle !== investor.investment_style) {
        await database.query(`
          UPDATE famous_investors
          SET investment_style = $1,
              style_updated_at = CURRENT_TIMESTAMP,
              style_confidence = $2
          WHERE id = $3
        `, [newStyle, factorPrefs.confidence || 0.7, investor.id]);
        updated++;
      }

      classified++;

      if ((i + 1) % 10 === 0) {
        const pct = 10 + ((i + 1) / investors.length) * 85;
        await onProgress(pct, `Classified ${i + 1}/${investors.length} investors...`);
      }
    }

    await onProgress(100, `Classified ${classified} investors, ${updated} updated`);

    return {
      itemsTotal: investors.length,
      itemsProcessed: classified,
      itemsUpdated: updated,
      itemsFailed: 0
    };
  }

  _classifyStyle(factorPrefs) {
    const { avg_value_pct, avg_quality_pct, avg_momentum_pct, avg_growth_pct, avg_size_pct } = factorPrefs;

    // Value investor: high value percentile (cheap stocks)
    if (avg_value_pct > 70 && avg_quality_pct > 50) {
      factorPrefs.confidence = 0.8;
      return 'deep_value';
    }

    if (avg_value_pct > 60 && avg_quality_pct > 60) {
      factorPrefs.confidence = 0.75;
      return 'quality_value';
    }

    // Growth investor: high growth, lower value (willing to pay up)
    if (avg_growth_pct > 65 && avg_value_pct < 50) {
      factorPrefs.confidence = 0.8;
      return 'growth';
    }

    // Quality investor: very high quality regardless of value
    if (avg_quality_pct > 75) {
      factorPrefs.confidence = 0.7;
      return 'quality';
    }

    // Momentum investor: follows price trends
    if (avg_momentum_pct > 70) {
      factorPrefs.confidence = 0.7;
      return 'momentum';
    }

    // Small cap specialist: consistently picks smaller companies
    if (avg_size_pct < 35) {
      factorPrefs.confidence = 0.65;
      return 'small_cap';
    }

    // GARP: growth at reasonable price
    if (avg_growth_pct > 55 && avg_value_pct > 45 && avg_quality_pct > 50) {
      factorPrefs.confidence = 0.7;
      return 'garp';
    }

    // Default: diversified/blend
    factorPrefs.confidence = 0.5;
    return 'blend';
  }

  /**
   * Update investor track records
   * Calculates win rates, average returns, sector performance
   */
  async runTrackRecordUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting track record update...');

    const historicalService = this.getHistoricalService();

    // Get all investors with decisions
    const result = await database.query(`
      SELECT DISTINCT investor_id FROM investment_decisions
      WHERE return_1y IS NOT NULL
    `);
    const investors = result.rows;

    await onProgress(10, `Updating track records for ${investors.length} investors...`);

    let updated = 0;

    for (let i = 0; i < investors.length; i++) {
      const { investor_id } = investors[i];

      // Calculate for all_time period
      await historicalService.calculateInvestorTrackRecord(investor_id, 'all_time');
      updated++;

      if ((i + 1) % 20 === 0) {
        const pct = 10 + ((i + 1) / investors.length) * 85;
        await onProgress(pct, `Updated ${i + 1}/${investors.length} track records...`);
      }
    }

    await onProgress(100, `Updated ${updated} investor track records`);

    return {
      itemsTotal: investors.length,
      itemsProcessed: updated,
      itemsUpdated: updated,
      itemsFailed: 0
    };
  }

  /**
   * Match decisions to investment patterns
   * Identifies value plays, turnarounds, growth plays, etc.
   *
   * NOTE: This job requires SQLite-specific APIs (db.prepare) in patternMatcher.js
   * On PostgreSQL, it will return early with a warning until the service is refactored.
   */
  async runPatternMatching(db, onProgress) {
    const { isUsingPostgres } = require('../../../lib/db');

    if (isUsingPostgres()) {
      await onProgress(100, 'Pattern matching skipped - requires PostgreSQL refactoring of patternMatcher.js');
      console.warn('[analyticsBundle] analytics.pattern_matching: patternMatcher.js uses SQLite db.prepare() API which is incompatible with PostgreSQL');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        skipped: true,
        reason: 'PostgreSQL not yet supported for this job - patternMatcher.js needs refactoring'
      };
    }

    await onProgress(5, 'Starting pattern matching...');

    const historicalService = this.getHistoricalService();

    await onProgress(10, 'Matching decisions to patterns...');

    const result = await historicalService.matchAllPatterns({
      onProgress: async (pct, msg) => {
        await onProgress(10 + pct * 0.85, msg);
      }
    });

    await onProgress(100, `Matched ${result.matched} decisions to patterns`);

    return {
      itemsTotal: result.total || 0,
      itemsProcessed: result.processed || 0,
      itemsUpdated: result.matched || 0,
      itemsFailed: result.errors || 0
    };
  }

  /**
   * Update market indicators for current and previous quarter
   * - Buffett Indicator (Market Cap / GDP)
   * - S&P 500 P/E Ratio (TTM)
   * - FRED MSI (official Federal Reserve Equity/Net Worth ratio)
   * - Stock MSI (aggregate EV/Book from individual stocks)
   */
  async runMarketIndicators(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting market indicator update...');

    const { HistoricalMarketIndicatorsService } = require('../../historicalMarketIndicators');
    const { FREDService } = require('../../dataProviders/fredService');

    const service = new HistoricalMarketIndicatorsService(database);
    const fredService = new FREDService();

    // Determine current and previous quarter
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentYear = now.getFullYear();
    const currentQuarter = `${currentYear}-Q${currentQ}`;

    const prevQ = currentQ === 1 ? 4 : currentQ - 1;
    const prevYear = currentQ === 1 ? currentYear - 1 : currentYear;
    const prevQuarter = `${prevYear}-Q${prevQ}`;

    await onProgress(10, 'Fetching latest FRED MSI data (NCBCEPNW)...');

    // Fetch latest FRED MSI data
    try {
      await fredService.fetchAndStoreSeries('NCBCEPNW');
    } catch (error) {
      console.warn('Could not fetch FRED MSI:', error.message);
    }

    await onProgress(30, `Calculating indicators for ${prevQuarter} and ${currentQuarter}...`);

    let updated = 0;
    for (const quarter of [prevQuarter, currentQuarter]) {
      try {
        const buffett = service.calculateBuffettIndicator(quarter);
        const pe = service.getSP500PEForQuarterTTM(quarter);
        const msi = service.calculateAggregateMSI(quarter);
        const fredMSI = service.getMSIFromFRED(quarter);

        await database.query(`
          INSERT INTO market_indicator_history (
            quarter, buffett_indicator, buffett_source, sp500_pe, aggregate_msi, fred_msi
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(quarter) DO UPDATE SET
            buffett_indicator = excluded.buffett_indicator,
            buffett_source = excluded.buffett_source,
            sp500_pe = excluded.sp500_pe,
            aggregate_msi = excluded.aggregate_msi,
            fred_msi = excluded.fred_msi
        `, [
          quarter,
          buffett?.value || null,
          buffett?.source || null,
          pe || null,
          msi?.value || null,
          fredMSI?.value || null
        ]);

        updated++;
        await onProgress(30 + (updated / 2) * 60, `Updated ${quarter}: Buffett=${buffett?.value?.toFixed(1) || 'N/A'}%, FRED MSI=${fredMSI?.value?.toFixed(3) || 'N/A'}`);
      } catch (error) {
        console.error(`Error updating ${quarter}:`, error.message);
      }
    }

    await onProgress(100, `Updated ${updated} quarters with market indicators`);

    return {
      itemsTotal: 2,
      itemsProcessed: updated,
      itemsUpdated: updated,
      itemsFailed: 2 - updated
    };
  }
}

const analyticsBundle = new AnalyticsBundle();

module.exports = {
  execute: (jobKey, db, context) => analyticsBundle.execute(jobKey, db, context)
};
