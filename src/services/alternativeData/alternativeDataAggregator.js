/**
 * Alternative Data Aggregator
 *
 * Unified interface for all alternative data sources.
 * Combines signals from:
 * - Congressional trades (Quiver)
 * - Short interest (FINRA)
 * - Government contracts (Quiver)
 * - FRED economic indicators (existing)
 *
 * Provides weighted combined scoring and opportunity discovery.
 */

const { QuiverQuantitativeService } = require('./quiverQuantitative');
const { FinraShortInterestService } = require('./finraShortInterest');

class AlternativeDataAggregator {
  constructor(db) {
    this.db = db;

    // Initialize sub-services
    this.quiver = new QuiverQuantitativeService(db);
    this.finra = new FinraShortInterestService(db);

    // Signal weights for combined score
    this.WEIGHTS = {
      congress: 0.40,      // Congressional trades are highly informative
      shortInterest: 0.35, // Short interest shows sentiment
      contracts: 0.25      // Government contracts for revenue visibility
    };

    // Prepare statements
    this.prepareStatements();
  }

  prepareStatements() {
    this.upsertSignal = this.db.prepare(`
      INSERT INTO alternative_data_signals (
        company_id, symbol, signal_date,
        congress_signal, congress_buy_count, congress_sell_count, congress_net_amount,
        short_interest_signal, short_pct_float, days_to_cover, is_squeeze_candidate,
        contract_signal, recent_contract_value, contract_to_mcap_ratio,
        combined_score, confidence, data_sources
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, signal_date) DO UPDATE SET
        congress_signal = excluded.congress_signal,
        congress_buy_count = excluded.congress_buy_count,
        congress_sell_count = excluded.congress_sell_count,
        short_interest_signal = excluded.short_interest_signal,
        short_pct_float = excluded.short_pct_float,
        days_to_cover = excluded.days_to_cover,
        is_squeeze_candidate = excluded.is_squeeze_candidate,
        contract_signal = excluded.contract_signal,
        combined_score = excluded.combined_score,
        confidence = excluded.confidence,
        data_sources = excluded.data_sources,
        updated_at = CURRENT_TIMESTAMP
    `);

    this.getLatestSignal = this.db.prepare(`
      SELECT * FROM alternative_data_signals
      WHERE symbol = ?
      ORDER BY signal_date DESC
      LIMIT 1
    `);

    this.getTopSignals = this.db.prepare(`
      SELECT
        ads.*,
        c.name as company_name,
        pm.last_price,
        pm.market_cap
      FROM alternative_data_signals ads
      JOIN companies c ON ads.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE ads.signal_date = (
        SELECT MAX(signal_date) FROM alternative_data_signals
        WHERE symbol = ads.symbol
      )
        AND ads.combined_score IS NOT NULL
      ORDER BY ads.combined_score DESC
      LIMIT ?
    `);

    this.getBottomSignals = this.db.prepare(`
      SELECT
        ads.*,
        c.name as company_name,
        pm.last_price,
        pm.market_cap
      FROM alternative_data_signals ads
      JOIN companies c ON ads.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE ads.signal_date = (
        SELECT MAX(signal_date) FROM alternative_data_signals
        WHERE symbol = ads.symbol
      )
        AND ads.combined_score IS NOT NULL
      ORDER BY ads.combined_score ASC
      LIMIT ?
    `);

    this.getCompanyId = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `);

    this.getMarketCap = this.db.prepare(`
      SELECT market_cap FROM price_metrics WHERE company_id = ?
    `);
  }

  /**
   * Get all alternative data signals for a symbol
   */
  getSignals(symbol) {
    // Get congressional signal
    const congressSignal = this.quiver.getCongressSignal(symbol);

    // Get short interest signal
    const shortSignal = this.finra.getShortInterestSignal(symbol);

    // Get contract signal
    const contractSignal = this.quiver.getContractSignal(symbol);

    return {
      congress: congressSignal,
      shortInterest: shortSignal,
      contracts: contractSignal
    };
  }

  /**
   * Calculate combined alternative data score
   */
  calculateCombinedScore(signals) {
    let totalWeight = 0;
    let weightedSum = 0;
    let dataSources = 0;

    // Congressional signal
    if (signals.congress?.signal !== null) {
      weightedSum += signals.congress.signal * this.WEIGHTS.congress;
      totalWeight += this.WEIGHTS.congress;
      dataSources++;
    }

    // Short interest signal
    if (signals.shortInterest?.signal !== null) {
      weightedSum += signals.shortInterest.signal * this.WEIGHTS.shortInterest;
      totalWeight += this.WEIGHTS.shortInterest;
      dataSources++;
    }

    // Contract signal
    if (signals.contracts?.signal !== null) {
      weightedSum += signals.contracts.signal * this.WEIGHTS.contracts;
      totalWeight += this.WEIGHTS.contracts;
      dataSources++;
    }

    if (totalWeight === 0) {
      return { score: null, confidence: 0, dataSources: 0 };
    }

    const combinedScore = weightedSum / totalWeight;

    // Confidence based on data availability and individual confidences
    let avgConfidence = 0;
    let confCount = 0;
    if (signals.congress?.confidence) { avgConfidence += signals.congress.confidence; confCount++; }
    if (signals.shortInterest?.confidence) { avgConfidence += signals.shortInterest.confidence; confCount++; }
    if (signals.contracts?.confidence) { avgConfidence += signals.contracts.confidence; confCount++; }

    const confidence = confCount > 0
      ? (avgConfidence / confCount) * (dataSources / 3)
      : 0;

    return {
      score: combinedScore,
      confidence,
      dataSources
    };
  }

  /**
   * Update and store all signals for a symbol
   */
  async updateSymbol(symbol, fetchNew = false) {
    console.log(`\n📊 Updating alternative data for ${symbol}...`);

    const companyRow = this.getCompanyId.get(symbol);
    if (!companyRow) {
      console.log(`  Company not found: ${symbol}`);
      return null;
    }

    // Optionally fetch new data
    if (fetchNew) {
      await this.quiver.fetchCongressionalTrades(symbol);
      await this.quiver.fetchGovernmentContracts(symbol);
      await this.finra.updateShortInterest(symbol);
    }

    // Get all signals
    const signals = this.getSignals(symbol);

    // Calculate combined score
    const combined = this.calculateCombinedScore(signals);

    // Get market cap for contract ratio
    const mcapRow = this.getMarketCap.get(companyRow.id);
    const marketCap = mcapRow?.market_cap || 0;
    const contractRatio = marketCap > 0 && signals.contracts?.totalValue
      ? signals.contracts.totalValue / marketCap
      : null;

    // Store aggregated signal
    const signalDate = new Date().toISOString().split('T')[0];

    this.upsertSignal.run(
      companyRow.id,
      symbol,
      signalDate,
      signals.congress?.signal,
      signals.congress?.buyCount || 0,
      signals.congress?.sellCount || 0,
      signals.congress?.netAmount || 0,
      signals.shortInterest?.signal,
      signals.shortInterest?.shortPctFloat,
      signals.shortInterest?.daysToCover,
      signals.shortInterest?.isSqueezeCandidate ? 1 : 0,
      signals.contracts?.signal,
      signals.contracts?.totalValue,
      contractRatio,
      combined.score,
      combined.confidence,
      combined.dataSources
    );

    console.log(`  Combined score: ${combined.score?.toFixed(3) || 'N/A'}, ` +
                `Confidence: ${(combined.confidence * 100).toFixed(0)}%, ` +
                `Sources: ${combined.dataSources}/3`);

    return {
      symbol,
      signals,
      combined,
      signalDate
    };
  }

  /**
   * Batch update signals for multiple symbols
   */
  async batchUpdate(symbols, options = {}) {
    const { fetchNew = false, delayMs = 1000 } = options;

    console.log(`\n📊 Batch updating alternative data for ${symbols.length} symbols...\n`);

    const results = [];

    for (const symbol of symbols) {
      try {
        const result = await this.updateSymbol(symbol, fetchNew);
        if (result) results.push(result);
      } catch (error) {
        console.error(`  Error updating ${symbol}: ${error.message}`);
      }

      if (fetchNew) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    console.log(`\n✅ Updated ${results.length}/${symbols.length} symbols\n`);

    return results;
  }

  /**
   * Get top bullish signals
   */
  getTopBullish(limit = 20) {
    return this.getTopSignals.all(limit);
  }

  /**
   * Get top bearish signals
   */
  getTopBearish(limit = 20) {
    return this.getBottomSignals.all(limit);
  }

  /**
   * Get top congressional buys with additional context
   */
  getTopCongressBuys(options = {}) {
    const { lookbackDays = '-30 days', limit = 20 } = options;

    const topBuys = this.quiver.getTopCongressBuys(lookbackDays, limit);

    // Enrich with short interest and valuation data
    return topBuys.map(buy => {
      const shortInterest = this.finra.getShortInterestSignal(buy.symbol);
      const valuation = this.db.prepare(`
        SELECT
          cm.pe_ratio,
          cm.fcf_yield,
          cm.roic,
          vr.valuation_signal,
          vr.current_pe_percentile
        FROM calculated_metrics cm
        LEFT JOIN valuation_ranges vr ON vr.company_id = cm.company_id
        WHERE cm.company_id = (SELECT id FROM companies WHERE symbol = ?)
          AND cm.period_type = 'annual'
        ORDER BY cm.fiscal_period DESC
        LIMIT 1
      `).get(buy.symbol);

      return {
        ...buy,
        shortInterest: shortInterest?.shortPctFloat,
        isSqueezeCandidate: shortInterest?.isSqueezeCandidate,
        peRatio: valuation?.pe_ratio,
        fcfYield: valuation?.fcf_yield,
        roic: valuation?.roic,
        valuationSignal: valuation?.valuation_signal,
        pePercentile: valuation?.current_pe_percentile
      };
    });
  }

  /**
   * Get squeeze candidates with congressional activity
   */
  getSqueezeCandidatesWithContext(limit = 20) {
    const squeezeCandidates = this.finra.getSqueezeCandidates(limit);

    return squeezeCandidates.map(candidate => {
      const congressSignal = this.quiver.getCongressSignal(candidate.symbol);

      return {
        ...candidate,
        congressBuyCount: congressSignal.buyCount,
        congressSellCount: congressSignal.sellCount,
        congressSignal: congressSignal.signal,
        hasPoliticianBuying: congressSignal.buyCount > 0
      };
    });
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_symbols,
        COUNT(CASE WHEN combined_score > 0.3 THEN 1 END) as bullish_signals,
        COUNT(CASE WHEN combined_score < -0.3 THEN 1 END) as bearish_signals,
        COUNT(CASE WHEN is_squeeze_candidate = 1 THEN 1 END) as squeeze_candidates,
        COUNT(CASE WHEN congress_buy_count > 0 THEN 1 END) as with_congress_buys,
        AVG(combined_score) as avg_score,
        MAX(signal_date) as latest_date
      FROM alternative_data_signals
      WHERE signal_date >= date('now', '-7 days')
    `).get();

    const topBullish = this.getTopBullish(5);
    const topBearish = this.getTopBearish(5);

    return {
      stats,
      topBullish: topBullish.map(s => ({
        symbol: s.symbol,
        score: s.combined_score,
        congressSignal: s.congress_signal,
        shortSignal: s.short_interest_signal
      })),
      topBearish: topBearish.map(s => ({
        symbol: s.symbol,
        score: s.combined_score,
        congressSignal: s.congress_signal,
        shortSignal: s.short_interest_signal
      }))
    };
  }

  /**
   * Get alternative data for screening integration
   */
  getScreeningData(symbol) {
    const latest = this.getLatestSignal.get(symbol);

    if (!latest) {
      return null;
    }

    return {
      altDataScore: latest.combined_score,
      altDataConfidence: latest.confidence,
      congressBullish: latest.congress_signal > 0.2,
      congressBearish: latest.congress_signal < -0.2,
      highShortInterest: latest.short_pct_float > 0.20,
      squeezeCandidate: latest.is_squeeze_candidate === 1,
      hasGovContracts: latest.contract_signal > 0
    };
  }

  /**
   * Run full update for top holdings
   */
  async runFullUpdate(options = {}) {
    const { limit = 100, fetchNew = true } = options;

    console.log('\n🔄 Running full alternative data update...\n');

    // Get top companies by market cap
    const companies = this.db.prepare(`
      SELECT c.symbol
      FROM companies c
      JOIN price_metrics pm ON pm.company_id = c.id
      WHERE c.symbol NOT LIKE 'CIK_%'
        AND pm.market_cap IS NOT NULL
      ORDER BY pm.market_cap DESC
      LIMIT ?
    `).all(limit);

    const symbols = companies.map(c => c.symbol);

    // Update all
    await this.batchUpdate(symbols, { fetchNew, delayMs: 1500 });

    // Update politician track records
    if (fetchNew) {
      await this.quiver.updatePoliticianTrackRecords();
    }

    // Return summary
    return this.getSummary();
  }
}

// Export index for all alternative data services
module.exports = {
  AlternativeDataAggregator,
  QuiverQuantitativeService,
  FinraShortInterestService
};
