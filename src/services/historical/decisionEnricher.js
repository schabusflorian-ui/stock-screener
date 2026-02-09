// src/services/historical/decisionEnricher.js
// Converts investor holdings to structured investment decisions and enriches with context

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

/**
 * DecisionEnricher
 *
 * Transforms raw 13F holdings data into rich investment decisions by:
 * 1. Detecting position changes (new, increased, decreased, sold)
 * 2. Capturing stock context at decision time (valuation, growth, quality metrics)
 * 3. Capturing market context at decision time (S&P P/E, VIX, rates)
 * 4. Classifying conviction level based on position size and changes
 */
class DecisionEnricher {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  /**
   * Backfill investment_decisions from existing investor_holdings
   * Uses batched processing to handle large datasets
   */
  async backfillFromHoldings(investorId = null, options = {}) {
    const { skipExisting = true, verbose = false, batchSize = 5000 } = options;

    // First, get the count of holdings to process
    let countQuery = `
      SELECT COUNT(*) as count
      FROM investor_holdings ih
      JOIN famous_investors fi ON ih.investor_id = fi.id
      WHERE ih.change_type IS NOT NULL
        AND ih.change_type != 'unchanged'
    `;
    const countParams = [];

    if (investorId) {
      countQuery += ' AND ih.investor_id = ?';
      countParams.push(investorId);
    }

    if (skipExisting) {
      countQuery += ` AND NOT EXISTS (
        SELECT 1 FROM investment_decisions d
        WHERE d.investor_id = ih.investor_id
          AND d.cusip = ih.cusip
          AND d.decision_date = ih.filing_date
      )`;
    }

    const { count: totalHoldings } = this.db.prepare(countQuery).get(...countParams);

    if (verbose) {
      console.log(`📊 Found ${totalHoldings} holdings to convert to decisions`);
    }

    if (totalHoldings === 0) {
      return { created: 0, errors: 0, total: 0 };
    }

    const insertDecision = this.db.prepare(`
      INSERT INTO investment_decisions (
        investor_id, company_id, cusip, symbol, security_name,
        decision_date, report_date, decision_type,
        shares, position_value, portfolio_weight,
        previous_shares, shares_change, shares_change_pct,
        is_new_position, sector, industry,
        data_quality_score, created_at
      ) VALUES (
        @investor_id, @company_id, @cusip, @symbol, @security_name,
        @decision_date, @report_date, @decision_type,
        @shares, @position_value, @portfolio_weight,
        @previous_shares, @shares_change, @shares_change_pct,
        @is_new_position, @sector, @industry,
        @data_quality_score, datetime('now')
      )
    `);

    let created = 0;
    let errors = 0;
    let offset = 0;

    // Process in batches
    while (offset < totalHoldings) {
      // Build batch query
      let batchQuery = `
        SELECT
          ih.id as holding_id,
          ih.investor_id,
          ih.company_id,
          ih.cusip,
          ih.security_name,
          ih.filing_date,
          ih.report_date,
          ih.shares,
          ih.market_value,
          ih.portfolio_weight,
          ih.prev_shares,
          ih.shares_change,
          ih.shares_change_pct,
          ih.change_type,
          c.symbol,
          c.sector,
          c.industry,
          fi.name as investor_name,
          fi.investment_style as investor_style
        FROM investor_holdings ih
        LEFT JOIN companies c ON ih.company_id = c.id
        JOIN famous_investors fi ON ih.investor_id = fi.id
        WHERE ih.change_type IS NOT NULL
          AND ih.change_type != 'unchanged'
      `;

      const batchParams = [];
      if (investorId) {
        batchQuery += ' AND ih.investor_id = ?';
        batchParams.push(investorId);
      }

      if (skipExisting) {
        batchQuery += ` AND NOT EXISTS (
          SELECT 1 FROM investment_decisions d
          WHERE d.investor_id = ih.investor_id
            AND d.cusip = ih.cusip
            AND d.decision_date = ih.filing_date
        )`;
      }

      batchQuery += ' ORDER BY ih.filing_date DESC, ih.id LIMIT ? OFFSET ?';
      batchParams.push(batchSize, offset);

      const holdings = this.db.prepare(batchQuery).all(...batchParams);

      if (holdings.length === 0) break;

      // Process batch in a transaction
      const batchTransaction = this.db.transaction(() => {
        for (const holding of holdings) {
          try {
            const decisionType = this._mapDecisionType(holding.change_type);

            insertDecision.run({
              investor_id: holding.investor_id,
              company_id: holding.company_id,
              cusip: holding.cusip,
              symbol: holding.symbol,
              security_name: holding.security_name,
              decision_date: holding.filing_date,
              report_date: holding.report_date,
              decision_type: decisionType,
              shares: holding.shares,
              position_value: holding.market_value,
              portfolio_weight: holding.portfolio_weight,
              previous_shares: holding.prev_shares,
              shares_change: holding.shares_change,
              shares_change_pct: holding.shares_change_pct,
              is_new_position: decisionType === 'new_position' ? 1 : 0,
              sector: holding.sector,
              industry: holding.industry,
              data_quality_score: 20
            });

            created++;
          } catch (e) {
            if (verbose) {
              console.error(`Error creating decision for ${holding.cusip}: ${e.message}`);
            }
            errors++;
          }
        }
      });

      batchTransaction();
      offset += holdings.length;

      if (verbose) {
        console.log(`  Processed ${Math.min(offset, totalHoldings)}/${totalHoldings} (${created} created, ${errors} errors)`);
      }
    }

    if (verbose) {
      console.log(`✅ Created ${created} decisions (${errors} errors)`);
    }

    return { created, errors, total: totalHoldings };
  }

  /**
   * Enrich a single decision with stock and market context
   */
  async enrichDecision(decisionId) {
    const database = await getDatabaseAsync();

    const decisionResult = await database.query(`
      SELECT * FROM investment_decisions WHERE id = $1
    `, [decisionId]);
    const decision = decisionResult.rows[0];

    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    // Get stock context at decision date
    const stockContext = await this._getStockContext(
      decision.company_id,
      decision.decision_date
    );

    // Get market context at decision date
    const marketContext = await this._getMarketContext(decision.decision_date);

    // Calculate additional indicators
    const indicators = this._calculateIndicators(decision, stockContext);

    // Update decision with enriched data
    const enrichedData = {
      ...stockContext,
      ...marketContext,
      ...indicators,
      data_quality_score: this._calculateDataQuality(stockContext, marketContext)
    };

    await database.query(`
      UPDATE investment_decisions SET
        stock_price = $1,
        market_cap = $2,
        enterprise_value = $3,
        pe_ratio = $4,
        pb_ratio = $5,
        ps_ratio = $6,
        ev_ebitda = $7,
        ev_revenue = $8,
        fcf_yield = $9,
        earnings_yield = $10,
        dividend_yield = $11,
        revenue_growth_yoy = $12,
        revenue_growth_3y_cagr = $13,
        earnings_growth_yoy = $14,
        fcf_growth_yoy = $15,
        gross_margin = $16,
        operating_margin = $17,
        net_margin = $18,
        roe = $19,
        roic = $20,
        roa = $21,
        debt_to_equity = $22,
        debt_to_assets = $23,
        current_ratio = $24,
        interest_coverage = $25,
        fcf_per_share = $26,
        market_context_id = $27,
        sp500_pe = $28,
        sp500_1y_return = $29,
        vix = $30,
        fed_funds_rate = $31,
        yield_curve_spread = $32,
        market_cycle = $33,
        is_top_10_position = $34,
        position_size_category = $35,
        data_quality_score = $36,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $37
    `, [
      enrichedData.stock_price,
      enrichedData.market_cap,
      enrichedData.enterprise_value,
      enrichedData.pe_ratio,
      enrichedData.pb_ratio,
      enrichedData.ps_ratio,
      enrichedData.ev_ebitda,
      enrichedData.ev_revenue,
      enrichedData.fcf_yield,
      enrichedData.earnings_yield,
      enrichedData.dividend_yield,
      enrichedData.revenue_growth_yoy,
      enrichedData.revenue_growth_3y_cagr,
      enrichedData.earnings_growth_yoy,
      enrichedData.fcf_growth_yoy,
      enrichedData.gross_margin,
      enrichedData.operating_margin,
      enrichedData.net_margin,
      enrichedData.roe,
      enrichedData.roic,
      enrichedData.roa,
      enrichedData.debt_to_equity,
      enrichedData.debt_to_assets,
      enrichedData.current_ratio,
      enrichedData.interest_coverage,
      enrichedData.fcf_per_share,
      enrichedData.market_context_id,
      enrichedData.sp500_pe,
      enrichedData.sp500_1y_return,
      enrichedData.vix,
      enrichedData.fed_funds_rate,
      enrichedData.yield_curve_spread,
      enrichedData.market_cycle,
      enrichedData.is_top_10_position,
      enrichedData.position_size_category,
      enrichedData.data_quality_score,
      decisionId
    ]);

    return {
      decisionId,
      enriched: true,
      stockContext,
      marketContext,
      indicators
    };
  }

  /**
   * Enrich all decisions that need context
   */
  async enrichAllDecisions(options = {}) {
    const { limit = 1000, minQualityScore = 50, verbose = false } = options;

    const decisions = this.db.prepare(`
      SELECT id, company_id, decision_date, symbol
      FROM investment_decisions
      WHERE data_quality_score < ?
        AND company_id IS NOT NULL
      ORDER BY decision_date DESC
      LIMIT ?
    `).all(minQualityScore, limit);

    if (verbose) {
      console.log(`📊 Enriching ${decisions.length} decisions...`);
    }

    let enriched = 0;
    let errors = 0;

    for (const decision of decisions) {
      try {
        await this.enrichDecision(decision.id);
        enriched++;

        if (verbose && enriched % 100 === 0) {
          console.log(`  Enriched ${enriched}/${decisions.length}`);
        }
      } catch (e) {
        if (verbose) {
          console.error(`Error enriching decision ${decision.id}: ${e.message}`);
        }
        errors++;
      }
    }

    if (verbose) {
      console.log(`✅ Enriched ${enriched} decisions (${errors} errors)`);
    }

    return { enriched, errors, total: decisions.length };
  }

  /**
   * Get stock context (metrics) at a specific date
   */
  async _getStockContext(companyId, date) {
    if (!companyId) {
      return {};
    }

    // Get price at decision date
    const price = this.db.prepare(`
      SELECT close as stock_price
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `).get(companyId, date);

    // Get metrics at or before decision date
    const metrics = this.db.prepare(`
      SELECT
        market_cap,
        enterprise_value,
        pe_ratio,
        pb_ratio,
        ps_ratio,
        ev_ebitda,
        fcf_yield,
        earnings_yield,
        dividend_yield,
        revenue_growth_yoy,
        earnings_growth_yoy,
        fcf_growth_yoy,
        gross_margin,
        operating_margin,
        net_margin,
        roe,
        roic,
        roa,
        debt_to_equity,
        debt_to_assets,
        current_ratio,
        interest_coverage,
        fcf_per_share
      FROM calculated_metrics
      WHERE company_id = ?
        AND fiscal_period <= ?
      ORDER BY fiscal_period DESC
      LIMIT 1
    `).get(companyId, date);

    // Calculate revenue growth 3Y CAGR
    const revenueHistory = this.db.prepare(`
      SELECT fiscal_period, revenue_growth_yoy
      FROM calculated_metrics
      WHERE company_id = ? AND fiscal_period <= ?
      ORDER BY fiscal_period DESC
      LIMIT 4
    `).all(companyId, date);

    let revenue_growth_3y_cagr = null;
    if (revenueHistory.length >= 4) {
      // Approximate 3Y CAGR from YoY growth rates
      const growthRates = revenueHistory.map(r => r.revenue_growth_yoy).filter(r => r != null);
      if (growthRates.length >= 3) {
        const avgGrowth = growthRates.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
        revenue_growth_3y_cagr = avgGrowth;
      }
    }

    // Calculate EV/Revenue if we have the data
    let ev_revenue = null;
    if (metrics?.enterprise_value && metrics?.market_cap) {
      // Would need revenue, but we can estimate from PS ratio
      if (metrics.ps_ratio && metrics.ps_ratio > 0) {
        const impliedRevenue = metrics.market_cap / metrics.ps_ratio;
        ev_revenue = metrics.enterprise_value / impliedRevenue;
      }
    }

    return {
      stock_price: price?.stock_price || null,
      market_cap: metrics?.market_cap || null,
      enterprise_value: metrics?.enterprise_value || null,
      pe_ratio: metrics?.pe_ratio || null,
      pb_ratio: metrics?.pb_ratio || null,
      ps_ratio: metrics?.ps_ratio || null,
      ev_ebitda: metrics?.ev_ebitda || null,
      ev_revenue,
      fcf_yield: metrics?.fcf_yield || null,
      earnings_yield: metrics?.earnings_yield || null,
      dividend_yield: metrics?.dividend_yield || null,
      revenue_growth_yoy: metrics?.revenue_growth_yoy || null,
      revenue_growth_3y_cagr,
      earnings_growth_yoy: metrics?.earnings_growth_yoy || null,
      fcf_growth_yoy: metrics?.fcf_growth_yoy || null,
      gross_margin: metrics?.gross_margin || null,
      operating_margin: metrics?.operating_margin || null,
      net_margin: metrics?.net_margin || null,
      roe: metrics?.roe || null,
      roic: metrics?.roic || null,
      roa: metrics?.roa || null,
      debt_to_equity: metrics?.debt_to_equity || null,
      debt_to_assets: metrics?.debt_to_assets || null,
      current_ratio: metrics?.current_ratio || null,
      interest_coverage: metrics?.interest_coverage || null,
      fcf_per_share: metrics?.fcf_per_share || null
    };
  }

  /**
   * Get or calculate market context for a date
   */
  async _getMarketContext(date) {
    // Check if we have a snapshot for this date
    const context = this.db.prepare(`
      SELECT *
      FROM market_context_snapshots
      WHERE snapshot_date = ?
    `).get(date);

    if (context) {
      return {
        market_context_id: context.id,
        sp500_pe: context.sp500_pe,
        sp500_1y_return: context.sp500_1y_return,
        vix: context.vix,
        fed_funds_rate: context.fed_funds_rate,
        yield_curve_spread: context.yield_curve_spread,
        market_cycle: context.market_cycle
      };
    }

    // Try to calculate from available data
    return this._calculateMarketContext(date);
  }

  /**
   * Calculate market context from available data
   */
  async _calculateMarketContext(date) {
    // Get S&P 500 data
    const spy = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = 'SPY'
    `).get();

    let sp500_1y_return = null;
    if (spy) {
      const currentPrice = this.db.prepare(`
        SELECT close FROM daily_prices
        WHERE company_id = ? AND date <= ?
        ORDER BY date DESC LIMIT 1
      `).get(spy.id, date);

      const yearAgoPrice = this.db.prepare(`
        SELECT close FROM daily_prices
        WHERE company_id = ? AND date <= date(?, '-1 year')
        ORDER BY date DESC LIMIT 1
      `).get(spy.id, date);

      if (currentPrice?.close && yearAgoPrice?.close) {
        sp500_1y_return = ((currentPrice.close - yearAgoPrice.close) / yearAgoPrice.close) * 100;
      }
    }

    // Try to get S&P 500 PE from index_metrics if available
    const indexMetrics = this.db.prepare(`
      SELECT weighted_pe
      FROM index_metrics
      WHERE symbol = 'SP500' AND date <= ?
      ORDER BY date DESC LIMIT 1
    `).get(date);

    // Estimate market cycle based on returns
    let market_cycle = null;
    if (sp500_1y_return !== null) {
      if (sp500_1y_return > 20) market_cycle = 'late_bull';
      else if (sp500_1y_return > 10) market_cycle = 'mid_bull';
      else if (sp500_1y_return > 0) market_cycle = 'early_bull';
      else if (sp500_1y_return > -20) market_cycle = 'correction';
      else market_cycle = 'bear';
    }

    return {
      market_context_id: null,
      sp500_pe: indexMetrics?.weighted_pe || null,
      sp500_1y_return,
      vix: null,  // Would need external data source
      fed_funds_rate: null,  // Would need external data source
      yield_curve_spread: null,
      market_cycle
    };
  }

  /**
   * Calculate additional decision indicators
   */
  _calculateIndicators(decision, stockContext) {
    // Determine position size category
    let position_size_category = 'starter';
    if (decision.portfolio_weight >= 10) {
      position_size_category = 'core';
    } else if (decision.portfolio_weight >= 5) {
      position_size_category = 'significant';
    } else if (decision.portfolio_weight >= 2) {
      position_size_category = 'moderate';
    }

    // Check if it's a top 10 position
    const topPositions = this.db.prepare(`
      SELECT COUNT(*) as rank_count
      FROM investment_decisions
      WHERE investor_id = ?
        AND decision_date = ?
        AND portfolio_weight > ?
    `).get(decision.investor_id, decision.decision_date, decision.portfolio_weight || 0);

    const is_top_10_position = topPositions.rank_count < 10 ? 1 : 0;

    return {
      position_size_category,
      is_top_10_position
    };
  }

  /**
   * Calculate data quality score based on available context
   */
  _calculateDataQuality(stockContext, marketContext) {
    let score = 0;

    // Stock context metrics (each worth 5 points, max 50)
    const stockFields = [
      'stock_price', 'pe_ratio', 'pb_ratio', 'roic', 'roe',
      'revenue_growth_yoy', 'net_margin', 'debt_to_equity',
      'fcf_yield', 'market_cap'
    ];
    for (const field of stockFields) {
      if (stockContext[field] != null) score += 5;
    }

    // Market context (each worth 10 points, max 50)
    const marketFields = ['sp500_pe', 'sp500_1y_return', 'market_cycle', 'vix', 'fed_funds_rate'];
    for (const field of marketFields) {
      if (marketContext[field] != null) score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Map holding change_type to decision_type
   */
  _mapDecisionType(changeType) {
    const mapping = {
      'new': 'new_position',
      'increased': 'increased',
      'decreased': 'decreased',
      'sold': 'sold_out',
      'unchanged': 'held'
    };
    return mapping[changeType] || 'held';
  }

  /**
   * Link decisions to factor scores at time of decision
   * This populates the decision_factor_context table
   */
  async enrichWithFactorContext(options = {}) {
    const { batchSize = 10000, verbose = false, onProgress } = options;

    // Find decisions that need factor context
    const countResult = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM investment_decisions d
      WHERE d.company_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM decision_factor_context dfc
          WHERE dfc.decision_id = d.id
        )
    `).get();

    const totalToProcess = countResult.count;

    if (verbose) {
      console.log(`📊 Found ${totalToProcess} decisions needing factor context`);
    }

    if (totalToProcess === 0) {
      return { processed: 0, enriched: 0, errors: 0 };
    }

    const insertContext = this.db.prepare(`
      INSERT OR IGNORE INTO decision_factor_context (
        decision_id,
        value_score, quality_score, momentum_score, growth_score, size_score, volatility_score,
        value_percentile, quality_percentile, momentum_percentile, growth_percentile,
        dominant_factor, dominant_factor_percentile,
        is_value_play, is_quality_play, is_momentum_play, is_growth_play,
        is_contrarian_play, is_small_cap_play
      ) VALUES (
        @decision_id,
        @value_score, @quality_score, @momentum_score, @growth_score, @size_score, @volatility_score,
        @value_percentile, @quality_percentile, @momentum_percentile, @growth_percentile,
        @dominant_factor, @dominant_factor_percentile,
        @is_value_play, @is_quality_play, @is_momentum_play, @is_growth_play,
        @is_contrarian_play, @is_small_cap_play
      )
    `);

    let processed = 0;
    let enriched = 0;
    let errors = 0;
    let offset = 0;

    while (offset < totalToProcess) {
      // Get batch of decisions
      const decisions = this.db.prepare(`
        SELECT d.id, d.company_id, d.decision_date
        FROM investment_decisions d
        WHERE d.company_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM decision_factor_context dfc
            WHERE dfc.decision_id = d.id
          )
        ORDER BY d.decision_date DESC
        LIMIT ?
      `).all(batchSize);

      if (decisions.length === 0) break;

      // Process in transaction
      const batchTransaction = this.db.transaction(() => {
        for (const decision of decisions) {
          try {
            // Find factor scores closest to decision date (at or before)
            const factorScore = this.db.prepare(`
              SELECT *
              FROM stock_factor_scores
              WHERE company_id = ?
                AND score_date <= ?
              ORDER BY score_date DESC
              LIMIT 1
            `).get(decision.company_id, decision.decision_date);

            if (!factorScore) {
              // No factor scores available for this stock/date
              processed++;
              continue;
            }

            // Determine dominant factor
            const factors = [
              { name: 'value', percentile: factorScore.value_percentile },
              { name: 'quality', percentile: factorScore.quality_percentile },
              { name: 'momentum', percentile: factorScore.momentum_percentile },
              { name: 'growth', percentile: factorScore.growth_percentile }
            ].filter(f => f.percentile != null);

            let dominant_factor = null;
            let dominant_factor_percentile = null;

            if (factors.length > 0) {
              // Find the most extreme factor (highest or lowest)
              factors.sort((a, b) => {
                const aExtreme = Math.max(a.percentile, 100 - a.percentile);
                const bExtreme = Math.max(b.percentile, 100 - b.percentile);
                return bExtreme - aExtreme;
              });
              dominant_factor = factors[0].name;
              dominant_factor_percentile = factors[0].percentile;
            }

            // Classify the play type
            const is_value_play = factorScore.value_percentile >= 80 ? 1 : 0;
            const is_quality_play = factorScore.quality_percentile >= 80 ? 1 : 0;
            const is_momentum_play = factorScore.momentum_percentile >= 80 ? 1 : 0;
            const is_growth_play = factorScore.growth_percentile >= 80 ? 1 : 0;
            const is_contrarian_play = factorScore.momentum_percentile <= 20 ? 1 : 0;
            const is_small_cap_play = factorScore.size_percentile <= 30 ? 1 : 0;

            insertContext.run({
              decision_id: decision.id,
              value_score: factorScore.value_score,
              quality_score: factorScore.quality_score,
              momentum_score: factorScore.momentum_score,
              growth_score: factorScore.growth_score,
              size_score: factorScore.size_score,
              volatility_score: factorScore.volatility_score,
              value_percentile: factorScore.value_percentile,
              quality_percentile: factorScore.quality_percentile,
              momentum_percentile: factorScore.momentum_percentile,
              growth_percentile: factorScore.growth_percentile,
              dominant_factor,
              dominant_factor_percentile,
              is_value_play,
              is_quality_play,
              is_momentum_play,
              is_growth_play,
              is_contrarian_play,
              is_small_cap_play
            });

            enriched++;
            processed++;
          } catch (e) {
            if (verbose) {
              console.error(`Error enriching decision ${decision.id}: ${e.message}`);
            }
            errors++;
            processed++;
          }
        }
      });

      batchTransaction();
      offset += decisions.length;

      if (verbose && offset % (batchSize * 5) === 0) {
        console.log(`  Processed ${processed}/${totalToProcess} (${enriched} enriched, ${errors} errors)`);
      }

      if (onProgress) {
        const pct = Math.min(100, (processed / totalToProcess) * 100);
        await onProgress(pct, `Processed ${processed}/${totalToProcess} decisions`);
      }
    }

    if (verbose) {
      console.log(`✅ Enriched ${enriched} decisions with factor context (${errors} errors)`);
    }

    return { processed, enriched, errors, total: totalToProcess };
  }

  /**
   * Batch enrich decisions with factor context for a specific date range
   * Useful for historical backfill
   */
  async enrichFactorContextForDateRange(startDate, endDate, options = {}) {
    const { verbose = false } = options;

    if (verbose) {
      console.log(`📊 Enriching factor context for decisions from ${startDate} to ${endDate}`);
    }

    // Get decision IDs in date range that need context
    const decisions = this.db.prepare(`
      SELECT d.id, d.company_id, d.decision_date
      FROM investment_decisions d
      WHERE d.company_id IS NOT NULL
        AND d.decision_date >= ?
        AND d.decision_date <= ?
        AND NOT EXISTS (
          SELECT 1 FROM decision_factor_context dfc
          WHERE dfc.decision_id = d.id
        )
      ORDER BY d.decision_date DESC
    `).all(startDate, endDate);

    if (verbose) {
      console.log(`  Found ${decisions.length} decisions to enrich`);
    }

    return this.enrichWithFactorContext({
      ...options,
      verbose
    });
  }
}

module.exports = DecisionEnricher;
